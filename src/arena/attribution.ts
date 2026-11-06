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

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
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
  if (!Object.keys(a).length) return null;
  a.landed_at = now.toISOString();
  return a;
}

export function readAttribution(store: KeyValueStore, key = ATTRIBUTION_KEY): Attribution | null {
  try {
    const raw = store.getItem(key);
    if (!raw) return null;
    const a = JSON.parse(raw) as Attribution;
    return a && typeof a === 'object' ? a : null;
  } catch {
    return null;
  }
}

/**
 * Records the landing labels: the latest touch wins, the first touch of the
 * tab is kept in `first`. A page without labels changes nothing (an internal
 * click must not erase where the visitor came from).
 */
export function captureAttribution(url: URL, store: KeyValueStore, now: Date = new Date(), key = ATTRIBUTION_KEY): Attribution | null {
  const next = attributionFromUrl(url, now);
  const prev = readAttribution(store, key);
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
  return merged;
}
