/**
 * Client for the Arena platform's public API: the channel feed (builder, at
 * build time, and the purchase island in the browser) and the public checkout
 * routes (purchase island, order status page). No markup, no site specifics.
 *
 * Written so Node can run it with type stripping only (the builder imports it
 * without a bundler): no enums, no parameter properties, no namespaces.
 */
import { selectTestEvents } from './test-channel.ts';
import type {
  EventsSnapshot,
  FeedEvent,
  FeedEventDetail,
  FeedEventList,
  CheckoutStartRequest,
  CheckoutStartResponse,
  CheckoutQuoteRequest,
  CheckoutQuoteResponse,
  CheckoutStatus,
  CheckoutRecoverResponse,
  ReferralOffer,
  FunnelBeacon,
  FeedRemovedEvent,
  MyTicketsSession,
  MyTicketsOrdersPage,
  OrganizerContactRequest,
  MarketingSubscriptionRequest,
} from './types.ts';

export interface ArenaClientOptions {
  /** API origin, e.g. https://api.arenasoldout.com */
  apiBase: string;
  /** Public feed token of the sales channel. */
  feedToken: string;
  fetch?: typeof fetch;
  /** Request timeout, ms. */
  timeoutMs?: number;
}

/** A platform error answer: HTTP status plus the envelope's stable code. */
export class ArenaApiError extends Error {
  status: number;
  code: string;
  details: Record<string, unknown> | null;
  constructor(status: number, code: string, message: string, details: Record<string, unknown> | null = null) {
    super(message);
    this.name = 'ArenaApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

/** Network failure or timeout: the request may or may not have reached the platform. */
export class ArenaNetworkError extends Error {
  timeout: boolean;
  constructor(message: string, timeout: boolean) {
    super(message);
    this.name = 'ArenaNetworkError';
    this.timeout = timeout;
  }
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  body?: unknown;
  headers?: Record<string, string>;
  /** Keep the request alive while the page unloads (funnel beacon). */
  keepalive?: boolean;
  /** `blob`: return the body as a Blob (ticket PDF). */
  as?: 'json' | 'blob';
}

export function createArenaClient(opts: ArenaClientOptions) {
  const base = opts.apiBase.replace(/\/+$/, '');
  const token = encodeURIComponent(opts.feedToken);
  const doFetch = opts.fetch ?? ((input: RequestInfo | URL, init?: RequestInit) => fetch(input, init));
  const timeoutMs = opts.timeoutMs ?? 20_000;

  async function request<T>(path: string, ro: RequestOptions = {}): Promise<{ status: number; body: T | null }> {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    const headers: Record<string, string> = { Accept: 'application/json', ...(ro.headers ?? {}) };
    if (ro.body !== undefined) headers['Content-Type'] = 'application/json';
    let res: Response;
    try {
      res = await doFetch(`${base}${path}`, {
        method: ro.method ?? 'GET',
        headers,
        body: ro.body === undefined ? undefined : JSON.stringify(ro.body),
        signal: ctrl.signal,
        keepalive: ro.keepalive,
        // Tokens travel in the path; never send a referrer or cookies along.
        credentials: 'omit',
        referrerPolicy: 'no-referrer',
      });
    } catch (e) {
      const aborted = (e as { name?: string })?.name === 'AbortError';
      throw new ArenaNetworkError(aborted ? 'request timed out' : String((e as Error)?.message ?? e), aborted);
    } finally {
      clearTimeout(timer);
    }
    if (!res.ok) {
      let code = `http_${res.status}`;
      let message = res.statusText;
      let details: Record<string, unknown> | null = null;
      try {
        const body = (await res.json()) as { error?: { code?: string; message?: string; details?: Record<string, unknown> }; details?: Record<string, unknown> };
        code = body.error?.code ?? code;
        message = body.error?.message ?? message;
        details = body.error?.details ?? body.details ?? null;
      } catch {
        /* not JSON */
      }
      throw new ArenaApiError(res.status, code, message, details);
    }
    if (res.status === 204) return { status: 204, body: null };
    if (ro.as === 'blob') return { status: res.status, body: (await res.blob()) as unknown as T };
    return { status: res.status, body: (await res.json()) as T };
  }

  async function get<T>(path: string): Promise<T> {
    return (await request<T>(path)).body as T;
  }

  // ── Feed ────────────────────────────────────────────────────────────────

  async function listEvents(page = 1, perPage = 100, includeRemoved = false): Promise<FeedEventList> {
    return get<FeedEventList>(`/v1/public/feeds/${token}/events?page=${page}&per_page=${perPage}${includeRemoved ? '&include_removed=true' : ''}`);
  }

  /** Event detail. The platform wraps it as {"event": {...}}; older answers were bare. */
  async function getEvent(eventId: string): Promise<FeedEventDetail> {
    const body = await get<{ event?: FeedEventDetail } & Partial<FeedEventDetail>>(
      `/v1/public/feeds/${token}/events/${encodeURIComponent(eventId)}`,
    );
    return (body.event ?? body) as FeedEventDetail;
  }

  /**
   * Complete pass over the feed: every page, then the detail of every event.
   * Throws if the pass is incomplete, so a partial snapshot is never published
   * (spec 62 §9 "Полнота").
   */
  async function fetchSnapshot(perPage = 100): Promise<EventsSnapshot> {
    // `include_removed` adds the events that left the feed in the last 30 days
    // (their pages are taken down and answer 410). A platform that does not know
    // the parameter simply omits the list.
    const first = await listEvents(1, perPage, true);
    const list: FeedEvent[] = [...first.events];
    const removed = new Map<string, FeedRemovedEvent>();
    const takeRemoved = (page: FeedEventList) => {
      for (const r of page.removed_events ?? []) if (r?.id && !removed.has(r.id)) removed.set(r.id, r);
    };
    takeRemoved(first);
    for (let p = 2; p <= first.pagination.total_pages; p++) {
      const page = await listEvents(p, perPage, true);
      list.push(...page.events);
      takeRemoved(page);
    }
    if (list.length !== first.pagination.total) {
      throw new Error(`feed pass incomplete: ${list.length} of ${first.pagination.total}`);
    }
    const seen = new Set<string>();
    const events: FeedEventDetail[] = [];
    for (const e of list) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      events.push(await getEvent(e.id));
    }
    // An event that is both listed and "removed" (republished) is listed.
    const removedEvents = [...removed.values()].filter((r) => !seen.has(r.id));
    return { fetched_at: new Date().toISOString(), source: 'feed', events, removed_events: removedEvents };
  }

  /**
   * Staging test channel: the detail of the listed events named in `ids` (UUID or
   * display number). Ids the feed does not list are returned in `missing`.
   */
  async function fetchEventsByIds(ids: string[], perPage = 100): Promise<{ events: FeedEventDetail[]; missing: string[] }> {
    const first = await listEvents(1, perPage);
    const list: FeedEvent[] = [...first.events];
    for (let p = 2; p <= first.pagination.total_pages; p++) list.push(...(await listEvents(p, perPage)).events);
    const picked = selectTestEvents(list, ids);
    const events: FeedEventDetail[] = [];
    for (const e of picked) events.push(await getEvent(e.id));
    const found = new Set(picked.flatMap((e) => [String(e.id).toLowerCase(), String(e.display_number)]));
    return { events, missing: ids.filter((i) => !found.has(i.toLowerCase())) };
  }

  // ── Checkout (browser) ──────────────────────────────────────────────────

  /** Read-only price quote of a cart (no hold, no order). */
  async function quote(body: CheckoutQuoteRequest): Promise<CheckoutQuoteResponse> {
    return (await request<CheckoutQuoteResponse>(`/v1/public/feeds/${token}/checkout/quote`, { method: 'POST', body })).body!;
  }

  /**
   * Holds the places, creates the order and the payment page in one call.
   * `idempotencyKey`: one per payment attempt (spec 62 §5.4); a repeat with
   * the same key and body returns the same checkout, another body is 409.
   */
  async function startCheckout(body: CheckoutStartRequest, idempotencyKey: string): Promise<CheckoutStartResponse> {
    return (
      await request<CheckoutStartResponse>(`/v1/public/feeds/${token}/checkout/start`, {
        method: 'POST',
        body,
        headers: { 'Idempotency-Key': idempotencyKey },
      })
    ).body!;
  }

  async function checkoutStatus(checkoutToken: string): Promise<CheckoutStatus> {
    return get<CheckoutStatus>(`/v1/public/checkout/${encodeURIComponent(checkoutToken)}`);
  }

  /** Re-captures the same cart after the hold expired (409 when the places are gone). */
  async function recoverCheckout(checkoutToken: string): Promise<CheckoutRecoverResponse> {
    return (await request<CheckoutRecoverResponse>(`/v1/public/checkout/${encodeURIComponent(checkoutToken)}/recover`, { method: 'POST', body: {} })).body!;
  }

  /** "Refer a friend" offer of a paid order; null when there is none (404 referral.not_available). */
  async function referral(checkoutToken: string): Promise<ReferralOffer | null> {
    try {
      return await get<ReferralOffer>(`/v1/public/checkout/${encodeURIComponent(checkoutToken)}/referral`);
    } catch (e) {
      if (e instanceof ArenaApiError && e.status === 404) return null;
      throw e;
    }
  }

  // ── My tickets by link (spec 62 §7) ─────────────────────────────────────

  /** E-mails a one-time link. The platform answers 202 whether or not the address has orders. */
  async function requestMyTicketsLink(body: { email: string; locale: string; page_url: string }): Promise<void> {
    await request<unknown>(`/v1/public/feeds/${token}/my-tickets/link`, { method: 'POST', body });
  }

  /** Spends the e-mailed token (once) for a 4-hour session; 410 my_tickets.link_invalid when used, expired or unknown. */
  async function exchangeMyTicketsToken(linkToken: string): Promise<MyTicketsSession> {
    return (await request<MyTicketsSession>('/v1/public/my-tickets/session', { method: 'POST', body: { token: linkToken } })).body!;
  }

  async function myTicketsOrders(sessionToken: string, page = 1): Promise<MyTicketsOrdersPage> {
    return (await request<MyTicketsOrdersPage>(`/v1/public/my-tickets/orders?page=${page}`, { headers: bearer(sessionToken) })).body!;
  }

  /** The ticket PDF as a Blob: a plain link cannot carry the bearer header. */
  async function myTicketsPdf(sessionToken: string, orderId: string, ticketId: string): Promise<Blob> {
    const path = `/v1/public/my-tickets/orders/${encodeURIComponent(orderId)}/tickets/${encodeURIComponent(ticketId)}/pdf`;
    return (await request<Blob>(path, { headers: { ...bearer(sessionToken), Accept: 'application/pdf' }, as: 'blob' })).body!;
  }

  async function revokeMyTicketsSession(sessionToken: string): Promise<void> {
    await request<null>('/v1/public/my-tickets/session', { method: 'DELETE', headers: bearer(sessionToken) });
  }

  function bearer(sessionToken: string): Record<string, string> {
    return { Authorization: `Bearer ${sessionToken}` };
  }

  // ── Site forms (spec 62 §10.2) ──────────────────────────────────────────

  /** Contact and private-event forms. One Idempotency-Key per submission; 202 {status: queued}. */
  async function sendOrganizerContact(body: OrganizerContactRequest, idempotencyKey: string): Promise<void> {
    await request<unknown>(`/v1/public/feeds/${token}/organizer-contact`, { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } });
  }

