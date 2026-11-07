import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBuilder } from '../lib/builder.mjs';
import { needsImageBuild } from '../lib/state.mjs';
import { currentRelease } from '../lib/release.mjs';

const signed = (id) => `https://api.arenasoldout.com/v1/media-files/${id}?expires=1&sig=${Math.random()}`;

function ev(id, slug, price = 29000) {
  return {
    id,
    display_number: 1,
    slug,
    name: slug,
    status: 'published',
    poster_media_id: `m-${id}`,
    poster_url: signed(`m-${id}`),
    sessions: [{ id: `${id}-s`, start_at: '2030-01-01T18:00:00Z', end_at: '2030-01-01T21:00:00Z', status: 'scheduled', tiers: [{ id: 't', current_price: price }] }],
  };
}

let root;
let clock;
let feed;
let builds;

/** A fake `npm run build`: one page per event per language, linking the poster. */
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
  for (const e of snap.events) {
    for (const pre of ['', '/en', '/he']) page(`${pre}/event/${e.slug}/`, `<h1>${e.name} ${e.sessions[0].tiers[0].current_price}</h1><img src="${e.poster_url}">`);
  }
  return dist;
}

function make(extra = {}) {
  return createBuilder({
    dataDir: join(root, 'data'),
    siteDir: join(root, 'site'),
    siteUrl: 'https://vinoandco.events',
    now: () => clock,
    log: () => {},
    fetchSnapshot: async () => {
      if (feed instanceof Error) throw feed;
      return { fetched_at: clock.toISOString(), source: 'feed', events: structuredClone(feed) };
    },
    fetch: async (url) => {
      if (String(url).includes('/media-files/')) return new Response(new Uint8Array([1, 2, 3]), { headers: { 'content-type': 'image/jpeg' } });
      throw new Error(`unexpected fetch ${url}`);
    },
    optimize: async (b) => b,
    buildSite: fakeBuild,
    checkSite: async () => {},
    eventPaths: (s) => s.events.flatMap((e) => [`/event/${e.slug}/`, `/en/event/${e.slug}/`, `/he/event/${e.slug}/`]),
    releaseName: () => `r${builds}`,
    ...extra,
  });
}

