const fs = require('node:fs');
const path = require('node:path');
const { app, BrowserWindow, Menu, dialog, ipcMain, powerMonitor, shell } = require('electron');

const config = require('../app.config.json');
const { LicenseManager } = require('./license');
const { Backend } = require('./backend');
const { Backups } = require('./backup');

if (!app.requestSingleInstanceLock()) {
  app.quit();
  process.exit(0);
}

const dataDir = app.getPath('userData');
const resourcesDir = app.isPackaged ? process.resourcesPath : path.join(__dirname, '..', 'resources');
const logFile = path.join(dataDir, 'corepos.log');

function log(...args) {
  const line = `[${new Date().toISOString()}] ${args.join(' ')}\n`;
  try { fs.appendFileSync(logFile, line); } catch { /* ignore */ }
  if (!app.isPackaged) process.stdout.write(line);
}

const license = new LicenseManager({
  dataDir,
  serverUrl: process.env.COREPOS_LICENSE_SERVER || config.licenseServerUrl,
  publicKey: process.env.COREPOS_LICENSE_PUBLIC_KEY || config.licensePublicKey,
  appVersion: app.getVersion(),
});
const backend = new Backend({ resourcesDir, dataDir, preferredPort: config.preferredPort, log });
const backups = new Backups({ backend, dataDir });

let win = null;
let launcher = { state: 'starting', message: '' };
let revalidateTimer = null;
let lastLeaseWarning = 0;

// ---------------------------------------------------------------- windows

