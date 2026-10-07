# CorePOS License Server

Product-key license server for the CorePOS desktop app. It issues `CPOS-XXXXX-XXXXX-XXXXX-XXXXX` keys,
binds them to machines, and returns Ed25519-signed license tokens that the desktop client verifies
offline. It includes a small, mobile-friendly admin panel.

- **Stack:** Next.js (App Router, JavaScript), Postgres via `@neondatabase/serverless`, Node `crypto` (Ed25519).
- **Hosting:** Vercel, no extra config. Tables are created automatically on first request (`schema.sql` has the same DDL).
- **Local dev:** with no `DATABASE_URL`, an embedded Postgres (PGlite) stores data in `./.pglite`.

---

## 1. Local development

```bash
cd license-server
npm install
npm run gen-keys > .env.local            # writes LICENSE_PRIVATE_KEY, LICENSE_PUBLIC_KEY, ADMIN_SESSION_SECRET
echo "ADMIN_PASSWORD=choose-a-password" >> .env.local
npm run dev                              # http://localhost:3000/admin
```

Leave `DATABASE_URL` unset to use PGlite (`./.pglite`, gitignored). Delete that folder to start over.
To use a real Postgres locally, set `DATABASE_URL` in `.env.local`.

### Smoke test

```bash
npm run build && npm start               # or: npm run dev
npm run smoke-test                       # default http://localhost:3000; or: npm run smoke-test -- http://localhost:3457
```

The test reads `ADMIN_PASSWORD` and `LICENSE_PUBLIC_KEY` from `.env.local`. It logs in, creates keys, and runs
the whole activation flow: activate, re-activate, the activation limit, validate, revoke, reinstate,
deactivate, reset and expiry. It verifies every token using only the raw public key.
**It creates test keys in whatever database the server is using**, so don't point it at production.

---

## 2. Generating keys

```bash
npm run gen-keys
```

This prints three lines you can paste straight into `.env.local` or Vercel:

| Variable | What it is |
|---|---|
| `LICENSE_PRIVATE_KEY` | Ed25519 private key, base64 of PKCS8 DER. **Secret.** Signs license tokens. |
| `LICENSE_PUBLIC_KEY` | Raw 32-byte Ed25519 public key, base64. Public. **Embed this in the desktop client.** |
| `ADMIN_SESSION_SECRET` | Random secret for HMAC-signing the admin session cookie. |

Generate the key pair **once** for production and keep it. If you rotate it, every token already issued
stops verifying, and clients built with the old public key can't verify new tokens.

## 3. Environment variables

| Variable | Required | Notes |
|---|---|---|
| `DATABASE_URL` | On Vercel | Postgres connection string. The Vercel Neon integration sets it. (`POSTGRES_URL` also works.) |
| `LICENSE_PRIVATE_KEY` | Yes | See above. |
| `LICENSE_PUBLIC_KEY` | Yes | See above. Served at `GET /api/v1/public-key`. |
| `ADMIN_PASSWORD` | Yes | Admin panel password. Use a long one. |
| `ADMIN_SESSION_SECRET` | Yes | At least 16 characters. Changing it logs out all admin sessions. |
| `DOWNLOAD_URL` | No | Added to the WhatsApp message shown after a key is created. |
| `ADMIN_TIMEZONE` | No | Time zone for displaying dates and reading expiry dates in the admin panel. Default `Asia/Karachi`. A key with an expiry date expires at 23:59:59 on that day in this time zone. |

See `.env.example`.

---

## 4. Deploying to Vercel (step by step)

1. **Push the code.** Put the `license-server` folder in a Git repo (GitHub/GitLab/Bitbucket). It can be
   the repo root or a subfolder.
2. **Create the project.** Go to vercel.com → **Add New… → Project** → import the repo.
   If `license-server` is a subfolder, set **Root Directory** to `license-server`.
   Vercel detects Next.js automatically. Leave the build settings at their defaults.
3. **Add the database.** Open the project → **Storage** tab (or **Marketplace**) → **Create Database** →
   choose **Neon (Serverless Postgres)** → pick a region near your users → connect it to this project for
   all environments. This sets `DATABASE_URL` (plus a few other `POSTGRES_*`/`PG*` vars, which you can ignore).
