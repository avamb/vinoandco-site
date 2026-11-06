import { describe, expect, it } from 'vitest';
import { buildBuyerContext, captureClickIds, cookieValue, gaClientId, readClickIds } from './buyer-context.ts';
import { ArenaApiError, createArenaClient } from './client.ts';

function store() {
  const m = new Map<string, string>();
  return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
}
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('buyer context', () => {
  it('keeps fbclid and gclid of the landing URL for the tab; a page without them changes nothing', () => {
    const s = store();
    expect(captureClickIds(new URL('https://x/?fbclid=FB1&utm_source=ig'), s)).toEqual({ fbclid: 'FB1' });
    expect(captureClickIds(new URL('https://x/other/'), s)).toEqual({ fbclid: 'FB1' });
    expect(captureClickIds(new URL('https://x/?gclid=G1'), s)).toEqual({ fbclid: 'FB1', gclid: 'G1' });
    expect(readClickIds(s)).toEqual({ fbclid: 'FB1', gclid: 'G1' });
  });

  it('reads cookies and the GA4 client id', () => {
    const c = '_ga=GA1.1.123456789.1700000000; other=1; _fbp=fb.1.1.2';
    expect(cookieValue(c, '_fbp')).toBe('fb.1.1.2');
    expect(cookieValue(c, 'missing')).toBeUndefined();
    expect(gaClientId(c)).toBe('123456789.1700000000');
    expect(gaClientId('x=1')).toBeUndefined();
  });

  it('with consent: click ids, cookies that exist, the GA id, page url and the text version', () => {
    const s = store();
    captureClickIds(new URL('https://x/?fbclid=FB1&gclid=G1'), s);
    const ctx = buildBuyerContext({ pageUrl: 'https://vinoandco.events/event/premera/', store: s, cookies: '_fbp=fb.1.1.2; _ga=GA1.1.5.6', consent: { granted: true, version: '2026-11-06' } });
    expect(ctx).toEqual({ tracking_consent: true, tracking_consent_text_version: '2026-11-06', fbclid: 'FB1', gclid: 'G1', fbp: 'fb.1.1.2', ga_client_id: '5.6', page_url: 'https://vinoandco.events/event/premera/' });
  });

  it('without consent: no GA id, tracking_consent false; absent cookies are left out', () => {
    const ctx = buildBuyerContext({ pageUrl: 'https://x/', store: store(), cookies: '_ga=GA1.1.5.6', consent: { granted: false, version: '2026-11-06' } });
    expect(ctx.tracking_consent).toBe(false);
    expect(ctx).not.toHaveProperty('ga_client_id');
    expect(ctx).not.toHaveProperty('fbp');
    expect(ctx).not.toHaveProperty('fbc');
    expect(buildBuyerContext({ pageUrl: 'https://x/', store: store(), cookies: '', consent: null })).toEqual({ tracking_consent: false, page_url: 'https://x/' });
  });

  it('drops values the platform would drop anyway', () => {
    const ctx = buildBuyerContext({ pageUrl: 'https://x/', store: store(), cookies: `_fbp=${'a'.repeat(300)}`, consent: null });
    expect(ctx).not.toHaveProperty('fbp');
  });
});

