// The builder's loop (spec 62 §9): poll the feed every 2 minutes, build on a
// change, on the end of a session (+5 min) and hourly, publish only a checked
// and complete build, keep the last good one otherwise, retry 1/2/5/10 min.
// Everything with side effects is injected, so the whole loop runs in tests.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync, unlinkSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { checkCompleteness, contentHash, mediaRefs, nextScheduledBuild, rewriteMedia } from './snapshot.mjs';
import { health, readState, retryDelayMs, writeState } from './state.mjs';
import { mergeRemoved } from '../../scripts/removed-events.mjs';
import { syncMedia } from './media.mjs';
import { changedPaths, currentRelease, pageHashes, pruneReleases, stageRelease, switchCurrent, verifyRelease } from './release.mjs';
import { purgeCloudflare, purgeUrls } from './purge.mjs';

export const POLL_MS = 2 * 60_000;

/**
 * @param {object} o
 * @param {string} o.dataDir     snapshots, media, state (volume builder-data)
 * @param {string} o.siteDir     releases/ and the `current` link (volume shared with web)
 * @param {() => Promise<object>} o.fetchSnapshot   one complete pass over the feed
 * @param {(snapshotPath: string) => Promise<string>} o.buildSite  builds, returns the dist folder
 * @param {(releaseDir: string) => Promise<void>} o.checkSite      the site's own checks against a release
 * @param {(snapshot: object) => string[]} o.eventPaths            pages that must exist for a snapshot
 * @param {(snapshot: object) => string[]} [o.removedPaths]        addresses of removed events: no page, answer 410
 * @param {string} o.siteUrl
 */
