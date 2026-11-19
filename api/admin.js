'use strict';
// POST /api/admin  (header: x-admin-key)  actions: pending | approve | reject | approved | remove
const L = require('./_lib');

const ID = /^[a-f0-9]{12}$/;

async function findPending(id) {
  const all = await L.redis(['LRANGE', L.PENDING, 0, -1]);
  for (const raw of all || []) { const x = L.parse(raw); if (x && x.id === id) return { raw, x }; }
  return null;
}
async function findApproved(tool, kind, id) {
  const all = await L.redis(['LRANGE', L.okKey(tool, kind), 0, -1]);
  for (const raw of all || []) { const x = L.parse(raw); if (x && x.id === id) return { raw, x }; }
  return null;
}

module.exports = async (req, res) => {
  try {
    if (req.method !== 'POST') return L.send(res, 405, { error: 'Method not allowed.' }, { Allow: 'POST' });
    const adminKey = process.env.ADMIN_KEY;
    if (!adminKey) return L.send(res, 503, { error: 'admin_not_configured' });

    // Brute-force guard: 10 wrong keys per 15 minutes per visitor.
    const ip = L.ipHash(req), fk = `qf:rl:admin:${ip}`;
    const fails = Number(await L.redis(['GET', fk]) || 0);
    if (fails >= 10) return L.send(res, 429, { error: 'Too many wrong keys. Try again in 15 minutes.' });
    const given = String(req.headers['x-admin-key'] || '');
    if (!given || !L.safeEqual(given, adminKey)) {
      const n = await L.redis(['INCR', fk]);
      if (n === 1) await L.redis(['EXPIRE', fk, 900]);
      return L.send(res, 401, { error: 'Wrong key.' });
    }

    let b;
    try { b = await L.readBody(req); } catch (e) { return L.send(res, 400, { error: 'Bad request.' }); }
    const action = String(b.action || '');

    if (action === 'pending') {
      const [raw, total] = await L.pipeline([['LRANGE', L.PENDING, 0, 199], ['LLEN', L.PENDING]]);
      return L.send(res, 200, { ok: true, total, items: (raw || []).map(L.parse).filter(Boolean) });
    }
    if (action === 'approve' || action === 'reject') {
      const id = String(b.id || '');
      if (!ID.test(id)) return L.send(res, 400, { error: 'Bad id.' });
      const f = await findPending(id);
      if (!f) return L.send(res, 404, { error: 'Not found (already handled?).' });
      await L.redis(['LREM', L.PENDING, 1, f.raw]);
      if (action === 'approve') {
        const key = L.okKey(f.x.tool, f.x.kind);
        await L.redis(['LPUSH', key, f.raw]);
        await L.redis(['LTRIM', key, 0, 199]);
      }
      return L.send(res, 200, { ok: true });
    }
    if (action === 'approved') {
      const tool = String(b.tool || '');
      if (!L.TOOLS.includes(tool)) return L.send(res, 400, { error: 'Unknown page.' });
      const [rv, cm] = await L.pipeline([['LRANGE', L.okKey(tool, 'review'), 0, 99], ['LRANGE', L.okKey(tool, 'comment'), 0, 99]]);
      return L.send(res, 200, { ok: true, items: [...(rv || []), ...(cm || [])].map(L.parse).filter(Boolean) });
    }
    if (action === 'remove') {
      const tool = String(b.tool || ''), kind = String(b.kind || ''), id = String(b.id || '');
      if (!L.TOOLS.includes(tool) || !L.KINDS.includes(kind) || !ID.test(id)) return L.send(res, 400, { error: 'Bad request.' });
      const f = await findApproved(tool, kind, id);
      if (!f) return L.send(res, 404, { error: 'Not found.' });
      await L.redis(['LREM', L.okKey(tool, kind), 1, f.raw]);
      return L.send(res, 200, { ok: true });
    }
    return L.send(res, 400, { error: 'Unknown action.' });
  } catch (e) {
    if (e && e.code === 'NOT_CONFIGURED') return L.send(res, 503, { error: 'not_configured' });
    console.error('admin error:', e && e.message);
    return L.send(res, 500, { error: 'Something went wrong.' });
  }
};
