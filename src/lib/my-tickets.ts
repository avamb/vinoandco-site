/**
 * "My tickets by link" rules (spec 62 §7). The e-mailed link carries a
 * one-time token (`?t=`). Opening the page must NOT spend it (mail scanners
 * open links): the page keeps the token, takes it out of the address and
 * shows a button; only the button press exchanges it for a 4-hour session.
 * The session lives in the tab sessionStorage, never in a cookie.
 */
import { ArenaApiError, ArenaNetworkError, type ArenaClient } from '../arena/client.ts';
import type { MyTicketsSession } from '../arena/types.ts';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

export const LINK_TOKEN_KEY = 'vc_my_tickets_link';
export const SESSION_KEY = 'vc_my_tickets_session';

function safe<T>(fn: () => T, fallback: T): T {
  try {
    return fn();
  } catch {
    return fallback;
  }
}

/** Keeps the token of the address in the store and returns the address without it. */
export function takeLinkToken(href: string, store: KeyValueStore | null): { token: string | null; cleanUrl: string | null } {
  const url = new URL(href);
  const fromUrl = url.searchParams.get('t');
  if (fromUrl) {
    safe(() => store?.setItem(LINK_TOKEN_KEY, fromUrl), undefined);
    url.searchParams.delete('t');
    return { token: fromUrl, cleanUrl: url.pathname + url.search + url.hash };
  }
  return { token: safe(() => store?.getItem(LINK_TOKEN_KEY) ?? null, null), cleanUrl: null };
}

export function readSession(store: KeyValueStore | null, now: Date = new Date()): MyTicketsSession | null {
  const raw = safe(() => store?.getItem(SESSION_KEY) ?? null, null);
  if (!raw) return null;
  try {
    const s = JSON.parse(raw) as MyTicketsSession;
    if (!s.session_token || Date.parse(s.expires_at) <= now.getTime()) {
      clearSession(store);
      return null;
    }
    return s;
  } catch {
    return null;
  }
}

export function saveSession(store: KeyValueStore | null, s: MyTicketsSession): void {
  safe(() => store?.setItem(SESSION_KEY, JSON.stringify(s)), undefined);
}

export function clearSession(store: KeyValueStore | null): void {
  safe(() => store?.removeItem(SESSION_KEY), undefined);
}

export type ErrorKind = 'session' | 'rateLimited' | 'unavailable' | 'notReady' | 'generic';

export type ExchangeResult = { kind: 'ok'; session: MyTicketsSession } | { kind: 'expired' } | { kind: 'error'; reason: ErrorKind };

/** What the visitor is told for a failed call. */
export function errorKind(e: unknown): ErrorKind {
  if (e instanceof ArenaNetworkError) return 'unavailable';
  if (e instanceof ArenaApiError) {
    if (e.code === 'checkout.pdf_not_found') return 'notReady';
    if (e.status === 401) return 'session';
    if (e.status === 429) return 'rateLimited';
    if (e.status === 503 || e.status === 502) return 'unavailable';
  }
  return 'generic';
}

/**
 * The button press: spends the token. 410 means used, expired or unknown; the
 * token is dropped either way. A network error or 429 keeps it (the call may
 * not have reached the platform), so the visitor can press again.
 */
export async function exchangeLinkToken(client: Pick<ArenaClient, 'exchangeMyTicketsToken'>, store: KeyValueStore | null): Promise<ExchangeResult> {
  const token = safe(() => store?.getItem(LINK_TOKEN_KEY) ?? null, null);
  if (!token) return { kind: 'expired' };
  try {
    const session = await client.exchangeMyTicketsToken(token);
    safe(() => store?.removeItem(LINK_TOKEN_KEY), undefined);
    saveSession(store, session);
    return { kind: 'ok', session };
  } catch (e) {
    if (e instanceof ArenaApiError && e.status === 410) {
      safe(() => store?.removeItem(LINK_TOKEN_KEY), undefined);
      return { kind: 'expired' };
    }
    return { kind: 'error', reason: errorKind(e) };
  }
}

/** File name of a downloaded ticket. */
export function ticketFileName(orderNumber: number, humanCode?: string | null, index = 0): string {
  const part = (humanCode ?? '').replace(/[^A-Za-z0-9_-]/g, '') || String(index + 1);
  return `vinoandco-${orderNumber}-${part}.pdf`;
}
