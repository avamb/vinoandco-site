/**
 * Browser tracking context sent with checkout/start (spec 62 §8.1, §8.3): the
 * click ids of the landing URL, the Meta cookies, the GA4 client id and the
 * cookie banner's answer. The platform uses it for server-side Meta CAPI and
 * GA4 conversions and sends nothing without `tracking_consent: true`.
 *
 * Pure functions over a URL, a Storage-like object and a cookie string.
 */
import type { BuyerContext } from './types.ts';
import type { KeyValueStore } from './attribution.ts';

export const CLICK_IDS_KEY = 'arena_click_ids';

export interface ClickIds {
  fbclid?: string;
  gclid?: string;
}

const MAX = 256;

function clean(v: string | null | undefined, max = MAX): string | undefined {
  const s = (v ?? '').trim();
  // eslint-disable-next-line no-control-regex
  if (!s || s.length > max || /[\u0000-\u001f\u007f]/.test(s)) return undefined;
  return s;
}

/** Remembers fbclid / gclid of the landing URL for the tab; a page without them keeps what is stored. */
export function captureClickIds(url: URL, store: KeyValueStore, key = CLICK_IDS_KEY): ClickIds {
  const prev = readClickIds(store, key);
  const next: ClickIds = { ...prev };
  const fbclid = clean(url.searchParams.get('fbclid'));
  const gclid = clean(url.searchParams.get('gclid'));
  if (fbclid) next.fbclid = fbclid;
  if (gclid) next.gclid = gclid;
  if (next.fbclid !== prev.fbclid || next.gclid !== prev.gclid) {
    try {
      store.setItem(key, JSON.stringify(next));
    } catch {
      /* storage blocked: the purchase simply carries no click id */
    }
  }
  return next;
}

export function readClickIds(store: KeyValueStore, key = CLICK_IDS_KEY): ClickIds {
  try {
    const raw = store.getItem(key);
    if (!raw) return {};
    const o = JSON.parse(raw) as ClickIds;
    return { ...(clean(o.fbclid) ? { fbclid: clean(o.fbclid) } : {}), ...(clean(o.gclid) ? { gclid: clean(o.gclid) } : {}) };
  } catch {
    return {};
  }
}

/** Value of one cookie from a `document.cookie` string, or undefined. */
export function cookieValue(cookies: string, name: string): string | undefined {
  for (const part of cookies.split(';')) {
    const i = part.indexOf('=');
    if (i < 0) continue;
    if (part.slice(0, i).trim() !== name) continue;
    try {
      return decodeURIComponent(part.slice(i + 1).trim());
    } catch {
      return part.slice(i + 1).trim();
    }
  }
  return undefined;
}

/** GA4 client id from the `_ga` cookie: `GA1.1.123456789.1700000000` -> `123456789.1700000000`. */
export function gaClientId(cookies: string): string | undefined {
  const v = cookieValue(cookies, '_ga');
  const m = v ? /^GA\d+\.\d+\.(.+)$/.exec(v) : null;
  return clean(m?.[1]);
}

export interface BuyerContextInput {
  /** The page the checkout starts on. */
  pageUrl: string;
  store: KeyValueStore;
  /** `document.cookie`. */
  cookies: string;
  /** The cookie banner's choice; null = not asked yet (counts as not granted). */
  consent: { granted: boolean; version: string } | null;
}

/**
 * The `buyer_context` object. fbp / fbc / ga_client_id are cookies of the
 * marketing scripts that exist only after consent; they are included only when
 * present, and the GA4 id only when the buyer consented. The click ids of the
 * landing URL are an address, not a cookie: sent as they are, the platform
 * ignores them without `tracking_consent`.
 */
export function buildBuyerContext(i: BuyerContextInput): BuyerContext {
  const granted = Boolean(i.consent?.granted);
  const ids = readClickIds(i.store);
  const ctx: BuyerContext = { tracking_consent: granted };
  if (ids.fbclid) ctx.fbclid = ids.fbclid;
  if (ids.gclid) ctx.gclid = ids.gclid;
  const fbp = clean(cookieValue(i.cookies, '_fbp'));
  const fbc = clean(cookieValue(i.cookies, '_fbc'));
  if (fbp) ctx.fbp = fbp;
  if (fbc) ctx.fbc = fbc;
  if (granted) {
    const ga = gaClientId(i.cookies);
    if (ga) ctx.ga_client_id = ga;
  }
  const page = clean(i.pageUrl, 2048);
  if (page) ctx.page_url = page;
  if (i.consent?.version) ctx.tracking_consent_text_version = clean(i.consent.version, 64);
  return ctx;
}
