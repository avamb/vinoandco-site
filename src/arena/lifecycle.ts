/**
 * Event lifecycle rules shared by every site (spec 62 §6.1). Pure functions.
 */
import type { FeedEvent, FeedEventDetail, FeedSession, SalesState } from './types.ts';

/** A session is over at its end, or 6 h after start when the end is missing. */
export function sessionEndsAt(s: Pick<FeedSession, 'start_at' | 'end_at'>): Date {
  if (s.end_at) return new Date(s.end_at);
  return new Date(new Date(s.start_at).getTime() + 6 * 3600_000);
}

/** An event is upcoming until its last non-cancelled session has ended. */
export function isPast(e: FeedEventDetail, now: Date = new Date()): boolean {
  const live = e.sessions.filter((s) => s.status !== 'cancelled');
  const all = live.length ? live : e.sessions;
  if (!all.length) {
    return e.last_session_at ? new Date(e.last_session_at) < now : false;
  }
  return all.every((s) => sessionEndsAt(s) < now);
}

/** Sessions still to come, sorted by start. */
export function upcomingSessions(e: FeedEventDetail, now: Date = new Date()): FeedSession[] {
  return e.sessions
    .filter((s) => sessionEndsAt(s) >= now)
    .sort((a, b) => a.start_at.localeCompare(b.start_at));
}

/** `unlisted` events get a page with noindex but never appear in lists (§6.3). */
export function isListed(e: FeedEvent): boolean {
  return e.visibility !== 'unlisted';
}

/**
 * The card / button state of an event: the best state among its sessions still
 * to come (open beats soon beats sold_out).
 */
export function eventSalesState(e: FeedEventDetail, now: Date = new Date()): SalesState {
  const next = upcomingSessions(e, now);
  if (!next.length) {
    const allCancelled = e.sessions.length > 0 && e.sessions.every((s) => s.status === 'cancelled');
    return allCancelled ? 'cancelled' : 'ended';
  }
  const states = next.map((s) => s.sales_state || 'open');
  for (const st of ['open', 'soon', 'sold_out', 'cancelled', 'ended'] as const) {
    if (states.includes(st)) return st;
  }
  return 'open';
}

/** Lowest current price among open, non-add-on tiers (minor units). */
export function priceFrom(sessions: FeedSession[]): { amount: number; currency: string } | null {
  let best: { amount: number; currency: string } | null = null;
  for (const s of sessions) {
    for (const t of s.tiers) {
      if (t.is_addon || !t.is_open) continue;
      if (!best || t.current_price < best.amount) best = { amount: t.current_price, currency: t.currency };
    }
  }
  return best;
}

/**
 * The slug the event's page lives at: the platform slug (П-5); else a slug the
 * site already knows for this event (`known`, keyed by display number); else
 * a stable fallback `e<display_number>`.
 *
 * TODO(П-5): once the feed carries `slug` for every event, drop `known` and
 * the `e<n>` fallback; a page then moves only through the platform's slug
 * history (301 from the old slug).
 */
export function eventSlug(e: FeedEvent, known: Record<string, string> = {}): string {
  if (e.slug && e.slug.trim()) return e.slug.trim();
  const k = known[String(e.display_number)];
  return k && k.trim() ? k.trim() : `e${e.display_number}`;
}
