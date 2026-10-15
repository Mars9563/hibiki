// Real-server behaviour tests for rate limiting + upload guards.   Run: npm run test:limits
//
// Starts the actual server (tsx index.ts) against a FAKE Supabase that answers
// /auth/v1/user ("tok-<name>" -> user <name>) and trivial REST calls. No real service, secret
// or .env is used: the server runs from an empty temp directory with dummy environment
// variables. Covers: trusted-proxy / IP-spoofing behaviour, per-IP and per-user rate limits,
// and the upload guards (size, file count, MIME, concurrency, abort handling).
import http from 'node:http';
import os from 'node:os';
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const SERVER_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EMPTY_CWD = fs.mkdtempSync(path.join(os.tmpdir(), 'hibiki-limits-')); // no .env here
const require = createRequire(SERVER_DIR + '/');
const proxyaddr = require('proxy-addr');

const FAKE = 5056, APP = 5055; // local test ports
let pass = 0, fail = 0;
const check = (name, ok, extra = '') => { (ok ? pass++ : fail++); console.log(`${ok ? 'PASS' : 'FAIL'}  ${name}${extra ? '  [' + extra + ']' : ''}`); };

// ---- fake Supabase ----
const fake = http.createServer((req, res) => {
  res.setHeader('content-type', 'application/json');
  if (req.url.startsWith('/auth/v1/user')) {
    const tok = (req.headers.authorization || '').replace('Bearer ', '');
    if (!tok.startsWith('tok-')) { res.statusCode = 401; return res.end('{"msg":"bad"}'); }
    return res.end(JSON.stringify({ id: tok.slice(4), aud: 'authenticated', email: tok + '@x.invalid' }));
  }
  res.end('[]');
});
await new Promise(r => fake.listen(FAKE, '127.0.0.1', r));

// ---- real server (cwd has no .env; all env overridden to dummies) ----
const srv = spawn(SERVER_DIR + '/node_modules/.bin/tsx', [SERVER_DIR + '/index.ts'], {
  cwd: EMPTY_CWD,
  env: { PATH: process.env.PATH, PORT: String(APP), SUPABASE_URL: `http://127.0.0.1:${FAKE}`, SUPABASE_PUBLISHABLE_KEY: 'pub', SUPABASE_SERVICE_ROLE_KEY: 'svc',
    ALLOWED_ORIGIN: 'http://localhost:3000', CLOUDINARY_CLOUD_NAME: 'x', CLOUDINARY_API_KEY: 'x', CLOUDINARY_API_SECRET: 'x',
    R2_ACCOUNT_ID: 'x', R2_ACCESS_KEY_ID: 'x', R2_SECRET_ACCESS_KEY: 'x', R2_BUCKET_NAME: 'x' },
  stdio: ['ignore', 'pipe', 'pipe'],
});
let serverLog = ''; srv.stdout.on('data', d => serverLog += d); srv.stderr.on('data', d => serverLog += d);
for (let i = 0; i < 100; i++) { try { const r = await fetch(`http://127.0.0.1:${APP}/`); if (r.ok) break; } catch {} await new Promise(r => setTimeout(r, 150)); }

const get = (path, headers = {}) => fetch(`http://127.0.0.1:${APP}${path}`, { headers });
const rss = () => Number(require('node:child_process').execSync(`ps -o rss= -p ${srv.pid} $(pgrep -P ${srv.pid} | tr '\\n' ' ') 2>/dev/null | awk '{s+=$1} END{print s}'`).toString()) / 1024;

