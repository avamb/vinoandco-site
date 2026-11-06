// Checks the built site (dist/) against redirects.yaml:
//   - every `pages` entry (code 200) exists as a built page;
//   - every 301 target exists as a built page;
//   - no 301/410 source is also a built page (it would never be reached);
//   - `pending` event entries are counted, not failed.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

const root = decodeURIComponent(new URL('../', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
// DIST_DIR: check another build folder (the builder checks each release before publishing it).
const dist = process.env.DIST_DIR || join(root, 'dist');
const doc = parse(readFileSync(join(root, 'redirects.yaml'), 'utf8'));

const built = (path) => {
  const p = decodeURIComponent(path.split('?')[0]);
  if (p.endsWith('/')) return existsSync(join(dist, p, 'index.html'));
  return existsSync(join(dist, p));
};
const errors = [];
for (const r of doc.pages ?? []) if (!built(r.from)) errors.push(`200 expected but not built: ${r.from}`);
// Event pages answering 200: the Bil24-era static pages always; the platform's
// only on a build from the real feed (the sample snapshot does not have them).
const platformToo = process.env.CHECK_PLATFORM_EVENTS === '1';
for (const r of (doc.events ?? []).filter((e) => e.code === 200)) {
  if (r.platform && !platformToo) continue;
  if (!built(r.from)) errors.push(`200 expected but not built: ${r.from}`);
}
const rules = [...(doc.redirects ?? []), ...(doc.gone ?? []), ...(doc.events ?? []).filter((e) => e.code !== 'pending')];
for (const r of rules) {
  if (r.code === 301 && !built(r.to)) errors.push(`301 target not built: ${r.from} -> ${r.to}`);
  if (!r.from.includes('*') && (r.code === 301 || r.code === 410) && built(r.from)) errors.push(`${r.code} source is also a page: ${r.from}`);
}
const pending = (doc.events ?? []).filter((e) => e.code === 'pending').length;
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
const eventPages = (doc.events ?? []).filter((e) => e.code === 200).length;
console.log(`redirects: ${doc.pages.length} pages, ${eventPages} event pages, ${rules.length} rules OK; ${pending} WordPress event addresses pending the slug table`);
