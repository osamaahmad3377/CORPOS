// Runs the bundled Laravel API + React app on a private localhost port using
// the bundled portable PHP. All shop data (SQLite database, uploads, logs,
// caches, app key) lives in the user-data folder, never in the install
// folder — so updates/reinstalls keep the data and Program Files stays
// read-only.

const crypto = require('node:crypto');
const fs = require('node:fs');
const net = require('node:net');
const path = require('node:path');
const { spawn } = require('node:child_process');

class Backend {
  constructor({ resourcesDir, dataDir, preferredPort = 47321, log = console.log }) {
    this.resourcesDir = resourcesDir;
    this.dataDir = dataDir;
    this.preferredPort = preferredPort;
    this.log = log;
    this.proc = null;
    this.port = null;

    this.backendDir = path.join(resourcesDir, 'backend');
    this.publicDir = path.join(this.backendDir, 'public');
    this.phpBin = this.findPhp();
    // The bundled php.ini only suits the bundled (Windows) PHP build.
    this.phpIni = path.dirname(this.phpBin) === path.join(resourcesDir, 'php')
      ? path.join(resourcesDir, 'php', 'php.ini')
      : '';

    this.dbFile = path.join(dataDir, 'database', 'corepos.sqlite');
    this.storageDir = path.join(dataDir, 'storage');
    this.cacheDir = path.join(dataDir, 'cache');
  }

  findPhp() {
    const bundled = path.join(this.resourcesDir, 'php', process.platform === 'win32' ? 'php.exe' : 'php');
    if (fs.existsSync(bundled)) return bundled;
    // Development on a Mac/Linux box: allow an explicit or system PHP.
    return process.env.COREPOS_PHP || 'php';
  }

  ensureDirs() {
    for (const dir of [
      path.dirname(this.dbFile),
      path.join(this.storageDir, 'app', 'public'),
      path.join(this.storageDir, 'framework', 'cache', 'data'),
      path.join(this.storageDir, 'framework', 'sessions'),
      path.join(this.storageDir, 'framework', 'views'),
      path.join(this.storageDir, 'logs'),
      this.cacheDir,
    ]) {
      fs.mkdirSync(dir, { recursive: true });
    }
    if (!fs.existsSync(this.dbFile)) fs.writeFileSync(this.dbFile, '');
  }

  // Per-install Laravel APP_KEY (encrypts sessions etc.), generated once.
  appKey() {
    const file = path.join(this.dataDir, 'app.key');
    if (!fs.existsSync(file)) {
      fs.writeFileSync(file, `base64:${crypto.randomBytes(32).toString('base64')}`);
    }
    return fs.readFileSync(file, 'utf8').trim();
  }

  env() {
    const url = `http://127.0.0.1:${this.port || this.preferredPort}`;
    return {
      ...process.env,
      APP_NAME: 'CorePOS',
      APP_ENV: 'production',
      APP_DEBUG: 'false',
      APP_KEY: this.appKey(),
      APP_URL: url,
      FRONTEND_URL: url,
      APP_TIMEZONE: 'Asia/Karachi',
      DB_CONNECTION: 'sqlite',
      DB_DATABASE: this.dbFile,
      DB_FOREIGN_KEYS: 'true',
      LARAVEL_STORAGE_PATH: this.storageDir,
      APP_SERVICES_CACHE: path.join(this.cacheDir, 'services.php'),
      APP_PACKAGES_CACHE: path.join(this.cacheDir, 'packages.php'),
      APP_CONFIG_CACHE: path.join(this.cacheDir, 'config.php'),
      APP_ROUTES_CACHE: path.join(this.cacheDir, 'routes.php'),
      APP_EVENTS_CACHE: path.join(this.cacheDir, 'events.php'),
      VIEW_COMPILED_PATH: path.join(this.storageDir, 'framework', 'views'),
      LOG_CHANNEL: 'daily',
      LOG_LEVEL: 'warning',
      CACHE_STORE: 'file',
      SESSION_DRIVER: 'file',
      SESSION_DOMAIN: '',
      SESSION_SECURE_COOKIE: 'false',
      QUEUE_CONNECTION: 'sync',
      FILESYSTEM_DISK: 'public',
      MAIL_MAILER: 'log',
      SANCTUM_TOKEN_IDLE_MINUTES: '720',
    };
  }

  phpArgs(args) {
    if (!fs.existsSync(this.phpIni)) return args;
    // A relative extension_dir is resolved against the working directory on
    // Windows, not php.exe's folder — so always pass it absolutely.
    return ['-c', this.phpIni, '-d', `extension_dir=${path.join(path.dirname(this.phpIni), 'ext')}`, ...args];
  }

