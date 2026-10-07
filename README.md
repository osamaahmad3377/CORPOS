# CorePOS — offline POS for retail shops

CorePOS installs on a single Windows 10/11 PC in the shop and runs fully offline.
Each install is activated with a product key. Keys are created and revoked from
your own license server on Vercel.

```
COREPOS/
├── backend/         Laravel 12 API (desktop edition: SQLite, pos:install command)
├── frontend/        React source  ← ADD THIS (see "Frontend" below)
├── desktop/         Electron shell + Windows installer (bundles PHP 8.4 + the app)
├── license-server/  Next.js app for Vercel: admin panel, activate/validate/revoke API
└── public_html/     Old Hostinger deployment (left untouched; contains live DB password)
```

## How it works on the shop PC

1. The owner runs `CorePOS-Setup-x.y.z.exe`. It installs to Program Files, plus the VC++ runtime.
2. On first launch, CorePOS asks for a **product key**. That needs internet once.
   - The key is bound to the PC's Machine ID on the license server.
3. The **setup wizard** asks for the shop name, phone, address and the owner's login
   (email and password). There are no default `admin@shop.com` / `password` accounts.
4. CorePOS starts a private PHP server on `127.0.0.1` and opens the POS in its own window.
5. All data lives in `%APPDATA%\CorePOS\`:
   - `database\corepos.sqlite`
   - product images
   - logs
   - `backups\` (one automatic backup per day, the last 30 are kept)

   Reinstalling or updating never deletes it.
6. **Licensing:**
   - CorePOS re-checks the key at every launch and every 4 hours.
   - With no internet it keeps working for `lease_days` (default 10) after the last successful check.
   - **Revoked key:** at the next online check the POS closes and asks for a key again.
   - Editing the license file, copying it to another PC, or winding the clock back
     all fail the check.
7. **Menu:**
   - *File:* Backup now / Restore backup
   - *Help:* License… (shows key and expiry; "Deactivate this computer" moves the key to a new PC), WhatsApp support

## One-time setup

### 1. Deploy the license server (Vercel)
See [license-server/README.md](license-server/README.md). Summary:
```bash
cd license-server
npm install
npm run gen-keys      # prints LICENSE_PRIVATE_KEY, LICENSE_PUBLIC_KEY, ADMIN_SESSION_SECRET
```
Then, in Vercel:
1. Create the project.
2. Add Neon Postgres (Storage tab).
3. Set the env vars `LICENSE_PRIVATE_KEY`, `LICENSE_PUBLIC_KEY`, `ADMIN_SESSION_SECRET`,
   `ADMIN_PASSWORD` and optionally `DOWNLOAD_URL`.
4. Deploy.

**Keep `LICENSE_PRIVATE_KEY` secret and never change it.** Changing it invalidates every installed shop.

### 2. Point the desktop app at it
Edit [desktop/app.config.json](desktop/app.config.json):
```json
{
  "licenseServerUrl": "https://your-project.vercel.app",
  "licensePublicKey": "<LICENSE_PUBLIC_KEY from step 1>",
  "supportPhone": "+92 3xx xxxxxxx",
  "supportWhatsApp": "923xxxxxxxxx"
}
```

### 3. Build the installer
```bash
cd desktop
npm install
npm run dist:win:mac   # on a Mac  (exe keeps the default Electron icon)
npm run dist:win       # on a Windows PC (proper icon/metadata; add code signing here later)
```
Output: `desktop/dist/CorePOS-Setup-<version>.exe`. Upload it wherever shops download it
(your website, Google Drive, and so on) and put that link in `DOWNLOAD_URL`.

`npm run prepare` (part of `dist:*`) does the following:
- downloads the official Windows PHP 8.4 and checks its SHA-256
- downloads the VC++ runtime
- copies `backend/` and builds `frontend/` into `desktop/resources/`

## Selling to a shop

1. Open `https://your-project.vercel.app/admin`, then **Create key**. Enter the shop name,
   phone, city, plan, number of PCs, and an optional expiry date for subscriptions.
2. Send the shop the key and the download link. The admin panel prepares the WhatsApp message.
3. The shop installs, enters the key and sets up its login.
4. If the shop stops paying, open the key and click **Revoke**. The POS locks at its next
   online check, or within `lease_days` at most.
   - **Reinstate** turns the key back on.
   - **Reset activations** lets the shop move to a new PC.

## Releasing an update

1. Bump `version` in `desktop/package.json`.
2. Add any new Laravel migrations in `backend/database/migrations`. They run automatically on
   the shop PC at the next launch, and the daily backup is taken first.
3. Rebuild and send the new `.exe`. Installing over the old version keeps all the data.

## Frontend

The React **source** isn't in this folder yet. Copy the React/Vite project into `frontend/`
(it needs `package.json`, `src/` and `vite.config.*`) and make sure the API base URL comes from
`import.meta.env.VITE_API_URL`. The desktop build sets it to `/api/v1`. The build fails if
the old `itartificer.com` URL is still hardcoded.

Until then, the desktop build uses the prebuilt bundle from `public_html/assets` and rewrites
its API URL to `/api/v1`. That works, but the UI still shows the old "Thread & Co. / Clothing
POS" branding.

## Developing / testing locally

```bash
# backend + desktop shell on a Mac, with a portable PHP 8.4 (static-php.dev):
cd desktop && npm run prepare:app
COREPOS_PHP=/path/to/php \
COREPOS_LICENSE_SERVER=http://localhost:3000 COREPOS_LICENSE_PUBLIC_KEY=<from license-server/.env.local> \
  npx electron .
# (if launched from a VS Code terminal: `unset ELECTRON_RUN_AS_NODE` first)

npm run test:license                     # desktop licensing unit tests (mock server)
cd ../license-server && npm run smoke-test -- http://localhost:3000
```
