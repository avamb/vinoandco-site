// Events that left the feed (include_removed): no page, the address answers 410,
// the shrink guard accepts a shrink backed by an explicit removal, the registry
// in state.json outlives the platform 30-day list.
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuilder } from '../lib/builder.mjs';
import { currentRelease } from '../lib/release.mjs';
import { checkCompleteness, contentHash } from '../lib/snapshot.mjs';
import { mergeRemoved, removedPaths, removedSlug } from '../../scripts/removed-events.mjs';
import { nginxRules } from '../../scripts/gen-nginx-redirects.mjs';

const ev = (id, slug, n = 1) => ({
  id,
  display_number: n,
  slug,
  name: slug,
  status: 'published',
  sessions: [{ id: `${id}-s`, start_at: '2030-01-01T18:00:00Z', end_at: '2030-01-01T21:00:00Z', status: 'scheduled', tiers: [{ id: 't', current_price: 100 }] }],
});
const gone = (id, slug, n, status = 'unpublished', removed_at = '2026-11-06T10:00:00Z') => ({ id, display_number: n, name: slug, slug, status, removed_at, last_session_at: null });

describe('removed events rules', () => {
  it('the page slug follows eventSlug: platform slug, known table, e<n>', () => {
    expect(removedSlug({ slug: 'premera', display_number: 5 })).toBe('premera');
    expect(removedSlug({ slug: null, display_number: 5 }, { 5: 'old-name' })).toBe('old-name');
    expect(removedSlug({ slug: null, display_number: 7 })).toBe('e7');
    expect(removedSlug({ slug: null, display_number: null })).toBeNull();
  });

  it('lists the address in all three languages', () => {
    expect(removedPaths([gone('a', 'premera', 1)])).toEqual(['/en/event/premera/', '/event/premera/', '/he/event/premera/']);
  });

  it('merges the registry, drops a republished event, keeps entries the platform forgot', () => {
    const reg = mergeRemoved([gone('old', 'old-one', 2, 'deleted', '2026-09-01T00:00:00Z')], { events: [ev('b', 'b')], removed_events: [gone('a', 'a', 1), gone('b', 'b', 3)] });
    expect(reg.map((r) => r.id).sort()).toEqual(['a', 'old']);
    const again = mergeRemoved(reg, { events: [ev('a', 'a')], removed_events: [] });
    expect(again.map((r) => r.id)).toEqual(['old']);
  });

  it('the shrink guard accepts a shrink named in removed_events and refuses an unnamed one', () => {
    const prev = { events: [ev('a', 'a'), ev('b', 'b'), ev('c', 'c')] };
    const named = { events: [ev('a', 'a'), ev('b', 'b')], removed_events: [gone('c', 'c', 3)] };
    expect(checkCompleteness(prev, named).ok).toBe(true);
    expect(checkCompleteness(prev, named).reason).toMatch(/removed_events/);
    const unnamed = { events: [ev('a', 'a')], removed_events: [gone('c', 'c', 3)] };
    expect(checkCompleteness(prev, unnamed).ok).toBe(false);
    expect(checkCompleteness(prev, unnamed, { allowShrink: true }).ok).toBe(true);
  });

  it('a removal changes the content hash, a later removed_at does not', () => {
    const base = { events: [ev('a', 'a')] };
    const h0 = contentHash(base);
    const h1 = contentHash({ ...base, removed_events: [gone('x', 'x', 9)] });
    expect(h1).not.toBe(h0);
    expect(contentHash({ ...base, removed_events: [gone('x', 'x', 9, 'unpublished', '2026-11-07T00:00:00Z')] })).toBe(h1);
    expect(contentHash({ ...base, removed_events: [] })).toBe(h0);
  });

  it('nginx answers 410 for the removed addresses', () => {
    const conf = nginxRules({ pages: [] }, removedPaths([gone('a', 'premera', 1)]));
    expect(conf).toContain('location = /event/premera/ { return 410; }');
    expect(conf).toContain('location = /he/event/premera/ { return 410; }');
  });
});