export function createBuilder(o) {
  const now = o.now ?? (() => new Date());
  const log = o.log ?? ((m) => console.log(`[builder] ${m}`));
  const stateFile = join(o.dataDir, 'state.json');
  const snapDir = join(o.dataDir, 'snapshots');
  const mediaDir = join(o.dataDir, 'media');
  const shrinkFlag = join(o.dataDir, 'allow-shrink');
  mkdirSync(snapDir, { recursive: true });
  mkdirSync(o.siteDir, { recursive: true });

  let state = readState(stateFile);
  let latest = readJson(join(snapDir, 'latest.json'));
  let building = null;
  let pending = false;
  let lastPollAt = 0;

  const save = () => writeState(stateFile, state);
  const iso = () => now().toISOString();

  function readJson(p) {
    try {
      return existsSync(p) ? JSON.parse(readFileSync(p, 'utf8')) : null;
    } catch {
      return null;
    }
  }

  /** One complete pass over the feed. A change opens the "unprocessed" clock and asks for a build. */
  async function poll() {
    lastPollAt = now().getTime();
    let snap;
    try {
      snap = await o.fetchSnapshot();
    } catch (e) {
      log(`poll failed: ${e?.message ?? e}`);
      state.last_error = `poll: ${e?.message ?? e}`;
      state.last_error_at = iso();
      save();
      return { changed: false, error: e };
    }
    // Removals outlive the platform 30-day list: the registry in state.json keeps them.
    state.removed = mergeRemoved(state.removed, snap);
    snap = { ...snap, removed_events: state.removed };
    latest = snap;
    writeFileSync(join(snapDir, 'latest.json'), JSON.stringify(snap));
    state.last_successful_poll_at = iso();
    const changed = contentHash(snap) !== state.published_hash;
    if (changed && !state.oldest_unprocessed_change_at) state.oldest_unprocessed_change_at = iso();
    if (!changed) state.oldest_unprocessed_change_at = null;
    save();
    // After a failed build the retry pause decides when to try again (1/2/5/10 min).
    if (changed && !state.next_retry_at) requestBuild('change');
    return { changed };
  }

  /** Asks for a build; requests made while one runs merge into ONE next build. */
  function requestBuild(reason) {
    if (building) {
      pending = true;
      return building;
    }
    building = (async () => {
      try {
        do {
          pending = false;
          await buildOnce(reason);
          reason = 'merged';
        } while (pending);
      } finally {
        building = null;
      }
    })();
    return building;
  }

  async function buildOnce(reason) {
    if (!latest) {
      await poll();
      if (!latest) return { published: false, reason: 'no snapshot' };
    }
    const snap = latest;
    const hash = contentHash(snap);
    log(`build (${reason}): ${snap.events?.length ?? 0} event(s)`);
    let staged = null;
    try {
      const published = readJson(join(snapDir, 'published.json'));
      const allowShrink = existsSync(shrinkFlag);
      const complete = checkCompleteness(published, snap, { allowShrink });
      if (!complete.ok) throw new Error(`not published: ${complete.reason}`);
      if (complete.reason) log(complete.reason);

      const { files, errors } = await syncMedia(mediaRefs(snap), mediaDir, { fetch: o.fetch, optimize: o.optimize, log });
      if (errors.length) log(`${errors.length} media file(s) missing; their images are left out`);
      const buildPath = join(snapDir, 'build.json');
      writeFileSync(buildPath, JSON.stringify(rewriteMedia(snap, files)));

      const dist = await o.buildSite(resolve(buildPath));
      staged = stageRelease(dist, o.siteDir, mediaDir, files, o.releaseName?.());
      await o.checkSite(staged);
      const shrinking = Boolean(complete.reason);
      const check = verifyRelease(staged, { eventPaths: o.eventPaths(snap), removedPaths: o.removedPaths?.(snap) ?? [], minPages: shrinking ? 0 : state.published_pages ?? 0 });
      if (!check.ok) throw new Error(`release check failed: ${check.errors.slice(0, 10).join('; ')}`);

      const prev = currentRelease(o.siteDir);
      const oldHashes = prev && existsSync(prev) ? pageHashes(prev) : {};
      switchCurrent(o.siteDir, staged);
      const at = iso();
      log(`published ${staged} (${check.pages} pages)`);

      copyFileSync(join(snapDir, 'latest.json'), join(snapDir, 'published.json'));
      if (allowShrink) unlinkSync(shrinkFlag);
      state = {
        ...state,
        last_publish_at: at,
        last_build_at: at,
        published_hash: hash,
        published_events: snap.events?.length ?? 0,
        // Staging test pages (3 per test event) are left out of the baseline: a test event may vanish.
        published_pages: Math.max(0, check.pages - 3 * (snap.test_events?.length ?? 0)),
        current_release: staged,
        oldest_unprocessed_change_at: contentHash(latest) === hash ? null : state.oldest_unprocessed_change_at,
        consecutive_failures: 0,
        next_retry_at: null,
        last_error: null,
        last_error_at: null,
      };
      save();
      pruneReleases(o.siteDir, o.keepReleases ?? 5);

      try {
        const urls = purgeUrls(o.siteUrl, changedPaths(oldHashes, pageHashes(staged)));
        state.last_purge = { at, ...(await purgeCloudflare(urls, { token: o.cfToken, zoneId: o.cfZoneId, fetch: o.fetch, log })) };
      } catch (e) {
        state.last_purge = { at, error: String(e?.message ?? e) };
        log(String(e?.message ?? e));
      }
      save();
      return { published: true, release: staged };
    } catch (e) {
      if (staged && currentRelease(o.siteDir) !== resolve(staged)) rmSync(staged, { recursive: true, force: true });
      state.consecutive_failures = (state.consecutive_failures ?? 0) + 1;
      state.last_error = String(e?.message ?? e);
      state.last_error_at = iso();
      state.next_retry_at = new Date(now().getTime() + retryDelayMs(state.consecutive_failures)).toISOString();
      if (!state.oldest_unprocessed_change_at && hash !== state.published_hash) state.oldest_unprocessed_change_at = iso();
      save();
      log(`build failed (${state.consecutive_failures} in a row, retry at ${state.next_retry_at}): ${state.last_error}`);
      return { published: false, error: e };
    }
  }

  /**
   * One step of the clock (called every ~15 s): poll when due, retry a failed
   * build when its pause is over, build when a session has just ended or an
   * hour has passed. A build after a failure waits for its pause.
   */
  async function tick() {
    const t = now().getTime();
    if (t - lastPollAt >= (o.pollMs ?? POLL_MS)) await poll();
    if (building) return;
    if (state.next_retry_at) {
      if (t >= Date.parse(state.next_retry_at)) await requestBuild('retry');
      return;
    }
    const base = latest ?? readJson(join(snapDir, 'published.json'));
    if (!base) return;
    const due = Date.parse(nextScheduledBuild(base, state.last_build_at));
    if (t >= due) await requestBuild('schedule');
  }

  return {
    poll,
    tick,
    requestBuild,
    health: () => health(state, now()),
    get state() {
      return state;
    },
    get building() {
      return building;
    },
  };
}
