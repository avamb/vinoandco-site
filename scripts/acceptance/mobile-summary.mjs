// Summarises the JSON files written by mobile-audit.mjs.
//   node scripts/acceptance/mobile-summary.mjs <dir> <glob-prefix> [--type 375 ru] [--comp 375] [--find]
// --find   findings per page and width (overflow, overlaps, too close, covered, clipped)
// --type W LANG   type scale per role for every page at that width (new vs wp)
// --comp W        distinct component values (radius / padding / gap / height) at that width, new vs wp
// --sections W LANG  section margins/paddings and the text gutter per page
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const [dir, prefix = 'audit-'] = process.argv.slice(2);
const args = process.argv.slice(2);
const at = (k) => { const i = args.indexOf('--' + k); return i < 0 ? null : args.slice(i + 1).filter((x) => !x.startsWith('--')); };
const runs = readdirSync(dir).filter((f) => f.startsWith(prefix) && f.endsWith('.json')).flatMap((f) => JSON.parse(readFileSync(join(dir, f), 'utf8')));

if (at('find')) {
  const rows = new Map();
  for (const r of runs) {
    if (r.error) { rows.set(`${r.site} ${r.page} ERROR ${r.error}`, (rows.get(`${r.site} ${r.page} ERROR ${r.error}`) || []).concat(`${r.width}/${r.lang}`)); continue; }
    const add = (what) => { const k = `${r.site} | ${r.page} | ${what}`; rows.set(k, (rows.get(k) || []).concat(`${r.width}${r.lang}`)); };
    if (r.overflow.over) add(`overflow ${r.overflow.innerWidth}px: ${r.overflow.wide[0] || ''}`);
    for (const p of r.pairs) if (p.kind !== 'touch') add(`${p.kind} ${p.dist}px ${p.overlap}: ${p.a} <-> ${p.b}`);
    for (const o of r.occluded) add(`covered: ${o.el} under ${o.under}`);
    for (const c of r.clipped) add(`clipped ${c.what}: ${c.el}`);
    for (const t of r.textOverImage || []) add(`text on image: ${t.text} at x=${t.x}, image ends ${t.imgRight}`);
  }
  for (const [k, v] of [...rows].sort()) console.log(`${k}  [${[...new Set(v)].join(' ')}]`);
}

const t = at('type');
if (t) {
  const [w, lang] = t;
  const roles = {};
  for (const r of runs.filter((x) => x.width === Number(w) && x.lang === lang && !x.error)) {
    for (const [role, v] of Object.entries(r.type)) for (const [k, o] of Object.entries(v)) {
      roles[role] ??= {}; const key = `${r.site} ${k}`;
      roles[role][key] ??= { n: 0, pages: new Set(), sample: o.sample }; roles[role][key].n += o.n; roles[role][key].pages.add(r.page);
    }
  }
  for (const [role, v] of Object.entries(roles)) {
    console.log(`\n### ${role}`);
    for (const [k, o] of Object.entries(v).sort((a, b) => b[1].n - a[1].n)) console.log(`  ${k}  x${o.n}  "${o.sample}"  [${[...o.pages].join(',')}]`);
  }
}

const c = at('comp');
if (c) {
  const [w] = c;
  const g = {};
  for (const r of runs.filter((x) => x.width === Number(w) && !x.error)) for (const [grp, v] of Object.entries(r.comp)) for (const [k, n] of Object.entries(v)) {
    g[grp] ??= {}; const key = `${r.site} ${k}`; g[grp][key] ??= { n: 0, pages: new Set() }; g[grp][key].n += n; g[grp][key].pages.add(r.page);
  }
  for (const [grp, v] of Object.entries(g)) {
    console.log(`\n### ${grp}`);
    for (const [k, o] of Object.entries(v).sort()) console.log(`  ${k}  x${o.n}  [${[...o.pages].slice(0, 6).join(',')}]`);
  }
}

const s = at('sections');
if (s) {
  const [w, lang] = s;
  for (const r of runs.filter((x) => x.width === Number(w) && x.lang === lang && !x.error && x.state === 'page')) {
    console.log(`\n${r.site} ${r.page}`);
    for (const x of r.sections) console.log(`  ${x.el.padEnd(30)} m ${x.mt}/${x.mb} p ${x.pt}/${x.pb} pi ${x.pi} h ${x.h} gutter ${x.gutter}`);
  }
}

// --distinct W SITE: per component group, every distinct radius / padding / height in use (markdown rows)
const d = at('distinct');
if (d) {
  const [w, siteName = 'new'] = d;
  const g = {};
  for (const r of runs.filter((x) => x.width === Number(w) && x.site === siteName && !x.error)) for (const [grp, v] of Object.entries(r.comp)) for (const k of Object.keys(v)) {
    const m = k.match(/^(.*?): radius (.*?); padding (.*?); gap (.*?); h (\d+)$/); if (!m) continue;
    g[grp] ??= { radius: new Set(), padding: new Set(), h: new Set() };
    g[grp].radius.add(m[2]); g[grp].padding.add(`${m[1]} ${m[3]}`); g[grp].h.add(`${m[1]} ${m[5]}`);
  }
  for (const [grp, v] of Object.entries(g)) console.log(`| ${grp} | ${[...v.radius].sort().join(', ')} | ${[...v.padding].sort().join('; ')} |`);
}