try {
  // ============ A. trust proxy / spoofing ============
  console.log('\n--- A. trusted-proxy semantics (proxy-addr, same lib Express uses)');
  const trust = proxyaddr.compile(['loopback', 'linklocal', 'uniquelocal']);
  const mk = (peer, xff) => ({ connection: { remoteAddress: peer }, headers: xff ? { 'x-forwarded-for': xff } : {} });
  check('public peer cannot choose its IP via X-Forwarded-For', proxyaddr(mk('203.0.113.5', '1.2.3.4'), trust) === '203.0.113.5');
  check('private peer (Traefik/pod hop) -> real client from header', proxyaddr(mk('10.42.0.1', '198.51.100.7'), trust) === '198.51.100.7');
  check('spoofed LEFT entries are ignored (right-most untrusted wins)', proxyaddr(mk('10.42.0.1', '6.6.6.6, 198.51.100.7'), trust) === '198.51.100.7');
  check('no header -> TCP peer address (pod IP as today)', proxyaddr(mk('10.42.0.9', null), trust) === '10.42.0.9');
  check('trusting everything (trust proxy=true) WOULD be spoofable [control]', proxyaddr(mk('203.0.113.5', '1.2.3.4'), () => true) === '1.2.3.4');

  // ============ B. startup warning gone ============
  console.log('\n--- B. express-rate-limit validation');
  await get('/api/rooms', { 'x-forwarded-for': '198.51.100.1', authorization: 'Bearer bogus' });
  check('no ERR_ERL_UNEXPECTED_X_FORWARDED_FOR with an X-Forwarded-For request', !/ERR_ERL/.test(serverLog), /ERR_ERL/.test(serverLog) ? serverLog.match(/ERR_ERL\w+/)[0] : '');

  // ============ C. pre-auth limiter keyed by real IP (not shared) ============
  console.log('\n--- C. IP limiter: one client cannot exhaust everyone else\'s bucket');
  let last, firstBlock = -1;
  for (let i = 1; i <= 310; i++) { last = await get('/api/rooms', { 'x-forwarded-for': `203.0.113.${50}`, authorization: 'Bearer bogus' }); if (last.status === 429 && firstBlock < 0) firstBlock = i; }
  check('attacker IP gets 429 after 300 requests', firstBlock === 301, `first 429 at request #${firstBlock}`);
  const other = await get('/api/rooms', { 'x-forwarded-for': '203.0.113.51', authorization: 'Bearer tok-carol' });
  check('a different client IP is NOT affected (200 for valid user)', other.status === 200, `status ${other.status}`);
  const rotating = [];
  for (let i = 0; i < 5; i++) rotating.push((await get('/api/rooms', { 'x-forwarded-for': `${i}.${i}.${i}.${i}, 203.0.113.50`, authorization: 'Bearer bogus' })).status);
  check('rotating spoofed left-hand X-Forwarded-For entries does not evade the limit', rotating.every(s => s === 429), rotating.join(','));

  // ============ D. per-user limiter ============
  console.log('\n--- D. per-user limiter (post-auth)');
  const agg = { alice: 0, aliceBlocked: 0, bobOk: 0 };
  for (let i = 1; i <= 905; i++) { // distinct IPs so the IP limiter never interferes
    const r = await get('/api/rooms', { 'x-forwarded-for': `100.64.${Math.floor(i / 250)}.${i % 250 + 1}`, authorization: 'Bearer tok-alice' });
    if (r.status === 429) agg.aliceBlocked++; else if (r.status === 200) agg.alice++;
  }
  const bob = await get('/api/rooms', { 'x-forwarded-for': '100.65.0.1', authorization: 'Bearer tok-bob' });
  check('user alice limited to 900 / 15 min', agg.alice === 900 && agg.aliceBlocked === 5, `ok=${agg.alice} blocked=${agg.aliceBlocked}`);
  check('user bob unaffected by alice', bob.status === 200, `status ${bob.status}`);

  // ============ E. upload guards ============
  console.log('\n--- E. upload guards');
  const url = `http://127.0.0.1:${APP}/api/rooms/00000000-0000-4000-8000-000000000000/messages`;
  const hdr = u => ({ authorization: `Bearer tok-${u}`, 'x-forwarded-for': `192.0.2.${Math.floor(Math.random() * 200) + 1}` });
  const form = (files) => { const f = new FormData(); files.forEach(([n, size, type]) => f.append('files', new Blob([new Uint8Array(size)], { type }), n)); return f; };

  let r = await fetch(url, { method: 'POST', headers: hdr('up1'), body: form([['big.pdf', 80 * 1024 * 1024, 'application/pdf']]) });
  check('declared Content-Length > 76 MB rejected up front (413 JSON)', r.status === 413 && (await r.json()).success === false, `status ${r.status}`);

  r = await fetch(url, { method: 'POST', headers: hdr('up2'), body: form([['a.pdf', 26 * 1024 * 1024, 'application/pdf']]) });
  check('single file > 25 MB -> 413 JSON (was a non-JSON 500)', r.status === 413 && (await r.json()).success === false, `status ${r.status}`);

  r = await fetch(url, { method: 'POST', headers: hdr('up3'), body: form(Array.from({ length: 11 }, (_, i) => [`f${i}.txt`, 10, 'text/plain'])) });
  check('11 files -> 400 JSON', r.status === 400 && (await r.json()).success === false, `status ${r.status}`);

  r = await fetch(url, { method: 'POST', headers: hdr('up4'), body: form([['x.exe', 10, 'application/x-msdownload']]) });
  check('disallowed MIME -> 415 JSON', r.status === 415 && (await r.json()).success === false, `status ${r.status}`);

  // chunked stream with NO Content-Length, 200 MB -> must be cut off, RAM must not balloon
  const before = rss();
  const code = await new Promise(resolve => {
    const rq = http.request(url, { method: 'POST', headers: { ...hdr('up5'), 'content-type': 'multipart/form-data; boundary=BB', 'transfer-encoding': 'chunked' } }, res => { let b = ''; res.on('data', d => b += d); res.on('end', () => resolve(res.statusCode)); });
    rq.on('error', () => resolve('reset'));
    rq.write('--BB\r\nContent-Disposition: form-data; name="files"; filename="a.pdf"\r\nContent-Type: application/pdf\r\n\r\n');
    const chunk = Buffer.alloc(1024 * 1024, 65); let sent = 0;
    const pump = () => { while (sent < 200) { sent++; if (!rq.write(chunk)) return rq.once('drain', pump); } rq.end(); };
    pump();
  });
  const after = rss(); const aliveAfter = await fetch(`http://127.0.0.1:${APP}/`).then(r=>r.status).catch(()=>0); check("server process SURVIVES the aborted oversized upload", aliveAfter===200, `GET / -> ${aliveAfter}`);
  check('200 MB chunked body (no Content-Length) is cut off', code === 413 || code === 'reset', `result ${code}`);
  check('server RAM stays bounded during that attempt', after - before < 150, `RSS ${before.toFixed(0)} -> ${after.toFixed(0)} MB`);

  // concurrency: hold slots open with stalled uploads
  const stall = (user) => new Promise(resolve => {
    const rq = http.request(url, { method: 'POST', headers: { ...hdr(user), 'content-type': 'multipart/form-data; boundary=BB', 'transfer-encoding': 'chunked' } }, res => { res.resume(); resolve({ res: res.statusCode, rq }); });
    rq.on('error', () => {});
    rq.write('--BB\r\nContent-Disposition: form-data; name="files"; filename="a.txt"\r\nContent-Type: text/plain\r\n\r\nhello');
    setTimeout(() => resolve({ held: true, rq }), 600); // no response within 600 ms => slot is being held
  });
  const heldA = [await stall('same'), await stall('same')];
  const third = await stall('same');
  check('per-user cap: 2 stalled uploads hold slots, the 3rd gets 429', heldA.every(h => h.held) && third.res === 429, `held=${heldA.map(h => !!h.held)} third=${third.res}`);
  heldA.forEach(h => h.rq.destroy()); third.rq.destroy();
  await new Promise(r => setTimeout(r, 400));
  const heldB = [await stall('u1'), await stall('u2'), await stall('u3'), await stall('u4')];
  const fifth = await stall('u5');
  check('global cap: 4 users stalled, the 5th user gets 503', heldB.every(h => h.held) && fifth.res === 503, `held=${heldB.map(h => !!h.held)} fifth=${fifth.res}`);
  heldB.forEach(h => h.rq.destroy()); fifth.rq.destroy();
  await new Promise(r => setTimeout(r, 500));
  const reuse = await stall('u5');
  check('slots are released when clients disconnect (new upload accepted)', reuse.held === true, `res=${reuse.res}`);
  reuse.rq.destroy();
} finally {
  srv.kill('SIGTERM'); fake.close();
  console.log(`\n==== ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}
