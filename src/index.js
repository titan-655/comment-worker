// Comment Worker — self-hosted comments for static sites (Disqus alternative)
// Routes:
//   GET  /embed.js                          -> client script (one line <script> embed)
//   GET  /api/:siteId/comments?page=:path   -> list comments for a page (public)
//   POST /api/:siteId/comments              -> post a comment (public, spam-guarded)
//   GET  /admin?site=:siteId&key=:secret    -> moderation dashboard (HTML)
//   GET  /api/:siteId/admin/comments        -> list all (auth: Bearer secret)
//   POST /api/:siteId/admin/comments/:id    -> set status (approved/pending/spam)
//   GET  /api/:siteId/admin/delete/:id      -> delete a comment
//   GET  /api/:siteId/admin/export.csv      -> export comments as CSV
//   GET  /api/:siteId/admin/stats           -> counts by status

const JSON_HEADERS = { 'Content-Type': 'application/json; charset=utf-8', 'Access-Control-Allow-Origin': '*' };
const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type, Authorization',
};

const DASHBOARD_HTML = "<!DOCTYPE html>\n<html lang=\"fa\" dir=\"rtl\">\n<head>\n<meta charset=\"UTF-8\">\n<meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\">\n<title>\u0645\u062f\u06cc\u0631\u06cc\u062a \u062f\u06cc\u062f\u06af\u0627\u0647\u200c\u0647\u0627</title>\n<style>\n:root{--bg:#0f172a;--card:#1e293b;--accent:#38bdf8;--text:#e2e8f0;--muted:#94a3b8;--green:#10b981;--yellow:#f59e0b;--red:#ef4444}\n*{margin:0;padding:0;box-sizing:border-box}\nbody{background:var(--bg);color:var(--text);font-family:Vazirmatn,Tahoma,sans-serif;min-height:100vh;padding:20px}\n.container{max-width:860px;margin:0 auto}\nh1{font-size:1.3rem;margin-bottom:20px;color:var(--accent)}\n.card{background:var(--card);border-radius:12px;padding:20px;margin-bottom:16px}\ninput[type=password]{width:100%;padding:10px;border:1px solid #334155;border-radius:8px;background:#0f172a;color:var(--text);margin-bottom:10px}\nbutton{background:var(--accent);color:#0f172a;border:none;padding:8px 16px;border-radius:8px;cursor:pointer;font-weight:bold;font-size:.9rem}\nbutton.sec{background:#334155;color:var(--text)}\nbutton.ok{background:var(--green);color:#052e16}\nbutton.warn{background:var(--yellow);color:#451a03}\nbutton.danger{background:var(--red);color:#fff}\n.stats{display:flex;gap:10px;flex-wrap:wrap;margin-bottom:16px}\n.stat{flex:1;min-width:120px;background:var(--card);border-radius:10px;padding:14px;text-align:center}\n.stat b{display:block;font-size:1.6rem}\n.stat span{color:var(--muted);font-size:.8rem}\n.comment{background:#0f172a;border-radius:10px;padding:14px;margin-bottom:12px}\n.comment .meta{color:var(--muted);font-size:.8rem;margin-bottom:6px}\n.comment .body{white-space:pre-wrap;margin:8px 0}\n.comment .actions{display:flex;gap:8px;flex-wrap:wrap}\n.badge{display:inline-block;padding:2px 10px;border-radius:999px;font-size:.75rem}\n.badge.approved{background:#064e3b;color:#6ee7b7}\n.badge.pending{background:#713f12;color:#fcd34d}\n.badge.spam{background:#7f1d1d;color:#fca5a5}\n.filter{display:flex;gap:8px;margin-bottom:16px;flex-wrap:wrap}\n.hidden{display:none}\n.muted{color:var(--muted);font-size:.85rem}\npre{background:#0f172a;padding:10px;border-radius:8px;overflow-x:auto;font-size:.8rem;direction:ltr;text-align:left;margin-top:8px}\n</style>\n</head>\n<body>\n<div class=\"container\">\n<h1>\ud83d\udcac \u0645\u062f\u06cc\u0631\u06cc\u062a \u062f\u06cc\u062f\u06af\u0627\u0647\u200c\u0647\u0627</h1>\n\n<div id=\"login\" class=\"card\">\n  <h2 style=\"margin-bottom:12px\">\u0648\u0631\u0648\u062f</h2>\n  <input type=\"password\" id=\"key\" placeholder=\"\u06a9\u0644\u06cc\u062f \u0633\u0627\u06cc\u062a (secret)\">\n  <button onclick=\"login()\">\u0648\u0631\u0648\u062f</button>\n  <p class=\"muted\" style=\"margin-top:8px\">\u06a9\u0644\u06cc\u062f \u0647\u0645\u0627\u0646 secret \u0633\u0627\u06cc\u062a \u0627\u0633\u062a \u06a9\u0647 \u0647\u0646\u06af\u0627\u0645 \u0633\u0627\u062e\u062a \u0633\u0627\u06cc\u062a \u062f\u0631\u06cc\u0627\u0641\u062a \u06a9\u0631\u062f\u06cc\u062f.</p>\n</div>\n\n<div id=\"main\" class=\"hidden\">\n  <div class=\"stats\" id=\"stats\"></div>\n\n  <div class=\"card\">\n    <h2 style=\"margin-bottom:12px\">\u0641\u06cc\u0644\u062a\u0631</h2>\n    <div class=\"filter\">\n      <button class=\"sec\" onclick=\"setFilter('')\">\u0647\u0645\u0647</button>\n      <button class=\"ok\" onclick=\"setFilter('approved')\">\u062a\u0623\u06cc\u06cc\u062f\u0634\u062f\u0647</button>\n      <button class=\"warn\" onclick=\"setFilter('pending')\">\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631</button>\n      <button class=\"danger\" onclick=\"setFilter('spam')\">\u0627\u0633\u067e\u0645</button>\n      <button class=\"sec\" onclick=\"exportCSV()\" style=\"margin-inline-start:auto\">\u2b07\ufe0f \u062e\u0631\u0648\u062c\u06cc CSV</button>\n    </div>\n  </div>\n\n  <div id=\"list\"></div>\n</div>\n</div>\n\n<script>\nlet KEY = '';\nlet FILTER = '';\nconst SITE = new URLSearchParams(location.search).get('site') || '';\nconst BASE = location.origin;\n\nasync function api(path, opts = {}) {\n  const r = await fetch(BASE + path, { ...opts, headers: { ...(opts.headers || {}), 'Authorization': 'Bearer ' + KEY } });\n  if (r.status === 401) { alert('\u062f\u0633\u062a\u0631\u0633\u06cc \u063a\u06cc\u0631\u0645\u062c\u0627\u0632 \u2014 \u06a9\u0644\u06cc\u062f \u0631\u0627 \u0686\u06a9 \u06a9\u0646\u06cc\u062f'); throw new Error('401'); }\n  return r.json();\n}\n\nfunction esc(s) { return String(s ?? '').replace(/[&<>\"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '\"': '&quot;', \"'\": '&#39;' }[c])); }\n\nfunction login() {\n  KEY = document.getElementById('key').value.trim();\n  if (!KEY) return alert('\u06a9\u0644\u06cc\u062f \u0631\u0627 \u0648\u0627\u0631\u062f \u06a9\u0646\u06cc\u062f');\n  document.getElementById('login').classList.add('hidden');\n  document.getElementById('main').classList.remove('hidden');\n  loadStats();\n  loadComments();\n}\n\nasync function loadStats() {\n  const s = await api('/api/' + SITE + '/admin/stats');\n  document.getElementById('stats').innerHTML =\n    `<div class=\"stat\"><b>${s.approved}</b><span>\u062a\u0623\u06cc\u06cc\u062f\u0634\u062f\u0647</span></div>` +\n    `<div class=\"stat\"><b>${s.pending}</b><span>\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631</span></div>` +\n    `<div class=\"stat\"><b>${s.spam}</b><span>\u0627\u0633\u067e\u0645</span></div>`;\n}\n\nasync function loadComments() {\n  const q = FILTER ? '?status=' + FILTER : '';\n  const d = await api('/api/' + SITE + '/admin/comments' + q);\n  const list = document.getElementById('list');\n  if (!d.comments.length) { list.innerHTML = '<p class=\"muted\">\u062f\u06cc\u062f\u06af\u0627\u0647\u06cc \u0646\u06cc\u0633\u062a</p>'; return; }\n  list.innerHTML = d.comments.map(c => {\n    const when = new Date(c.created_at * 1000).toLocaleString('fa-IR');\n    const badge = `<span class=\"badge ${c.status}\">${c.status === 'approved' ? '\u062a\u0623\u06cc\u06cc\u062f\u0634\u062f\u0647' : c.status === 'pending' ? '\u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631' : '\u0627\u0633\u067e\u0645'}</span>`;\n    const actions = `\n      ${c.status !== 'approved' ? `<button class=\"ok\" onclick=\"setStatus(${c.id},'approved')\">\u2713 \u062a\u0623\u06cc\u06cc\u062f</button>` : ''}\n      ${c.status !== 'pending' ? `<button class=\"warn\" onclick=\"setStatus(${c.id},'pending')\">\u23f3 \u062f\u0631 \u0627\u0646\u062a\u0638\u0627\u0631</button>` : ''}\n      ${c.status !== 'spam' ? `<button class=\"danger\" onclick=\"setStatus(${c.id},'spam')\">\ud83d\udeab \u0627\u0633\u067e\u0645</button>` : ''}\n      <button class=\"danger\" onclick=\"del(${c.id})\">\ud83d\uddd1 \u062d\u0630\u0641</button>`;\n    return `<div class=\"comment\">\n      <div class=\"meta\">#${c.id} \u2022 ${esc(c.author)} \u2022 ${when} \u2022 \u0635\u0641\u062d\u0647: ${esc(c.page_path)} ${badge}</div>\n      <div class=\"body\">${esc(c.body)}</div>\n      <div class=\"actions\">${actions}</div>\n    </div>`;\n  }).join('');\n}\n\nfunction setFilter(f) { FILTER = f; loadComments(); }\n\nasync function setStatus(id, status) {\n  await api(`/api/${SITE}/admin/comments/${id}?status=${status}`, { method: 'POST' });\n  loadStats(); loadComments();\n}\n\nasync function del(id) {\n  if (!confirm('\u062d\u0630\u0641 \u0634\u0648\u062f\u061f')) return;\n  await api(`/api/${SITE}/admin/delete/${id}`);\n  loadStats(); loadComments();\n}\n\nfunction exportCSV() { location.href = `${BASE}/api/${SITE}/admin/export.csv`; }\n\n// auto login if key in URL\nconst k = new URLSearchParams(location.search).get('key');\nif (k) { document.getElementById('key').value = k; login(); }\n</script>\n</body>\n</html>\n";


