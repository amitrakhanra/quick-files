'use strict';
// Shared helpers for the QuickFile reviews/comments API (Vercel serverless functions).
// Storage is an Upstash Redis database, reached over its REST API with plain fetch().
const crypto = require('crypto');

// Only these pages may receive reviews/comments (stops junk keys being created).
const TOOLS = [
  'home', 'jpg-to-pdf', 'pdf-to-jpg', 'merge-pdf', 'compress-pdf', 'lock-pdf', 'unlock-pdf', 'rotate-pdf',
  'split-pdf', 'resize-image', 'image-to-jpg', 'pdf-to-word', 'add-watermark-to-pdf', 'add-page-numbers-to-pdf',
  'remove-pdf-pages', 'compress-image', 'pdf-to-text', 'compress-pdf-to-target-size',
  'compress-image-to-target-size', 'compress-image-to-20kb', 'compress-image-to-50kb',
  'compress-image-to-100kb', 'compress-pdf-to-100kb', 'compress-pdf-to-200kb',
];
const KINDS = ['review', 'comment'];
const LIMITS = { name: 40, review: 600, comment: 800, reviewMin: 10, commentMin: 3 };
const PENDING = 'qf:pending';
const okKey = (tool, kind) => `qf:ok:${tool}:${kind}`;

class NotConfigured extends Error { constructor() { super('not configured'); this.code = 'NOT_CONFIGURED'; } }

function conf() {
  // Works with a database created directly at Upstash, or via the Vercel Marketplace integration.
  const url = process.env.UPSTASH_REDIS_REST_URL || process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN || process.env.KV_REST_API_TOKEN;
  return url && token ? { url: url.replace(/\/+$/, ''), token } : null;
}

async function call(path, body) {
  const c = conf();
  if (!c) throw new NotConfigured();
  const r = await fetch(c.url + path, {
    method: 'POST',
    headers: { Authorization: 'Bearer ' + c.token, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error('Redis error ' + r.status + (j.error ? ': ' + j.error : ''));
  return j;
}
async function redis(cmd) {
  const j = await call('', cmd);
  if (j.error) throw new Error('Redis error: ' + j.error);
  return j.result;
}
async function pipeline(cmds) {
  const j = await call('/pipeline', cmds);
  return j.map(x => { if (x.error) throw new Error('Redis error: ' + x.error); return x.result; });
}

const sha = s => crypto.createHash('sha256').update(String(s)).digest('hex');
function ipHash(req) {
  const fwd = String(req.headers['x-forwarded-for'] || '').split(',')[0].trim();
  const ip = fwd || req.headers['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown';
  // One-way hash: the IP itself is never stored. Used only for short-lived rate-limit counters.
  return sha((process.env.IP_SALT || process.env.ADMIN_KEY || 'qf') + '|' + ip).slice(0, 32);
}

function send(res, status, obj, extra) {
  res.statusCode = status;
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Cache-Control', 'no-store');
  if (extra) for (const k of Object.keys(extra)) res.setHeader(k, extra[k]);
  res.end(JSON.stringify(obj));
}

async function readBody(req) {
  if (req.body && typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  let raw = '';
  if (typeof req.body === 'string') raw = req.body;
  else if (Buffer.isBuffer(req.body)) raw = req.body.toString('utf8');
  else {
    let size = 0;
    for await (const chunk of req) { size += chunk.length; if (size > 20000) throw Object.assign(new Error('Body too large'), { code: 'TOO_LARGE' }); raw += chunk; }
  }
  if (raw.length > 20000) throw Object.assign(new Error('Body too large'), { code: 'TOO_LARGE' });
  try { return JSON.parse(raw || '{}'); } catch (e) { throw Object.assign(new Error('Bad JSON'), { code: 'BAD_JSON' }); }
}

// Plain text only: strip control characters, normalise spaces, cap length. Output is always shown with textContent.
function cleanText(s, max) {
  return String(s == null ? '' : s).normalize('NFC')
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F​-‏‪-‮⁦-⁩﻿]/g, '')
    .replace(/\r\n?/g, '\n').replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim().slice(0, max);
}
function looksSpammy(text) {
  if (/(https?:\/\/|www\.|ftp:\/\/)/i.test(text)) return 'Links are not allowed in reviews or comments.';
  if (/\b[a-z0-9-]+\.(com|net|org|io|co|in|ru|cn|xyz|top|info|biz|site|online|shop|me|ly|link|click|app|dev)\b/i.test(text)) return 'Links are not allowed in reviews or comments.';
  if (/[^\s@]+@[^\s@]+\.[a-z]{2,}/i.test(text)) return 'Please do not include email addresses.';
  if (/(.)\1{9,}/.test(text)) return 'That looks like spam. Please write a normal message.';
  return null;
}

function safeEqual(a, b) {
  return crypto.timingSafeEqual(Buffer.from(sha(a), 'hex'), Buffer.from(sha(b), 'hex'));
}
function publicItem(x) { return { id: x.id, name: x.name, rating: x.rating || 0, text: x.text, ts: x.ts }; }
function parse(raw) { try { const x = JSON.parse(raw); return x && x.id ? x : null; } catch (e) { return null; } }

module.exports = { TOOLS, KINDS, LIMITS, PENDING, okKey, NotConfigured, redis, pipeline, sha, ipHash, send, readBody, cleanText, looksSpammy, safeEqual, publicItem, parse, conf };