function createWindow() {
  win = new BrowserWindow({
    width: 1366,
    height: 820,
    minWidth: 1024,
    minHeight: 640,
    show: false,
    title: 'CorePOS',
    backgroundColor: '#f8fafc',
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once('ready-to-show', () => {
    win.maximize();
    win.show();
  });

  // Keep the window on our own pages; anything external opens in the browser.
  const isOurs = (url) => url.startsWith('file://') || url === 'about:blank'
    || (backend.port && url.startsWith(backend.url()));
  win.webContents.on('will-navigate', (e, url) => {
    if (!isOurs(url)) {
      e.preventDefault();
      if (/^https?:/.test(url)) shell.openExternal(url);
    }
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    // Receipt/label printing may open a same-origin popup.
    if (isOurs(url)) {
      return { action: 'allow', overrideBrowserWindowOptions: { autoHideMenuBar: true, webPreferences: { sandbox: true } } };
    }
    if (/^https?:/.test(url)) shell.openExternal(url);
    return { action: 'deny' };
  });

  win.on('closed', () => { win = null; });
}

function showLauncher(state, message = '') {
  launcher = { state, message };
  if (!win) createWindow();
  const current = win.webContents.getURL();
  if (current.startsWith('file://') && current.includes('launcher.html')) {
    win.webContents.send('launcher-state', publicState());
  } else {
    win.loadFile(path.join(__dirname, '..', 'ui', 'launcher.html'));
  }
}

function publicState() {
  const local = license.localStatus();
  const p = local.payload;
  return {
    ...launcher,
    version: app.getVersion(),
    machineId: license.machineId,
    supportPhone: config.supportPhone,
    supportWhatsApp: config.supportWhatsApp,
    license: p ? {
      key: maskKey(local.key),
      shopName: p.shop_name,
      plan: p.plan,
      leaseUntil: p.lease_until,
      expiresAt: p.expires_at,
    } : null,
  };
}

function maskKey(key) {
  return key ? key.replace(/^(CPOS-\w{5})-\w{5}-\w{5}-(\w{5})$/, '$1-*****-*****-$2') : '';
}

// ---------------------------------------------------------------- flow

async function boot() {
  stopRevalidation();
  const local = license.localStatus();
  log('boot: license', local.status);

  if (local.status === 'valid') {
    await afterLicensed();
    revalidate(); // background — locks the POS if the key was revoked
    return;
  }

  if (local.status === 'missing' || local.status === 'invalid') {
    if (local.status === 'invalid') license.clear();
    showLauncher('activate');
    return;
  }

  // lease_expired / expired / clock: must talk to the server now.
  showLauncher('checking');
  const res = await license.validate();
  if (res.ok) {
    await afterLicensed();
  } else if (res.fatal) {
    showLauncher('activate', messageFor(res));
  } else if (local.status === 'clock') {
    showLauncher('offline', 'Your computer date/time looks wrong. Please correct the date and time, connect to the internet and press Retry.');
  } else {
    showLauncher('offline', 'Your license needs to be re-checked online. Please connect this computer to the internet and press Retry.');
  }
}

async function afterLicensed() {
  showLauncher('starting');
  try {
    if (!(await backend.isInstalled())) {
      showLauncher('setup');
      return;
    }
    await startPos();
  } catch (err) {
    log('start failed:', err.stack || err);
    showLauncher('error', String(err.message || err));
  }
}

async function startPos() {
  showLauncher('starting');
  backend.onExit = (code) => {
    if (win) showLauncher('error', `The POS engine stopped unexpectedly (code ${code}). Press Retry to restart it.`);
  };
  const url = await backend.start();
  backups.daily().catch((e) => log('daily backup failed:', e.message));
  if (!win) createWindow();
  await win.loadURL(url);
  scheduleRevalidation();
}

function lock(state, message) {
  stopRevalidation();
  backend.stop();
  showLauncher(state, message);
}

function messageFor(res) {
  switch (res.code) {
    case 'REVOKED': return 'This product key has been disabled. Please contact CorePOS support for a new key.';
    case 'EXPIRED': return 'This product key has expired. Please contact CorePOS support to renew it.';
    case 'NOT_ACTIVATED': return 'This computer is no longer activated for this key. Please enter your product key again.';
    case 'INVALID_KEY': return 'This product key is not valid.';
    case 'ACTIVATION_LIMIT': return 'This key is already in use on another computer. Contact support to move it to this computer.';
    default: return res.message || 'Activation failed.';
  }
}

// ---------------------------------------------------------------- revalidation

async function revalidate() {
  const res = await license.validate();
  log('revalidate:', res.ok ? 'ok' : `${res.code || ''} ${res.network ? '(offline)' : ''}`);
  if (res.ok) return;

  if (res.fatal) {
    lock('activate', messageFor(res));
    return;
  }

  // Offline: keep running until the lease runs out.
  const local = license.localStatus();
  if (local.status !== 'valid') {
    lock('offline', 'Your license needs to be re-checked online. Please connect this computer to the internet and press Retry.');
  } else if (local.daysLeft <= 2 && Date.now() - lastLeaseWarning > 12 * 3600 * 1000 && win) {
    lastLeaseWarning = Date.now();
    dialog.showMessageBox(win, {
      type: 'warning',
      title: 'Internet needed soon',
      message: `CorePOS could not verify your license online. Please connect to the internet within ${local.daysLeft + 1} day(s) or the POS will lock until you do.`,
    });
  }
}

function scheduleRevalidation() {
  stopRevalidation();
  const hours = Number(config.revalidateHours) || 4;
  revalidateTimer = setInterval(revalidate, hours * 3600 * 1000);
}

function stopRevalidation() {
  if (revalidateTimer) clearInterval(revalidateTimer);
  revalidateTimer = null;
}

// ---------------------------------------------------------------- IPC (launcher page only)

function fromLauncher(event) {
  const url = event.senderFrame && event.senderFrame.url;
  return typeof url === 'string' && url.startsWith('file://') && url.includes('launcher.html');
}

function handle(channel, fn) {
  ipcMain.handle(channel, async (event, ...args) => {
    if (!fromLauncher(event)) throw new Error('Not allowed');
    return fn(...args);
  });
}

handle('state', () => publicState());

handle('activate', async (key) => {
  const res = await license.activate(key);
  if (!res.ok) return { ok: false, message: res.network ? res.message : messageFor(res) };
  afterLicensed();
  return { ok: true };
});

handle('setup', async (details) => {
  const res = await backend.install(details);
  if (!res.ok) return { ok: false, errors: res.errors || ['Setup failed.'] };
  startPos().catch((err) => showLauncher('error', String(err.message || err)));
  return { ok: true };
});

handle('retry', () => { boot(); return true; });
handle('open-logs', () => shell.openPath(path.join(backend.storageDir, 'logs')));
handle('open-whatsapp', () => {
  const text = encodeURIComponent(`Assalam o Alaikum, I need help with CorePOS.\nMachine ID: ${license.machineId}`);
  shell.openExternal(`https://wa.me/${config.supportWhatsApp}?text=${text}`);
});
handle('quit', () => app.quit());

// ---------------------------------------------------------------- menu

async function backupNow() {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    title: 'Save backup',
    defaultPath: path.join(app.getPath('documents'), `CorePOS-backup-${backups.stamp()}.sqlite`),
    filters: [{ name: 'CorePOS backup', extensions: ['sqlite'] }],
  });
  if (canceled || !filePath) return;
  try {
    await backups.backupTo(filePath);
    dialog.showMessageBox(win, { type: 'info', message: 'Backup saved.', detail: filePath });
  } catch (e) {
    dialog.showErrorBox('Backup failed', e.message);
  }
}

