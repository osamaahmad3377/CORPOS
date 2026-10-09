// Product-key licensing.
//
// The license server (license-server/, deployed on Vercel) hands back a
// signed token after activation/validation:
//   base64url(payloadJson) + "." + base64url(ed25519Signature(payloadJson))
// We verify it offline with the public key baked into app.config.json, so
// the POS keeps working without internet until the token's lease_until.
// Every few hours (and at each launch) we re-validate online; if the server
// says the key was revoked/expired, the license is wiped and the POS locks.

const { fetchCompat } = require('./http');
const crypto = require('node:crypto');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');

// Server answers that mean "this key may no longer be used on this PC".
const FATAL_CODES = new Set(['INVALID_KEY', 'REVOKED', 'EXPIRED', 'NOT_ACTIVATED']);

// Allowed clock drift before we treat the PC clock as rolled back.
const CLOCK_TOLERANCE_SEC = 2 * 3600;

const KEY_PATTERN = /^CPOS-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}-[A-Z0-9]{5}$/;

function normalizeKey(key) {
  return String(key || '').toUpperCase().replace(/[^A-Z0-9]/g, '')
    .replace(/^CPOS/, '')
    .replace(/(.{5})(?=.)/g, '$1-')
    .replace(/^/, 'CPOS-');
}

function isWellFormedKey(key) {
  return KEY_PATTERN.test(key);
}

function rawMachineGuid() {
  try {
    if (process.platform === 'win32') {
      const out = execFileSync('reg', ['query', 'HKLM\\SOFTWARE\\Microsoft\\Cryptography', '/v', 'MachineGuid'], {
        encoding: 'utf8', windowsHide: true,
      });
      const m = out.match(/MachineGuid\s+REG_SZ\s+([^\s]+)/i);
      if (m) return m[1];
    } else if (process.platform === 'darwin') {
      const out = execFileSync('ioreg', ['-rd1', '-c', 'IOPlatformExpertDevice'], { encoding: 'utf8' });
      const m = out.match(/"IOPlatformUUID"\s*=\s*"([^"]+)"/);
      if (m) return m[1];
    } else {
      for (const f of ['/etc/machine-id', '/var/lib/dbus/machine-id']) {
        if (fs.existsSync(f)) return fs.readFileSync(f, 'utf8').trim();
      }
    }
  } catch {
    // fall through
  }
  return `${os.hostname()}|${os.userInfo().username}`;
}

// Stable per-PC id shown to the shop and bound to the key on the server.
function getMachineId() {
  const hex = crypto.createHash('sha256').update(`corepos|${rawMachineGuid()}`).digest('hex').toUpperCase();
  return hex.slice(0, 20).match(/.{5}/g).join('-');
}

function b64urlDecode(s) {
  return Buffer.from(s.replace(/-/g, '+').replace(/_/g, '/'), 'base64');
}

function publicKeyFromRaw(rawB64) {
  const raw = Buffer.from(rawB64, 'base64');
  if (raw.length !== 32) throw new Error('licensePublicKey must be a base64 raw 32-byte Ed25519 key');
  return crypto.createPublicKey({
    key: { kty: 'OKP', crv: 'Ed25519', x: raw.toString('base64url') },
    format: 'jwk',
  });
}

// Returns the payload if the signature is valid, otherwise null.
function verifyToken(token, publicKeyRawB64) {
  if (typeof token !== 'string' || !token.includes('.')) return null;
  const [p, s] = token.split('.');
  try {
    const payloadBytes = b64urlDecode(p);
    const ok = crypto.verify(null, payloadBytes, publicKeyFromRaw(publicKeyRawB64), b64urlDecode(s));
    if (!ok) return null;
    const payload = JSON.parse(payloadBytes.toString('utf8'));
    return payload && payload.v === 1 ? payload : null;
  } catch {
    return null;
  }
}

class LicenseManager {
  constructor({ dataDir, serverUrl, publicKey, appVersion, fetchImpl = fetchCompat, now = () => Date.now() }) {
    this.file = path.join(dataDir, 'license.json');
    this.serverUrl = String(serverUrl || '').replace(/\/+$/, '');
    this.publicKey = publicKey;
    this.appVersion = appVersion;
    this.fetch = fetchImpl;
    this.now = now;
    this.machineId = getMachineId();
  }