// ---- DB compatibility layer (works on Cloudflare D1 and node:sqlite) ----
// D1:  db.prepare(sql).bind(...).all()  -> { results: [...] }
//       db.prepare(sql).bind(...).first() -> row | null
//       db.prepare(sql).bind(...).run()    -> { meta: { last_row_id, changes } }
// node:sqlite:  db.prepare(sql).all(...)  -> [...]        (qAll wraps it -> { results })
//                db.prepare(sql).get(...) -> row | undefined
//                db.prepare(sql).run(...) -> { lastInsertRowid, changes }  (qRun wraps it)
function hasBind(db) {
  const stmt = db.prepare('SELECT 1 AS x');
  return typeof stmt.bind === 'function';
}
const D1_API = (() => { try { return hasBind({ prepare: () => ({ bind: () => ({}) }) }); } catch (e) { return false; } })();
async function qAll(db, sql, ...args) {
  const stmt = db.prepare(sql);
  if (typeof stmt.bind === 'function') return stmt.bind(...args).all(); // D1: already { results }
  return { results: stmt.all(...args) }; // node:sqlite: normalize array -> { results }
}
async function qFirst(db, sql, ...args) {
  const stmt = db.prepare(sql);
  if (typeof stmt.bind === 'function') return stmt.bind(...args).first();
  return stmt.get(...args);
}
async function qRun(db, sql, ...args) {
  const stmt = db.prepare(sql);
  if (typeof stmt.bind === 'function') return stmt.bind(...args).run();
  const res = stmt.run(...args);
  return { meta: { last_row_id: Number(res.lastInsertRowid), changes: res.changes } };
}

