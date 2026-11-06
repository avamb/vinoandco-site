// Releases: each build lands in its own folder under <site>/releases/, is
// checked there, and only then becomes `current` by an atomic symlink switch
// (spec 62 §9 "Атомарность"). A failed build or check leaves `current` on the
// last good release (last-known-good).
import { spawn } from 'node:child_process';
import { createHash } from 'node:crypto';
import {
  cpSync,
  existsSync,
  lstatSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  readlinkSync,
  renameSync,
  rmSync,
  statSync,
  symlinkSync,
  unlinkSync,
} from 'node:fs';
import { join, relative, resolve } from 'node:path';

/** Runs a command, resolves on exit 0, rejects with the tail of its output otherwise. */
export function run(cmd, args, { cwd, env, timeoutMs = 10 * 60_000, log = () => {} } = {}) {
  return new Promise((ok, fail) => {
    const child = spawn(cmd, args, { cwd, env, shell: process.platform === 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    let tail = '';
    const keep = (chunk) => {
      tail = (tail + chunk.toString()).slice(-4000);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    const timer = setTimeout(() => child.kill('SIGKILL'), timeoutMs);
    child.on('error', (e) => {
      clearTimeout(timer);
      fail(e);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      log(`${cmd} ${args.join(' ')}: exit ${code}`);
      if (code === 0) ok(tail);
      else fail(new Error(`${cmd} ${args.join(' ')} exited ${code}: ${tail.trim().split('\n').slice(-15).join('\n')}`));
    });
  });
}

/** Every built page: site path -> sha256 of its HTML. */
export function pageHashes(dir) {
  const out = {};
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (name !== '_site' && name !== '.nginx') walk(p);
      } else if (name.endsWith('.html') || name === 'sitemap.xml' || name === 'robots.txt') {
        let path = '/' + relative(dir, p).split('\\').join('/');
        if (path.endsWith('/index.html')) path = path.slice(0, -'index.html'.length);
        out[path] = createHash('sha256').update(readFileSync(p)).digest('hex');
      }
    }
  };
  walk(dir);
  return out;
}

/** Number of HTML pages of a release. */
export function pageCount(dir) {
  return Object.keys(pageHashes(dir)).filter((p) => p.endsWith('/') || p.endsWith('.html')).length;
}

/** Paths whose content changed, appeared or disappeared between two releases. */
export function changedPaths(oldHashes, newHashes) {
  const out = [];
  for (const [p, h] of Object.entries(newHashes)) if (oldHashes[p] !== h) out.push(p);
  for (const p of Object.keys(oldHashes)) if (!(p in newHashes)) out.push(p);
  return out.sort();
}

/** The folder `current` points to, or null. */
export function currentRelease(siteDir) {
  const link = join(siteDir, 'current');
  try {
    if (!lstatSync(link).isSymbolicLink()) return null;
    return resolve(siteDir, readlinkSync(link));
  } catch {
    return null;
  }
}

/**
 * Points `current` at `releaseDir` atomically: a new link is made next to it
 * and renamed over the old one (rename(2) replaces a symlink in one step).
 * Windows (local tests) cannot rename over a junction, so it swaps instead.
 */
export function switchCurrent(siteDir, releaseDir) {
  const link = join(siteDir, 'current');
  const tmp = join(siteDir, `.current-${process.pid}-${Date.now()}`);
  if (process.platform === 'win32') {
    symlinkSync(resolve(releaseDir), tmp, 'junction');
    if (existsSync(link) || isLink(link)) unlinkSync(link);
    renameSync(tmp, link);
    return;
  }
  symlinkSync(relative(siteDir, releaseDir), tmp, 'dir');
  renameSync(tmp, link);
}

function isLink(p) {
  try {
    return lstatSync(p).isSymbolicLink();
  } catch {
    return false;
  }
}

/** Keeps the newest `keep` releases plus the current one; removes the rest. */
export function pruneReleases(siteDir, keep = 5) {
  const dir = join(siteDir, 'releases');
  if (!existsSync(dir)) return [];
  const cur = currentRelease(siteDir);
  const names = readdirSync(dir).sort().reverse();
  const removed = [];
  names.slice(keep).forEach((name) => {
    const p = join(dir, name);
    if (cur && resolve(p) === cur) return;
    rmSync(p, { recursive: true, force: true });
    removed.push(name);
  });
  return removed;
}

/** New release folder name: sortable UTC time. */
export function releaseName(now = new Date()) {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d+Z$/, 'Z');
}

/** Copies a built dist into a fresh release folder plus the media files it links to. */
export function stageRelease(distDir, siteDir, mediaDir, mediaFiles, name = releaseName()) {
  const dest = join(siteDir, 'releases', name);
  rmSync(dest, { recursive: true, force: true });
  mkdirSync(join(siteDir, 'releases'), { recursive: true });
  cpSync(distDir, dest, { recursive: true });
  const out = join(dest, '_site', 'media');
  mkdirSync(out, { recursive: true });
  for (const sitePath of new Set(Object.values(mediaFiles))) {
    const file = sitePath.split('/').pop();
    cpSync(join(mediaDir, file), join(out, file));
  }
  return dest;
}

/**
 * Builder-side checks of a release, on top of the site's own check scripts:
 * every listed event has its page in each language, every media file the
 * pages link to is present, and the page count did not drop without reason.
 */
export function verifyRelease(dir, { eventPaths = [], minPages = 0 } = {}) {
  const errors = [];
  const pages = pageCount(dir);
  if (pages < minPages) errors.push(`only ${pages} pages, the published release had ${minPages}`);
  for (const p of eventPaths) {
    if (!existsSync(join(dir, decodeURIComponent(p), 'index.html'))) errors.push(`missing event page ${p}`);
  }
  const media = new Set();
  const walk = (d) => {
    for (const name of readdirSync(d)) {
      const p = join(d, name);
      if (statSync(p).isDirectory()) {
        if (name !== '_site') walk(p);
      } else if (name.endsWith('.html')) {
        for (const m of readFileSync(p, 'utf8').matchAll(/\/_site\/media\/([A-Za-z0-9-]+\.jpg)/g)) media.add(m[1]);
      }
    }
  };
  walk(dir);
  for (const f of media) if (!existsSync(join(dir, '_site', 'media', f))) errors.push(`missing media /_site/media/${f}`);
  return { ok: errors.length === 0, errors, pages };
}
