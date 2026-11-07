// Pages of the staging test channel's events (spec §6.3): the same three addresses as a
// production event. They are checked for existence like any event, but the builder never
// treats them as removals (a test event that disappears is simply not built).

/**
 * @param {{ test_events?: object[], events?: object[] }} snapshot
 * @param {Record<string,string>} known   slug table
 * @param {(e: object, known: Record<string,string>) => string} slugOf   eventSlug
 */
export function testEventPaths(snapshot, known, slugOf) {
  const taken = new Set((snapshot.events ?? []).map((e) => slugOf(e, known)));
  const out = [];
  for (const e of snapshot.test_events ?? []) {
    const slug = slugOf(e, known);
    if (taken.has(slug)) continue; // a public event owns that address
    out.push(`/event/${slug}/`, `/en/event/${slug}/`, `/he/event/${slug}/`);
  }
  return out;
}
