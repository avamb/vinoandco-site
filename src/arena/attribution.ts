/**
 * Purchase attribution (spec 43 §4.4, spec 62 §8.3): the sales-link ref
 * (`?sl=` or `?ref=`) and utm labels of the landing page, carried in the tab's
 * sessionStorage until `checkout/start`. The platform cleans the object and
 * ties the ref to the organization's sales link; the site only carries it.
 *
 * Pure functions over a URL and a Storage-like object, so they run in tests.
 */
import type { Attribution } from './types.ts';

export const ATTRIBUTION_KEY = 'arena_attribution';

const UTM = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term'] as const;
const MAX = 200;

export const ATTRIBUTION_TTL_DAYS = 30;
const TTL_MS = ATTRIBUTION_TTL_DAYS * 24 * 60 * 60 * 1000;

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem?(key: string): void;
}

/** Long-lived copy (localStorage); `allowed` is false after an explicit cookie decline. */
export interface LongStore {
  store: KeyValueStore;
  allowed: boolean;
}

function clean(v: string | null): string | undefined {
  const s = (v ?? '').trim();
  return s ? s.slice(0, MAX) : undefined;
}

/** The labels a URL carries, or null when it carries none. */
export function attributionFromUrl(url: URL, now: Date = new Date()): Attribution | null {
  const q = url.searchParams;
  const a: Attribution = {};
  const ref = clean(q.get('sl')) ?? clean(q.get('ref'));
  if (ref) a.ref = ref;
  for (const k of UTM) {
    const v = clean(q.get(k));
    if (v) a[k] = v;
  }
  if (!Object.keys(a).length && q.get('fbclid')?.trim()) {
    a.utm_source = 'facebook';
    a.utm_medium = 'fbclid';
  }
  if (!Object.keys(a).length) return null;
  a.landed_at = now.toISOString();
  return a;
}

function parse(raw: string | null): (Attribution & { expires_at?: string }) | null {
  try {
    if (!raw) return null;
    const a = JSON.parse(raw);
    return a && typeof a === 'object' ? a : null;
  } catch {
    return null;
  }
}

/** The stored object without internal fields (`expires_at` never goes to the API). */
function strip(a: Attribution & { expires_at?: string }): Attribution {
  const { expires_at: _e, ...rest } = a;
  return rest;
}

/** Long-lived record if present and not expired; an expired one is removed. */
function readLong(store: KeyValueStore, key: string, now: Date): Attribution | null {
  const a = parse(store.getItem(key));
  if (!a) return null;
  const exp = a.expires_at ? Date.parse(a.expires_at) : NaN;
  if (!(exp > now.getTime())) {
    try {
      store.removeItem?.(key);
    } catch {
      /* ignore */
    }
    return null;
  }
  return strip(a);
}

/** Tab storage first, else the 30-day long-lived copy (a new tab after an ad click). */
export function readAttribution(store: KeyValueStore, long?: KeyValueStore | null, now: Date = new Date(), key = ATTRIBUTION_KEY): Attribution | null {
  try {
    const a = parse(store.getItem(key));
    if (a) return strip(a);
  } catch {
    /* fall through to the long-lived copy */
  }
  try {
    return long ? readLong(long, key, now) : null;
  } catch {
    return null;
  }
}

/** On a decline: forget the long-lived copy. */
export function clearLongAttribution(long: KeyValueStore, key = ATTRIBUTION_KEY): void {
  try {
    long.removeItem?.(key);
  } catch {
    /* ignore */
  }
}

/**
 * Records the landing labels: the latest touch wins, the first touch of the
 * tab is kept in `first`. A page without labels changes nothing (an internal
 * click must not erase where the visitor came from).
 */
export function captureAttribution(url: URL, store: KeyValueStore, now: Date = new Date(), key = ATTRIBUTION_KEY, long?: LongStore): Attribution | null {
  const next = attributionFromUrl(url, now);
  const prev = readAttribution(store, long?.allowed ? long.store : null, now, key);
  if (!next) return prev;
  const firstSource = prev?.first ?? prev ?? next;
  const first = {
    ...(firstSource.ref ? { ref: firstSource.ref } : {}),
    ...(firstSource.utm_source ? { utm_source: firstSource.utm_source } : {}),
    ...(firstSource.utm_campaign ? { utm_campaign: firstSource.utm_campaign } : {}),
    ...(firstSource.landed_at ? { landed_at: firstSource.landed_at } : {}),
  };
  const merged: Attribution = { ...next, first };
  try {
    store.setItem(key, JSON.stringify(merged));
  } catch {
    /* storage full or blocked: attribution is best effort */
  }
  if (long?.allowed) {
    try {
      long.store.setItem(key, JSON.stringify({ ...merged, expires_at: new Date(now.getTime() + TTL_MS).toISOString() }));
    } catch {
      /* best effort */
    }
  }
  return merged;
}
