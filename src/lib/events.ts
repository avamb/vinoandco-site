/**
 * Events for the build: read the snapshot (written by the builder, or the
 * sample snapshot when there is none), apply the lifecycle rules from
 * src/arena and shape what the pages need. Runs at build time only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sample from '../data/events.sample.json';
import knownSlugs from '../data/event-slugs.json';
import {
  eventSalesState,
  eventSlug,
  isListed,
  isPast,
  priceFrom,
  upcomingSessions,
  type EventsSnapshot,
  type FeedEventDetail,
  type FeedSession,
  type SalesState,
} from '../arena/index.ts';
import { arena, brand, type LanguageCode } from '../../site.config.ts';
import { language } from './i18n.ts';
import { sanitizeHtml } from './sanitize.ts';

let cached: EventsSnapshot | null = null;

export function loadSnapshot(): EventsSnapshot {
  if (cached) return cached;
  if (arena.snapshotPath) {
    cached = JSON.parse(readFileSync(resolve(arena.snapshotPath), 'utf-8')) as EventsSnapshot;
  } else {
    cached = sample as unknown as EventsSnapshot;
  }
  return cached;
}

/** Build time: lists and "past" are decided once per build (spec 62 §6.1, §9). */
export const buildNow = new Date();

export interface SiteEvent {
  raw: FeedEventDetail;
  slug: string;
  name: string;
  past: boolean;
  listed: boolean;
  /** Staging test-channel event: noindex, in no list and no sitemap. */
  test: boolean;
  /** Feed token for this event's browser calls (checkout, funnel): the test channel's for a test event. */
  feedToken: string;
  state: SalesState;
  poster: string | null;
  descriptionHtml: string;
  descriptionText: string;
  /** Next session (or the last one for a past event). */
  primary: FeedSession | null;
  sessions: FeedSession[];
  venueName: string;
  venueCity: string;
  venueAddress: string;
  timezone: string;
  priceFrom: { amount: number; currency: string } | null;
  ageRating: string | null;
}

export interface ShapeOptions {
  now?: Date;
  /** slug table of known events (display number -> slug) */
  known?: Record<string, string>;
  /** Feed token of the main channel. */
  mainToken?: string;
  /** Feed token of the staging test channel; empty = test events are not built at all. */
  testToken?: string;
}

function shape(e: FeedEventDetail, o: Required<ShapeOptions>, test: boolean): SiteEvent {
  const past = isPast(e, o.now);
  const next = upcomingSessions(e, o.now);
  const sorted = [...e.sessions].sort((a, b) => a.start_at.localeCompare(b.start_at));
  const primary = past ? sorted[sorted.length - 1] ?? null : next[0] ?? sorted[0] ?? null;
  const venue = e.venues.find((v) => primary && v.session_starts.includes(primary.start_at)) ?? e.venues[0];
  return {
    raw: e,
    // TODO(П-5): the platform slug; until the feed has it, the known-slug table or e<display_number>.
    slug: eventSlug(e, o.known),
    name: e.name,
    past,
    // A test event is never listed: not on home / upcoming / past / carousel, not in the sitemap.
    listed: test ? false : isListed(e),
    test,
    feedToken: test ? o.testToken : o.mainToken,
    state: past ? 'ended' : eventSalesState(e, o.now),
    poster: primary?.poster_url ?? e.poster_url ?? e.image_url,
    descriptionHtml: sanitizeHtml(e.description_html ?? ''),
    descriptionText: e.description_text ?? '',
    primary,
    sessions: sorted,
    venueName: venue?.name ?? e.venue_names[0] ?? '',
    venueCity: venue?.city ?? '',
    venueAddress: venue?.address ?? '',
    timezone: primary?.timezone || venue?.timezone || brand.defaultTimezone,
    priceFrom: priceFrom(past ? [] : next),
    ageRating: e.age_rating ?? null,
  };
}

