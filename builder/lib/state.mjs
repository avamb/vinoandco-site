// Builder state file and the three freshness readings (spec 62 §9, §14.7):
//   last_successful_poll_at     the last complete pass over the feed, change or not;
//   oldest_unprocessed_change_at a change seen and not yet published (null = none);
//   last_publish_at             when a release was last switched in.
// Alerts: no successful poll for 10 minutes, an unprocessed change older than
// 15 minutes. The publish time alone never alerts (a quiet hour builds nothing).
import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs';

export const POLL_ALERT_MS = 10 * 60_000;
export const CHANGE_ALERT_MS = 15 * 60_000;

export function emptyState() {
  return {
    last_successful_poll_at: null,
    oldest_unprocessed_change_at: null,
    last_publish_at: null,
    last_build_at: null,
    published_hash: null,
    published_events: null,
    published_pages: null,
    current_release: null,
    last_error: null,
    last_error_at: null,
    consecutive_failures: 0,
    next_retry_at: null,
    last_purge: null,
    // Build id of the image that produced the current release (see needsImageBuild).
    published_build_id: null,
    // Events that left the feed (id, slug, status, removed_at): their pages answer 410 for good.
    removed: [],
  };
}

/**
 * True when the running image (`buildId`) is not the one that produced the published release,
 * so a build is due even though the feed content is unchanged. An empty build id never asks.
 */
export function needsImageBuild(state, buildId) {
  return Boolean(buildId) && state?.published_build_id !== buildId;
}

export function readState(file) {
  if (!existsSync(file)) return emptyState();
  try {
    return { ...emptyState(), ...JSON.parse(readFileSync(file, 'utf8')) };
  } catch {
    return emptyState();
  }
}

/** Write through a temp file and rename, so a reader never sees half a file. */
export function writeState(file, state) {
  const tmp = `${file}.tmp`;
  writeFileSync(tmp, JSON.stringify(state, null, 2));
  renameSync(tmp, file);
}

/** Health report for /healthz: the readings, their ages and the alerts. */
export function health(state, now = new Date()) {
  const t = now.getTime();
  const age = (iso) => (iso ? Math.round((t - Date.parse(iso)) / 1000) : null);
  const alerts = [];
  const pollAge = age(state.last_successful_poll_at);
  if (pollAge === null || pollAge * 1000 > POLL_ALERT_MS) alerts.push('poll_stale');
  const changeAge = age(state.oldest_unprocessed_change_at);
  if (changeAge !== null && changeAge * 1000 > CHANGE_ALERT_MS) alerts.push('change_unpublished');
  return {
    ok: alerts.length === 0,
    alerts,
    last_successful_poll_at: state.last_successful_poll_at,
    last_successful_poll_age_s: pollAge,
    oldest_unprocessed_change_at: state.oldest_unprocessed_change_at,
    oldest_unprocessed_change_age_s: changeAge,
    last_publish_at: state.last_publish_at,
    last_publish_age_s: age(state.last_publish_at),
    current_release: state.current_release,
    published_events: state.published_events,
    published_pages: state.published_pages,
    consecutive_failures: state.consecutive_failures,
    next_retry_at: state.next_retry_at,
    last_error: state.last_error,
    last_error_at: state.last_error_at,
    last_purge: state.last_purge,
  };
}

/** Pause before the next attempt after `failures` failures in a row: 1, 2, 5, 10, 10… minutes. */
export function retryDelayMs(failures) {
  const steps = [1, 2, 5, 10];
  return steps[Math.min(Math.max(failures, 1), steps.length) - 1] * 60_000;
}

/**
 * Decides what to do with an existing builder.lock (a heartbeat the holder rewrites every cycle).
 * Returns { take, reason }: take=false means a live holder owns it and this process must stop.
 *  - our own host and pid: ours;
 *  - same host (two processes in one container): taken over only when that pid is dead;
 *  - another host (a recreated container has a new hostname): taken over only when the heartbeat
 *    is older than 3 poll cycles plus a margin, since pid 1 exists in every container and says nothing.
 * @param {{host?: string, pid?: number, at?: string}|null} lock
 * @param {{now: number, pollSeconds: number, host: string, pid: number, isAlive: (pid: number) => boolean, marginMs?: number}} ctx
 */
export function lockDecision(lock, { now, pollSeconds, host, pid, isAlive, marginMs = 30_000 }) {
  if (!lock || typeof lock !== 'object') return { take: true, reason: 'unreadable' };
  if (lock.host === host) {
    if (lock.pid === pid) return { take: true, reason: 'own' };
    return isAlive(lock.pid) ? { take: false, reason: 'alive' } : { take: true, reason: 'stale' };
  }
  const at = Date.parse(lock.at);
  const staleAfter = 3 * pollSeconds * 1000 + marginMs;
  if (!Number.isFinite(at) || now - at > staleAfter) return { take: true, reason: 'stale' };
  return { take: false, reason: 'alive' };
}