  /** Club sign-up (double opt-in); 202 {status: check_email}. */
  async function subscribeMarketing(body: MarketingSubscriptionRequest, idempotencyKey: string): Promise<void> {
    await request<unknown>(`/v1/public/feeds/${token}/marketing-subscriptions`, { method: 'POST', body, headers: { 'Idempotency-Key': idempotencyKey } });
  }

  /** Absolute address of a platform-relative path (ticket PDF links). */
  function absolute(path: string): string {
    return /^https?:\/\//i.test(path) ? path : `${base}${path.startsWith('/') ? '' : '/'}${path}`;
  }

  /** Funnel beacon (spec 50): no visitor data, no cookie; never throws. */
  async function funnel(beacon: Omit<FunnelBeacon, 'feed_token'>): Promise<void> {
    try {
      await request<null>('/v1/public/funnel', { method: 'POST', body: { ...beacon, feed_token: opts.feedToken }, keepalive: true });
    } catch {
      /* a lost beacon is not an error for the visitor */
    }
  }

  return { listEvents, getEvent, fetchSnapshot, fetchEventsByIds, quote, startCheckout, checkoutStatus, recoverCheckout, referral, funnel, absolute, requestMyTicketsLink, exchangeMyTicketsToken, myTicketsOrders, myTicketsPdf, revokeMyTicketsSession, sendOrganizerContact, subscribeMarketing };
}

export type ArenaClient = ReturnType<typeof createArenaClient>;
