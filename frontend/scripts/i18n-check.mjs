// Lists strings passed to t('…') that have no Urdu translation yet.
//   node scripts/i18n-check.mjs            -> all files
//   node scripts/i18n-check.mjs src/pages/pos   -> one folder
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';

const root = path.resolve(path.dirname(new URL(import.meta.url).pathname), '..');
const target = path.resolve(root, process.argv[2] || 'src');

const ur = {};
for (const f of fs.readdirSync(path.join(root, 'src/i18n/ur'))) {
  if (f.endsWith('.js')) Object.assign(ur, (await import(pathToFileURL(path.join(root, 'src/i18n/ur', f)))).default);
}

const files = [];
(function walk(d) {
  const st = fs.statSync(d);
  if (st.isFile()) { if (/\.(jsx?|tsx?)$/.test(d)) files.push(d); return; }
  for (const e of fs.readdirSync(d)) if (e !== 'i18n') walk(path.join(d, e));
})(target);

const re = /\bt\(\s*(['"`])((?:\\.|(?!\1).)*)\1/g;
let missing = 0;
for (const f of files) {
  const src = fs.readFileSync(f, 'utf8');
  const keys = new Set();
  for (const m of src.matchAll(re)) {
    if (m[1] === '`' && m[2].includes('${')) continue; // dynamic — not a key
    keys.add(m[2].replace(/\\(['"`\\])/g, '$1'));
  }
  const miss = [...keys].filter((k) => ur[k] === undefined);
  if (miss.length) {
    missing += miss.length;
    console.log(`\n${path.relative(root, f)} (${miss.length})`);
    for (const k of miss) console.log(`  ${JSON.stringify(k)}`);
  }
}
console.log(missing ? `\n${missing} string(s) missing Urdu.` : 'All t() strings have Urdu.');
process.exitCode = missing ? 1 : 0;