describe('client: removed events', () => {
  it('asks for include_removed on every page and collects removed_events without the republished ones', async () => {
    const urls: string[] = [];
    const c = createArenaClient({
      apiBase: 'https://api.test',
      feedToken: 'tok',
      fetch: (async (input: RequestInfo | URL) => {
        const url = String(input);
        urls.push(url);
        const removed = [
          { id: 'gone', display_number: 4, name: 'G', slug: 'g', status: 'cancelled', removed_at: '2026-11-01T00:00:00Z', last_session_at: null },
          { id: 'a', display_number: 1, name: 'A', slug: 'a', status: 'unpublished', removed_at: '2026-11-01T00:00:00Z', last_session_at: null },
        ];
        if (url.includes('/events?page=1')) return json({ events: [{ id: 'a' }], removed_events: removed, pagination: { page: 1, per_page: 1, total: 2, total_pages: 2 } });
        if (url.includes('/events?page=2')) return json({ events: [{ id: 'b' }], removed_events: removed, pagination: { page: 2, per_page: 1, total: 2, total_pages: 2 } });
        return json({ event: { id: url.split('/events/')[1], sessions: [] } });
      }) as typeof fetch,
    });
    const snap = await c.fetchSnapshot(1);
    expect(urls.filter((u) => u.includes('/events?')).every((u) => u.includes('include_removed=true'))).toBe(true);
    expect(snap.removed_events!.map((r) => r.id)).toEqual(['gone']);
  });

  it('an older platform without the list gives an empty one', async () => {
    const c = createArenaClient({
      apiBase: 'https://api.test',
      feedToken: 'tok',
      fetch: (async (input: RequestInfo | URL) =>
        String(input).includes('/events?') ? json({ events: [], pagination: { page: 1, per_page: 100, total: 0, total_pages: 1 } }) : json({})) as typeof fetch,
    });
    expect((await c.fetchSnapshot()).removed_events).toEqual([]);
  });
});

describe('client: my tickets and forms routes', () => {
  function client(handler: (url: string, init: RequestInit) => Response) {
    const calls: { url: string; init: RequestInit }[] = [];
    const c = createArenaClient({
      apiBase: 'https://api.test',
      feedToken: 'tok',
      fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
        calls.push({ url: String(input), init: init! });
        return handler(String(input), init!);
      }) as typeof fetch,
    });
    return { c, calls };
  }

  it('exchange carries the token in the body and a 410 is an ArenaApiError', async () => {
    const { c, calls } = client(() => json({ error: { code: 'my_tickets.link_invalid', message: '' } }, 410));
    const err = await c.exchangeMyTicketsToken('abc').catch((e) => e);
    expect(err).toBeInstanceOf(ArenaApiError);
    expect(err.status).toBe(410);
    expect(calls[0].url).toBe('https://api.test/v1/public/my-tickets/session');
    expect(JSON.parse(String(calls[0].init.body))).toEqual({ token: 'abc' });
  });

  it('orders and pdf send the bearer; the pdf comes back as a blob', async () => {
    const { c, calls } = client((url) => (url.endsWith('/pdf') ? new Response(new Blob(['%PDF'], { type: 'application/pdf' })) : json({ orders: [], pagination: { page: 2, per_page: 20, total: 0, total_pages: 2 } })));
    await c.myTicketsOrders('S', 2);
    const blob = await c.myTicketsPdf('S', 'o 1', 't1');
    expect(blob.size).toBe(4);
    expect(calls[0].url).toBe('https://api.test/v1/public/my-tickets/orders?page=2');
    expect((calls[0].init.headers as Record<string, string>).Authorization).toBe('Bearer S');
    expect(calls[1].url).toBe('https://api.test/v1/public/my-tickets/orders/o%201/tickets/t1/pdf');
    expect((calls[1].init.headers as Record<string, string>).Authorization).toBe('Bearer S');
  });

  it('form routes carry the Idempotency-Key', async () => {
    const { c, calls } = client(() => json({ status: 'queued' }, 202));
    await c.sendOrganizerContact({ topic: 'contact', name: 'A', email: 'a@b.co', consent: true, locale: 'ru', turnstile_token: 't' }, 'key-1');
    await c.subscribeMarketing({ email: 'a@b.co', locale: 'ru', consent: true, text_version: 'club-2026-11', turnstile_token: 't' }, 'key-2');
    expect(calls.map((x) => x.url)).toEqual(['https://api.test/v1/public/feeds/tok/organizer-contact', 'https://api.test/v1/public/feeds/tok/marketing-subscriptions']);
    expect(calls.map((x) => (x.init.headers as Record<string, string>)['Idempotency-Key'])).toEqual(['key-1', 'key-2']);
  });
});
