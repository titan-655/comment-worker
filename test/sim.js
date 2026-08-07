// Comment Worker — automated tests (run with Node 22.5+:  node --experimental-sqlite test/sim.js)
// Simulates the Worker's fetch handler against a real SQLite database (node:sqlite)
// so no network or Cloudflare account is needed.

import { DatabaseSync } from 'node:sqlite';
import { readFileSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const workerSrc = readFileSync(join(__dirname, '..', 'src', 'index.js'), 'utf-8');

// Build a sandboxed worker module: replace `export default` with `module.exports`-style binding.
// We evaluate the source with `new Function` to get the default export object.
const sandbox = { String, JSON, URL, Response, FormData, fetch: () => {}, console, Date, Math, Number, parseInt, parseFloat, encodeURIComponent, decodeURIComponent, isNaN, setTimeout, clearTimeout };
const srcWithExport = workerSrc.replace('export default', 'module.exports =');
const m = { exports: {} };
const fn = new Function('module', 'exports', 'require', srcWithExport + '\n;return module.exports;');
let worker;
try {
  worker = fn(m, m.exports, () => ({}));
} catch (e) {
  console.error('Failed to load worker:', e.message);
  process.exit(1);
}
const handler = worker.fetch;

// ---- test framework ----
let passed = 0, failed = 0;
const failures = [];
function test(name, fn) {
  return fn().then(
    () => { passed++; console.log(`  ✅ ${name}`); },
    (e) => { failed++; failures.push({ name, error: e.message || e }); console.log(`  ❌ ${name} — ${e.message || e}`); }
  );
}
async function expectStatus(resp, status, label) {
  if (resp.status !== status) throw new Error(`${label}: expected ${status}, got ${resp.status} (${await resp.text().catch(() => '')})`);
}
async function expectOk(resp, label) {
  const body = await resp.json();
  if (!body.ok) throw new Error(`${label}: expected ok:true, got ${JSON.stringify(body)}`);
  return body;
}

// ---- database ----
const db = new DatabaseSync(':memory:');
db.exec(readFileSync(join(__dirname, '..', 'schema.sql'), 'utf-8'));

// seed a site
db.prepare(`INSERT INTO sites (id, name, secret, moderation, rate_limit) VALUES ('blog', 'وبلاگ من', 's3cret', 'open', 3)`).run();

// ---- request helper ----
function req(method, path, { body, headers = {} } = {}) {
  return new Request('https://test.local' + path, {
    method,
    headers: { 'Content-Type': 'application/json', ...headers },
    body: body ? JSON.stringify(body) : undefined,
  });
}
// Node 22 has Request? It has global Request (undici). Good.

const env = { D1: db };

// ---- tests ----
const tests = [];
const t = (name, fn) => tests.push([name, fn]);

t('embed.js returns JS', async () => {
  const r = await handler(req('GET', '/embed.js'), env);
  await expectStatus(r, 200, 'embed.js');
  const text = await r.text();
  if (!text.includes('cw-comments')) throw new Error('embed.js missing container id');
  if (!text.includes('data-site')) throw new Error('embed.js missing site attr');
});

t('list comments — empty', async () => {
  const r = await handler(req('GET', '/api/blog/comments?page=/'), env);
  await expectStatus(r, 200, 'list');
  const b = await r.json();
  if (!Array.isArray(b.comments)) throw new Error('comments not array');
  if (b.comments.length !== 0) throw new Error('expected empty');
});

t('post comment — approved (open moderation)', async () => {
  const r = await handler(req('POST', '/api/blog/comments?page=/p1', { body: { author: 'علی', email: 'ali@x.com', body: 'سلام، تست' }, headers: { 'CF-Connecting-IP': '1.1.1.1' } }), env);
  const b = await expectOk(r, 'post');
  if (b.status !== 'approved') throw new Error('expected approved, got ' + b.status);
});

t('post comment — missing fields → 400', async () => {
  const r = await handler(req('POST', '/api/blog/comments?page=/p1', { body: { author: '', body: '' } }), env);
  await expectStatus(r, 400, 'missing fields');
});

t('list comments — now has 1', async () => {
  const r = await handler(req('GET', '/api/blog/comments?page=/p1'), env);
  const b = await r.json();
  if (b.comments.length !== 1) throw new Error('expected 1 comment');
  if (b.comments[0].author !== 'علی') throw new Error('author mismatch');
  if (b.comments[0].email !== undefined) throw new Error('email must not be exposed');
});

t('list comments — page scoping', async () => {
  const r = await handler(req('GET', '/api/blog/comments?page=/p2'), env);
  const b = await r.json();
  if (b.comments.length !== 0) throw new Error('expected 0 on other page');
});

t('honeypot — pretend success, not saved', async () => {
  const r = await handler(req('POST', '/api/blog/comments?page=/p1', { body: { author: 'Bot', body: 'spammy', _hp: 'filled' } }), env);
  await expectOk(r, 'honeypot');
  const list = await handler(req('GET', '/api/blog/comments?page=/p1'), env);
  const b = await list.json();
  if (b.comments.length !== 1) throw new Error('honeypot comment was saved!');
});

t('spam detection — link → spam status', async () => {
  const r = await handler(req('POST', '/api/blog/comments?page=/p1', { body: { author: 'Spammer', body: 'چک کن https://spam.example' }, headers: { 'CF-Connecting-IP': '2.2.2.2' } }), env);
  const b = await expectOk(r, 'spam post');
  if (b.status !== 'spam') throw new Error('expected spam, got ' + b.status);
});

t('spam not shown publicly', async () => {
  const r = await handler(req('GET', '/api/blog/comments?page=/p1'), env);
  const b = await r.json();
  if (b.comments.length !== 1) throw new Error('spam leaked to public');
});

t('rate limit — 4th comment from same IP → 429', async () => {
  // IP 3.3.3.3: limit 3 per hour
  for (let i = 0; i < 3; i++) {
    const r = await handler(req('POST', '/api/blog/comments?page=/p3', { body: { author: 'User', body: 'دیدگاه ' + i }, headers: { 'CF-Connecting-IP': '3.3.3.3' } }), env);
    await expectOk(r, 'rate post ' + i);
  }
  const r4 = await handler(req('POST', '/api/blog/comments?page=/p3', { body: { author: 'User', body: 'چهارمی' }, headers: { 'CF-Connecting-IP': '3.3.3.3' } }), env);
  await expectStatus(r4, 429, 'rate limit');
});

t('moderated site — pending until approved', async () => {
  db.prepare(`INSERT INTO sites (id, name, secret, moderation) VALUES ('mod', 'مدیریتی', 'msec', 'moderated')`).run();
  const r = await handler(req('POST', '/api/mod/comments?page=/x', { body: { author: 'م', body: 'تست' }, headers: { 'CF-Connecting-IP': '9.9.9.9' } }), env);
  const b = await expectOk(r, 'moderated post');
  if (b.status !== 'pending') throw new Error('expected pending, got ' + b.status);
  const list = await handler(req('GET', '/api/mod/comments?page=/x'), env);
  const lb = await list.json();
  if (lb.comments.length !== 0) throw new Error('pending comment leaked');
});

t('closed site — 403', async () => {
  db.prepare(`INSERT INTO sites (id, name, secret, moderation) VALUES ('closed', 'بسته', 'csec', 'closed')`).run();
  const r = await handler(req('POST', '/api/closed/comments?page=/x', { body: { author: 'م', body: 'تست' } }), env);
  await expectStatus(r, 403, 'closed site');
});

t('unknown site — 404', async () => {
  const r = await handler(req('GET', '/api/nope/comments?page=/'), env);
  await expectStatus(r, 404, 'unknown site');
});

t('admin — 401 without auth', async () => {
  const r = await handler(req('GET', '/api/blog/admin/comments'), env);
  await expectStatus(r, 401, 'admin no auth');
});

t('admin — 200 with secret', async () => {
  const r = await handler(req('GET', '/api/blog/admin/comments', { headers: { Authorization: 'Bearer s3cret' } }), env);
  await expectStatus(r, 200, 'admin auth');
  const b = await r.json();
  if (b.comments.length < 1) throw new Error('expected some comments');
});

t('admin — filter pending', async () => {
  const r = await handler(req('GET', '/api/mod/admin/comments?status=pending', { headers: { Authorization: 'Bearer msec' } }), env);
  const b = await r.json();
  if (b.comments.length !== 1) throw new Error('expected 1 pending');
});

t('admin — approve pending → appears publicly', async () => {
  const r = await handler(req('POST', '/api/mod/admin/comments/6?status=approved', { headers: { Authorization: 'Bearer msec' } }), env);
  await expectOk(r, 'approve');
  const list = await handler(req('GET', '/api/mod/comments?page=/x'), env);
  const b = await list.json();
  if (b.comments.length !== 1) throw new Error('approved comment should be public');
});

t('admin — mark spam → hidden again', async () => {
  await handler(req('POST', '/api/mod/admin/comments/6?status=spam', { headers: { Authorization: 'Bearer msec' } }), env);
  const list = await handler(req('GET', '/api/mod/comments?page=/x'), env);
  const b = await list.json();
  if (b.comments.length !== 0) throw new Error('spam comment should be hidden');
});

t('admin — delete comment', async () => {
  const r = await handler(req('GET', '/api/blog/admin/delete/1', { headers: { Authorization: 'Bearer s3cret' } }), env);
  await expectOk(r, 'delete');
  const list = await handler(req('GET', '/api/blog/comments?page=/p1'), env);
  const b = await list.json();
  if (b.comments.length !== 0) throw new Error('comment not deleted');
});

t('admin — stats', async () => {
  const r = await handler(req('GET', '/api/blog/admin/stats', { headers: { Authorization: 'Bearer s3cret' } }), env);
  await expectStatus(r, 200, 'stats');
  const b = await r.json();
  if (typeof b.approved !== 'number' || typeof b.pending !== 'number' || typeof b.spam !== 'number') throw new Error('bad stats shape');
});

t('admin — export CSV', async () => {
  const r = await handler(req('GET', '/api/blog/admin/export.csv', { headers: { Authorization: 'Bearer s3cret' } }), env);
  await expectStatus(r, 200, 'csv');
  const text = await r.text();
  if (!text.startsWith('id,page,parent,author,body,status,created_at')) throw new Error('bad csv header');
  if (!text.includes('دیدگاه 0') || !text.includes('spam')) throw new Error('csv missing data');
});

t('admin dashboard HTML', async () => {
  const r = await handler(req('GET', '/admin?site=blog&key=s3cret'), env);
  await expectStatus(r, 200, 'dashboard');
  const text = await r.text();
  if (!text.includes('مدیریت دیدگاه')) throw new Error('dashboard missing title');
  if (!text.includes('cw-comments') && !text.includes('cf-turnstile')) { /* dashboard does not need embed */ }
  if (!text.includes('سایت')) throw new Error('dashboard missing site ref');
});

t('unknown route — 404', async () => {
  const r = await handler(req('GET', '/nope'), env);
  await expectStatus(r, 404, 'unknown');
});

// ---- run ----
(async () => {
  for (const [name, fn] of tests) await test(name, fn);
  console.log(`\n===== نتیجه: ${passed} ✅ | ${failed} ❌ =====`);
  if (failed > 0) {
    console.log('\nشکست‌ها:');
    for (const f of failures) console.log(`  - ${f.name}: ${f.error}`);
    process.exit(1);
  }
})();
