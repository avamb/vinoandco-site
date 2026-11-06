// Site builder — STUB (spec 62 §9).
//
// What it will do:
//   1. every 2 minutes take a complete pass over the channel feed through
//      src/arena (client.fetchSnapshot), hash it without the signed media URLs;
//   2. on a change (or at the end of the next session + 5 min, or hourly) write
//      the snapshot to /data, download and optimize posters, run
//      `EVENTS_SNAPSHOT=/data/snapshot.json npm run build` into a new folder;
//   3. check the result (page count, required pages, links), then switch the
//      folder nginx serves; otherwise keep the last good build;
//   4. purge changed URLs in Cloudflare; report the three freshness readings.
//
// Today it only checks that it can reach the feed, so the compose wiring can be
// tested. It never writes anything.
const api = (process.env.PUBLIC_ARENA_API || '').replace(/\/+$/, '');
const token = process.env.PUBLIC_FEED_TOKEN || '';
if (!token) {
  console.log('builder stub: PUBLIC_FEED_TOKEN is empty, nothing to do');
  process.exit(0);
}
const res = await fetch(`${api}/v1/public/feeds/${encodeURIComponent(token)}/events?per_page=1`, {
  headers: { Accept: 'application/json' },
});
const body = res.ok ? await res.json() : null;
console.log(`builder stub: feed answered ${res.status}, events total ${body?.pagination?.total ?? '?'}`);
