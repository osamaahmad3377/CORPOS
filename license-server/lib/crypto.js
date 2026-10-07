import crypto from 'node:crypto';

const KEY_ALPHABET = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

/** CPOS-XXXXX-XXXXX-XXXXX-XXXXX using crypto.randomInt */
export function generateProductKey() {
  const groups = [];
  for (let g = 0; g < 4; g++) {
    let s = '';
    for (let i = 0; i < 5; i++) s += KEY_ALPHABET[crypto.randomInt(KEY_ALPHABET.length)];
    groups.push(s);
  }
  return 'CPOS-' + groups.join('-');
}

/** Uppercase, trim, strip all whitespace. */
export function normalizeKey(key) {
  return String(key).toUpperCase().replace(/\s+/g, '');
}

let cachedPrivateKey = null;
function getPrivateKey() {
  if (cachedPrivateKey) return cachedPrivateKey;
  const b64 = process.env.LICENSE_PRIVATE_KEY;
  if (!b64) throw new Error('LICENSE_PRIVATE_KEY is not set');
  cachedPrivateKey = crypto.createPrivateKey({
    key: Buffer.from(b64.trim(), 'base64'),
    format: 'der',
    type: 'pkcs8',
  });
  if (cachedPrivateKey.asymmetricKeyType !== 'ed25519') {
    cachedPrivateKey = null;
    throw new Error('LICENSE_PRIVATE_KEY must be an Ed25519 key');
  }
  return cachedPrivateKey;
}

/** base64 of the raw 32-byte Ed25519 public key. */
export function getPublicKeyBase64() {
  const fromEnv = process.env.LICENSE_PUBLIC_KEY;
  if (fromEnv) return fromEnv.trim();
  // Fallback: derive from the private key.
  const jwk = crypto.createPublicKey(getPrivateKey()).export({ format: 'jwk' });
  return Buffer.from(jwk.x, 'base64url').toString('base64');
}

/**
 * token = base64url(payloadJson) + "." + base64url(ed25519 signature over payloadJson bytes)
 * (Node's base64url encoding has no padding.)
 */
export function signLicense(payloadObject) {
  const payloadJson = JSON.stringify(payloadObject);
  const payloadBytes = Buffer.from(payloadJson, 'utf8');
  const signature = crypto.sign(null, payloadBytes, getPrivateKey());
  return payloadBytes.toString('base64url') + '.' + signature.toString('base64url');
}

export function unixNow() {
  return Math.floor(Date.now() / 1000);
}

/** Build the exact payload the desktop client verifies. */
export function buildLicensePayload(lic, machineId) {
  const now = unixNow();
  const expiresAt = lic.expires_at ? Math.floor(new Date(lic.expires_at).getTime() / 1000) : null;
  let leaseUntil = now + Number(lic.lease_days) * 86400;
  if (expiresAt !== null && leaseUntil > expiresAt) leaseUntil = expiresAt;
  return {
    v: 1,
    key: lic.key,
    key_id: String(lic.id),
    shop_name: lic.shop_name,
    plan: lic.plan,
    machine_id: machineId,
    issued_at: now,
    lease_until: leaseUntil,
    expires_at: expiresAt,
  };
}
