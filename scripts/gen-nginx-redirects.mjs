// Turns redirects.yaml into nginx `location` rules: dist/.nginx/redirects.conf,
// included by nginx/default.conf.template. Run by scripts/postbuild.mjs.
import { existsSync, readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { parse } from 'yaml';
import { removedPaths } from './removed-events.mjs';

export function nginxRules(doc, goneEvents = []) {
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
  // Events that left the platform feed: 410, never the 404 page.
  for (const p of goneEvents) lines.push(`location = ${p} { return 410; }`);
  return lines.join('\n') + '\n';
}

/** Addresses to answer 410: the removed events of the build snapshot, minus any address that is a built page. */
export function goneEventPaths(root, dist) {
  const file = process.env.EVENTS_SNAPSHOT;
  if (!file || !existsSync(file)) return [];
  const snapshot = JSON.parse(readFileSync(file, 'utf8'));
  const known = JSON.parse(readFileSync(join(root, 'src', 'data', 'event-slugs.json'), 'utf8'));
  return removedPaths(snapshot.removed_events, known).filter((p) => !existsSync(join(dist, p, 'index.html')));
}

export function writeNginxRedirects(root, dist) {
  const doc = parse(readFileSync(join(root, 'redirects.yaml'), 'utf8'));
  mkdirSync(join(dist, '.nginx'), { recursive: true });
  writeFileSync(join(dist, '.nginx', 'redirects.conf'), nginxRules(doc, goneEventPaths(root, dist)));
  return doc;
}
