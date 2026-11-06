import { describe, expect, it } from 'vitest';
import { ArenaApiError, createArenaClient } from './client.ts';

type Handler = (url: string, init?: RequestInit) => Response | Promise<Response>;

function client(handler: Handler) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const c = createArenaClient({
    apiBase: 'https://api.test/',
    feedToken: 'tok',
    fetch: (async (input: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(input), init });
      return handler(String(input), init);
    }) as typeof fetch,
  });
  return { c, calls };
}

const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

describe('feed', () => {
  it('walks every page and unwraps the {"event": …} detail', async () => {
    const { c, calls } = client((url) => {
      if (url.includes('/events?page=1')) return json({ events: [{ id: 'a' }, { id: 'b' }], pagination: { page: 1, per_page: 2, total: 3, total_pages: 2 } });
      if (url.includes('/events?page=2')) return json({ events: [{ id: 'c' }], pagination: { page: 2, per_page: 2, total: 3, total_pages: 2 } });
      const id = url.split('/events/')[1];
      return id === 'b' ? json({ id, sessions: [] }) : json({ event: { id, sessions: [] } });
    });
    const snap = await c.fetchSnapshot(2);
    expect(snap.events.map((e) => e.id)).toEqual(['a', 'b', 'c']);
    expect(calls[0].url).toBe('https://api.test/v1/public/feeds/tok/events?page=1&per_page=2&include_removed=true');
  });

  it('refuses an incomplete pass', async () => {
    const { c } = client(() => json({ events: [{ id: 'a' }], pagination: { page: 1, per_page: 100, total: 2, total_pages: 1 } }));
    await expect(c.fetchSnapshot()).rejects.toThrow(/incomplete: 1 of 2/);
  });

  it('turns an error envelope into ArenaApiError with its code', async () => {
    const { c } = client(() => json({ error: { code: 'feed.not_found', message: 'no' } }, 404));
    const err = await c.listEvents().catch((e) => e);
    expect(err).toBeInstanceOf(ArenaApiError);
    expect(err.code).toBe('feed.not_found');
    expect(err.status).toBe(404);
  });
});

describe('checkout routes', () => {
  it('sends the Idempotency-Key on checkout/start and no cookies or referrer', async () => {
    const { c, calls } = client(() => json({ checkout_token: 't', redirect_url: 'https://pay', expires_at: 'x', pricing: {} }, 201));
    await c.startCheckout({ session_id: 's', buyer: { email: 'a@b.c' }, return_url: 'https://site/order-status/', locale: 'ru' }, 'key-1');
    const init = calls[0].init!;
    expect(calls[0].url).toBe('https://api.test/v1/public/feeds/tok/checkout/start');
    expect((init.headers as Record<string, string>)['Idempotency-Key']).toBe('key-1');
    expect(init.credentials).toBe('omit');
    expect(init.referrerPolicy).toBe('no-referrer');
    expect(JSON.parse(String(init.body)).buyer.email).toBe('a@b.c');
  });

  it('answers null for a missing referral programme and absolutizes PDF paths', async () => {
    const { c } = client(() => json({ error: { code: 'referral.not_available', message: '' } }, 404));
    expect(await c.referral('t')).toBeNull();
    expect(c.absolute('/v1/public/checkout/t/tickets/x/pdf')).toBe('https://api.test/v1/public/checkout/t/tickets/x/pdf');
  });

  it('never throws from the funnel beacon', async () => {
    const { c, calls } = client(() => {
      throw new Error('offline');
    });
    await expect(c.funnel({ event_id: 'e', step: 'view', surface: 'external_site' })).resolves.toBeUndefined();
    expect(JSON.parse(String(calls[0].init!.body)).feed_token).toBe('tok');
  });
});
