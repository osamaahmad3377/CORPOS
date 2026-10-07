// Downloads static PHP 8.4 CLI builds for macOS (static-php-cli: every
// extension compiled in, no dylib dependencies) for both Apple Silicon and
// Intel, checks them against the pinned SHA-256 below, and unpacks them into
// resources/php-mac-arm64 and resources/php-mac-x64 with a php.ini.
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
  arm64: { arch: 'aarch64', sha256: 'bba286e442796dbd420d778a016e2817b31d5036d11b3ba316d19a60de912cdc' },
  x64: { arch: 'x86_64', sha256: 'bd1c20f355e73a9f807b24ba62fd98f3a57bc08d063ebb3aa6393909e01ce89e' },
};
const REQUIRED_MODULES = ['pdo_sqlite', 'sqlite3', 'mbstring', 'openssl', 'fileinfo', 'gd', 'curl', 'zip', 'tokenizer', 'ctype', 'dom', 'bcmath'];

const PHP_INI = `; CorePOS bundled PHP configuration (macOS, static build)
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
    const file = `php-${PHP_VERSION}-cli-macos-${build.arch}.tar.gz`;
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

    const dir = path.join(root, 'resources', `php-mac-${electronArch}`);
    fs.rmSync(dir, { recursive: true, force: true });
    fs.mkdirSync(dir, { recursive: true });
    execFileSync('tar', ['-xzf', archive, '-C', dir]);
    fs.chmodSync(path.join(dir, 'php'), 0o755);
    fs.writeFileSync(path.join(dir, 'php.ini'), PHP_INI);

    // Run the binary that matches this Mac to confirm it has what Laravel needs.
    const hostArch = process.arch === 'arm64' ? 'arm64' : 'x64';
    if (electronArch === hostArch) {
      const modules = execFileSync(path.join(dir, 'php'), ['-m'], { encoding: 'utf8' }).toLowerCase();
      const missing = REQUIRED_MODULES.filter((m) => !modules.includes(`\n${m}\n`));
      if (missing.length) throw new Error(`PHP for ${electronArch} is missing: ${missing.join(', ')}`);
    }
    console.log(`macOS PHP ${PHP_VERSION} (${electronArch}) verified -> ${dir}`);
  }
}

main().catch((err) => {
  console.error(err.message || err);
  process.exit(1);
});