4. **Set the environment variables.** Run `npm run gen-keys` locally. Then go to **Project → Settings →
   Environment Variables** and add `LICENSE_PRIVATE_KEY`, `LICENSE_PUBLIC_KEY`, `ADMIN_SESSION_SECRET`,
   `ADMIN_PASSWORD` and, if you want, `DOWNLOAD_URL` and `ADMIN_TIMEZONE` (Production, plus Preview if you use it).
5. **Deploy.** Click **Deploy**. If you added the variables after the first deploy, go to **Deployments →
   ⋯ → Redeploy**, because environment variables only apply to new deployments.
6. **Check it.**
   - `https://<your-app>.vercel.app/api/v1/public-key` should return your `LICENSE_PUBLIC_KEY`.
   - `https://<your-app>.vercel.app/admin` → log in → create a key. The tables are created on the first request.
7. **Optional:** add a custom domain (for example `license.yourdomain.com`) under **Settings → Domains** and
   point the desktop client at it. Run `schema.sql` in the Neon SQL editor only if you want to create the
   tables by hand. The server creates them anyway.

---

## 5. Public API contract

Base path: `/api/v1`. The API takes and returns JSON. CORS is open (`Access-Control-Allow-Origin: *`).
`activate`, `validate` and `deactivate` are `POST`; `public-key` is `GET`. Request bodies over 10 KB
are rejected with `BAD_REQUEST`.

**Success:** `{ "ok": true, "license": "<token>", "server_time": <unix seconds> }`
**Failure:** `{ "ok": false, "code": "<CODE>", "message": "<human readable English>", "server_time": <unix seconds> }`

Clients should treat only `ok:false` plus `code` as authoritative. A network error or a 5xx response
without a JSON body means "offline": keep running until `lease_until`.

| Code | HTTP | Meaning |
|---|---|---|
| `BAD_REQUEST` | 400 | Missing or invalid fields, invalid JSON, or body > 10 KB |
| `INVALID_KEY` | 404 | Key not found |
| `REVOKED` | 403 | Key was revoked by the admin |
| `EXPIRED` | 403 | Key's `expires_at` is in the past |
| `ACTIVATION_LIMIT` | 409 | Key is already active on `max_activations` other machines |
| `NOT_ACTIVATED` | 403 | Machine isn't bound to this key, or was deactivated |
| `SERVER_ERROR` | 500 | Unexpected server error |

**Input rules:** `key` is normalized: uppercased, trimmed, with all whitespace removed. `machine_id` is
required and must be 8–128 characters of `[A-Za-z0-9-]`. `machine_name` (≤200 characters) and
`app_version` (≤50 characters) are optional strings.

### `POST /api/v1/activate`
Body: `{ "key", "machine_id", "machine_name"?, "app_version"? }`
- Key checks, in order: not found → `INVALID_KEY`, revoked → `REVOKED`, past `expires_at` → `EXPIRED`.
- If the machine already has an active activation, the server refreshes it and returns a token.
  Re-activating is idempotent, for example after a reinstall on the same PC.
- If the machine is new or was deactivated: when active activations ≥ `max_activations` → `ACTIVATION_LIMIT`;
  otherwise it creates or reactivates the activation and returns a token.

### `POST /api/v1/validate`
Body: `{ "key", "machine_id", "app_version"? }`
The same key checks apply. Then the machine must have an active activation, otherwise `NOT_ACTIVATED`.
The server updates `last_seen_at`, `last_ip` and `app_version`, and returns a fresh token.

### `POST /api/v1/deactivate`
Body: `{ "key", "machine_id" }` → `{ "ok": true, "server_time" }`
This frees the machine's seat so the shop can move to a new PC. Unknown key → `INVALID_KEY`; machine
never activated → `NOT_ACTIVATED`; already deactivated → `ok: true` (idempotent). It works even when
the key is revoked or expired.

### `GET /api/v1/public-key`
→ `{ "ok": true, "public_key": "<LICENSE_PUBLIC_KEY>", "server_time": <unix seconds> }`

### License token format

```
payloadJson = JSON.stringify(payloadObject)
signature   = Ed25519 sign(payloadJson as UTF-8 bytes)
token       = base64url(payloadJson bytes) + "." + base64url(signature)    // base64url, no padding
```

