import { query } from './db.js';
import { audit } from './audit.js';
import { ApiError } from './api.js';
import { normalizeKey, buildLicensePayload, signLicense } from './crypto.js';

const MACHINE_ID_RE = /^[A-Za-z0-9-]{8,128}$/;

function optionalString(v, max) {
  if (typeof v !== 'string') return null;
  const s = v.trim();
  return s ? s.slice(0, max) : null;
}

/** Validate + normalize the common request fields. */
export function parseLicenseRequest(body) {
  if (typeof body.key !== 'string' || !normalizeKey(body.key)) {
    throw new ApiError('BAD_REQUEST', 'A product key is required.');
  }
  if (typeof body.machine_id !== 'string' || !MACHINE_ID_RE.test(body.machine_id)) {
    throw new ApiError(
      'BAD_REQUEST',
      'machine_id is required and must be 8-128 characters (letters, digits and hyphens only).'
    );
  }
  const key = normalizeKey(body.key);
  if (key.length > 64) throw new ApiError('BAD_REQUEST', 'The product key is too long.');
  return {
    key,
    machineId: body.machine_id,
    machineName: optionalString(body.machine_name, 200),
    appVersion: optionalString(body.app_version, 50),
  };
}

async function failAndThrow(lic, action, code, message, req) {
  await audit(lic?.id ?? null, 'failed', { action, code, key: req.key, machine_id: req.machineId }, req.ip);
  throw new ApiError(code, message);
}

/** Look up a key and apply the INVALID_KEY / REVOKED / EXPIRED checks. */
async function loadUsableLicense(action, req) {
  const rows = await query(`SELECT * FROM license_keys WHERE key = $1`, [req.key]);
  const lic = rows[0];
  if (!lic) {
    await failAndThrow(null, action, 'INVALID_KEY', 'This product key was not found. Please check the key and try again.', req);
  }
  if (lic.status === 'revoked') {
    await failAndThrow(lic, action, 'REVOKED', 'This product key has been revoked. Please contact your vendor.', req);
  }
  if (lic.expires_at && new Date(lic.expires_at).getTime() <= Date.now()) {
    await failAndThrow(lic, action, 'EXPIRED', 'This product key has expired. Please contact your vendor to renew.', req);
  }
  return lic;
}

export async function activate(req) {
  const lic = await loadUsableLicense('activate', req);

  const existing = (
    await query(`SELECT * FROM activations WHERE license_key_id = $1 AND machine_id = $2`, [lic.id, req.machineId])
  )[0];

  if (existing && !existing.deactivated_at) {
    // Idempotent re-activation (e.g. reinstall on the same PC).
    await query(
      `UPDATE activations
          SET last_seen_at = now(), last_ip = $2,
              machine_name = COALESCE($3, machine_name), app_version = COALESCE($4, app_version)
        WHERE id = $1`,
      [existing.id, req.ip, req.machineName, req.appVersion]
    );
    await audit(lic.id, 'activated', { machine_id: req.machineId, machine_name: req.machineName, app_version: req.appVersion, reactivation: true }, req.ip);
    return signLicense(buildLicensePayload(lic, req.machineId));
  }

  // New machine, or a previously deactivated one: enforce the seat limit.
  // The count check is embedded in the write so concurrent activations can't easily overshoot.
  const rows = await query(
    `INSERT INTO activations (license_key_id, machine_id, machine_name, app_version, last_ip)
     SELECT $1, $2, $3, $4, $5
      WHERE (SELECT count(*) FROM activations
              WHERE license_key_id = $1 AND deactivated_at IS NULL AND machine_id <> $2) < $6
     ON CONFLICT (license_key_id, machine_id) DO UPDATE
        SET deactivated_at = NULL, last_seen_at = now(), last_ip = EXCLUDED.last_ip,
            machine_name = COALESCE(EXCLUDED.machine_name, activations.machine_name),
            app_version = COALESCE(EXCLUDED.app_version, activations.app_version)
     RETURNING id`,
    [lic.id, req.machineId, req.machineName, req.appVersion, req.ip, lic.max_activations]
  );
  if (rows.length === 0) {
    await failAndThrow(
      lic,
      'activate',
      'ACTIVATION_LIMIT',
      `This product key is already activated on the maximum number of computers (${lic.max_activations}). Deactivate it on another computer or contact your vendor.`,
      req
    );
  }
  await audit(lic.id, 'activated', { machine_id: req.machineId, machine_name: req.machineName, app_version: req.appVersion, reactivation: Boolean(existing) }, req.ip);
  return signLicense(buildLicensePayload(lic, req.machineId));
}

export async function validate(req) {
  const lic = await loadUsableLicense('validate', req);
  const rows = await query(
    `UPDATE activations
        SET last_seen_at = now(), last_ip = $3, app_version = COALESCE($4, app_version)
      WHERE license_key_id = $1 AND machine_id = $2 AND deactivated_at IS NULL
      RETURNING id`,
    [lic.id, req.machineId, req.ip, req.appVersion]
  );
  if (rows.length === 0) {
    await failAndThrow(lic, 'validate', 'NOT_ACTIVATED', 'This computer is not activated for this product key. Please activate it again.', req);
  }
  // Successful validations only update last_seen_at (not logged, to avoid audit bloat).
  return signLicense(buildLicensePayload(lic, req.machineId));
}

export async function deactivate(req) {
  const lic = (await query(`SELECT * FROM license_keys WHERE key = $1`, [req.key]))[0];
  if (!lic) {
    await failAndThrow(null, 'deactivate', 'INVALID_KEY', 'This product key was not found. Please check the key and try again.', req);
  }
  const act = (
    await query(`SELECT * FROM activations WHERE license_key_id = $1 AND machine_id = $2`, [lic.id, req.machineId])
  )[0];
  if (!act) {
    await failAndThrow(lic, 'deactivate', 'NOT_ACTIVATED', 'This computer is not activated for this product key.', req);
  }
  if (!act.deactivated_at) {
    await query(`UPDATE activations SET deactivated_at = now(), last_ip = $2 WHERE id = $1`, [act.id, req.ip]);
    await audit(lic.id, 'deactivated', { machine_id: req.machineId, by: 'client' }, req.ip);
  }
}
