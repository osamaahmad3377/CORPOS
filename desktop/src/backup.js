// Automatic daily backups of the shop database, plus manual backup/restore.
// Uses SQLite's VACUUM INTO via the bundled PHP so the copy is consistent
// even while the POS is running (WAL mode).

const fs = require('node:fs');
const path = require('node:path');
const { spawn } = require('node:child_process');

const KEEP_DAILY = 30;

class Backups {
  constructor({ backend, dataDir }) {
    this.backend = backend;
    this.dir = path.join(dataDir, 'backups');
  }

  stamp() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
  }

  async snapshot(target) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { force: true });
    const code = 'try { $db = new PDO("sqlite:" . $argv[1]); $db->exec("VACUUM INTO " . $db->quote($argv[2])); echo "OK"; } catch (Throwable $e) { fwrite(STDERR, $e->getMessage()); exit(1); }';
    return new Promise((resolve, reject) => {
      const child = spawn(this.backend.phpBin, this.backend.phpArgs(['-r', code, this.backend.dbFile, target]), { windowsHide: true });
      let err = '';
      child.stderr.on('data', (d) => { err += d; });
      child.on('error', reject);
      child.on('close', (c) => (c === 0 ? resolve(target) : reject(new Error(err || 'Backup failed'))));
    });
  }

  // Once per day, keep the last KEEP_DAILY copies.
  async daily() {
    fs.mkdirSync(this.dir, { recursive: true });
    const today = this.stamp().slice(0, 10);
    const existing = fs.readdirSync(this.dir).filter((f) => /^auto_.*\.sqlite$/.test(f)).sort();
    if (!existing.some((f) => f.startsWith(`auto_${today}`))) {
      await this.snapshot(path.join(this.dir, `auto_${this.stamp()}.sqlite`));
    }
    const all = fs.readdirSync(this.dir).filter((f) => /^auto_.*\.sqlite$/.test(f)).sort();
    for (const old of all.slice(0, Math.max(0, all.length - KEEP_DAILY))) {
      fs.rmSync(path.join(this.dir, old), { force: true });
    }
  }

  async backupTo(file) {
    return this.snapshot(file);
  }

  // Caller must stop the backend first and restart it afterwards.
  async restoreFrom(file) {
    const header = Buffer.alloc(16);
    const fd = fs.openSync(file, 'r');
    fs.readSync(fd, header, 0, 16, 0);
    fs.closeSync(fd);
    if (header.toString('latin1') !== 'SQLite format 3\u0000') {
      throw new Error('That file is not a CorePOS backup.');
    }
    // Safety copy of the current data before overwriting it.
    await this.snapshot(path.join(this.dir, `before-restore_${this.stamp()}.sqlite`));
    const db = this.backend.dbFile;
    for (const f of [db, `${db}-wal`, `${db}-shm`]) fs.rmSync(f, { force: true });
    fs.copyFileSync(file, db);
  }
}

module.exports = { Backups };
