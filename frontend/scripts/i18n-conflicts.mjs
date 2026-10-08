// Lists English keys translated differently in two Urdu dictionary files.
import fs from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
const dir = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../src/i18n/ur');
const seen = {};
for (const f of fs.readdirSync(dir).filter((x) => x.endsWith('.js')).sort()) {
  const d = (await import(pathToFileURL(path.join(dir, f)))).default;
  for (const [k, v] of Object.entries(d)) (seen[k] ||= []).push([f, v]);
}
let n = 0;
for (const [k, list] of Object.entries(seen)) {
  if (new Set(list.map(([, v]) => v)).size > 1) {
    n++;
    console.log(JSON.stringify(k));
    for (const [f, v] of list) console.log(`   ${f.padEnd(12)} ${v}`);
  }
}
console.log(n ? `\n${n} conflicting key(s).` : 'No conflicts.');
