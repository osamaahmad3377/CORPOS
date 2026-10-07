// Assembles resources/backend: the Laravel API (../backend) with the built
// React app placed in its public/ folder, so one local PHP server serves both
// from the same origin (the frontend talks to /api/v1).
//
// Frontend source:
//   ../frontend (React + Vite)  -> built here with VITE_API_URL=/api/v1
//   otherwise                   -> falls back to the prebuilt bundle in
//                                  ../public_html, re-pointed at /api/v1

import { execSync } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repo = path.resolve(root, '..');
const src = path.join(repo, 'backend');
const out = path.join(root, 'resources', 'backend');
const frontendSrc = path.join(repo, 'frontend');
const prebuilt = path.join(repo, 'public_html');

const HOSTED_API = 'https://pos-sw.itartificer.com/api/api/v1';

const SKIP = [
  /^\.env/,
  /^\.htaccess$/,
  /^\.DS_Store$/,
  /^tests$/,
  /^node_modules$/,
  /^storage$/,            // per-install storage lives in %APPDATA%
  /^bootstrap\/cache\/.+\.php$/,
  /^database\/.*\.sqlite.*$/,
  /^public\/(storage|hot)$/,
  /^phpunit\.xml$/,
];

function copyTree(from, to, rel = '') {
  fs.mkdirSync(to, { recursive: true });
  for (const entry of fs.readdirSync(from, { withFileTypes: true })) {
    const r = rel ? `${rel}/${entry.name}` : entry.name;
    if (SKIP.some((re) => re.test(r)) || entry.name === '.DS_Store') continue;
    const a = path.join(from, entry.name);
    const b = path.join(to, entry.name);
    if (entry.isDirectory()) copyTree(a, b, r);
    else if (entry.isFile()) fs.copyFileSync(a, b);
  }
}

function buildFrontend(publicDir) {
  console.log('Building React frontend from ../frontend …');
  const env = {
    ...process.env,
    VITE_API_URL: '/api/v1',
    VITE_API_BASE_URL: '/api/v1',
    VITE_DESKTOP: '1',
  };
  const opts = { cwd: frontendSrc, stdio: 'inherit', env };
  execSync(fs.existsSync(path.join(frontendSrc, 'package-lock.json')) ? 'npm ci' : 'npm install', opts);
  execSync('npm run build', opts);
  const dist = path.join(frontendSrc, 'dist');
  if (!fs.existsSync(path.join(dist, 'index.html'))) throw new Error('frontend build produced no dist/index.html');
  copyTree(dist, publicDir);

  const bundle = fs.readdirSync(path.join(publicDir, 'assets')).filter((f) => f.endsWith('.js'))
    .map((f) => fs.readFileSync(path.join(publicDir, 'assets', f), 'utf8')).join('\n');
  if (bundle.includes('itartificer.com')) {
    throw new Error('Frontend build still contains the hosted API URL — make the API base URL come from VITE_API_URL.');
  }
}

function usePrebuilt(publicDir) {
  console.log('No ../frontend source found — using the prebuilt bundle from ../public_html');
  copyTree(path.join(prebuilt, 'assets'), path.join(publicDir, 'assets'));
  fs.copyFileSync(path.join(prebuilt, 'favicon.svg'), path.join(publicDir, 'favicon.svg'));

  let patched = 0;
  for (const f of fs.readdirSync(path.join(publicDir, 'assets'))) {
    if (!f.endsWith('.js')) continue;
    const file = path.join(publicDir, 'assets', f);
    const js = fs.readFileSync(file, 'utf8');
    if (js.includes(HOSTED_API)) {
      fs.writeFileSync(file, js.split(HOSTED_API).join('/api/v1'));
      patched++;
    }
  }
  if (!patched) throw new Error(`Could not find ${HOSTED_API} in the prebuilt bundle to re-point it.`);

  // Offline shops: drop the Google Fonts link (falls back to system fonts).
  const html = fs.readFileSync(path.join(prebuilt, 'index.html'), 'utf8')
    .replace(/\s*<link rel="preconnect"[^>]*>/g, '')
    .replace(/\s*<link\s+rel="stylesheet"\s+href="https:\/\/fonts\.googleapis\.com[^>]*>/g, '')
    .replace(/<title>[^<]*<\/title>/, '<title>CorePOS</title>');
  fs.writeFileSync(path.join(publicDir, 'index.html'), html);
}

fs.rmSync(out, { recursive: true, force: true });
copyTree(src, out);
fs.mkdirSync(path.join(out, 'bootstrap', 'cache'), { recursive: true });

const publicDir = path.join(out, 'public');
if (fs.existsSync(path.join(frontendSrc, 'package.json'))) buildFrontend(publicDir);
else usePrebuilt(publicDir);

console.log(`Backend + frontend ready in ${out}`);
