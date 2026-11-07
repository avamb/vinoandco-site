// Site builder (spec 62 §9). Entry point of the `builder` service:
//
//   node --experimental-strip-types builder/run.mjs           loop + /healthz
//   node --experimental-strip-types builder/run.mjs --once    one poll and one build, then exit
//   node --experimental-strip-types builder/run.mjs --poll    one pass over the feed, print the summary
//
// Environment (public values only in the repository, see .env.example):
//   PUBLIC_ARENA_API, PUBLIC_FEED_TOKEN   feed to poll (required)
//   PUBLIC_TEST_FEED_TOKEN, TEST_EVENT_IDS   staging only: the test channel's feed token and the
//                                         event ids (UUID or display number, comma separated) to build
//                                         from it. Both empty in production.
//   SITE_URL                              origin of the published site (purge URLs)
//   SITE_BUILD_ID                         id of this image (build arg, else /app/.build-id)
//   BUILDER_DATA_DIR   (/data)            snapshots, media, state.json   — volume builder-data
//   BUILDER_SITE_DIR   (/site)            releases/ and `current`        — volume shared with web
//   BUILDER_APP_DIR    (repo root)        where `npm run build` runs
//   BUILDER_HEALTH_PORT (8081)            GET /healthz (200 ok / 503 with alerts)
//   BUILDER_POLL_SECONDS (120)
//   CF_API_TOKEN, CF_ZONE_ID              optional Cloudflare purge (secret: deploy env only)
import { createServer } from 'node:http';
import { hostname } from 'node:os';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createArenaClient } from '../src/arena/client.ts';
import { eventSlug } from '../src/arena/lifecycle.ts';
import { createBuilder } from './lib/builder.mjs';
import { removedPaths } from '../scripts/removed-events.mjs';
import { run } from './lib/release.mjs';
import { lockDecision } from './lib/state.mjs';
import { testChannelConfig } from '../src/arena/test-channel.ts';
import { testEventPaths } from './lib/test-events.mjs';

const here = dirname(fileURLToPath(import.meta.url));
const env = process.env;
const appDir = resolve(env.BUILDER_APP_DIR || join(here, '..'));
const dataDir = resolve(env.BUILDER_DATA_DIR || '/data');
const siteDir = resolve(env.BUILDER_SITE_DIR || '/site');
const apiBase = env.PUBLIC_ARENA_API || 'https://api.arenasoldout.com';
const feedToken = env.PUBLIC_FEED_TOKEN || '';
const buildId = (() => {
  if (env.SITE_BUILD_ID) return env.SITE_BUILD_ID.trim();
  try {
    return readFileSync(join(appDir, '.build-id'), 'utf8').trim();
  } catch {
    return '';
  }
})();
const log = (m) => console.log(`${new Date().toISOString()} [builder] ${m}`);

if (!feedToken) {
  log('PUBLIC_FEED_TOKEN is empty: nothing to poll');
  process.exit(1);
}

const client = createArenaClient({ apiBase, feedToken, timeoutMs: 30_000 });
const knownSlugs = JSON.parse(readFileSync(join(appDir, 'src', 'data', 'event-slugs.json'), 'utf8'));
const testCfg = testChannelConfig(env);
const testClient = testCfg.enabled ? createArenaClient({ apiBase, feedToken: testCfg.token, timeoutMs: 30_000 }) : null;
let lastTestEvents = [];
try {
  lastTestEvents = JSON.parse(readFileSync(join(dataDir, 'snapshots', 'latest.json'), 'utf8')).test_events ?? [];
} catch {
  /* first run */
}
const npm = process.platform === 'win32' ? 'npm.cmd' : 'npm';

/** Every page an event must have in the build: ru, en, he. */
function eventPaths(snapshot) {
  const out = [];
  for (const e of snapshot.events ?? []) {
    const slug = eventSlug(e, knownSlugs);
    out.push(`/event/${slug}/`, `/en/event/${slug}/`, `/he/event/${slug}/`);
  }
  out.push(...testEventPaths(snapshot, knownSlugs, eventSlug));
  return out;
}

/** Addresses of events that left the feed: no page, 410. */
const removedEventPaths = (snapshot) => removedPaths(snapshot.removed_events, knownSlugs);

const builder = createBuilder({
  dataDir,
  siteDir,
  buildId,
  siteUrl: env.SITE_URL || 'https://vinoandco.events',
  pollMs: Number(env.BUILDER_POLL_SECONDS || 120) * 1000,
  cfToken: env.CF_API_TOKEN || '',
  cfZoneId: env.CF_ZONE_ID || '',
  log,
  async fetchSnapshot() {
    // The main feed decides everything: its failure fails the poll. The test feed is
    // best effort: on any failure the previous test events stay in the snapshot.
    const snap = await client.fetchSnapshot();
    if (!testClient) return snap;
    try {
      const { events, missing } = await testClient.fetchEventsByIds(testCfg.ids);
      if (missing.length) log(`test feed does not list: ${missing.join(', ')} (not built)`);
      lastTestEvents = events;
    } catch (e) {
      log(`test feed failed, keeping the previous ${lastTestEvents.length} test event(s): ${e?.message ?? e}`);
    }
    return { ...snap, test_events: lastTestEvents };
  },
  eventPaths,
  removedPaths: removedEventPaths,
  async buildSite(snapshotPath) {
    await run(npm, ['run', 'build'], { cwd: appDir, env: { ...env, EVENTS_SNAPSHOT: snapshotPath }, log });
    return join(appDir, 'dist');
  },
  async checkSite(releaseDir) {
    const e = { ...env, DIST_DIR: releaseDir, CHECK_PLATFORM_EVENTS: '1' };
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
  if (testClient) {
    const t = await testClient.fetchEventsByIds(testCfg.ids);
    for (const e of t.events) console.log(`TEST	${e.display_number}	${eventSlug(e, knownSlugs)}	${e.name}`);
    console.log(`${t.events.length} test event(s)${t.missing.length ? `, not listed: ${t.missing.join(', ')}` : ''}`);
  }
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
  let other = null;
  try {
    other = JSON.parse(readFileSync(lockFile, 'utf8'));
  } catch {
    /* unreadable lock: take it */
  }
  const verdict = lockDecision(other, {
    now: Date.now(),
    pollSeconds: Number(env.BUILDER_POLL_SECONDS || 120),
    host: me.host,
    pid: me.pid,
    isAlive: (p) => {
      try {
        process.kill(p, 0);
        return true;
      } catch (e) {
        return e?.code === 'EPERM';
      }
    },
  });
  if (!verdict.take) {
    log(`another builder holds ${lockFile} (${other?.host} pid ${other?.pid}); exiting`);
    process.exit(1);
  }
  if (verdict.reason === 'stale') log(`lock: taking over stale lock of ${other?.host}`);
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
    try {
      if (JSON.parse(readFileSync(lockFile, 'utf8')).host === me.host) unlinkSync(lockFile);
    } catch {
      /* nothing to release */
    }
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
