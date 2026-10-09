// Downloads static PHP 8.4 CLI builds for Linux (static-php-cli: every
// extension compiled in, no shared-library dependencies, so they run on any
// distribution — Ubuntu, Debian, Mint, Fedora…) for 64-bit Intel/AMD and ARM,
// checks them against the pinned SHA-256 below, and unpacks them into
// resources/php-linux-x64 and resources/php-linux-arm64 with a php.ini.
//
// static-php.dev publishes no checksums, so hashes are pinned here. To move
// to a newer PHP: change PHP_VERSION, run once with UPDATE_HASHES=1, review
// the printed hashes and paste them in.

import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const cacheDir = path.join(root, '.cache');
const BASE = 'https://dl.static-php.dev/static-php-cli/common/';
const PHP_VERSION = '8.4.23';
const BUILDS = {
  // electron-builder arch name -> static-php arch + pinned sha256
  x64: { arch: 'x86_64', sha256: '1aeed5bc7967977ca5b1da7163acd91bf9ba3ac56037045d4e91ee2ff2712bb7' },
  arm64: { arch: 'aarch64', sha256: '0978d89157292bcc9268a34a73a4d5d2793f8dff1403b5138a94d2af6b7a09b0' },
};
const REQUIRED_MODULES = ['pdo_sqlite', 'sqlite3', 'mbstring', 'openssl', 'fileinfo', 'gd', 'curl', 'zip', 'tokenizer', 'ctype', 'dom', 'bcmath'];

const PHP_INI = `; CorePOS bundled PHP configuration (Linux, static build)
[PHP]
expose_php = Off
max_execution_time = 120
memory_limit = 512M
error_reporting = E_ALL & ~E_DEPRECATED
display_errors = Off
display_startup_errors = Off
log_errors = On
post_max_size = 32M
upload_max_filesize = 16M
max_file_uploads = 20
allow_url_fopen = On
default_charset = "UTF-8"
variables_order = "EGPCS"

[Date]
date.timezone = Asia/Karachi
`;

async function download(url, dest) {
  if (fs.existsSync(dest)) return dest;
  console.log(`Downloading ${url}`);
  const res = await fetch(url, { redirect: 'follow' });
  if (!res.ok) throw new Error(`GET ${url} -> HTTP ${res.status}`);
  fs.writeFileSync(`${dest}.part`, Buffer.from(await res.arrayBuffer()));
  fs.renameSync(`${dest}.part`, dest);
  return dest;
}

async function main() {
  fs.mkdirSync(cacheDir, { recursive: true });

  for (const [electronArch, build] of Object.entries(BUILDS)) {
    const file = `php-${PHP_VERSION}-cli-linux-${build.arch}.tar.gz`;
    const archive = await download(`${BASE}${file}`, path.join(cacheDir, file));
    const actual = createHash('sha256').update(fs.readFileSync(archive)).digest('hex');
    if (process.env.UPDATE_HASHES) {
      console.log(`${electronArch}: ${actual}`);
      continue;
    }
    if (actual !== build.sha256) {
      fs.rmSync(archive);
      throw new Error(`Checksum mismatch for ${file}: expected ${build.sha256}, got ${actual}`);
    }

    const dir = path.join(root, 'resources', `php-linux-${electronArch}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', dir]);
    fs.chmodSync(path.join(dir, 'php'), 0o755);
    fs.writeFileSync(path.join(dir, 'php.ini'), PHP_INI);

    // On a Linux build machine, run the matching binary to confirm it has what
    // Laravel needs (the same static-php "common" set is checked on macOS).
    const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
    if (process.platform === 'linux' && electronArch === hostArch) {
      const modules = execFileSync(path.join(dir, 'php'), ['-m'], { encoding: 'utf8' }).toLowerCase();
      const missing = REQUIRED_MODULES.filter((m) => !modules.includes(`\n${m}\n`));
      if (missing.length) throw new Error(`PHP for ${electronArch} is missing: ${missing.join(', ')}`);
    }
    console.log(`Linux PHP ${PHP_VERSION} (${electronArch}) verified -> ${dir}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
