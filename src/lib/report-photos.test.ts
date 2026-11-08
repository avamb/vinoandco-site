import { describe, expect, it } from 'vitest';
import sample from '../data/events.sample.json';
import type { EventsSnapshot, FeedEventDetail } from '../arena/index.ts';
import { buildSiteEvents, reportPhotos } from './events.ts';

const base = sample as unknown as EventsSnapshot;
const photo = (id: string, url: string | null) => ({ media_id: id, url, caption: null, width: 1200, height: 800 });

function withPhotos(): EventsSnapshot {
  const e = structuredClone(base.events[0]!) as FeedEventDetail;
  e.materials.report_photos = [photo('r-1', '/_site/media/r-1.jpg'), photo('r-2', '/_site/media/r-2.jpg'), photo('r-3', null)] as never;
  e.materials.gallery = [photo('r-2', '/_site/media/r-2.jpg'), photo('g-1', '/_site/media/g-1.jpg')] as never;
  return { ...base, events: [e] };
}

describe('reportPhotos', () => {
  it('lists report photos then gallery, each media once, without failed downloads', () => {
    const { events } = buildSiteEvents(withPhotos(), { now: new Date('2099-01-01T00:00:00Z') });
    expect(events[0]!.past).toBe(true);
    expect(reportPhotos(events[0]!).map((p) => p.url)).toEqual(['/_site/media/r-1.jpg', '/_site/media/r-2.jpg', '/_site/media/g-1.jpg']);
  });
  it('shows nothing for an event that has not happened yet', () => {
    const { events } = buildSiteEvents(withPhotos(), { now: new Date('2000-01-01T00:00:00Z') });
    expect(events[0]!.past).toBe(false);
    expect(reportPhotos(events[0]!)).toEqual([]);
  });
});