  nowSec() {
    return Math.floor(this.now() / 1000);
  }

  read() {
    try {
      return JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      return null;
    }
  }

  write(data) {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = `${this.file}.tmp`;
    fs.writeFileSync(tmp, JSON.stringify(data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  clear() {
    fs.rmSync(this.file, { force: true });
  }

  // Offline check of the stored license.
  // status: 'valid' | 'missing' | 'invalid' | 'expired' | 'lease_expired' | 'clock'
  localStatus() {
    const stored = this.read();
    if (!stored || !stored.token) return { status: 'missing' };

    const payload = verifyToken(stored.token, this.publicKey);
    if (!payload || payload.machine_id !== this.machineId || payload.key !== stored.key) {
      return { status: 'invalid' };
    }

    const now = this.nowSec();
    const info = { payload, key: stored.key };

    // Highest time we've ever seen (server time or local) — if the PC clock
    // is now well behind it, someone wound the clock back to dodge the lease.
    const maxSeen = Math.max(stored.max_seen || 0, payload.issued_at || 0);
    if (now + CLOCK_TOLERANCE_SEC < maxSeen) return { status: 'clock', ...info };

    if (payload.expires_at && now >= payload.expires_at) return { status: 'expired', ...info };
    if (now >= payload.lease_until) return { status: 'lease_expired', ...info };

    if (now > (stored.max_seen || 0)) this.write({ ...stored, max_seen: now });

    return { status: 'valid', daysLeft: Math.floor((payload.lease_until - now) / 86400), ...info };
  }

  async call(endpoint, body) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), 15000);
    try {
      const res = await this.fetch(`${this.serverUrl}/api/v1/${endpoint}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
        signal: ctrl.signal,
      });
      let data = null;
      try { data = await res.json(); } catch { /* non-JSON */ }
      if (!data || typeof data.ok !== 'boolean') {
        return { ok: false, network: true, message: `License server error (HTTP ${res.status}).` };
      }
      return data;
    } catch {
      return { ok: false, network: true, message: 'Could not reach the license server. Check the internet connection.' };
    } finally {
      clearTimeout(timer);
    }
  }

  acceptToken(key, token, serverTime) {
    const payload = verifyToken(token, this.publicKey);
    if (!payload || payload.machine_id !== this.machineId || payload.key !== key) {
      return { ok: false, code: 'BAD_TOKEN', message: 'The license server returned an invalid license. Please contact support.' };
    }
    const stored = this.read() || {};
    this.write({
      key,
      token,
      max_seen: Math.max(stored.max_seen || 0, serverTime || 0, this.nowSec()),
      last_online_check: this.nowSec(),
    });
    return { ok: true, payload };
  }

  async activate(rawKey) {
    const key = normalizeKey(rawKey);
    if (!isWellFormedKey(key)) {
      return { ok: false, code: 'BAD_FORMAT', message: 'Product key should look like CPOS-XXXXX-XXXXX-XXXXX-XXXXX.' };
    }
    const res = await this.call('activate', {
      key,
      machine_id: this.machineId,
      machine_name: os.hostname(),
      app_version: this.appVersion,
    });
    if (!res.ok) return res;
    return this.acceptToken(key, res.license, res.server_time);
  }

  // Online re-check. Returns { ok, fatal, network, code, message }.
  async validate() {
    const stored = this.read();
    if (!stored || !stored.key) return { ok: false, fatal: true, code: 'MISSING' };

    const res = await this.call('validate', {
      key: stored.key,
      machine_id: this.machineId,
      app_version: this.appVersion,
    });

    if (res.ok) return { ...this.acceptToken(stored.key, res.license, res.server_time), fatal: false };

    if (!res.network && FATAL_CODES.has(res.code)) {
      this.clear();
      return { ...res, fatal: true };
    }
    return { ...res, fatal: false };
  }

  async deactivate() {
    const stored = this.read();
    if (!stored || !stored.key) return { ok: true };
    const res = await this.call('deactivate', { key: stored.key, machine_id: this.machineId });
    if (res.ok) this.clear();
    return res;
  }
}

module.exports = { LicenseManager, getMachineId, verifyToken, normalizeKey, isWellFormedKey, FATAL_CODES };
