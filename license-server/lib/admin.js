// Admin-side helpers: auth guards for pages/route handlers and data access.
import { NextResponse } from 'next/server';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { query } from './db.js';
import { audit } from './audit.js';
import { generateProductKey } from './crypto.js';
import { SESSION_COOKIE, verifySessionToken } from './auth.js';

// ---------- auth guards ----------

/** For server components: redirect to the login page if not signed in. */
export async function requireAdminPage() {
  const store = await cookies();
  if (!verifySessionToken(store.get(SESSION_COOKIE)?.value)) redirect('/admin/login');
}

export class AdminError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function adminJson(body, status = 200) {
  return NextResponse.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

/** Wrap an admin API handler: requires a valid session cookie; JSON errors. */
export function adminHandler(fn) {
  return async (req, ctx) => {
    try {
      if (!verifySessionToken(req.cookies.get(SESSION_COOKIE)?.value)) {
        return adminJson({ ok: false, error: 'Not signed in.' }, 401);
      }
      if (req.method !== 'GET' && req.method !== 'HEAD') {
        // CSRF hardening on top of SameSite=Lax: only accept JSON bodies.
        const ct = req.headers.get('content-type') || '';
        if (!ct.includes('application/json')) {
          return adminJson({ ok: false, error: 'Content-Type must be application/json.' }, 415);
        }
      }
      return await fn(req, ctx);
    } catch (err) {
      if (err instanceof AdminError) return adminJson({ ok: false, error: err.message }, err.status);
      console.error('[admin-api]', err);
      return adminJson({ ok: false, error: 'Server error: ' + (err?.message || 'unknown') }, 500);
    }
  };
}

export async function readAdminBody(req) {
  const text = await req.text();
  if (text.length > 64 * 1024) throw new AdminError(400, 'Request body too large.');
  if (!text) return {};
  try {
    const body = JSON.parse(text);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body;
  } catch {
    throw new AdminError(400, 'Request body must be a JSON object.');
  }
}

export function adminIp(req) {
  const xff = req.headers.get('x-forwarded-for');
  return xff ? xff.split(',')[0].trim() : req.headers.get('x-real-ip') || null;
}

// ---------- validation ----------

export function displayTimeZone() {
  const tz = process.env.ADMIN_TIMEZONE || 'Asia/Karachi';
  try {
    new Intl.DateTimeFormat('en-GB', { timeZone: tz });
    return tz;
  } catch {
    return 'UTC';
  }
}

function str(v, max, field, required = false) {
  if (v === undefined || v === null || v === '') {
    if (required) throw new AdminError(400, `${field} is required.`);
    return null;
  }
  if (typeof v !== 'string' && typeof v !== 'number') throw new AdminError(400, `${field} must be text.`);
  const s = String(v).trim();
  if (!s) {
    if (required) throw new AdminError(400, `${field} is required.`);
    return null;
  }
  if (s.length > max) throw new AdminError(400, `${field} is too long (max ${max} characters).`);
  return s;
}

function int(v, field, min, max, fallback) {
  if (v === undefined || v === null || v === '') return fallback;
  const n = Number(v);
  if (!Number.isInteger(n) || n < min || n > max) {
    throw new AdminError(400, `${field} must be a whole number between ${min} and ${max}.`);
  }
  return n;
}

/** expires_at: '' / null = lifetime; 'YYYY-MM-DD' = end of that day in ADMIN_TIMEZONE. */
function expiryDate(v) {
  if (v === undefined || v === null || v === '') return null;
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) {
    throw new AdminError(400, 'Expiry date must be in YYYY-MM-DD format.');
  }
  if (Number.isNaN(Date.parse(v + 'T00:00:00Z'))) throw new AdminError(400, 'Expiry date is not a valid date.');
  return v;
}

export function parseKeyFields(body) {
  return {
    shop_name: str(body.shop_name, 200, 'Shop name', true),
    owner_name: str(body.owner_name, 200, 'Owner name'),
    phone: str(body.phone, 50, 'Phone'),
    city: str(body.city, 100, 'City'),
    notes: str(body.notes, 5000, 'Notes'),
    plan: str(body.plan, 50, 'Plan') || 'standard',
    max_activations: int(body.max_activations, 'Max activations', 1, 1000, 1),
    lease_days: int(body.lease_days, 'Lease days', 1, 3650, 10),
    expires_on: expiryDate(body.expires_at),
  };
}

// SQL expression turning a 'YYYY-MM-DD' param into end-of-day in the admin time zone.
const EXPIRY_SQL = (dateParam, tzParam) =>
  `CASE WHEN ${dateParam}::text IS NULL THEN NULL
        ELSE ((${dateParam}::text)::date + time '23:59:59') AT TIME ZONE ${tzParam}::text END`;

// ---------- data access ----------

export async function listKeys(search) {
  const q = (search || '').trim();
  const like = '%' + q.replace(/[\\%_]/g, (m) => '\\' + m) + '%';
  return query(
    `SELECT k.*, COALESCE(a.used, 0) AS used, a.last_seen
       FROM license_keys k
       LEFT JOIN (
         SELECT license_key_id,
                count(*) FILTER (WHERE deactivated_at IS NULL)::int AS used,
                max(last_seen_at) AS last_seen
           FROM activations GROUP BY license_key_id
       ) a ON a.license_key_id = k.id
      WHERE $1 = ''
         OR k.key ILIKE $2 OR k.shop_name ILIKE $2 OR k.phone ILIKE $2 OR k.city ILIKE $2
         OR k.owner_name ILIKE $2
      ORDER BY k.created_at DESC, k.id DESC
      LIMIT 500`,
    [q, like]
  );
}

