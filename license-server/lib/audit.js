import { query } from './db.js';

/** Best-effort audit write; never breaks the main request. */
export async function audit(licenseKeyId, event, detail = null, ip = null) {
  try {
    await query(
      `INSERT INTO audit_log (license_key_id, event, detail, ip) VALUES ($1, $2, $3::jsonb, $4)`,
      [licenseKeyId ?? null, event, detail == null ? null : JSON.stringify(detail), ip]
    );
  } catch (err) {
    console.error('[audit] failed to write audit log', err);
  }
}
