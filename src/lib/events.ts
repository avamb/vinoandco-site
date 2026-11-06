/**
 * Events for the build: read the snapshot (written by the builder, or the
 * sample snapshot when there is none), apply the lifecycle rules from
 * src/arena and shape what the pages need. Runs at build time only.
 */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import sample from '../data/events.sample.json';
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

export function siteEvents(): SiteEvent[] {
  return loadSnapshot().events.map((e) => {
    const past = isPast(e, buildNow);
    const next = upcomingSessions(e, buildNow);
    const sorted = [...e.sessions].sort((a, b) => a.start_at.localeCompare(b.start_at));
    const primary = past ? sorted[sorted.length - 1] ?? null : next[0] ?? sorted[0] ?? null;
    const venue = e.venues.find((v) => primary && v.session_starts.includes(primary.start_at)) ?? e.venues[0];
    return {
      raw: e,
      slug: eventSlug(e),
      name: e.name,
      past,
      listed: isListed(e),
      state: past ? 'ended' : eventSalesState(e, buildNow),
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
  });
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