async function restoreBackup() {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    title: 'Restore backup',
    filters: [{ name: 'CorePOS backup', extensions: ['sqlite'] }],
    properties: ['openFile'],
  });
  if (canceled || !filePaths[0]) return;
  const { response } = await dialog.showMessageBox(win, {
    type: 'warning',
    buttons: ['Restore', 'Cancel'],
    defaultId: 1,
    cancelId: 1,
    message: 'Replace ALL current data with this backup?',
    detail: 'Everything entered after the backup was made will be lost. (A safety copy of the current data is saved first.)',
  });
  if (response !== 0) return;
  stopRevalidation();
  backend.stop();
  try {
    await backups.restoreFrom(filePaths[0]);
    await startPos();
    dialog.showMessageBox(win, { type: 'info', message: 'Backup restored.' });
  } catch (e) {
    dialog.showErrorBox('Restore failed', e.message);
    startPos().catch((err) => showLauncher('error', String(err.message || err)));
  }
}

async function showLicenseInfo() {
  const s = publicState();
  const l = s.license;
  const fmt = (t) => (t ? new Date(t * 1000).toLocaleDateString('en-PK') : 'Lifetime');
  const { response } = await dialog.showMessageBox(win, {
    type: 'info',
    title: 'License',
    buttons: ['OK', 'Deactivate this computer'],
    message: l ? `Licensed to ${l.shopName}` : 'Not activated',
    detail: l
      ? `Product key: ${l.key}\nPlan: ${l.plan}\nValid until: ${fmt(l.expiresAt)}\nNext online check needed by: ${fmt(l.leaseUntil)}\nMachine ID: ${s.machineId}\nVersion: ${s.version}`
      : `Machine ID: ${s.machineId}`,
  });
  if (response === 1) {
    const { response: confirm } = await dialog.showMessageBox(win, {
      type: 'warning',
      buttons: ['Deactivate', 'Cancel'],
      defaultId: 1,
      cancelId: 1,
      message: 'Deactivate CorePOS on this computer?',
      detail: 'Use this when moving CorePOS to a new computer. Your shop data stays on this computer. Internet is required.',
    });
    if (confirm !== 0) return;
    const res = await license.deactivate();
    if (res.ok) lock('activate', 'This computer has been deactivated. Enter a product key to activate again.');
    else dialog.showErrorBox('Deactivate failed', res.message || 'Please try again with internet.');
  }
}

function buildMenu() {
  const template = [
    {
      label: 'File',
      submenu: [
        { label: 'Backup now…', click: backupNow },
        { label: 'Restore backup…', click: restoreBackup },
        { label: 'Open automatic backups folder', click: () => shell.openPath(backups.dir) },
        { type: 'separator' },
        { role: 'quit' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload' },
        { role: 'resetZoom' },
        { role: 'zoomIn' },
        { role: 'zoomOut' },
        { type: 'separator' },
        { role: 'togglefullscreen' },
        ...(app.isPackaged ? [] : [{ role: 'toggleDevTools' }]),
      ],
    },
    {
      label: 'Help',
      submenu: [
        { label: 'License…', click: showLicenseInfo },
        {
          label: 'Contact support on WhatsApp',
          click: () => shell.openExternal(`https://wa.me/${config.supportWhatsApp}?text=${encodeURIComponent(`CorePOS help. Machine ID: ${license.machineId}`)}`),
        },
        { label: 'Open logs folder', click: () => shell.openPath(path.join(backend.storageDir, 'logs')) },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

// ---------------------------------------------------------------- lifecycle

app.on('second-instance', () => {
  if (win) {
    if (win.isMinimized()) win.restore();
    win.focus();
  }
});

app.whenReady().then(() => {
  fs.mkdirSync(dataDir, { recursive: true });
  log(`CorePOS ${app.getVersion()} starting; data in ${dataDir}`);
  buildMenu();
  createWindow();
  powerMonitor.on('resume', () => { if (backend.proc) revalidate(); });
  boot();
});

app.on('window-all-closed', () => app.quit());
app.on('before-quit', () => {
  stopRevalidation();
  backend.stop();
});
