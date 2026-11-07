// Crawls redirects.yaml and the old WordPress sitemaps against a staging origin.
// Usage: node scripts/acceptance/addresses.mjs [origin]
import { readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { parse } from 'yaml';

const origin = (process.argv[2] || 'https://new.vinoandco.events').replace(/\/$/, '');
const doc = parse(readFileSync('redirects.yaml', 'utf8'));
const rows = []; // {from, code, to, src}
for (const [k, list] of Object.entries(doc)) {
  if (!Array.isArray(list)) continue;
  for (const r of list) rows.push({ ...r, src: k });
}
const known = new Set(rows.map((r) => r.from));
// old sitemap locs not covered by redirects.yaml
const dir = 'docs/reference/sitemap/';
const extra = [];
for (const f of readdirSync(dir).filter((f) => f.endsWith('.xml') && f !== 'sitemap.xml')) {
  for (const m of readFileSync(dir + f, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)) {
    const u = new URL(m[1]);
    const p = decodeURI(u.pathname);
    if (!known.has(p) && !known.has(u.pathname)) extra.push({ from: p, src: 'sitemap:' + f, code: 'any' });
  }
}
const all = [...rows, ...extra];
const sample = (p) => p.replace(/\*$/, 'x-sample');
const out = [];
const pool = 8;
let i = 0;
async function worker() {
  while (i < all.length) {
    const r = all[i++];
    const path = sample(r.from);
    let status = 0, loc = '';
    try {
      const res = await fetch(origin + encodeURI(decodeURI(path)), { redirect: 'manual', headers: { 'user-agent': 'acceptance-crawler' } });
      status = res.status; loc = res.headers.get('location') || '';
      await res.arrayBuffer();
    } catch (e) { status = -1; loc = String(e.message); }
    out.push({ ...r, path, status, loc });
  }
}
await Promise.all(Array.from({ length: pool }, worker));
const norm = (l) => l.replace(origin, '').replace(/^https?:\/\/[^/]+/, '');
const bad = [];
for (const r of out) {
  if (r.code === 'pending') continue;
  let ok;
  if (r.code === 200) ok = r.status === 200;
  else if (r.code === 301) ok = r.status === 301 && norm(r.loc) === r.to;
  else if (r.code === 410) ok = r.status === 410;
  else ok = [200, 301, 410].includes(r.status); // sitemap-only: must be an intentional answer
  if (!ok) bad.push(r);
}
const pend = out.filter((r) => r.code === 'pending');
const lines = [`checked ${out.length} addresses against ${origin}`, `mismatches: ${bad.length}`, `pending (P-5): ${pend.length} -> ${pend.map((r) => r.status).join(',')}`];
for (const r of bad) lines.push(`${r.src}\t${r.from}\texpected ${r.code}${r.to ? ' -> ' + r.to : ''}\tgot ${r.status} ${r.loc}`);
console.log(lines.join('\n'));
writeFileSync('docs/acceptance/2026-11-07/addresses.txt', lines.join('\n') + '\n');
