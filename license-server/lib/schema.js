// Keep in sync with /schema.sql. Each entry is a single statement
// (Neon's HTTP driver runs one statement per request).
export const SCHEMA_STATEMENTS = [
  `CREATE TABLE IF NOT EXISTS license_keys (
    id               SERIAL PRIMARY KEY,
    key              TEXT NOT NULL UNIQUE,
    shop_name        TEXT NOT NULL,
    owner_name       TEXT,
    phone            TEXT,
    city             TEXT,
    notes            TEXT,
    plan             TEXT NOT NULL DEFAULT 'standard',
    max_activations  INTEGER NOT NULL DEFAULT 1 CHECK (max_activations >= 1),
    lease_days       INTEGER NOT NULL DEFAULT 10 CHECK (lease_days >= 1),
    expires_at       TIMESTAMPTZ,
    status           TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'revoked')),
    revoked_at       TIMESTAMPTZ,
    revoked_reason   TEXT,
    created_at       TIMESTAMPTZ NOT NULL DEFAULT now(),
    updated_at       TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE TABLE IF NOT EXISTS activations (
    id                  SERIAL PRIMARY KEY,
    license_key_id      INTEGER NOT NULL REFERENCES license_keys(id) ON DELETE CASCADE,
    machine_id          TEXT NOT NULL,
    machine_name        TEXT,
    app_version         TEXT,
    first_activated_at  TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_seen_at        TIMESTAMPTZ NOT NULL DEFAULT now(),
    last_ip             TEXT,
    deactivated_at      TIMESTAMPTZ,
    UNIQUE (license_key_id, machine_id)
  )`,
  `CREATE TABLE IF NOT EXISTS audit_log (
    id              SERIAL PRIMARY KEY,
    license_key_id  INTEGER REFERENCES license_keys(id) ON DELETE SET NULL,
    event           TEXT NOT NULL,
    detail          JSONB,
    ip              TEXT,
    created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
  )`,
  `CREATE INDEX IF NOT EXISTS audit_log_key_idx ON audit_log (license_key_id, created_at DESC)`,
  `CREATE INDEX IF NOT EXISTS license_keys_created_idx ON license_keys (created_at DESC)`,
];
