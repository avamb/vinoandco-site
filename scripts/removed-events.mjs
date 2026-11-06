// Events that left the platform feed (include_removed, spec 62 §6.1 / П-6): their
// pages are not built and their addresses answer 410. Plain JavaScript on
// purpose: the builder, the postbuild step and the release check all use it, and
// postbuild runs under plain `node`.

/** Site language prefixes of an event address. */
export const EVENT_PREFIXES = ['', '/en', '/he'];

/**
 * The slug the removed event's page lived at: the same rule as `eventSlug`
 * in src/arena/lifecycle.ts (platform slug, else the known table, else e<n>).
 * Null when nothing identifies the page.
 */
export function removedSlug(e, known = {}) {
  if (e?.slug && String(e.slug).trim()) return String(e.slug).trim();
  const n = e?.display_number;
  if (n === null || n === undefined) return null;
  const k = known[String(n)];
  return k && String(k).trim() ? String(k).trim() : `e${n}`;
}

/** Every address (all three languages) of the removed events, without duplicates. */
export function removedPaths(removed, known = {}) {
  const out = new Set();
  for (const e of removed ?? []) {
    const slug = removedSlug(e, known);
    if (!slug) continue;
    for (const p of EVENT_PREFIXES) out.add(`${p}/event/${slug}/`);
  }
  return [...out].sort();
}

/**
 * The registry the builder keeps in state.json: the platform lists removals for
 * 30 days only, the 410 must outlive that. Entries from `snapshot.removed_events`
 * are added, an event that is listed again is dropped, the newest 2000 are kept.
 */
export function mergeRemoved(registry, snapshot, max = 2000) {
  const live = new Set((snapshot?.events ?? []).map((e) => e.id));
  const byId = new Map();
  for (const r of registry ?? []) if (r?.id && !live.has(r.id)) byId.set(r.id, r);
  for (const r of snapshot?.removed_events ?? []) if (r?.id && !live.has(r.id)) byId.set(r.id, { ...byId.get(r.id), ...r });
  return [...byId.values()]
    .sort((a, b) => String(b.removed_at ?? '').localeCompare(String(a.removed_at ?? '')) || String(a.id).localeCompare(String(b.id)))
    .slice(0, max);
}
