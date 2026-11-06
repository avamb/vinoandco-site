import { describe, expect, it } from 'vitest';
import { checkCompleteness, contentHash, mediaIdOf, mediaRefs, nextScheduledBuild, rewriteMedia } from '../lib/snapshot.mjs';
import { health, retryDelayMs } from '../lib/state.mjs';
import { purgeUrls } from '../lib/purge.mjs';
import { changedPaths } from '../lib/release.mjs';

const signed = (id, sig) => `https://api.arenasoldout.com/v1/media-files/${id}?expires=1794087067&sig=${sig}`;

function event(id, { price = 29000, poster = signed('m-1', 'aaa'), start = '2026-11-21T18:30:00Z', end = '2026-11-21T21:30:00Z', status = 'published' } = {}) {
  return {
    id,
    display_number: 33,
    name: 'Премьера',
    status,
    poster_media_id: 'm-1',
    poster_url: poster,
    sessions: [{ id: `${id}-s`, start_at: start, end_at: end, status: 'scheduled', tiers: [{ id: 't', current_price: price }], poster_url: poster }],
    materials: { gallery: [{ media_id: 'g-1', url: signed('g-1', 'bbb') }], videos: [], partner_links: [], map_point: null, report_photos: [] },
  };
}

describe('contentHash', () => {
  it('ignores the snapshot time and re-signed media links', () => {
    const a = { fetched_at: '2026-11-06T10:00:00Z', events: [event('e1')] };
    const b = { fetched_at: '2026-11-07T10:00:00Z', events: [event('e1', { poster: signed('m-1', 'zzz') })] };
    expect(contentHash(a)).toBe(contentHash(b));
  });
  it('changes with a price, a new poster or a new event', () => {
    const a = { events: [event('e1')] };
    expect(contentHash({ events: [event('e1', { price: 30000 })] })).not.toBe(contentHash(a));
    expect(contentHash({ events: [event('e1', { poster: signed('m-2', 'aaa') })] })).not.toBe(contentHash(a));
    expect(contentHash({ events: [event('e1'), event('e2')] })).not.toBe(contentHash(a));
  });
  it('does not depend on the order of events or keys', () => {
    const x = event('e1');
    const y = Object.fromEntries(Object.entries(event('e2')).reverse());
    expect(contentHash({ events: [x, y] })).toBe(contentHash({ events: [y, x] }));
  });
});

describe('media', () => {
  it('finds media ids in signed links only', () => {
    expect(mediaIdOf(signed('01a0-x', 's'))).toBe('01a0-x');
    expect(mediaIdOf('https://example.com/a.jpg')).toBeNull();
  });
  it('lists every media file once and rewrites links to site files', () => {
    const snap = { events: [event('e1')] };
    expect(mediaRefs(snap).map((r) => r.id).sort()).toEqual(['g-1', 'm-1']);
    const out = rewriteMedia(snap, { 'm-1': '/_site/media/m-1.jpg' });
    expect(out.events[0].poster_url).toBe('/_site/media/m-1.jpg');
    expect(out.events[0].sessions[0].poster_url).toBe('/_site/media/m-1.jpg');
    // not downloaded: no expiring link in the HTML
    expect(out.events[0].materials.gallery[0].url).toBeNull();
    expect(JSON.stringify(out)).not.toContain('sig=');
  });
});

describe('checkCompleteness', () => {
  const prev = { events: [event('e1'), event('e2'), event('e3')] };
  it('accepts the same or more events', () => {
    expect(checkCompleteness(prev, { events: [event('e1'), event('e2'), event('e3'), event('e4')] }).ok).toBe(true);
    expect(checkCompleteness(null, { events: [] }).ok).toBe(true);
  });
  it('refuses fewer events without an explicit take-down', () => {
    const r = checkCompleteness(prev, { events: [event('e1'), event('e2')] });
    expect(r.ok).toBe(false);
    expect(r.reason).toMatch(/no explicit take-down/);
  });
  it('accepts fewer events when taken down explicitly or allowed by the operator', () => {
    expect(checkCompleteness(prev, { events: [event('e1'), event('e2'), event('e3', { status: 'unpublished' })] }).ok).toBe(true);
    expect(checkCompleteness(prev, { events: [event('e1')] }, { allowShrink: true }).ok).toBe(true);
  });
});

describe('nextScheduledBuild', () => {
  const snap = { events: [event('e1', { start: '2026-11-21T18:30:00Z', end: '2026-11-21T21:30:00Z' })] };
  it('is the end of the nearest session plus 5 minutes when that comes before the hourly build', () => {
    expect(nextScheduledBuild(snap, '2026-11-21T21:00:00Z')).toBe('2026-11-21T21:35:00.000Z');
  });
  it('is hourly otherwise', () => {
    expect(nextScheduledBuild(snap, '2026-11-20T10:00:00Z')).toBe('2026-11-20T11:00:00.000Z');
    // the session end is already covered by the last build
    expect(nextScheduledBuild(snap, '2026-11-21T21:40:00Z')).toBe('2026-11-21T22:40:00.000Z');
  });
  it('uses start + 6 h when the end is missing and skips cancelled sessions', () => {
    const s = { events: [event('e1', { start: '2026-11-21T18:00:00Z', end: '' })] };
    expect(nextScheduledBuild(s, '2026-11-21T23:30:00Z')).toBe('2026-11-22T00:05:00.000Z');
    s.events[0].sessions[0].status = 'cancelled';
    expect(nextScheduledBuild(s, '2026-11-21T23:30:00Z')).toBe('2026-11-22T00:30:00.000Z');
  });
});

describe('health and retries', () => {
  const now = new Date('2026-11-06T12:00:00Z');
  it('alerts when the poll stopped or a change waits too long', () => {
    expect(health({ last_successful_poll_at: '2026-11-06T11:55:00Z', oldest_unprocessed_change_at: null }, now).ok).toBe(true);
    expect(health({ last_successful_poll_at: '2026-11-06T11:45:00Z' }, now).alerts).toEqual(['poll_stale']);
    expect(health({ last_successful_poll_at: '2026-11-06T11:59:00Z', oldest_unprocessed_change_at: '2026-11-06T11:40:00Z' }, now).alerts).toEqual(['change_unpublished']);
    // an old publish alone is not an alert
    expect(health({ last_successful_poll_at: '2026-11-06T11:59:00Z', last_publish_at: '2026-11-05T00:00:00Z' }, now).ok).toBe(true);
  });
  it('pauses 1, 2, 5, 10, 10 minutes', () => {
    expect([1, 2, 3, 4, 5].map((n) => retryDelayMs(n) / 60_000)).toEqual([1, 2, 5, 10, 10]);
  });
});

describe('purge', () => {
  it('purges changed and removed pages with and without the trailing slash', () => {
    const paths = changedPaths({ '/': 'a', '/event/x/': 'b', '/gone/': 'c' }, { '/': 'a', '/event/x/': 'B', '/sitemap.xml': 'n' });
    expect(paths).toEqual(['/event/x/', '/gone/', '/sitemap.xml']);
    expect(purgeUrls('https://vinoandco.events/', paths)).toEqual([
      'https://vinoandco.events/event/x/',
      'https://vinoandco.events/event/x',
      'https://vinoandco.events/gone/',
      'https://vinoandco.events/gone',
      'https://vinoandco.events/sitemap.xml',
    ]);
  });
});
