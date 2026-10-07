#!/usr/bin/env node
// End-to-end smoke test against a running server.
//   1) put LICENSE_PRIVATE_KEY / LICENSE_PUBLIC_KEY / ADMIN_PASSWORD / ADMIN_SESSION_SECRET in .env.local
//   2) npm run build && npm start      (or npm run dev)
//   3) npm run smoke-test [baseUrl]    (default http://localhost:3000)
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';

const BASE = (process.argv[2] || process.env.BASE_URL || 'http://localhost:3000').replace(/\/$/, '');

function loadEnvFile(file) {
  const out = {};
  if (!fs.existsSync(file)) return out;
  for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (m) out[m[1]] = m[2].replace(/^["']|["']$/g, '');
  }
  return out;
}
const env = { ...loadEnvFile(path.resolve('.env.local')), ...process.env };
const ADMIN_PASSWORD = env.ADMIN_PASSWORD;
const PUBLIC_KEY_B64 = env.LICENSE_PUBLIC_KEY;
if (!ADMIN_PASSWORD || !PUBLIC_KEY_B64) {
  console.error('ADMIN_PASSWORD and LICENSE_PUBLIC_KEY must be set (in .env.local or the environment).');
  process.exit(2);
}

let passed = 0;
let failed = 0;
function check(name, cond, extra) {
  if (cond) {
    passed++;
    console.log(`  PASS  ${name}`);
  } else {
    failed++;
    console.log(`  FAIL  ${name}${extra !== undefined ? '  -> ' + JSON.stringify(extra) : ''}`);
  }
}

let cookie = '';
async function call(method, url, body, { raw, headers = {} } = {}) {
  const res = await fetch(BASE + url, {
    method,
    headers: {
      ...(body !== undefined ? { 'Content-Type': 'application/json' } : {}),
      ...(cookie ? { Cookie: cookie } : {}),
      ...headers,
    },
    body: body === undefined ? undefined : raw ? body : JSON.stringify(body),
  });
  const setCookie = res.headers.get('set-cookie');
  let data = null;
  const text = await res.text();
  try { data = JSON.parse(text); } catch { data = { _text: text }; }
  return { status: res.status, data, headers: res.headers, setCookie };
}

// Verify a token using ONLY the raw 32-byte public key (as the desktop client will).
const publicKey = crypto.createPublicKey({
  key: { kty: 'OKP', crv: 'Ed25519', x: Buffer.from(PUBLIC_KEY_B64, 'base64').toString('base64url') },
  format: 'jwk',
});
function verifyToken(token) {
  if (typeof token !== 'string') return null;
  const parts = token.split('.');
  if (parts.length !== 2) return null;
  if (/[=+/]/.test(token)) return null; // must be base64url without padding
  const payloadBytes = Buffer.from(parts[0], 'base64url');
  const sig = Buffer.from(parts[1], 'base64url');
  if (!crypto.verify(null, payloadBytes, publicKey, sig)) return null;
  return JSON.parse(payloadBytes.toString('utf8'));
}

const MACHINE_A = 'MACHINE-A-' + crypto.randomBytes(6).toString('hex');
const MACHINE_B = 'MACHINE-B-' + crypto.randomBytes(6).toString('hex');
const PAYLOAD_FIELDS = ['v', 'key', 'key_id', 'shop_name', 'plan', 'machine_id', 'issued_at', 'lease_until', 'expires_at'];

async function main() {
  console.log(`Smoke testing ${BASE}\n`);

  console.log('Public key');
  const pk = await call('GET', '/api/v1/public-key');
  check('GET /api/v1/public-key ok', pk.status === 200 && pk.data.ok === true, pk.data);
  check('public key matches LICENSE_PUBLIC_KEY', pk.data.public_key === PUBLIC_KEY_B64, pk.data.public_key);
  check('public key is 32 raw bytes', Buffer.from(pk.data.public_key || '', 'base64').length === 32);
  const pre = await call('OPTIONS', '/api/v1/activate', undefined, { headers: { Origin: 'http://example.com', 'Access-Control-Request-Method': 'POST' } });
  check('CORS preflight allows any origin', pre.status === 204 && pre.headers.get('access-control-allow-origin') === '*', pre.status);

  console.log('\nAdmin auth');
  const noAuth = await call('GET', '/api/admin/keys');
  check('admin API without session -> 401', noAuth.status === 401, noAuth.status);
  const badLogin = await call('POST', '/api/admin/login', { password: 'wrong-password' });
  check('login with wrong password -> 401', badLogin.status === 401, badLogin.status);
  const login = await call('POST', '/api/admin/login', { password: ADMIN_PASSWORD });
  check('login with correct password', login.status === 200 && login.data.ok, login.data);
  check('session cookie is HttpOnly + SameSite=Lax', /HttpOnly/i.test(login.setCookie || '') && /SameSite=Lax/i.test(login.setCookie || ''), login.setCookie);
  cookie = (login.setCookie || '').split(';')[0];
  const forged = cookie.replace(/.$/, (c) => (c === 'A' ? 'B' : 'A'));
  const saved = cookie;
  cookie = forged;
  const forgedRes = await call('GET', '/api/admin/keys');
  check('tampered session cookie -> 401', forgedRes.status === 401, forgedRes.status);
  cookie = saved;
  const adminPage = await call('GET', '/admin');
  check('GET /admin with session renders dashboard', adminPage.status === 200, adminPage.status);

  console.log('\nCreate key (admin API)');
  const created = await call('POST', '/api/admin/keys', {
    shop_name: 'Smoke Test Shop', owner_name: 'Tester', phone: '+92 300 0000000', city: 'Lahore',
    plan: 'standard', max_activations: 1, lease_days: 10, notes: 'created by smoke-test',
  });
  check('create key -> 201', created.status === 201 && created.data.ok, created.data);
  const lic = created.data.keys?.[0];
  check('key format CPOS-XXXXX-XXXXX-XXXXX-XXXXX', /^CPOS(-[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}){4}$/.test(lic?.key || ''), lic?.key);
  const multi = await call('POST', '/api/admin/keys', { shop_name: 'Bulk Shop', quantity: 3 });
  check('create quantity=3 -> 3 distinct keys', multi.data.keys?.length === 3 && new Set(multi.data.keys.map((k) => k.key)).size === 3, multi.data);
  const missingShop = await call('POST', '/api/admin/keys', { owner_name: 'x' });
  check('create without shop_name -> 400', missingShop.status === 400, missingShop.data);

  console.log('\nActivate');
  const messyKey = '  ' + lic.key.toLowerCase().replace(/-/g, ' - ') + ' ';
  const act1 = await call('POST', '/api/v1/activate', { key: messyKey, machine_id: MACHINE_A, machine_name: 'Front Counter', app_version: '1.0.0' });
  check('activate machine A (key normalized: lowercase/spaces)', act1.status === 200 && act1.data.ok === true && typeof act1.data.license === 'string', act1.data);
  check('response has server_time', Number.isInteger(act1.data.server_time));
  const p1 = verifyToken(act1.data.license);
  check('token signature verifies with raw public key only', !!p1);
  if (p1) {
    const now = Math.floor(Date.now() / 1000);
    check('payload has exactly the specified fields', PAYLOAD_FIELDS.every((f) => f in p1) && Object.keys(p1).length === PAYLOAD_FIELDS.length, Object.keys(p1));
    check('payload v=1, key, key_id string, machine_id', p1.v === 1 && p1.key === lic.key && p1.key_id === String(lic.id) && p1.machine_id === MACHINE_A, p1);
    check('payload shop_name/plan', p1.shop_name === 'Smoke Test Shop' && p1.plan === 'standard', p1);
    check('lease_until = issued_at + 10 days', p1.lease_until === p1.issued_at + 10 * 86400, p1);
    check('issued_at ~ now', Math.abs(p1.issued_at - now) < 60, p1.issued_at);
    check('expires_at null (lifetime)', p1.expires_at === null, p1.expires_at);
  }
  const tampered = act1.data.license.replace(/^./, (c) => (c === 'e' ? 'f' : 'e'));
  check('tampered token fails verification', verifyToken(tampered) === null);

  const act1b = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_A, app_version: '1.0.1' });
  check('re-activate same machine -> ok (idempotent)', act1b.status === 200 && act1b.data.ok === true && !!verifyToken(act1b.data.license), act1b.data);

  const act2 = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_B, machine_name: 'Back Office' });
  check('activate second machine -> ACTIVATION_LIMIT (409)', act2.status === 409 && act2.data.ok === false && act2.data.code === 'ACTIVATION_LIMIT', act2.data);
  check('error has message + server_time', typeof act2.data.message === 'string' && Number.isInteger(act2.data.server_time));

  console.log('\nValidation errors');
  const inv = await call('POST', '/api/v1/activate', { key: 'CPOS-AAAAA-AAAAA-AAAAA-AAAAA', machine_id: MACHINE_A });
  check('unknown key -> INVALID_KEY (404)', inv.status === 404 && inv.data.code === 'INVALID_KEY', inv.data);
  const badMid = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: 'short' });
  check('bad machine_id -> BAD_REQUEST (400)', badMid.status === 400 && badMid.data.code === 'BAD_REQUEST', badMid.data);
  const badChars = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: 'abc_def_ghi!' });
  check('machine_id with invalid chars -> BAD_REQUEST', badChars.data.code === 'BAD_REQUEST', badChars.data);
  const noKey = await call('POST', '/api/v1/activate', { machine_id: MACHINE_A });
  check('missing key -> BAD_REQUEST', noKey.status === 400 && noKey.data.code === 'BAD_REQUEST', noKey.data);
  const badJson = await call('POST', '/api/v1/activate', '{not json', { raw: true });
  check('invalid JSON -> BAD_REQUEST', badJson.status === 400 && badJson.data.code === 'BAD_REQUEST', badJson.data);
  const big = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_A, machine_name: 'x'.repeat(11 * 1024) });
  check('body > 10KB -> BAD_REQUEST', big.status === 400 && big.data.code === 'BAD_REQUEST', big.data);

  console.log('\nValidate');
  const val = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: MACHINE_A, app_version: '1.0.2' });
  check('validate machine A -> ok', val.status === 200 && val.data.ok === true, val.data);
  const pv = verifyToken(val.data.license);
  check('validate token verifies with raw public key', !!pv && pv.machine_id === MACHINE_A && pv.key === lic.key, pv);
  const valB = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: MACHINE_B });
  check('validate unbound machine B -> NOT_ACTIVATED', valB.data.ok === false && valB.data.code === 'NOT_ACTIVATED', valB.data);

  console.log('\nRevoke / reinstate');
  const rev = await call('POST', `/api/admin/keys/${lic.id}/revoke`, { reason: 'smoke test' });
  check('admin revoke', rev.status === 200 && rev.data.key?.status === 'revoked', rev.data);
  const valRev = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: MACHINE_A });
  check('validate after revoke -> REVOKED (403)', valRev.status === 403 && valRev.data.code === 'REVOKED', valRev.data);
  const actRev = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_A });
  check('activate after revoke -> REVOKED', actRev.data.code === 'REVOKED', actRev.data);
  const rein = await call('POST', `/api/admin/keys/${lic.id}/reinstate`, {});
  check('admin reinstate', rein.status === 200 && rein.data.key?.status === 'active', rein.data);
  const valRein = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: MACHINE_A });
  check('validate after reinstate -> ok', valRein.data.ok === true && !!verifyToken(valRein.data.license), valRein.data);

  console.log('\nDeactivate');
  const deact = await call('POST', '/api/v1/deactivate', { key: lic.key, machine_id: MACHINE_A });
  check('deactivate machine A -> { ok: true, server_time }', deact.status === 200 && deact.data.ok === true && Number.isInteger(deact.data.server_time) && !('license' in deact.data), deact.data);
  const valDeact = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: MACHINE_A });
  check('validate after deactivate -> NOT_ACTIVATED', valDeact.data.ok === false && valDeact.data.code === 'NOT_ACTIVATED', valDeact.data);
  const actB = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_B, machine_name: 'Back Office' });
  check('freed seat: activate machine B -> ok', actB.data.ok === true && verifyToken(actB.data.license)?.machine_id === MACHINE_B, actB.data);
  const actA2 = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_A });
  check('machine A now blocked -> ACTIVATION_LIMIT', actA2.data.code === 'ACTIVATION_LIMIT', actA2.data);

  console.log('\nAdmin detail / edit / reset');
  const detail = await call('GET', `/api/admin/keys/${lic.id}`);
  check('detail lists 2 activations (1 active)', detail.data.activations?.length === 2 && detail.data.activations.filter((a) => !a.deactivated_at).length === 1, detail.data.activations);
  const events = new Set((detail.data.audit || []).map((e) => e.event));
  check('audit log has created/activated/failed/revoked/reinstated/deactivated',
    ['created', 'activated', 'failed', 'revoked', 'reinstated', 'deactivated'].every((e) => events.has(e)), [...events]);
  const page = await call('GET', `/admin/keys/${lic.id}`);
  check('key detail page renders', page.status === 200 && page.data._text?.includes(lic.key), page.status);
  const upd = await call('PATCH', `/api/admin/keys/${lic.id}`, { ...lic, max_activations: 2, lease_days: 5, expires_at: '' });
  check('admin edit max_activations=2, lease_days=5', upd.data.key?.max_activations === 2 && upd.data.key?.lease_days === 5, upd.data);
  const actA3 = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_A });
  const pa3 = verifyToken(actA3.data.license);
  check('machine A activates after limit raised; lease = 5 days', actA3.data.ok === true && pa3?.lease_until === pa3?.issued_at + 5 * 86400, actA3.data);
  const reset = await call('POST', `/api/admin/keys/${lic.id}/reset`, {});
  check('admin reset all activations', reset.data.ok === true && reset.data.deactivated === 2, reset.data);
  const valAfterReset = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: MACHINE_B });
  check('validate after reset -> NOT_ACTIVATED', valAfterReset.data.code === 'NOT_ACTIVATED', valAfterReset.data);
  const actAfterReset = await call('POST', '/api/v1/activate', { key: lic.key, machine_id: MACHINE_B });
  const actRow = (await call('GET', `/api/admin/keys/${lic.id}`)).data.activations.find((a) => a.machine_id === MACHINE_B);
  check('re-activate after reset ok', actAfterReset.data.ok === true && !actRow.deactivated_at, actAfterReset.data);
  const adminDeact = await call('POST', `/api/admin/keys/${lic.id}/activations/${actRow.id}/deactivate`, {});
  const valAfterAdminDeact = await call('POST', '/api/v1/validate', { key: lic.key, machine_id: MACHINE_B });
  check('admin per-machine deactivate -> NOT_ACTIVATED', adminDeact.data.ok === true && valAfterAdminDeact.data.code === 'NOT_ACTIVATED', valAfterAdminDeact.data);

  console.log('\nExpiry');
  const fmt = (d) => d.toISOString().slice(0, 10);
  const expired = await call('POST', '/api/admin/keys', { shop_name: 'Expired Shop', expires_at: fmt(new Date(Date.now() - 3 * 86400e3)) });
  const actExp = await call('POST', '/api/v1/activate', { key: expired.data.keys[0].key, machine_id: MACHINE_A });
  check('expired key -> EXPIRED (403)', actExp.status === 403 && actExp.data.code === 'EXPIRED', actExp.data);
  const soon = await call('POST', '/api/admin/keys', { shop_name: 'Soon Shop', lease_days: 10, expires_at: fmt(new Date(Date.now() + 3 * 86400e3)) });
  const actSoon = await call('POST', '/api/v1/activate', { key: soon.data.keys[0].key, machine_id: MACHINE_A });
  const ps = verifyToken(actSoon.data.license);
  const expUnix = Math.floor(new Date(soon.data.keys[0].expires_at).getTime() / 1000);
  check('lease_until capped at expires_at', !!ps && ps.expires_at === expUnix && ps.lease_until === expUnix && ps.lease_until < ps.issued_at + 10 * 86400, ps);

  console.log('\nLogout');
  const lo = await call('POST', '/api/admin/logout', {});
  cookie = (lo.setCookie || '').split(';')[0];
  const afterLogout = await call('GET', '/api/admin/keys');
  check('logout clears session', afterLogout.status === 401, afterLogout.status);

  console.log(`\n${passed} passed, ${failed} failed`);
  process.exit(failed ? 1 : 0);
}

main().catch((err) => {
  console.error('Smoke test crashed:', err);
  process.exit(1);
});
