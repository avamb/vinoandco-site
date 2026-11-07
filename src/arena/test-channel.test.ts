import { describe, expect, it } from 'vitest';
import { parseTestEventIds, selectTestEvents, testChannelConfig } from './test-channel.ts';

describe('parseTestEventIds', () => {
  it('splits on commas, semicolons and spaces, trims, lower-cases and deduplicates', () => {
    expect(parseTestEventIds(' 12, ABCD-1 ;12\n 7 ,, ')).toEqual(['12', 'abcd-1', '7']);
  });
  it('is empty for nothing', () => {
    expect(parseTestEventIds('')).toEqual([]);
    expect(parseTestEventIds(undefined)).toEqual([]);
  });
});

describe('testChannelConfig', () => {
  it('needs both a token and an id', () => {
    expect(testChannelConfig({}).enabled).toBe(false);
    expect(testChannelConfig({ PUBLIC_TEST_FEED_TOKEN: 'tok' }).enabled).toBe(false);
    expect(testChannelConfig({ TEST_EVENT_IDS: '5' }).enabled).toBe(false);
    const c = testChannelConfig({ PUBLIC_TEST_FEED_TOKEN: ' tok ', TEST_EVENT_IDS: '5, 6' });
    expect(c).toEqual({ token: 'tok', ids: ['5', '6'], enabled: true });
  });
});

describe('selectTestEvents', () => {
  const list = [
    { id: 'AAAA-1111', display_number: 41 },
    { id: 'bbbb-2222', display_number: 42 },
    { id: 'cccc-3333', display_number: 43 },
  ];
  it('matches a UUID (any case) or a display number', () => {
    expect(selectTestEvents(list, ['aaaa-1111', '43']).map((e) => e.display_number)).toEqual([41, 43]);
  });
  it('ignores ids the feed does not list', () => {
    expect(selectTestEvents(list, ['99'])).toEqual([]);
  });
});