export async function createKeys(body, ip) {
  const f = parseKeyFields(body);
  const quantity = int(body.quantity, 'Quantity', 1, 100, 1);
  const tz = displayTimeZone();
  const created = [];
  for (let i = 0; i < quantity; i++) {
    let row = null;
    for (let attempt = 0; attempt < 5 && !row; attempt++) {
      const rows = await query(
        `INSERT INTO license_keys
           (key, shop_name, owner_name, phone, city, notes, plan, max_activations, lease_days, expires_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, ${EXPIRY_SQL('$10', '$11')})
         ON CONFLICT (key) DO NOTHING
         RETURNING *`,
        [generateProductKey(), f.shop_name, f.owner_name, f.phone, f.city, f.notes, f.plan,
         f.max_activations, f.lease_days, f.expires_on, tz]
      );
      row = rows[0] || null;
    }
    if (!row) throw new AdminError(500, 'Could not generate a unique key. Please try again.');
    await audit(row.id, 'created', { by: 'admin', shop_name: row.shop_name, plan: row.plan, max_activations: row.max_activations, lease_days: row.lease_days, expires_at: row.expires_at }, ip);
    created.push(row);
  }
  return created;
}

export async function getKeyById(id) {
  if (!/^\d+$/.test(String(id))) return null;
  const rows = await query(`SELECT * FROM license_keys WHERE id = $1`, [Number(id)]);
  return rows[0] || null;
}

export async function getKeyDetail(id) {
  const key = await getKeyById(id);
  if (!key) return null;
  const [activations, auditLog] = await Promise.all([
    query(
      `SELECT * FROM activations WHERE license_key_id = $1
        ORDER BY (deactivated_at IS NULL) DESC, last_seen_at DESC`,
      [key.id]
    ),
    query(`SELECT * FROM audit_log WHERE license_key_id = $1 ORDER BY created_at DESC, id DESC LIMIT 200`, [key.id]),
  ]);
  return { key, activations, audit: auditLog };
}

async function mustGetKey(id) {
  const key = await getKeyById(id);
  if (!key) throw new AdminError(404, 'Key not found.');
  return key;
}

export async function updateKey(id, body, ip) {
  const before = await mustGetKey(id);
  const f = parseKeyFields(body);
  const rows = await query(
    `UPDATE license_keys
        SET shop_name = $2, owner_name = $3, phone = $4, city = $5, notes = $6, plan = $7,
            max_activations = $8, lease_days = $9, expires_at = ${EXPIRY_SQL('$10', '$11')},
            updated_at = now()
      WHERE id = $1 RETURNING *`,
    [before.id, f.shop_name, f.owner_name, f.phone, f.city, f.notes, f.plan,
     f.max_activations, f.lease_days, f.expires_on, displayTimeZone()]
  );
  const after = rows[0];
  const changes = {};
  for (const k of ['shop_name', 'owner_name', 'phone', 'city', 'notes', 'plan', 'max_activations', 'lease_days', 'expires_at']) {
    const a = before[k] instanceof Date ? before[k].toISOString() : before[k];
    const b = after[k] instanceof Date ? after[k].toISOString() : after[k];
    if (a !== b) changes[k] = { from: a, to: b };
  }
  if (Object.keys(changes).length) await audit(before.id, 'updated', { by: 'admin', changes }, ip);
  return after;
}

export async function revokeKey(id, reason, ip) {
  const key = await mustGetKey(id);
  const r = typeof reason === 'string' ? reason.trim().slice(0, 1000) : '';
  const rows = await query(
    `UPDATE license_keys SET status = 'revoked', revoked_at = now(), revoked_reason = $2, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [key.id, r || null]
  );
  await audit(key.id, 'revoked', { by: 'admin', reason: r || null }, ip);
  return rows[0];
}

export async function reinstateKey(id, ip) {
  const key = await mustGetKey(id);
  const rows = await query(
    `UPDATE license_keys SET status = 'active', revoked_at = NULL, revoked_reason = NULL, updated_at = now()
      WHERE id = $1 RETURNING *`,
    [key.id]
  );
  await audit(key.id, 'reinstated', { by: 'admin', previous_reason: key.revoked_reason }, ip);
  return rows[0];
}

export async function resetActivations(id, ip) {
  const key = await mustGetKey(id);
  const rows = await query(
    `UPDATE activations SET deactivated_at = now()
      WHERE license_key_id = $1 AND deactivated_at IS NULL RETURNING machine_id`,
    [key.id]
  );
  await audit(key.id, 'reset', { by: 'admin', machines: rows.map((r) => r.machine_id) }, ip);
  return rows.length;
}

export async function deactivateActivation(id, activationId, ip) {
  const key = await mustGetKey(id);
  if (!/^\d+$/.test(String(activationId))) throw new AdminError(404, 'Activation not found.');
  const act = (
    await query(`SELECT * FROM activations WHERE id = $1 AND license_key_id = $2`, [Number(activationId), key.id])
  )[0];
  if (!act) throw new AdminError(404, 'Activation not found.');
  if (!act.deactivated_at) {
    await query(`UPDATE activations SET deactivated_at = now() WHERE id = $1`, [act.id]);
    await audit(key.id, 'deactivated', { by: 'admin', machine_id: act.machine_id }, ip);
  }
}