describe('builder with removals', () => {
  let root;
  let clock;
  let feed;
  let removed;
  let builds;

  async function fakeBuild(snapshotPath) {
    builds++;
    const snap = JSON.parse(readFileSync(snapshotPath, 'utf8'));
    const dist = join(root, `dist-${builds}`);
    rmSync(dist, { recursive: true, force: true });
    const page = (p, html) => {
      mkdirSync(join(dist, p), { recursive: true });
      writeFileSync(join(dist, p, 'index.html'), html);
    };
    page('/', `<h1>home ${builds}</h1>`);
    for (const e of snap.events) for (const pre of ['', '/en', '/he']) page(`${pre}/event/${e.slug}/`, `<h1>${e.name}</h1>`);
    mkdirSync(join(dist, '.nginx'), { recursive: true });
    writeFileSync(join(dist, '.nginx', 'redirects.conf'), nginxRules({}, removedPaths(snap.removed_events)));
    return dist;
  }

  function make(extra = {}) {
    return createBuilder({
      dataDir: join(root, 'data'),
      siteDir: join(root, 'site'),
      siteUrl: 'https://vinoandco.events',
      now: () => clock,
      log: () => {},
      fetchSnapshot: async () => ({ fetched_at: clock.toISOString(), source: 'feed', events: structuredClone(feed), removed_events: structuredClone(removed) }),
      fetch: async () => new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/jpeg' } }),
      optimize: async (b) => b,
      buildSite: fakeBuild,
      checkSite: async () => {},
      eventPaths: (s) => s.events.flatMap((e) => [`/event/${e.slug}/`, `/en/event/${e.slug}/`, `/he/event/${e.slug}/`]),
      removedPaths: (s) => removedPaths(s.removed_events),
      releaseName: () => `r${builds}`,
      ...extra,
    });
  }

  beforeEach(() => {
    root = mkdtempSync(join(tmpdir(), 'vc-removed-'));
    clock = new Date('2026-11-07T12:00:00Z');
    feed = [ev('a', 'premera', 1), ev('b', 'kviz', 2)];
    removed = [];
    builds = 0;
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('publishes a shrink backed by an explicit removal without the allow-shrink file and records it in state.json', async () => {
    const b = make();
    await b.poll();
    await b.building;
    feed = [ev('a', 'premera', 1)];
    removed = [gone('b', 'kviz', 2, 'cancelled')];
    clock = new Date('2026-11-07T12:10:00Z');
    await b.poll();
    await b.building;
    const cur = currentRelease(join(root, 'site'));
    expect(cur).toMatch(/r2$/);
    expect(existsSync(join(cur, 'event', 'kviz', 'index.html'))).toBe(false);
    expect(readFileSync(join(cur, '.nginx', 'redirects.conf'), 'utf8')).toContain('location = /event/kviz/ { return 410; }');
    const state = JSON.parse(readFileSync(join(root, 'data', 'state.json'), 'utf8'));
    expect(state.removed).toEqual([expect.objectContaining({ id: 'b', status: 'cancelled', slug: 'kviz' })]);
    expect(state.consecutive_failures).toBe(0);
  });

  it('keeps answering 410 after the platform forgets the removal', async () => {
    const b = make();
    await b.poll();
    await b.building;
    feed = [ev('a', 'premera', 1)];
    removed = [gone('b', 'kviz', 2)];
    clock = new Date('2026-11-07T12:10:00Z');
    await b.poll();
    await b.building;
    removed = []; // 30 days later the list no longer names it
    feed = [ev('a', 'premera', 1), ev('c', 'novoe', 3)];
    clock = new Date('2026-12-20T12:00:00Z');
    await b.poll();
    await b.building;
    const cur = currentRelease(join(root, 'site'));
    expect(readFileSync(join(cur, '.nginx', 'redirects.conf'), 'utf8')).toContain('location = /event/kviz/ { return 410; }');
  });

  it('refuses a shrink that the platform did not name and keeps the last release', async () => {
    const b = make();
    await b.poll();
    await b.building;
    feed = [ev('a', 'premera', 1)];
    clock = new Date('2026-11-07T12:10:00Z');
    await b.poll();
    await b.building;
    expect(currentRelease(join(root, 'site'))).toMatch(/r1$/);
    expect(b.state.last_error).toMatch(/no explicit take-down/);
  });

  it('refuses a release in which a removed event still has a page', async () => {
    const b = make({
      buildSite: async (p) => {
        const dist = await fakeBuild(p);
        mkdirSync(join(dist, 'event', 'kviz'), { recursive: true });
        writeFileSync(join(dist, 'event', 'kviz', 'index.html'), 'x');
        return dist;
      },
    });
    feed = [ev('a', 'premera', 1)];
    removed = [gone('b', 'kviz', 2)];
    await b.poll();
    await b.building;
    expect(b.state.last_error).toMatch(/removed event still has a page/);
  });
});
