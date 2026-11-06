import { describe, expect, it } from 'vitest';
import { createAttemptKeys, gaItems, localTotal, maxQuantity, offeredTiers, splitQuantity, stepHint } from './cart.ts';
import { attributionFromUrl, captureAttribution } from './attribution.ts';
import type { CheckoutStartRequest, FeedTier } from './types.ts';

function tier(p: Partial<FeedTier> = {}): FeedTier {
  return {
    id: 't1',
    name: 'Входной билет',
    pricing_mode: 'fixed',
    price_amount: 29000,
    currency: 'ILS',
    pwyw_min: null,
    pwyw_max: null,
    capacity: 100,
    sale_window_start: null,
    sale_window_end: null,
    sort_order: 0,
    current_price: 29000,
    next_price_change_at: null,
    is_open: true,
    available: 50,
    is_addon: false,
    ...p,
  };
}

describe('offeredTiers', () => {
  it('hides add-ons and, while one category sells, the closed and sold-out ones', () => {
    const s = { tiers: [tier({ id: 'a', available: 0 }), tier({ id: 'b' }), tier({ id: 'c', is_open: false }), tier({ id: 'd', is_addon: true })] };
    expect(offeredTiers(s).map((t) => t.id)).toEqual(['b']);
  });
  it('keeps the whole list when nothing sells (it reads "sold out")', () => {
    const s = { tiers: [tier({ id: 'a', available: 0 }), tier({ id: 'b', available: 0, sort_order: -1 })] };
    expect(offeredTiers(s).map((t) => t.id)).toEqual(['b', 'a']);
  });
});

describe('quantity and price steps', () => {
  it('caps at 10 and at the free places', () => {
    expect(maxQuantity(tier({ available: 50 }))).toBe(10);
    expect(maxQuantity(tier({ available: 3 }))).toBe(3);
    expect(maxQuantity(tier({ available: null, capacity: 4 }))).toBe(4);
  });
  it('without the next step id an order cannot cross the step', () => {
    const t = tier({ available: 2, price_step: { remaining_at_price: 2, next_price: 32000 } });
    expect(maxQuantity(t)).toBe(2);
    expect(gaItems(t, 2)).toEqual([{ tier_id: 't1', quantity: 2 }]);
    expect(stepHint(t)).toEqual({ left: 2, nextPrice: 32000 });
  });
  it('with the next step id (П-4) the rest goes to the next category at its price', () => {
    const t = tier({ available: 2, price_step: { remaining_at_price: 2, next_price: 32000, next_tier_id: 't2' } });
    expect(maxQuantity(t)).toBe(10);
    expect(splitQuantity(t, 5)).toEqual({ own: 2, next: 3 });
    expect(gaItems(t, 5)).toEqual([{ tier_id: 't1', quantity: 2 }, { tier_id: 't2', quantity: 3 }]);
    expect(localTotal(t, 5).total).toBe(2 * 29000 + 3 * 32000);
  });
  it('adds the channel service fee with the platform floor', () => {
    expect(localTotal(tier({ current_price: 1890 }), 1, '5')).toEqual({ subtotal: 1890, fee: 94, total: 1984 });
    expect(localTotal(tier(), 2, '0').total).toBe(58000);
  });
  it('hints only real steps with few places left', () => {
    expect(stepHint(tier({ price_step: { remaining_at_price: 25, next_price: 1 } }))).toBeNull();
    expect(stepHint(tier())).toBeNull();
  });
});

describe('idempotency keys', () => {
  const body = (qty: number): CheckoutStartRequest => ({ session_id: 's', ga_items: [{ tier_id: 't', quantity: qty }], buyer: { email: 'a@b.c' }, return_url: 'r', locale: 'ru' });
  it('keeps the key for the same request and changes it for another one', () => {
    let n = 0;
    const keys = createAttemptKeys(() => `k${++n}`);
    expect(keys.keyFor(body(1))).toBe('k1');
    expect(keys.keyFor(body(1))).toBe('k1'); // double click / lost answer
    expect(keys.keyFor(body(2))).toBe('k2'); // other quantity
    expect(keys.keyFor({ ...body(2), expected_total: 1 })).toBe('k3'); // confirmed new price
    keys.reset();
    expect(keys.keyFor({ ...body(2), expected_total: 1 })).toBe('k4');
  });
});

describe('attribution', () => {
  const store = () => {
    const m = new Map<string, string>();
    return { getItem: (k: string) => m.get(k) ?? null, setItem: (k: string, v: string) => void m.set(k, v) };
  };
  it('reads ?sl= (or ?ref=) and utm labels', () => {
    const now = new Date('2026-11-06T10:00:00Z');
    expect(attributionFromUrl(new URL('https://x/?sl=QR7&utm_source=ig&utm_campaign=nov'), now)).toEqual({ ref: 'QR7', utm_source: 'ig', utm_campaign: 'nov', landed_at: '2026-11-06T10:00:00.000Z' });
    expect(attributionFromUrl(new URL('https://x/?ref=abc'), now)?.ref).toBe('abc');
    expect(attributionFromUrl(new URL('https://x/event/a/'), now)).toBeNull();
  });
  it('keeps the first touch, updates the last and survives pages without labels', () => {
    const s = store();
    captureAttribution(new URL('https://x/?sl=first&utm_source=fb'), s, new Date('2026-11-06T10:00:00Z'));
    captureAttribution(new URL('https://x/event/a/'), s);
    const a = captureAttribution(new URL('https://x/?utm_source=ig'), s, new Date('2026-11-06T11:00:00Z'))!;
    expect(a.utm_source).toBe('ig');
    expect(a.ref).toBeUndefined();
    expect(a.first).toEqual({ ref: 'first', utm_source: 'fb', landed_at: '2026-11-06T10:00:00.000Z' });
  });
});