const EMBED_JS = /* embed */ String.raw`(function () {
  // Comment Worker — client embed script
  var SCRIPT = document.currentScript;
  var API = SCRIPT.getAttribute('data-api') || location.origin;
  var SITE = SCRIPT.getAttribute('data-site');
  var PAGE = SCRIPT.getAttribute('data-page') || location.pathname;
  if (!SITE) return;

  var container = document.createElement('div');
  container.id = 'cw-comments';
  container.innerHTML = '<div style="font-family:sans-serif;max-width:680px;margin:2em auto">' +
    '<h3 style="border-bottom:2px solid #e5e7eb;padding-bottom:8px">دیدگاه\u200cها</h3>' +
    '<div id="cw-list"><p style="color:#6b7280">در حال بارگذاری...</p></div>' +
    '<form id="cw-form" style="margin-top:20px">' +
      '<input name="author" placeholder="نام *" required style="display:block;width:100%;padding:8px;margin-bottom:8px;border:1px solid #d1d5db;border-radius:6px">' +
      '<input name="email" placeholder="ایمیل (اختیاری)" style="display:block;width:100%;padding:8px;margin-bottom:8px;border:1px solid #d1d5db;border-radius:6px">' +
      '<textarea name="body" placeholder="متن دیدگاه... *" required style="display:block;width:100%;padding:8px;margin-bottom:8px;border:1px solid #d1d5db;border-radius:6px;min-height:90px"></textarea>' +
      '<input name="_hp" style="display:none" tabindex="-1" autocomplete="off">' +
      '<button type="submit" style="background:#111827;color:#fff;border:none;padding:8px 20px;border-radius:6px;cursor:pointer">ارسال دیدگاه</button>' +
    '</form>' +
    '<p id="cw-msg" style="font-size:13px;color:#6b7280"></p>' +
  '</div>';
  if (SCRIPT.nextSibling) SCRIPT.parentNode.insertBefore(container, SCRIPT.nextSibling);
  else document.body.appendChild(container);

  function esc(s) { return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) { return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]; }); }

  function render(list) {
    var box = document.getElementById('cw-list');
    if (!list.length) { box.innerHTML = '<p style="color:#6b7280">هنوز دیدگاهی نیست. اولین نفر باش!</p>'; return; }
    var html = '';
    list.forEach(function (c) {
      var d = new Date(c.created_at * 1000).toLocaleString('fa-IR');
      html += '<div style="padding:12px 0;border-bottom:1px solid #f3f4f6">' +
        '<b>' + esc(c.author) + '</b> <span style="color:#9ca3af;font-size:12px">' + d + '</span>' +
        '<p style="margin:6px 0 0;white-space:pre-wrap">' + esc(c.body) + '</p>' +
      '</div>';
    });
    box.innerHTML = html;
  }

  function load() {
    fetch(API + '/api/' + encodeURIComponent(SITE) + '/comments?page=' + encodeURIComponent(PAGE))
      .then(function (r) { return r.json(); })
      .then(function (j) { render(j.comments || []); })
      .catch(function () { var b = document.getElementById('cw-list'); if (b) b.innerHTML = '<p style="color:#6b7280">خطا در بارگذاری دیدگاه\u200cها</p>'; });
  }

  document.getElementById('cw-form').addEventListener('submit', function (e) {
    e.preventDefault();
    var fd = new FormData(e.target);
    var payload = {};
    fd.forEach(function (v, k) { payload[k] = v; });
    fetch(API + '/api/' + encodeURIComponent(SITE) + '/comments?page=' + encodeURIComponent(PAGE), {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    }).then(function (r) { return r.json(); }).then(function (j) {
      var msg = document.getElementById('cw-msg');
      if (j.ok) { msg.textContent = j.message || 'دیدگاه ثبت شد'; e.target.reset(); load(); }
      else { msg.textContent = j.error || 'خطایی رخ داد'; }
    }).catch(function () { document.getElementById('cw-msg').textContent = 'خطای شبکه'; });
  });

  load();
})();`;

