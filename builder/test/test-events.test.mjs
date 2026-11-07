import { describe, expect, it } from 'vitest';
import { testEventPaths } from '../lib/test-events.mjs';

const slugOf = (e) => e.slug;

describe('testEventPaths', () => {
  it('lists the three addresses of every test event and skips a public slug', () => {
    const snap = { events: [{ slug: 'wine' }], test_events: [{ slug: 'trial' }, { slug: 'wine' }] };
    expect(testEventPaths(snap, {}, slugOf)).toEqual(['/event/trial/', '/en/event/trial/', '/he/event/trial/']);
  });
  it('is empty without test events', () => {
    expect(testEventPaths({ events: [] }, {}, slugOf)).toEqual([]);
  });
});
