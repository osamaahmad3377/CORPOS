import { SCHEMA_STATEMENTS } from './schema.js';

// One tiny helper: query(sql, params) -> rows[]
// - DATABASE_URL set  -> Neon serverless Postgres (HTTP driver)
// - DATABASE_URL unset -> PGlite (embedded Postgres in WASM) stored in ./.pglite (local dev only)

const g = globalThis;

async function getDriver() {
  if (g.__cposDriver) return g.__cposDriver;
  g.__cposDriver = (async () => {
    const url = process.env.DATABASE_URL || process.env.POSTGRES_URL;
    if (url) {
      const { neon } = await import('@neondatabase/serverless');
      const sql = neon(url);
      return async (text, params = []) => sql.query(text, params);
    }
    if (process.env.VERCEL) {
      throw new Error('DATABASE_URL is not set. Add a Neon Postgres database to this Vercel project.');
    }
    const { PGlite } = await import('@electric-sql/pglite');
    const path = await import('node:path');
    const db = new PGlite(path.join(process.cwd(), '.pglite'));
    await db.waitReady;
    return async (text, params = []) => (await db.query(text, params)).rows;
  })();
  try {
    return await g.__cposDriver;
  } catch (err) {
    g.__cposDriver = null;
    throw err;
  }
}

async function ensureSchema(run) {
  if (!g.__cposSchema) {
    g.__cposSchema = (async () => {
      for (const stmt of SCHEMA_STATEMENTS) await run(stmt);
    })().catch((err) => {
      g.__cposSchema = null; // retry on next request
      throw err;
    });
  }
  return g.__cposSchema;
}

export async function query(text, params = []) {
  const run = await getDriver();
  await ensureSchema(run);
  return run(text, params);
}