```json
{
  "v": 1,
  "key": "CPOS-XXXXX-XXXXX-XXXXX-XXXXX",
  "key_id": "42",
  "shop_name": "My Shop",
  "plan": "standard",
  "machine_id": "<machine id sent by client>",
  "issued_at": 1790000000,
  "lease_until": 1790864000,
  "expires_at": null
}
```

`lease_until = issued_at + lease_days × 86400`, but never later than `expires_at` when the key has one.
`expires_at` is unix seconds, or `null` for a lifetime key.

**Verifying on the client (Node example):** verify the signature over the decoded payload bytes
*before* parsing the JSON, then check that `machine_id` matches this PC and that `lease_until` is in the future.

```js
const pub = crypto.createPublicKey({ key: { kty: 'OKP', crv: 'Ed25519',
  x: Buffer.from(LICENSE_PUBLIC_KEY, 'base64').toString('base64url') }, format: 'jwk' });
const [p, s] = token.split('.');
const bytes = Buffer.from(p, 'base64url');
const valid = crypto.verify(null, bytes, pub, Buffer.from(s, 'base64url'));
const payload = valid ? JSON.parse(bytes.toString('utf8')) : null;
```

---

## 6. How licensing behaves (revocation and offline)

- The client stores the latest token and **re-validates periodically** (for example at startup and every
  few hours while online). Each successful validate returns a fresh token with a new `lease_until`.
- When the server answers `ok:false` with `REVOKED`, `EXPIRED`, `INVALID_KEY` or `NOT_ACTIVATED`, the client
  **locks and asks for a product key**.
- When the client is **offline** (it can't reach the server), it **keeps working until `lease_until`** from its
  last valid token. So a **revocation takes effect at the next online check, or at most `lease_days` after
  the last successful check** (default 10 days).
- **Moving to a new PC:** deactivate on the old PC (client calls `/deactivate`), or deactivate that machine in
  the admin panel, or use **Reset all activations**. Then activate on the new PC. A deactivated machine gets
  `NOT_ACTIVATED` at its next online check.
- Changing `max_activations` or `lease_days` takes effect on the next activate or validate. Lowering
  `max_activations` doesn't kick off machines that are already active. It only blocks new ones.

## 7. Admin panel

`/admin`: log in with `ADMIN_PASSWORD`. The session is an HttpOnly, SameSite=Lax cookie (Secure in
production), HMAC-SHA256 signed, and lasts 12 hours.

- **Keys:** search by key, shop, owner, phone or city. Each row shows a status badge, activations
  used/max, last seen and expiry.
- **Create key:** fill in the shop details, plan, activations, lease days, an optional expiry date and
  notes, and create 1–100 keys at once. Afterwards the page shows the keys with Copy buttons, a ready
  WhatsApp message and an "Open in WhatsApp" link.
- **Key detail:** edit the details. See every computer that used the key and deactivate any of them.
  **Revoke** (with a reason), **Reinstate**, **Reset all activations**, and view the audit log.

The admin JSON API (cookie-authenticated, used by the UI and the smoke test):
`POST /api/admin/login {password}`, `POST /api/admin/logout`, `GET /api/admin/keys?q=`,
`POST /api/admin/keys {...fields, quantity}`, `GET|PATCH /api/admin/keys/:id`,
`POST /api/admin/keys/:id/revoke {reason}`, `POST /api/admin/keys/:id/reinstate`,
`POST /api/admin/keys/:id/reset`, `POST /api/admin/keys/:id/activations/:activationId/deactivate`.
Write requests must use `Content-Type: application/json`.

**Audit log events:** `created`, `activated`, `failed` (every rejected activate/validate/deactivate, with its
code), `revoked`, `reinstated`, `reset`, `deactivated`, `updated` (admin edits). Successful validates aren't
logged; they only update `last_seen_at`, which keeps the log small.

## 8. Project layout

```
app/api/v1/{activate,validate,deactivate,public-key}/route.js   public API
app/api/admin/...                                                admin JSON API
app/admin/...                                                    admin UI
lib/db.js        query(sql, params): Neon in production, PGlite locally; creates the schema on first use
lib/crypto.js    key generation, token signing, payload building
lib/licensing.js activate / validate / deactivate logic
lib/admin.js     admin auth guards, validation and data access
lib/auth.js      password check and signed session cookie
schema.sql       the same DDL as lib/schema.js
scripts/generate-keys.mjs, scripts/smoke-test.mjs
```
