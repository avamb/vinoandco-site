import { describe, expect, it } from 'vitest';
import sample from '../data/events.sample.json';
import type { EventsSnapshot, FeedEventDetail } from '../arena/index.ts';
import { buildSiteEvents } from './events.ts';

const base = sample as unknown as EventsSnapshot;
const now = new Date('2026-01-01T00:00:00Z');

function snapshotWithTest(): EventsSnapshot {
  const src = base.events[0]!;
  const test = { ...structuredClone(src), id: 'test-event-1', display_number: 9001, slug: 'test-only-event', name: 'Test event' } as FeedEventDetail;
  return { ...base, test_events: [test] };
}

describe('test channel events', () => {
  it('builds a test event with the test token, never listed', () => {
    const { events, testEvents } = buildSiteEvents(snapshotWithTest(), { now, mainToken: 'main', testToken: 'test' });
    expect(testEvents).toHaveLength(1);
    expect(testEvents[0]).toMatchObject({ slug: 'test-only-event', test: true, listed: false, feedToken: 'test' });
    expect(events.every((e) => !e.test && e.feedToken === 'main')).toBe(true);
    expect(events.some((e) => e.slug === 'test-only-event')).toBe(false);
  });
  it('builds no test event without a test token (production)', () => {
    const { testEvents } = buildSiteEvents(snapshotWithTest(), { now, mainToken: 'main', testToken: '' });
    expect(testEvents).toEqual([]);
  });
  it('lets a public event keep its address when a test slug collides', () => {
    const snap = snapshotWithTest();
    snap.test_events![0]!.slug = base.events[0]!.slug ?? undefined;
    const { events, testEvents } = buildSiteEvents(snap, { now, testToken: 'test', known: Object.fromEntries(base.events.map((e) => [String(e.display_number), `e${e.display_number}`])) });
    const clash = events.find((e) => e.slug === (snap.test_events![0]!.slug || ''));
    if (clash) expect(testEvents).toEqual([]);
  });
});
