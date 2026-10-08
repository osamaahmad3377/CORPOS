// Automatic daily backups of the shop database, plus manual backup/restore.
// Uses SQLite's VACUUM INTO via the bundled PHP so the copy is consistent
// even while the POS is running (WAL mode).
//
// Several businesses (mart + restaurant…): the first lives in the main
// database, each extra one in database/businesses/<name>.sqlite. Every
// backup saves one file per business; extra ones get "__<name>" added.

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

  // [{ src, suffix }] — the main database plus every extra business
  databases() {
    const list = [{ src: this.backend.dbFile, suffix: '' }];
    const dir = path.join(path.dirname(this.backend.dbFile), 'businesses');
    if (fs.existsSync(dir)) {
      for (const f of fs.readdirSync(dir).sort()) {
        if (/^business_[\w-]+\.sqlite$/.test(f)) list.push({ src: path.join(dir, f), suffix: `__${f.replace(/\.sqlite$/, '')}` });
      }
    }
    return list;
  }

  async snapshot(target, src = this.backend.dbFile) {
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.rmSync(target, { force: true });
    const code = 'try { $db = new PDO("sqlite:" . $argv[1]); $db->exec("VACUUM INTO " . $db->quote($argv[2])); echo "OK"; } catch (Throwable $e) { fwrite(STDERR, $e->getMessage()); exit(1); }';
    return new Promise((resolve, reject) => {
      const child = spawn(this.backend.phpBin, this.backend.phpArgs(['-r', code, src, target]), { windowsHide: true });
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
      const stamp = this.stamp();
      for (const db of this.databases()) await this.snapshot(path.join(this.dir, `auto_${stamp}${db.suffix}.sqlite`), db.src);
    }
    // keep the last KEEP_DAILY days (all businesses of a day together)
    const all = fs.readdirSync(this.dir).filter((f) => /^auto_.*\.sqlite$/.test(f));
    const days = [...new Set(all.map((f) => f.slice(5, 15)))].sort();
    const drop = new Set(days.slice(0, Math.max(0, days.length - KEEP_DAILY)));
    for (const old of all) if (drop.has(old.slice(5, 15))) fs.rmSync(path.join(this.dir, old), { force: true });
  }

  // Saves one file per business; returns the paths written.
  async backupTo(file) {
    const base = file.replace(/\.sqlite$/i, '');
    const written = [];
    for (const db of this.databases()) written.push(await this.snapshot(db.suffix ? `${base}${db.suffix}.sqlite` : file, db.src));
    return written;
  }

  // Which database a backup file belongs to (by its "__business_…" ending).
  targetFor(file) {
    const m = path.basename(file).match(/__(business_[\w-]+)\.sqlite$/i);
    return m ? path.join(path.dirname(this.backend.dbFile), 'businesses', `${m[1]}.sqlite`) : this.backend.dbFile;
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
    const db = this.targetFor(file);
    // Safety copy of the current data before overwriting it.
    if (fs.existsSync(db)) await this.snapshot(path.join(this.dir, `before-restore_${this.stamp()}_${path.basename(db)}`), db);
    fs.mkdirSync(path.dirname(db), { recursive: true });
    for (const f of [db, `${db}-wal`, `${db}-shm`]) fs.rmSync(f, { force: true });
    fs.copyFileSync(file, db);
  }
}

module.exports = { Backups };