function json(status, obj) {
  return new Response(JSON.stringify(obj), { status, headers: JSON_HEADERS });
}

function escapeHtml(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ---------- spam helpers ----------
async function rateLimitOK(db, siteId, ip, limit) {
  const hour = Math.floor(Date.now() / 1000) - 3600;
  const { results } = await qAll(db,
    `SELECT COUNT(*) AS n FROM comments WHERE site_id = ? AND ip = ? AND created_at >= ?`,
    siteId, ip, hour);
  return results[0].n < limit;
}

function isSpam(body) {
  const b = (body || '').toLowerCase();
  if (b.includes('http://') || b.includes('https://')) return true; // links -> spam (simple heuristic)
  const spamWords = ['viagra', 'casino', 'free money', 'click here', 'buy now', 'سئو', 'لینک'];
  return spamWords.some((w) => b.includes(w));
}

// ---------- public handlers ----------
async function listComments(req, db, siteId, page) {
  const site = await qFirst(db, `SELECT * FROM sites WHERE id = ?`, siteId);
  if (!site) return json(404, { error: 'سایت یافت نشد' });
  const { results } = await qAll(db,
    `SELECT id, parent_id, author, body, created_at FROM comments
     WHERE site_id = ? AND page_path = ? AND status = 'approved'
     ORDER BY created_at ASC LIMIT 200`,
    siteId, page);
  return json(200, { comments: results });
}

async function postComment(req, db, siteId, page) {
  const site = await qFirst(db, `SELECT * FROM sites WHERE id = ?`, siteId);
  if (!site) return json(404, { error: 'سایت یافت نشد' });
  if (site.moderation === 'closed') return json(403, { error: 'دیدگاه‌ها بسته است' });

  let payload = {};
  const ct = (req.headers.get('content-type') || '').toLowerCase();
  if (ct.includes('application/json')) {
    payload = await req.json().catch(() => ({}));
  } else {
    const fd = await req.formData().catch(() => new FormData());
    for (const [k, v] of fd.entries()) if (typeof v === 'string') payload[k] = v;
  }

  if (payload._hp) return json(200, { ok: true }); // honeypot — pretend success

  const author = String(payload.author || '').trim().slice(0, 60);
  const email = String(payload.email || '').trim().slice(0, 120);
  const body = String(payload.body || '').trim().slice(0, 4000);
  if (!author || !body) return json(400, { error: 'نام و متن دیدگاه الزامی است' });

  const ip = req.headers.get('CF-Connecting-IP') || '';
  const ua = req.headers.get('User-Agent') || '';

  const limit = site.rate_limit || 5;
  if (!(await rateLimitOK(db, siteId, ip, limit))) {
    return json(429, { error: 'تعداد دیدگاه بیش از حد مجاز است' });
  }

  const spam = isSpam(body);
  const status = spam ? 'spam' : (site.moderation === 'moderated' ? 'pending' : 'approved');

  const res = await qRun(db,
    `INSERT INTO comments (site_id, page_path, parent_id, author, email, body, ip, user_agent, status) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    siteId, page, payload.parent_id ? Number(payload.parent_id) : null, author, email, body, ip, ua, status);

  const id = res.meta.last_row_id;
  const msg = status === 'approved'
    ? 'دیدگاه شما ثبت شد'
    : (status === 'pending' ? 'دیدگاه شما پس از تأیید نمایش داده می‌شود' : 'دیدگاه شما ثبت شد');
  return json(200, { ok: true, id, status, message: msg });
}

// ---------- admin helpers ----------
async function adminAuth(db, siteId, auth) {
  const site = await qFirst(db, `SELECT * FROM sites WHERE id = ?`, siteId);
  if (!site) return { error: 404 };
  if (auth !== site.secret) return { error: 401 };
  return { site };
}

function authFrom(req) {
  return (req.headers.get('Authorization') || '').replace('Bearer ', '');
}

async function adminList(req, db, siteId, statusFilter) {
  const a = await adminAuth(db, siteId, authFrom(req));
  if (a.error) return json(a.error, { error: a.error === 404 ? 'سایت یافت نشد' : 'دسترسی غیرمجاز' });
  let sql = `SELECT * FROM comments WHERE site_id = ?`;
  const args = [siteId];
  if (statusFilter) { sql += ` AND status = ?`; args.push(statusFilter); }
  sql += ` ORDER BY created_at DESC LIMIT 500`;
  const { results } = await qAll(db, sql, ...args);
  return json(200, { comments: results });
}

async function adminSetStatus(req, db, siteId, id, status) {
  const a = await adminAuth(db, siteId, authFrom(req));
  if (a.error) return json(a.error, { error: a.error === 404 ? 'سایت یافت نشد' : 'دسترسی غیرمجاز' });
  if (!['approved', 'pending', 'spam'].includes(status)) return json(400, { error: 'وضعیت نامعتبر' });
  await qRun(db, `UPDATE comments SET status = ? WHERE id = ? AND site_id = ?`, status, id, siteId);
  return json(200, { ok: true });
}

async function adminDelete(req, db, siteId, id) {
  const a = await adminAuth(db, siteId, authFrom(req));
  if (a.error) return json(a.error, { error: a.error === 404 ? 'سایت یافت نشد' : 'دسترسی غیرمجاز' });
  await qRun(db, `DELETE FROM comments WHERE id = ? AND site_id = ?`, id, siteId);
  return json(200, { ok: true });
}

async function adminExport(req, db, siteId) {
  const a = await adminAuth(db, siteId, authFrom(req));
  if (a.error) return json(a.error, { error: a.error === 404 ? 'سایت یافت نشد' : 'دسترسی غیرمجاز' });
  const { results } = await qAll(db,
    `SELECT id, page_path, parent_id, author, body, status, created_at FROM comments WHERE site_id = ? ORDER BY created_at DESC`,
    siteId);
  const esc = (s) => `"${String(s ?? '').replace(/"/g, '""')}"`;
  const lines = [['id', 'page', 'parent', 'author', 'body', 'status', 'created_at'].join(',')];
  for (const r of results) {
    lines.push([r.id, r.page_path, r.parent_id ?? '', r.author, r.body, r.status, new Date(r.created_at * 1000).toISOString()].map(esc).join(','));
  }
  return new Response(lines.join('\n'), {
    headers: { 'Content-Type': 'text/csv; charset=utf-8', 'Content-Disposition': `attachment; filename="${siteId}-comments.csv"` },
  });
}

