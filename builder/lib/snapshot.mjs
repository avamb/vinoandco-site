// Snapshot rules of the builder (spec 62 §9): what counts as a change, what
// counts as a complete pass, and how signed media links become site files.
// Pure functions, no I/O.
import { createHash } from 'node:crypto';

/** A signed platform media link: /v1/media-files/<id>?expires=…&sig=… */
const MEDIA_RE = /\/v1\/media-files\/([A-Za-z0-9-]+)(?:\?[^"\s]*)?$/;

/** The media id a platform media link points to, or null. */
export function mediaIdOf(url) {
  if (typeof url !== 'string') return null;
  const m = MEDIA_RE.exec(url);
  return m ? m[1] : null;
}

/** Deep copy where every string is passed through fn (objects keep key order). */
function mapStrings(value, fn) {
  if (typeof value === 'string') return fn(value);
  if (Array.isArray(value)) return value.map((v) => mapStrings(v, fn));
  if (value && typeof value === 'object') {
    const out = {};
    for (const [k, v] of Object.entries(value)) out[k] = mapStrings(v, fn);
    return out;
  }
  return value;
}

/** Same value with object keys sorted, so the hash does not depend on key order. */
function canonical(value) {
  if (Array.isArray(value)) return value.map(canonical);
  if (value && typeof value === 'object') {
    const out = {};
    for (const k of Object.keys(value).sort()) out[k] = canonical(value[k]);
    return out;
  }
  return value;
}

/**
 * Hash of the events WITHOUT the signed media links: they are re-signed every
 * day and must not trigger builds. A media link counts by its media id only;
 * the snapshot time is ignored.
 */
export function contentHash(snapshot) {
  const events = [...(snapshot?.events ?? [])].sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const stable = mapStrings(events, (s) => {
    const id = mediaIdOf(s);
    return id ? `media:${id}` : s;
  });
  // A removal changes the site (the address answers 410), so it counts; its time does not.
  // Left out entirely when there is none, so a hash from before removals existed still matches.
  const removed = (snapshot?.removed_events ?? [])
    .map((r) => ({ id: r.id, status: r.status, slug: r.slug ?? null, n: r.display_number ?? null }))
    .sort((a, b) => String(a.id).localeCompare(String(b.id)));
  const payload = removed.length ? { events: stable, removed } : stable;
  return createHash('sha256').update(JSON.stringify(canonical(payload))).digest('hex');
}

/** Every platform media file the snapshot links to: [{ id, url }]. */
export function mediaRefs(snapshot) {
  const found = new Map();
  mapStrings(snapshot?.events ?? [], (s) => {
    const id = mediaIdOf(s);
    if (id && !found.has(id)) found.set(id, s);
    return s;
  });
  return [...found].map(([id, url]) => ({ id, url }));
}

/**
 * The snapshot the site is built from: each signed media link replaced by
 * the downloaded file (`files[id]`, a site path) or null when it could not be
 * downloaded — a signed link expires in a day, a broken image is worse than none.
 */
export function rewriteMedia(snapshot, files) {
  return {
    ...snapshot,
    events: mapStrings(snapshot.events ?? [], (s) => {
      const id = mediaIdOf(s);
      if (!id) return s;
      return files[id] ?? null;
    }),
  };
}

/** Events the platform marked as taken down (П-6, explicit). */
const REMOVED = new Set(['unpublished', 'deleted', 'archived', 'withdrawn']);

/**
 * Completeness rule (§9 "Полнота"): a pass with FEWER events than the last
 * published one is refused unless the drop is explained — by an explicit
 * "taken down" status in the feed (П-6) or by the operator's one-shot
 * allow-shrink flag. Returns { ok, reason }.
 */
export function checkCompleteness(prev, next, { allowShrink = false } = {}) {
  const prevCount = prev?.events?.length ?? 0;
  const live = (next?.events ?? []).filter((e) => !REMOVED.has(String(e.status)));
  const explicit = (next?.events ?? []).length - live.length;
  if (live.length >= prevCount || prevCount === 0) return { ok: true, reason: '' };
  const missing = prevCount - live.length;
  if (allowShrink) return { ok: true, reason: `${missing} event(s) fewer, allowed by the operator flag` };
  if (explicit >= missing) return { ok: true, reason: `${missing} event(s) taken down explicitly` };
  // The platform lists the events that left the feed (`removed_events`): a shrink is fine
  // when every event of the published build that is no longer listed is named there.
  const liveIds = new Set(live.map((e) => e.id));
  const removedIds = new Set((next?.removed_events ?? []).map((r) => r.id));
  const unexplained = (prev?.events ?? []).filter((e) => !liveIds.has(e.id) && !removedIds.has(e.id));
  if (unexplained.length === 0) return { ok: true, reason: `${missing} event(s) removed, named in removed_events` };
  return { ok: false, reason: `feed has ${live.length} event(s), the published build had ${prevCount}; no explicit take-down for ${unexplained.length}` };
}

/** A session is over at its end, or 6 h after its start when the end is missing (§6.1). */
function sessionEnd(s) {
  if (s.end_at) return Date.parse(s.end_at);
  return Date.parse(s.start_at) + 6 * 3600_000;
}

/**
 * When the next build is due even without a feed change (§9 "Переход по
 * времени"): 5 minutes after the end of the nearest session not yet covered
 * by the last build, and at least once an hour.
 */
export function nextScheduledBuild(snapshot, lastBuildAt, { graceMs = 5 * 60_000, everyMs = 3600_000 } = {}) {
  const last = lastBuildAt ? Date.parse(lastBuildAt) : 0;
  let next = last ? last + everyMs : Date.now();
  for (const e of snapshot?.events ?? []) {
    for (const s of e.sessions ?? []) {
      if (s.status === 'cancelled' || !s.start_at) continue;
      const due = sessionEnd(s) + graceMs;
      if (due > last && due < next) next = due;
    }
  }
  return new Date(next).toISOString();
}