beforeEach(() => {
  root = mkdtempSync(join(tmpdir(), 'vc-builder-'));
  clock = new Date('2026-11-06T12:00:00Z');
  feed = [ev('a', 'premera'), ev('b', 'kviz')];
  builds = 0;
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('builder', () => {
  it('publishes a complete build, switches current and records the three readings', async () => {
    const b = make();
    await b.poll();
    await b.building;
    const cur = currentRelease(join(root, 'site'));
    expect(cur).toMatch(/r1$/);
    const html = readFileSync(join(cur, 'event', 'premera', 'index.html'), 'utf8');
    expect(html).toContain('/_site/media/m-a.jpg');
    expect(html).not.toContain('sig=');
    expect(existsSync(join(cur, '_site', 'media', 'm-a.jpg'))).toBe(true);
    const h = b.health();
    expect(h.ok).toBe(true);
    expect(h.last_successful_poll_at).toBe(clock.toISOString());
    expect(h.last_publish_at).toBe(clock.toISOString());
    expect(h.oldest_unprocessed_change_at).toBeNull();
    expect(h.published_events).toBe(2);
  });

  it('does not rebuild when only the media signatures changed', async () => {
    const b = make();
    await b.poll();
    await b.building;
    const r = await b.poll(); // fresh signatures, same content
    expect(r.changed).toBe(false);
    expect(b.building).toBeNull();
    expect(builds).toBe(1);
  });

  it('rebuilds once when the running image differs from the one that made the release', async () => {
    const old = make({ buildId: 'img-1' });
    await old.poll();
    await old.building;
    expect(builds).toBe(1);
    expect(old.state.published_build_id).toBe('img-1');
    const same = make({ buildId: 'img-1' });
    expect((await same.poll()).changed).toBe(false);
    expect(same.building).toBeNull();
    expect(builds).toBe(1);
    const next = make({ buildId: 'img-2' });
    expect((await next.poll()).changed).toBe(false); // feed content is the same
    await next.building;
    expect(builds).toBe(2);
    expect(next.state.published_build_id).toBe('img-2');
    await next.poll();
    expect(next.building).toBeNull();
    expect(builds).toBe(2);
  });

  it('needsImageBuild never asks without a build id', () => {
    expect(needsImageBuild({ published_build_id: null }, '')).toBe(false);
    expect(needsImageBuild({ published_build_id: null }, 'x')).toBe(true);
    expect(needsImageBuild({ published_build_id: 'x' }, 'x')).toBe(false);
  });

  it('rebuilds on a price change and keeps a missing poster out instead of a signed link', async () => {
    const b = make();
    await b.poll();
    await b.building;
    feed[0] = ev('a', 'premera', 31000);
    feed[0].poster_media_id = 'm-new';
    feed[0].poster_url = 'https://api.arenasoldout.com/v1/media-files/m-new?expires=1&sig=x';
    const b2 = make({
      fetch: async () => new Response('nope', { status: 500 }),
    });
    await b2.poll();
    await b2.building;
    const cur = currentRelease(join(root, 'site'));
    expect(cur).toMatch(/r2$/);
    const html = readFileSync(join(cur, 'event', 'premera', 'index.html'), 'utf8');
    expect(html).toContain('31000');
    expect(html).toContain('src="null"');
    expect(html).not.toContain('sig=');
  });

  it('refuses a pass with fewer events, keeps the last good release and retries 1, 2, 5 minutes later', async () => {
    const b = make();
    await b.poll();
    await b.building;
    feed = [ev('a', 'premera')];
    clock = new Date('2026-11-06T12:10:00Z');
    await b.poll();
    await b.building;
    expect(currentRelease(join(root, 'site'))).toMatch(/r1$/);
    expect(b.state.consecutive_failures).toBe(1);
    expect(b.state.last_error).toMatch(/no explicit take-down/);
    expect(b.state.next_retry_at).toBe('2026-11-06T12:11:00.000Z');
    expect(b.state.oldest_unprocessed_change_at).toBe('2026-11-06T12:10:00.000Z');

    // a tick before the pause does nothing; after it, the retry fails again with a longer pause
    clock = new Date('2026-11-06T12:10:30Z');
    await b.tick();
    expect(b.state.consecutive_failures).toBe(1);
    clock = new Date('2026-11-06T12:11:00Z');
    await b.tick();
    expect(b.state.consecutive_failures).toBe(2);
    expect(b.state.next_retry_at).toBe('2026-11-06T12:13:00.000Z');
    // the change waits more than 15 minutes: alert
    clock = new Date('2026-11-06T12:26:00Z');
    expect(b.health().alerts).toContain('change_unpublished');

    // the operator confirms the take-down: the next retry publishes
    writeFileSync(join(root, 'data', 'allow-shrink'), '');
    await b.tick();
    expect(b.state.consecutive_failures).toBe(0);
    expect(currentRelease(join(root, 'site'))).not.toMatch(/r1$/);
    expect(existsSync(join(root, 'data', 'allow-shrink'))).toBe(false);
    expect(b.health().alerts).toEqual([]);
  });

  it('keeps the last good release when the build or its check fails', async () => {
    const b = make();
    await b.poll();
    await b.building;
    feed[0] = ev('a', 'premera', 1);
    const bad = make({ checkSite: async () => { throw new Error('check-dist: missing /en/'); } });
    await bad.poll();
    await bad.building;
    expect(currentRelease(join(root, 'site'))).toMatch(/r1$/);
    expect(bad.state.last_error).toMatch(/missing \/en\//);
    // the failed release folder is removed
    expect(readdirSync(join(root, 'site', 'releases'))).toEqual(['r1']);
  });

  it('builds on schedule after a session ends even when the feed did not change', async () => {
    feed = [ev('a', 'premera')];
    feed[0].sessions[0].start_at = '2026-11-06T18:00:00Z';
    feed[0].sessions[0].end_at = '2026-11-06T21:00:00Z';
    const b = make();
    await b.poll();
    await b.building;
    clock = new Date('2026-11-06T12:30:00Z');
    await b.tick(); // poll (no change), not due yet
    expect(builds).toBe(1);
    clock = new Date('2026-11-06T13:00:00Z');
    await b.tick(); // hourly
    expect(builds).toBe(2);
    clock = new Date('2026-11-06T13:59:00Z');
    await b.tick();
    expect(builds).toBe(2);
    clock = new Date('2026-11-06T21:05:00Z');
    await b.tick(); // session end + 5 min
    expect(builds).toBe(3);
  });

  it('merges build requests made during a build into one next build', async () => {
    let release;
    const gate = new Promise((r) => (release = r));
    const b = make({ buildSite: async (p) => { await gate; return fakeBuild(p); } });
    await b.poll();
    b.requestBuild('x');
    b.requestBuild('y');
    b.requestBuild('z');
    release();
    await b.building;
    expect(builds).toBe(2);
  });

  it('purges the changed pages in Cloudflare when a token and zone are set', async () => {
    const calls = [];
    const b = make({
      cfToken: 'tok',
      cfZoneId: 'zone',
      fetch: async (url, init) => {
        if (String(url).includes('cloudflare')) {
          calls.push(JSON.parse(init.body));
          return new Response(JSON.stringify({ success: true }), { headers: { 'content-type': 'application/json' } });
        }
        return new Response(new Uint8Array([1]), { headers: { 'content-type': 'image/png' } });
      },
    });
    await b.poll();
    await b.building;
    expect(calls.length).toBeGreaterThan(0);
    const files = calls.flatMap((c) => c.files);
    expect(files).toContain('https://vinoandco.events/event/premera/');
    expect(b.state.last_purge.skipped).toBe(false);
  });

  it('records a failed poll without touching the published site', async () => {
    const b = make();
    feed = new Error('HTTP 503');
    const r = await b.poll();
    expect(r.error).toBeTruthy();
    expect(b.state.last_successful_poll_at).toBeNull();
    expect(b.health().alerts).toContain('poll_stale');
    vi.useRealTimers();
  });
});
