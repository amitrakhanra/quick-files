// QuickFile reviews & comments widget. Talks only to this site's own /api/feedback.
// All user text is inserted with textContent, never as HTML.
(() => {
  const root = document.getElementById('feedback');
  if (!root) return;
  const tool = root.dataset.tool;
  const API = '/api/feedback';
  const LIM = { name: 40, review: 600, comment: 800, reviewMin: 10, commentMin: 3 };
  const st = { tab: 'review', data: null, rendered: 0, busy: false };

  const el = (tag, attrs, ...kids) => {
    const e = document.createElement(tag);
    for (const k in (attrs || {})) {
      if (k === 'class') e.className = attrs[k];
      else if (k === 'text') e.textContent = attrs[k];
      else e.setAttribute(k, attrs[k]);
    }
    kids.flat().forEach(c => { if (c != null) e.append(c); });
    return e;
  };
  const stars = n => '★'.repeat(n) + '☆'.repeat(5 - n);
  const when = ts => { try { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch (e) { return ''; } };

  function unavailable() {
    root.replaceChildren(el('h2', { text: 'Reviews & comments' }), el('p', { class: 'fb-muted', text: 'Reviews and comments are not available right now. Please check back later.' }));
  }

  function summary() {
    const d = st.data;
    const box = el('p', { class: 'fb-summary' });
    if (!d.count) { box.textContent = 'No reviews yet. Be the first to review this tool.'; return box; }
    box.append(el('span', { class: 'fb-stars', 'aria-hidden': 'true', text: stars(Math.round(d.avg)) }), ' ',
      el('strong', { text: d.avg.toFixed(1) }), ` out of 5 · ${d.count} review${d.count === 1 ? '' : 's'}`);
    box.setAttribute('aria-label', `Average rating ${d.avg.toFixed(1)} out of 5 from ${d.count} reviews`);
    return box;
  }

  function list(kind) {
    const items = kind === 'review' ? st.data.reviews : st.data.comments;
    if (!items.length) return el('p', { class: 'fb-muted', text: kind === 'review' ? 'No reviews yet.' : 'No comments yet.' });
    return el('ul', { class: 'fb-list' }, items.map(x => el('li', { class: 'fb-item' },
      el('div', { class: 'fb-meta' },
        kind === 'review' ? el('span', { class: 'fb-stars', role: 'img', 'aria-label': `${x.rating} out of 5 stars`, text: stars(x.rating) }) : null,
        el('strong', { text: x.name }), el('span', { class: 'fb-date', text: when(x.ts) })),
      el('p', { class: 'fb-text', text: x.text }))));
  }

  function form(kind) {
    const uid = 'fb-' + kind;
    const isR = kind === 'review';
    const max = LIM[kind];
    const f = el('form', { class: 'fb-form', novalidate: '' });
    f.append(el('h3', { text: isR ? 'Write a review' : 'Leave a comment' }));
    if (isR) {
      const fs = el('fieldset', { class: 'fb-rate' }, el('legend', { text: 'Your rating' }));
      const row = el('div', { class: 'fb-starrow' });
      for (let i = 5; i >= 1; i--) {
        row.append(el('input', { type: 'radio', name: 'rating', id: `${uid}-r${i}`, value: String(i) }),
          el('label', { for: `${uid}-r${i}`, title: `${i} star${i > 1 ? 's' : ''}` }, el('span', { class: 'fb-vh', text: `${i} star${i > 1 ? 's' : ''}` }), el('span', { 'aria-hidden': 'true', text: '★' })));
      }
      fs.append(row); f.append(fs);
    }
    f.append(
      el('label', { for: `${uid}-name`, text: 'Name (optional)' }),
      el('input', { type: 'text', id: `${uid}-name`, name: 'name', maxlength: String(LIM.name), autocomplete: 'nickname', placeholder: 'Anonymous' }),
      el('label', { for: `${uid}-text`, text: isR ? 'Your review' : 'Your comment' }),
      el('textarea', { id: `${uid}-text`, name: 'text', rows: '4', maxlength: String(max), required: '' }),
      el('div', { class: 'fb-count', 'aria-hidden': 'true', text: `0 / ${max}` }),
      // Hidden trap for bots. Real visitors never see or fill it.
      el('div', { class: 'fb-hp', 'aria-hidden': 'true' }, el('label', { for: `${uid}-web`, text: 'Leave this empty' }), el('input', { type: 'text', id: `${uid}-web`, name: 'website', tabindex: '-1', autocomplete: 'off' })),
      el('p', { class: 'fb-muted', text: 'Please do not include links or personal details. Posts are checked before they appear.' }),
      el('button', { type: 'submit', class: 'btn', text: isR ? 'Submit review' : 'Post comment' }),
      el('p', { class: 'fb-status', role: 'status', 'aria-live': 'polite' }));
    const ta = f.querySelector('textarea'), cnt = f.querySelector('.fb-count');
    ta.addEventListener('input', () => { cnt.textContent = `${ta.value.length} / ${max}`; });
    const stEl = f.querySelector('.fb-status');
    const say = (m, bad) => { stEl.textContent = m; stEl.className = 'fb-status' + (bad ? ' bad' : ' good'); };
    const born = Date.now();
    f.addEventListener('submit', async e => {
      e.preventDefault();
      if (st.busy) return;
      const text = ta.value.trim(), name = f.elements.name.value.trim();
      let rating = 0;
      if (isR) {
        const c = f.querySelector('input[name="rating"]:checked');
        if (!c) return say('Please choose a star rating.', true);
        rating = +c.value;
      }
      const min = isR ? LIM.reviewMin : LIM.commentMin;
      if (text.length < min) return say(`Please write at least ${min} characters.`, true);
      st.busy = true; const btn = f.querySelector('button'); btn.disabled = true; say('Sending…');
      try {
        const r = await fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ tool, kind, name, rating, text, website: f.elements.website.value, t: Date.now() - born }) });
        const j = await r.json().catch(() => ({}));
        if (r.ok) {
          ta.value = ''; cnt.textContent = `0 / ${max}`; f.elements.name.value = '';
          const c = f.querySelector('input[name="rating"]:checked'); if (c) c.checked = false;
          say(`Thank you! Your ${isR ? 'review' : 'comment'} will appear after it has been checked.`);
        } else say(j.error && j.error !== 'not_configured' ? j.error : 'Sorry, this could not be sent right now. Please try again later.', true);
      } catch (err) { say('Could not reach the server. Check your connection and try again.', true); }
      finally { st.busy = false; btn.disabled = false; }
    });
    return f;
  }

  function render() {
    const d = st.data;
    const tabs = el('div', { class: 'fb-tabs', role: 'tablist', 'aria-label': 'Reviews or comments' });
    [['review', `Reviews (${d.count})`], ['comment', `Comments (${d.commentCount})`]].forEach(([k, label]) => {
      const b = el('button', { type: 'button', role: 'tab', id: 'fb-tab-' + k, 'aria-selected': String(st.tab === k), 'aria-controls': 'fb-panel', tabindex: st.tab === k ? '0' : '-1', class: 'fb-tab', text: label });
      b.addEventListener('click', () => { st.tab = k; render(); b.focus(); });
      b.addEventListener('keydown', e => { if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') { st.tab = k === 'review' ? 'comment' : 'review'; render(); document.getElementById('fb-tab-' + st.tab).focus(); } });
      tabs.append(b);
    });
    const panel = el('div', { id: 'fb-panel', role: 'tabpanel', 'aria-labelledby': 'fb-tab-' + st.tab }, list(st.tab), form(st.tab));
    root.replaceChildren(el('h2', { text: 'Reviews & comments' }), summary(), tabs, panel);
  }

  async function load() {
    if (st.rendered) return; st.rendered = 1;
    try {
      const r = await fetch(API + '?tool=' + encodeURIComponent(tool));
      if (!r.ok) return unavailable();
      const j = await r.json();
      if (!j || !j.ok) return unavailable();
      st.data = j; render();
    } catch (e) { unavailable(); }
  }

  // Only contact the API when the section is about to be seen.
  if ('IntersectionObserver' in window) {
    const io = new IntersectionObserver(es => { if (es.some(x => x.isIntersecting)) { io.disconnect(); load(); } }, { rootMargin: '400px' });
    io.observe(root);
  } else load();
})();