  // Run `php artisan ...`, resolving with { code, stdout, stderr }.
  artisan(args, { input } = {}) {
    return new Promise((resolve) => {
      const child = spawn(this.phpBin, this.phpArgs(['artisan', ...args, '--no-interaction']), {
        cwd: this.backendDir,
        env: this.env(),
        windowsHide: true,
      });
      let stdout = '';
      let stderr = '';
      child.stdout.on('data', (d) => { stdout += d; });
      child.stderr.on('data', (d) => { stderr += d; });
      child.on('error', (err) => resolve({ code: -1, stdout, stderr: String(err) }));
      child.on('close', (code) => resolve({ code, stdout, stderr }));
      if (input !== undefined) child.stdin.end(input);
      else child.stdin.end();
    });
  }

  lastJsonLine(text) {
    const line = String(text).trim().split(/\r?\n/).reverse().find((l) => l.trim().startsWith('{'));
    try { return line ? JSON.parse(line) : null; } catch { return null; }
  }

  async isInstalled() {
    this.ensureDirs();
    const res = await this.artisan(['pos:install', '--status']);
    const data = this.lastJsonLine(res.stdout);
    if (!data) throw new Error(`Could not start PHP.\n${res.stderr || res.stdout}`);
    return !!data.installed;
  }

  async install(details) {
    this.ensureDirs();
    const res = await this.artisan(['pos:install'], { input: JSON.stringify(details) });
    return this.lastJsonLine(res.stdout) || { ok: false, errors: [res.stderr || res.stdout || 'Setup failed.'] };
  }

  // Apply any new migrations shipped with an app update, then warm caches.
  async prepare() {
    this.ensureDirs();
    const mig = await this.artisan(['migrate', '--force']);
    if (mig.code !== 0) throw new Error(`Database update failed.\n${mig.stderr || mig.stdout}`);
    await this.artisan(['optimize:clear']);
    await this.artisan(['config:cache']);
    await this.artisan(['route:cache']);
  }

  // Prefer a fixed port (keeps the browser origin — and so the logged-in
  // session in localStorage — stable across launches); fall back to any.
  async freePort() {
    const tryPort = (port) => new Promise((resolve) => {
      const srv = net.createServer();
      srv.once('error', () => resolve(null));
      srv.listen(port, '127.0.0.1', () => {
        const actual = srv.address().port;
        srv.close(() => resolve(actual));
      });
    });
    for (let p = this.preferredPort; p < this.preferredPort + 20; p++) {
      const port = await tryPort(p);
      if (port) return port;
    }
    return tryPort(0);
  }

  async start() {
    if (this.proc) return this.url();
    this.port = await this.freePort();
    await this.prepare();

    const router = path.join(this.backendDir, 'vendor', 'laravel', 'framework', 'src', 'Illuminate', 'Foundation', 'resources', 'server.php');
    this.proc = spawn(this.phpBin, this.phpArgs(['-S', `127.0.0.1:${this.port}`, '-t', this.publicDir, router]), {
      cwd: this.publicDir, // Laravel's router uses getcwd() as the public dir
      env: this.env(),
      windowsHide: true,
    });

    const logFile = fs.createWriteStream(path.join(this.storageDir, 'logs', 'php-server.log'), { flags: 'a' });
    this.proc.stdout.pipe(logFile);
    this.proc.stderr.pipe(logFile);
    this.proc.on('exit', (code) => {
      this.log(`PHP server exited (${code})`);
      this.proc = null;
      if (this.onExit) this.onExit(code);
    });

    await this.waitUntilUp();
    return this.url();
  }

  url() {
    return `http://127.0.0.1:${this.port}`;
  }

  async waitUntilUp(timeoutMs = 30000) {
    const deadline = Date.now() + timeoutMs;
    while (Date.now() < deadline) {
      if (!this.proc) throw new Error('PHP server stopped while starting. See logs/php-server.log.');
      try {
        const res = await fetch(`${this.url()}/up`);
        if (res.ok) return;
      } catch {
        // not up yet
      }
      await new Promise((r) => setTimeout(r, 250));
    }
    throw new Error('PHP server did not start in time.');
  }

  stop() {
    if (!this.proc) return;
    const proc = this.proc;
    this.onExit = null;
    this.proc = null;
    try {
      if (process.platform === 'win32') {
        spawn('taskkill', ['/pid', String(proc.pid), '/f', '/t'], { windowsHide: true });
      } else {
        proc.kill();
      }
    } catch {
      // already gone
    }
  }
}

module.exports = { Backend };
