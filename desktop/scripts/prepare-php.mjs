// Downloads the official Windows PHP 8.4 (NTS x64) build, verifies its
// SHA-256 against php.net's releases.json, unpacks it into resources/php
// with a php.ini tuned for CorePOS, and fetches the VC++ runtime installer.
//
//   node scripts/prepare-php.mjs            # latest 8.4.x
//   PHP_VERSION=8.4.26 node scripts/...     # pin a version

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.cache');
const phpDir = path.join(root, 'resources', 'php');
const RELEASES = 'https://downloads.php.net/~windows/releases/';
const VC_REDIST = 'https://aka.ms/vs/17/release/vc_redist.x64.exe';
const EXTENSIONS = ['curl', 'fileinfo', 'gd', 'intl', 'mbstring', 'openssl', 'pdo_sqlite', 'sodium', 'sqlite3', 'zip', 'opcache'];

async function download(url, dest) {
  if (fs.existsSync(dest)) return dest;
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  const tmp = `${dest}.part`;
  fs.writeFileSync(tmp, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(tmp, dest);
  return dest;
}

function sha256(file) {
  return createHash('sha256').update(fs.readFileSync(file)).digest('hex');
}

async function main() {
  fs.mkdirSync(cacheDir, { recursive: true });

  const releases = await (await fetch(`${RELEASES}releases.json`)).json();
  const branch = releases['8.4'];
  const build = branch['nts-vs17-x64'];
  if (!build) throw new Error('No nts-vs17-x64 build for PHP 8.4 in releases.json');
  if (process.env.PHP_VERSION && process.env.PHP_VERSION !== branch.version) {
    throw new Error(`PHP ${process.env.PHP_VERSION} requested but php.net now lists ${branch.version} as current. Remove PHP_VERSION or update it.`);
  }

  const zip = await download(`${RELEASES}${build.zip.path}`, path.join(cacheDir, build.zip.path));
  const actual = sha256(zip);
  if (actual !== build.zip.sha256) {
    fs.rmSync(zip);
    throw new Error(`Checksum mismatch for ${build.zip.path}: expected ${build.zip.sha256}, got ${actual}`);
  }
  console.log(`PHP ${branch.version} verified (${actual.slice(0, 12)}…)`);

  fs.rmSync(phpDir, { recursive: true, force: true });
  fs.mkdirSync(phpDir, { recursive: true });
  // bsdtar (macOS, Windows 10+) reads zip files.
  execFileSync('tar', ['-xf', zip, '-C', phpDir], { stdio: 'inherit' });

  // Trim things CorePOS never uses.
  for (const p of ['dev', 'extras', 'lib', 'php-cgi.exe', 'phpdbg.exe', 'php8embed.lib', 'php8phpdbg.dll', 'deplister.exe', 'pharcommand.phar', 'phar.phar.bat', 'php.ini-development', 'php.ini-production', 'news.txt', 'README.md', 'readme-redist-bins.txt', 'snapshot.txt']) {
    fs.rmSync(path.join(phpDir, p), { recursive: true, force: true });
  }
  const keepExt = new Set(EXTENSIONS.map((e) => `php_${e}.dll`));
  for (const f of fs.readdirSync(path.join(phpDir, 'ext'))) {
    if (!keepExt.has(f)) fs.rmSync(path.join(phpDir, 'ext', f), { force: true });
  }

  fs.writeFileSync(path.join(phpDir, 'php.ini'), `; CorePOS bundled PHP configuration
[PHP]
engine = On
short_open_tag = Off
expose_php = Off
max_execution_time = 120
memory_limit = 512M
error_reporting = E_ALL & ~E_DEPRECATED & ~E_STRICT
display_errors = Off
display_startup_errors = Off
log_errors = On
post_max_size = 32M
upload_max_filesize = 16M
max_file_uploads = 20
file_uploads = On
allow_url_fopen = On
default_charset = "UTF-8"
variables_order = "EGPCS"
extension_dir = "ext"

${EXTENSIONS.map((e) => (e === 'opcache' ? `zend_extension=${e}` : `extension=${e}`)).join('\n')}

[Date]
date.timezone = Asia/Karachi

[opcache]
opcache.enable = 1
opcache.enable_cli = 1
opcache.memory_consumption = 128
opcache.interned_strings_buffer = 16
opcache.max_accelerated_files = 20000
opcache.validate_timestamps = 0
opcache.jit = off

[Session]
session.save_handler = files
`);

  await download(VC_REDIST, path.join(root, 'resources', 'vc_redist.x64.exe'));

  for (const ext of EXTENSIONS) {
    if (!fs.existsSync(path.join(phpDir, 'ext', `php_${ext}.dll`))) throw new Error(`Missing ext/php_${ext}.dll`);
  }
  console.log(`Windows PHP ready in ${phpDir}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