/**
 * Pure: the events a snapshot yields. `events` are the public ones (lists, sitemap);
 * `testEvents` get a page only (see `routeEvents`). Test events are dropped without a
 * test token, and one whose slug a public event already uses (the public one wins).
 */
export function buildSiteEvents(snapshot: EventsSnapshot, opts: ShapeOptions = {}): { events: SiteEvent[]; testEvents: SiteEvent[] } {
  const o: Required<ShapeOptions> = { now: opts.now ?? buildNow, known: opts.known ?? {}, mainToken: opts.mainToken ?? '', testToken: opts.testToken ?? '' };
  const events = snapshot.events.map((e) => shape(e, o, false));
  const taken = new Set(events.map((e) => e.slug));
  const testEvents: SiteEvent[] = [];
  if (o.testToken) {
    for (const e of snapshot.test_events ?? []) {
      const t = shape(e, o, true);
      if (taken.has(t.slug)) continue;
      taken.add(t.slug);
      testEvents.push(t);
    }
  }
  return { events, testEvents };
}

function shaped() {
  return buildSiteEvents(loadSnapshot(), { known: knownSlugs as Record<string, string>, mainToken: arena.feedToken, testToken: arena.testFeedToken });
}

/** Public events: every list, the carousel and the sitemap read these (never test events). */
export function siteEvents(): SiteEvent[] {
  return shaped().events;
}

/** Every event that gets a page: public and test. Only the router uses this. */
export function routeEvents(): SiteEvent[] {
  const s = shaped();
  return [...s.events, ...s.testEvents];
}

export function upcomingEvents(): SiteEvent[] {
  return siteEvents()
    .filter((e) => !e.past && e.listed)
    .sort((a, b) => (a.primary?.start_at ?? '').localeCompare(b.primary?.start_at ?? ''));
}

export function pastEvents(): SiteEvent[] {
  return siteEvents()
    .filter((e) => e.past && e.listed)
    .sort((a, b) => (b.primary?.start_at ?? '').localeCompare(a.primary?.start_at ?? ''));
}

/**
 * Photos shown under "Photo report" on a finished event: the report photos,
 * then the gallery, each media once. A photo whose file could not be
 * downloaded by the builder (url null) is dropped, never shown broken.
 */
export function reportPhotos(e: SiteEvent): { url: string; caption: string; width: number | null; height: number | null }[] {
  if (!e.past) return [];
  const seen = new Set<string>();
  const out: { url: string; caption: string; width: number | null; height: number | null }[] = [];
  for (const p of [...(e.raw.materials?.report_photos ?? []), ...(e.raw.materials?.gallery ?? [])]) {
    if (!p?.url || seen.has(p.media_id || p.url)) continue;
    seen.add(p.media_id || p.url);
    out.push({ url: p.url, caption: p.caption ?? '', width: p.width ?? null, height: p.height ?? null });
  }
  return out;
}

/** Date as on WordPress cards: 2026-11-21, in the venue's zone. */
export function formatDate(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-CA', { timeZone: tz, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(iso));
}

/** Time as on WordPress cards: 20:30, in the venue's zone. */
export function formatTime(iso: string, tz: string): string {
  return new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(iso));
}

/** Session chip label: "21.11 · сб · 20:30". */
export function formatSessionChip(iso: string, tz: string, lang: LanguageCode): string {
  const intl = language(lang).intl;
  const d = new Date(iso);
  const date = new Intl.DateTimeFormat(intl, { timeZone: tz, day: 'numeric', month: 'long', weekday: 'short' }).format(d);
  return `${date} · ${formatTime(iso, tz)}`;
}

/** Whole days from the build to the start (the WordPress "До начала: N дней"). */
export function daysUntil(iso: string): number {
  return Math.max(0, Math.ceil((new Date(iso).getTime() - buildNow.getTime()) / 86_400_000));
}

export function formatMoney(minor: number, currency: string, lang: LanguageCode): string {
  return new Intl.NumberFormat(language(lang).intl, { style: 'currency', currency, maximumFractionDigits: minor % 100 ? 2 : 0 }).format(minor / 100);
}