async function adminStats(req, db, siteId) {
  const a = await adminAuth(db, siteId, authFrom(req));
  if (a.error) return json(a.error, { error: a.error === 404 ? 'سایت یافت نشد' : 'دسترسی غیرمجاز' });
  const { results } = await qAll(db,
    `SELECT status, COUNT(*) AS n FROM comments WHERE site_id = ? GROUP BY status`,
    siteId);
  const counts = { approved: 0, pending: 0, spam: 0 };
  for (const r of results) counts[r.status] = r.n;
  return json(200, counts);
}

// ---------- router ----------
export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const db = env.D1;

    if (request.method === 'OPTIONS') return new Response(null, { headers: CORS_HEADERS });

    // client embed script
    if (path === '/embed.js') {
      return new Response(EMBED_JS, { headers: { 'Content-Type': 'application/javascript; charset=utf-8', 'Cache-Control': 'public, max-age=3600' } });
    }

    // admin dashboard
    if (path.startsWith('/admin') && request.method === 'GET') {
      return new Response(DASHBOARD_HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8' } });
    }

    // public API
    let m = path.match(/^\/api\/([^/]+)\/comments$/);
    if (m) {
      const siteId = m[1];
      const page = url.searchParams.get('page') || '/';
      if (request.method === 'GET') return listComments(request, db, siteId, page);
      if (request.method === 'POST') return postComment(request, db, siteId, page);
    }

    // admin API
    m = path.match(/^\/api\/([^/]+)\/admin\/comments$/);
    if (m && request.method === 'GET') {
      const status = url.searchParams.get('status') || '';
      return adminList(request, db, m[1], status);
    }
    m = path.match(/^\/api\/([^/]+)\/admin\/comments\/(\d+)$/);
    if (m && request.method === 'POST') {
      const status = url.searchParams.get('status') || 'approved';
      return adminSetStatus(request, db, m[1], Number(m[2]), status);
    }
    m = path.match(/^\/api\/([^/]+)\/admin\/delete\/(\d+)$/);
    if (m && request.method === 'GET') {
      return adminDelete(request, db, m[1], Number(m[2]));
    }
    m = path.match(/^\/api\/([^/]+)\/admin\/export\.csv$/);
    if (m && request.method === 'GET') {
      return adminExport(request, db, m[1]);
    }
    m = path.match(/^\/api\/([^/]+)\/admin\/stats$/);
    if (m && request.method === 'GET') {
      return adminStats(request, db, m[1]);
    }

    return json(404, { error: 'یافت نشد' });
  },
};
