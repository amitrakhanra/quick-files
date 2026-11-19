'use strict';
// GET  /api/feedback?tool=<slug>   -> approved reviews + comments for a page
// POST /api/feedback               -> submit a review or comment (held for approval)
const crypto = require('crypto');
const L = require('./_lib');

async function get(req, res) {
  const tool = String((req.query && req.query.tool) || new URL(req.url, 'http://x').searchParams.get('tool') || '');
  if (!L.TOOLS.includes(tool)) return L.send(res, 400, { error: 'Unknown page.' });
  const [rv, cm] = await L.pipeline([
    ['LRANGE', L.okKey(tool, 'review'), 0, 199],
    ['LRANGE', L.okKey(tool, 'comment'), 0, 99],
  ]);
  const reviews = (rv || []).map(L.parse).filter(Boolean);
  const comments = (cm || []).map(L.parse).filter(Boolean);
  const avg = reviews.length ? Math.round((reviews.reduce((n, x) => n + (x.rating || 0), 0) / reviews.length) * 10) / 10 : 0;
  return L.send(res, 200, {
    ok: true, avg, count: reviews.length, commentCount: comments.length,
    reviews: reviews.slice(0, 30).map(L.publicItem),
    comments: comments.slice(0, 50).map(L.publicItem),
  }, { 'Cache-Control': 'public, s-maxage=30, stale-while-revalidate=120' });
}

async function post(req, res) {
  let b;
  try { b = await L.readBody(req); } catch (e) { return L.send(res, 400, { error: 'That request could not be read.' }); }

  const tool = String(b.tool || '');
  const kind = String(b.kind || '');
  if (!L.TOOLS.includes(tool)) return L.send(res, 400, { error: 'Unknown page.' });
  if (!L.KINDS.includes(kind)) return L.send(res, 400, { error: 'Unknown type.' });

  // Bots fill hidden fields: pretend it worked, store nothing.
  if (b.website) return L.send(res, 201, { ok: true, status: 'pending' });
  // Real people take more than a couple of seconds to write something.
  if (!(Number(b.t) >= 2500)) return L.send(res, 400, { error: 'Please take a moment to write your message, then send it again.' });

  const name = L.cleanText(b.name, L.LIMITS.name).replace(/\n/g, ' ') || 'Anonymous';
  const max = L.LIMITS[kind];
  const text = L.cleanText(b.text, max + 1);
  if (text.length > max) return L.send(res, 400, { error: `Please keep it under ${max} characters.` });
  const min = kind === 'review' ? L.LIMITS.reviewMin : L.LIMITS.commentMin;
  let rating = 0;
  if (kind === 'review') {
    rating = Number(b.rating);
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return L.send(res, 400, { error: 'Please choose a star rating from 1 to 5.' });
  }
  if (text.length < min) return L.send(res, 400, { error: `Please write at least ${min} characters.` });
  const bad = L.looksSpammy(name + ' ' + text);
  if (bad) return L.send(res, 400, { error: bad });

  const ip = L.ipHash(req);
  // Rate limits (counters expire on their own): 3 per hour, 10 per day per visitor.
  const hk = `qf:rl:h:${ip}`, dk = `qf:rl:d:${ip}`;
  const [h, d] = await L.pipeline([['INCR', hk], ['INCR', dk]]);
  if (h === 1) await L.redis(['EXPIRE', hk, 3600]);
  if (d === 1) await L.redis(['EXPIRE', dk, 86400]);
  if (h > 3 || d > 10) return L.send(res, 429, { error: 'You have posted a few times already. Please try again later.' });

  // Same text on the same page within a day is almost always a double click or spam.
  const dup = await L.redis(['SET', 'qf:dup:' + L.sha(tool + '|' + kind + '|' + text.toLowerCase()), '1', 'NX', 'EX', 86400]);
  if (dup === null) return L.send(res, 409, { error: 'It looks like you already sent that.' });

  // Do not let the moderation queue grow without limit.
  const waiting = await L.redis(['LLEN', L.PENDING]);
  if (waiting >= 500) return L.send(res, 503, { error: 'Too many messages are waiting to be checked. Please try again later.' });

  const item = { id: crypto.randomBytes(6).toString('hex'), tool, kind, name, text, ts: Date.now() };
  if (kind === 'review') item.rating = rating;
  await L.redis(['LPUSH', L.PENDING, JSON.stringify(item)]);
  return L.send(res, 201, { ok: true, status: 'pending' });
}

module.exports = async (req, res) => {
  try {
    if (req.method === 'GET') return await get(req, res);
    if (req.method === 'POST') return await post(req, res);
    return L.send(res, 405, { error: 'Method not allowed.' }, { Allow: 'GET, POST' });
  } catch (e) {
    if (e && e.code === 'NOT_CONFIGURED') return L.send(res, 503, { error: 'not_configured' });
    console.error('feedback error:', e && e.message);
    return L.send(res, 500, { error: 'Something went wrong. Please try again later.' });
  }
};
