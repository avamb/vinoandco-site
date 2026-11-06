// Site builder (spec 62 §9). Entry point of the `builder` service:
//
//   node --experimental-strip-types builder/run.mjs           loop + /healthz
//   node --experimental-strip-types builder/run.mjs --once    one poll and one build, then exit
//   node --experimental-strip-types builder/run.mjs --poll    one pass over the feed, print the summary
//
// Environment (public values only in the repository, see .env.example):
//   PUBLIC_ARENA_API, PUBLIC_FEED_TOKEN   feed to poll (required)
//   SITE_URL                              origin of the published site (purge URLs)
//   BUILDER_DATA_DIR   (/data)            snapshots, media, state.json   — volume builder-data
//   BUILDER_SITE_DIR   (/site)            releases/ and `current`        — volume shared with web
//   BUILDER_APP_DIR    (repo root)        where `npm run build` runs
//   BUILDER_HEALTH_PORT (8081)            GET /healthz (200 ok / 503 with alerts)
//   BUILDER_POLL_SECONDS (120)
//   CF_API_TOKEN, CF_ZONE_ID              optional Cloudflare purge (secret: deploy env only)
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArenaClient } from '../src/arena/client.ts';
import { eventSlug } from '../src/arena/lifecycle.ts';
import { createBuilder } from './lib/builder.mjs';
import { run } from './lib/release.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const appDir = resolve(env.BUILDER_APP_DIR || join(here, '..'));
const dataDir = resolve(env.BUILDER_DATA_DIR || '/data');
const siteDir = resolve(env.BUILDER_SITE_DIR || '/site');
const apiBase = env.PUBLIC_ARENA_API || 'https://api.arenasoldout.com';
const feedToken = env.PUBLIC_FEED_TOKEN || '';
const log = (m) => console.log(`${new Date().toISOString()} [builder] ${m}`);

if (!feedToken) {
  log('PUBLIC_FEED_TOKEN is empty: nothing to poll');
  process.exit(1);
}

const client = createArenaClient({ apiBase, feedToken, timeoutMs: 30_000 });
const knownSlugs = JSON.parse(readFileSync(join(appDir, 'src', 'data', 'event-slugs.json'), 'utf8'));
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Every page an event must have in the build: ru, en, he. */
function eventPaths(snapshot) {
  const out = [];
  for (const e of snapshot.events ?? []) {
    const slug = eventSlug(e, knownSlugs);
    out.push(`/event/${slug}/`, `/en/event/${slug}/`, `/he/event/${slug}/`);
  }
  return out;
}

const builder = createBuilder({
  dataDir,
  siteDir,
  siteUrl: env.SITE_URL || 'https://vinoandco.events',
  pollMs: Number(env.BUILDER_POLL_SECONDS || 120) * 1000,
  cfToken: env.CF_API_TOKEN || '',
  cfZoneId: env.CF_ZONE_ID || '',
  log,
  fetchSnapshot: () => client.fetchSnapshot(),
  eventPaths,
  async buildSite(snapshotPath) {
    await run(npm, ['run', 'build'], { cwd: appDir, env: { ...env, EVENTS_SNAPSHOT: snapshotPath }, log });
    return join(appDir, 'dist');
  },
  async checkSite(releaseDir) {
    const e = { ...env, DIST_DIR: releaseDir };
    await run(process.execPath, [join(appDir, 'scripts', 'check-dist.mjs')], { cwd: appDir, env: e, log });
    await run(process.execPath, [join(appDir, 'scripts', 'check-redirects.mjs')], { cwd: appDir, env: e, log });
  },
});

const args = new Set(process.argv.slice(2));

if (args.has('--poll')) {
  const snap = await client.fetchSnapshot();
  for (const e of snap.events) {
    const sessions = e.sessions.map((s) => `${s.start_at} ${s.sales_state || '?'} ${s.tiers.map((t) => `${t.name}:${t.available ?? '-'}`).join(',')}`);
    console.log(`${e.display_number}\t${eventSlug(e, knownSlugs)}\t${e.name}\t${sessions.join(' | ')}`);
  }
  console.log(`${snap.events.length} event(s)`);
  process.exit(0);
}

if (args.has('--once')) {
  await builder.poll();
  // A changed feed has already started a build; otherwise build anyway.
  await (builder.building ?? builder.requestBuild('manual'));
  console.log(JSON.stringify(builder.health(), null, 2));
  process.exit(builder.state.consecutive_failures ? 1 : 0);
}

// ── One builder per data volume ─────────────────────────────────────────────
// A heartbeat in builder.lock; another process's lock younger than 5 minutes
// means a second builder is running on the same volume, and this one stops.
mkdirSync(dataDir, { recursive: true });
const lockFile = join(dataDir, 'builder.lock');
const me = { host: hostname(), pid: process.pid };
function heartbeat() {
  writeFileSync(lockFile, JSON.stringify({ ...me, at: new Date().toISOString() }));
}
if (existsSync(lockFile)) {
  try {
    const other = JSON.parse(readFileSync(lockFile, 'utf8'));
    const fresh = Date.now() - Date.parse(other.at) < 5 * 60_000;
    const self = other.host === me.host && other.pid === me.pid;
    if (fresh && !self) {
      log(`another builder holds ${lockFile} (${other.host} pid ${other.pid}); exiting`);
      process.exit(1);
    }
  } catch {
    /* unreadable lock: take it */
  }
}
heartbeat();

const port = Number(env.BUILDER_HEALTH_PORT || 8081);
createServer((req, res) => {
  if (req.url === '/healthz' || req.url === '/') {
    const h = builder.health();
    res.writeHead(h.ok ? 200 : 503, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
    res.end(JSON.stringify(h, null, 2));
    return;
  }
  res.writeHead(404).end();
}).listen(port, () => log(`healthz on :${port}`));

let stopping = false;
for (const sig of ['SIGTERM', 'SIGINT']) {
  process.on(sig, async () => {
    if (stopping) return;
    stopping = true;
    log(`${sig}: finishing the running build`);
    await builder.building;
    process.exit(0);
  });
}

log(`polling ${apiBase} every ${Number(env.BUILDER_POLL_SECONDS || 120)} s; data ${dataDir}, site ${siteDir}`);
for (;;) {
  if (stopping) break;
  heartbeat();
  try {
    await builder.tick();
  } catch (e) {
    log(`tick failed: ${e?.stack ?? e}`);
  }
  await new Promise((r) => setTimeout(r, 15_000));
}
