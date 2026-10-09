// Downloads the official Windows PHP builds, verifies each SHA-256 against
// php.net's releases.json, unpacks them with a php.ini tuned for CorePOS, and
// fetches the matching VC++ runtime installers.
//
//   node scripts/prepare-php.mjs            # Windows 10/11: PHP 8.4, 64-bit + 32-bit
//   node scripts/prepare-php.mjs legacy     # Windows 7/8/8.1: PHP 8.2, 64-bit + 32-bit
//
// Output (electron-builder picks the folder by arch):
//   resources/php-win-x64, resources/php-win-ia32          (PHP 8.4, VS17)
//   resources/php-win7-x64, resources/php-win7-ia32        (PHP 8.2, VS16 — runs on Windows 7)
//   resources/vc_redist-x64.exe, resources/vc_redist-ia32.exe

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.cache');
const RELEASES = 'https://downloads.php.net/~windows/releases/';
// The 2015-2022 runtime installs on Windows 7 SP1 and newer.
const VC_REDIST = { x64: 'https://aka.ms/vs/17/release/vc_redist.x64.exe', ia32: 'https://aka.ms/vs/17/release/vc_redist.x86.exe' };
const LEGACY = process.argv.includes('legacy');
const BRANCH = LEGACY ? '8.2' : '8.4';
const TOOLSET = LEGACY ? 'vs16' : 'vs17';
const PREFIX = LEGACY ? 'php-win7' : 'php-win';
const ARCHES = { x64: 'x64', ia32: 'x86' }; // electron-builder arch -> php.net arch
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
  const branch = releases[BRANCH];
  if (process.env.PHP_VERSION && process.env.PHP_VERSION !== branch.version) {
    throw new Error(`PHP ${process.env.PHP_VERSION} requested but php.net now lists ${branch.version} as current. Remove PHP_VERSION or update it.`);
  }
  for (const [arch, phpArch] of Object.entries(ARCHES)) {
    await preparePhp(branch, arch, phpArch);
    await download(VC_REDIST[arch], path.join(root, 'resources', `vc_redist-${arch}.exe`));
  }
}

async function preparePhp(branch, arch, phpArch) {
  const build = branch[`nts-${TOOLSET}-${phpArch}`];
  if (!build) throw new Error(`No nts-${TOOLSET}-${phpArch} build for PHP ${BRANCH} in releases.json`);
  const phpDir = path.join(root, 'resources', `${PREFIX}-${arch}`);

  const zip = await download(`${RELEASES}${build.zip.path}`, path.join(cacheDir, build.zip.path));
  const actual = sha256(zip);
  if (actual !== build.zip.sha256) {
    fs.rmSync(zip);
    throw new Error(`Checksum mismatch for ${build.zip.path}: expected ${build.zip.sha256}, got ${actual}`);
  }
  console.log(`PHP ${branch.version} ${phpArch} verified (${actual.slice(0, 12)}…)`);

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

  for (const ext of EXTENSIONS) {
    if (!fs.existsSync(path.join(phpDir, 'ext', `php_${ext}.dll`))) throw new Error(`Missing ext/php_${ext}.dll`);
  }
  console.log(`Windows PHP ${branch.version} (${arch}) ready in ${phpDir}`);
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
