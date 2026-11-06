// Turns redirects.yaml into nginx `location` rules: dist/.nginx/redirects.conf,
// included by nginx/default.conf.template. Run by scripts/postbuild.mjs.
import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';

export function nginxRules(doc) {
  const lines = ['# Generated from redirects.yaml by scripts/gen-nginx-redirects.mjs — do not edit.'];
  const rule = (from, body) => {
    if (from.includes('*') && !from.endsWith('/*')) {
      const re = '^' + from.replace(/[.+?^${}()|[\]\\]/g, '\\$&').replace(/\*/g, '.*') + '$';
      lines.push(`location ~ ${re} { ${body} }`);
    } else if (from.endsWith('/*')) {
      lines.push(`location ^~ ${from.slice(0, -1)} { ${body} }`);
    } else {
      lines.push(`location = ${from} { ${body} }`);
      // WordPress answered the slash-less form with a 301 to the slashed one; keep it reachable.
      if (from.endsWith('/') && from !== '/') lines.push(`location = ${from.slice(0, -1)} { ${body} }`);
    }
  };
  for (const r of doc.redirects ?? []) rule(r.from, `return 301 ${r.to};`);
  for (const r of doc.gone ?? []) rule(r.from, 'return 410;');
  for (const r of doc.events ?? []) {
    if (r.code === 301 && r.to) rule(r.from, `return 301 ${r.to};`);
    if (r.code === 410) rule(r.from, 'return 410;');
  }
  return lines.join('\n') + '\n';
}

export function writeNginxRedirects(root, dist) {
  const doc = parse(readFileSync(join(root, 'redirects.yaml'), 'utf8'));
  mkdirSync(join(dist, '.nginx'), { recursive: true });
  writeFileSync(join(dist, '.nginx', 'redirects.conf'), nginxRules(doc));
  return doc;
}
