// Tests src/license.js against an in-process mock of the license server
// protocol (same token format as license-server/).  node scripts/test-license.mjs

import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { LicenseManager, normalizeKey } = require('../src/license.js');

const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
const rawPub = Buffer.from(publicKey.export({ format: 'jwk' }).x, 'base64url').toString('base64');

const KEY = 'CPOS-ABCDE-FGHJK-LMNPQ-RSTUV';
let clock = Date.now();
const db = { status: 'active', machine: null, leaseDays: 10, expiresAt: null };

function sign(payload) {
  const json = Buffer.from(JSON.stringify(payload), 'utf8');
  return `${json.toString('base64url')}.${crypto.sign(null, json, privateKey).toString('base64url')}`;
}

const server = http.createServer((req, res) => {
  let body = '';
  req.on('data', (d) => { body += d; });
  req.on('end', () => {
    const b = JSON.parse(body || '{}');
    const now = Math.floor(clock / 1000);
    const reply = (status, obj) => { res.writeHead(status, { 'Content-Type': 'application/json' }); res.end(JSON.stringify({ ...obj, server_time: now })); };
    const fail = (code) => reply(403, { ok: false, code, message: code });
    const ep = req.url.replace('/api/v1/', '');
    if (b.key !== KEY) return fail('INVALID_KEY');
    if (db.status === 'revoked') return fail('REVOKED');
    if (ep === 'activate') {
      if (db.machine && db.machine !== b.machine_id) return fail('ACTIVATION_LIMIT');
      db.machine = b.machine_id;
    } else if (ep === 'validate') {
      if (db.machine !== b.machine_id) return fail('NOT_ACTIVATED');
    } else if (ep === 'deactivate') {
      db.machine = null;
      return reply(200, { ok: true });
    }
    reply(200, {
      ok: true,
      license: sign({ v: 1, key: KEY, key_id: '1', shop_name: 'Test Shop', plan: 'standard', machine_id: b.machine_id, issued_at: now, lease_until: now + db.leaseDays * 86400, expires_at: db.expiresAt }),
    });
  });
});
await new Promise((r) => server.listen(0, '127.0.0.1', r));
const url = `http://127.0.0.1:${server.address().port}`;

const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'corepos-lic-'));
const lm = new LicenseManager({ dataDir, serverUrl: url, publicKey: rawPub, appVersion: 'test', now: () => clock });
const day = 86400 * 1000;
let n = 0;
const ok = (name) => console.log(`  ✓ ${++n}. ${name}`);

try {
  assert.equal(normalizeKey(' cpos abcde-fghjk lmnpq rstuv '), KEY); ok('key normalisation');
  assert.match(lm.machineId, /^[0-9A-F]{5}(-[0-9A-F]{5}){3}$/); ok(`machine id ${lm.machineId}`);
  assert.equal(lm.localStatus().status, 'missing'); ok('no license at first');

  let r = await lm.activate('CPOS-WRONG-WRONG-WRONG-WRONG');
  assert.equal(r.code, 'INVALID_KEY'); ok('unknown key rejected');
  r = await lm.activate('CPOS-123'); assert.equal(r.code, 'BAD_FORMAT'); ok('malformed key rejected locally');

  r = await lm.activate(KEY.toLowerCase());
  assert.equal(r.ok, true); assert.equal(lm.localStatus().status, 'valid'); ok('activation stores a valid license');

  const lm2 = new LicenseManager({ dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'corepos-lic2-')), serverUrl: url, publicKey: rawPub, appVersion: 'test', now: () => clock });
  lm2.machineId = 'AAAAA-BBBBB-CCCCC-DDDDD';
  assert.equal((await lm2.activate(KEY)).code, 'ACTIVATION_LIMIT'); ok('second PC blocked (activation limit)');

  // Tampering: change shop name inside the payload, keep old signature.
  const stored = JSON.parse(fs.readFileSync(lm.file, 'utf8'));
  const [p, s] = stored.token.split('.');
  const forged = JSON.parse(Buffer.from(p, 'base64url'));
  forged.lease_until += 365 * 86400;
  fs.writeFileSync(lm.file, JSON.stringify({ ...stored, token: `${Buffer.from(JSON.stringify(forged)).toString('base64url')}.${s}` }));
  assert.equal(lm.localStatus().status, 'invalid'); ok('edited license file rejected');
  fs.writeFileSync(lm.file, JSON.stringify(stored));

  // Copy license to another PC.
  fs.writeFileSync(lm2.file, JSON.stringify(stored));
  assert.equal(lm2.localStatus().status, 'invalid'); ok('license copied to another PC rejected');

  // Offline within lease.
  const offline = new LicenseManager({ dataDir, serverUrl: 'http://127.0.0.1:9', publicKey: rawPub, appVersion: 'test', now: () => clock });
  clock += 5 * day;
  r = await offline.validate();
  assert.equal(r.ok, false); assert.equal(r.fatal, false); assert.equal(r.network, true);
  assert.equal(offline.localStatus().status, 'valid'); ok('offline 5 days: still works');

  clock += 6 * day;
  assert.equal(offline.localStatus().status, 'lease_expired'); ok('offline 11 days: lease expired, needs internet');

  r = await lm.validate();
  assert.equal(r.ok, true); assert.equal(lm.localStatus().status, 'valid'); ok('back online: lease renewed');

  // Clock rollback.
  clock -= 3 * day;
  assert.equal(lm.localStatus().status, 'clock'); ok('PC clock wound back detected');
  clock += 3 * day;

  // Revocation.
  db.status = 'revoked';
  r = await lm.validate();
  assert.equal(r.fatal, true); assert.equal(r.code, 'REVOKED');
  assert.equal(lm.localStatus().status, 'missing'); ok('revoked key: license wiped, POS must lock');
  db.status = 'active';

  // Key expiry date.
  db.expiresAt = Math.floor(clock / 1000) + 2 * 86400;
  assert.equal((await lm.activate(KEY)).ok, true);
  assert.ok(lm.localStatus().payload.expires_at); clock += 3 * day;
  assert.equal(lm.localStatus().status, 'expired'); ok('subscription end date enforced offline');
  db.expiresAt = null;

  assert.equal((await lm.activate(KEY)).ok, true);
  r = await lm.deactivate();
  assert.equal(r.ok, true); assert.equal(lm.localStatus().status, 'missing'); assert.equal(db.machine, null); ok('deactivate frees the key for a new PC');

  console.log(`\nAll ${n} license tests passed.`);
} finally {
  server.close();
}
