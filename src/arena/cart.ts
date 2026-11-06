/**
 * General-admission cart rules shared by every site's purchase modal (spec 62
 * §5.1, §5.4). Pure functions; the modal only renders what they return.
 */
import type { FeedSession, FeedTier, GaItem } from './types.ts';

/** The modal never sells more than this many tickets in one order (WP: max 10). */
export const MAX_TICKETS = 10;

export function isSoldOut(t: FeedTier): boolean {
  return t.available !== null && t.available !== undefined && t.available <= 0;
}

/**
 * The categories the buyer can choose: main (not add-on) categories, open and
 * with places. A closed or sold-out one is not offered while another still
 * sells; when none sells, the list stays as it is and reads "sold out".
 */
export function offeredTiers(session: Pick<FeedSession, 'tiers'>): FeedTier[] {
  const main = [...session.tiers].filter((t) => !t.is_addon).sort((a, b) => a.sort_order - b.sort_order);
  const selling = main.filter((t) => t.is_open && !isSoldOut(t));
  return selling.length ? selling : main;
}

export function isSellable(t: FeedTier): boolean {
  return t.is_open && !isSoldOut(t) && (t.pricing_mode === 'fixed' || t.pricing_mode === 'free');
}

/** The id of the category the price step continues in (П-4), or null. */
export function nextStepTierId(t: FeedTier): string | null {
  return t.price_step?.next_tier_id ?? null;
}

/**
 * Most tickets the buyer may pick: 10, the category's free places, plus the
 * next price step when the platform names it (П-4). Without the next step's
 * id an order cannot spill over, so it stops at the places of this step.
 */
export function maxQuantity(t: FeedTier, max = MAX_TICKETS): number {
  const own = t.available ?? t.capacity ?? max;
  if (nextStepTierId(t) && t.price_step?.remaining_at_price !== null && t.price_step?.remaining_at_price !== undefined) {
    // The next step's own free places are not in the feed; the platform refuses an over-order with 409.
    return Math.max(1, max);
  }
  return Math.max(1, Math.min(max, own));
}

/** How a quantity splits between this price step and the next one. */
export function splitQuantity(t: FeedTier, qty: number): { own: number; next: number } {
  const remaining = t.price_step?.remaining_at_price;
  if (!nextStepTierId(t) || remaining === null || remaining === undefined || qty <= remaining) return { own: qty, next: 0 };
  return { own: Math.max(0, remaining), next: qty - Math.max(0, remaining) };
}

/** The ga_items of one category line (two lines when the order crosses a price step). */
export function gaItems(t: FeedTier, qty: number): GaItem[] {
  const s = splitQuantity(t, qty);
  const items: GaItem[] = [];
  if (s.own > 0) items.push({ tier_id: t.id, quantity: s.own });
  const next = nextStepTierId(t);
  if (s.next > 0 && next) items.push({ tier_id: next, quantity: s.next });
  return items;
}

/**
 * Price the buyer sees before a quote (minor units): price steps, then the
 * channel's service fee with the platform's basis-point floor
 * (hcheckout.ComputePricingLines). The platform re-prices on start; a promo
 * total always comes from `checkout/quote`.
 */
export function localTotal(t: FeedTier, qty: number, serviceFeePercent = '0'): { subtotal: number; fee: number; total: number } {
  const s = splitQuantity(t, qty);
  const nextPrice = t.price_step?.next_price ?? t.current_price;
  const subtotal = t.current_price * s.own + nextPrice * s.next;
  const bp = Math.round((parseFloat(serviceFeePercent) || 0) * 100);
  const fee = Math.floor((subtotal * bp) / 10_000);
  return { subtotal, fee, total: subtotal + fee };
}

/** "N left at this price, then X": only for a real step with few places left (WP chainLeft = 10). */
export function stepHint(t: FeedTier, threshold = 10): { left: number; nextPrice: number } | null {
  const ps = t.price_step;
  if (!ps || ps.remaining_at_price === null || ps.remaining_at_price === undefined) return null;
  if (ps.remaining_at_price <= 0 || ps.remaining_at_price > threshold) return null;
  return { left: ps.remaining_at_price, nextPrice: ps.next_price };
}

export const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

/**
 * One Idempotency-Key per payment attempt (§5.4): the same request sent again
 * (double click, lost answer) keeps its key and gets the same checkout back;
 * a changed request (other quantity, a confirmed new price, another promo)
 * gets a new key, because the platform answers a reused key with another body
 * with 409 idempotency.body_mismatch.
 */
export function createAttemptKeys(newKey: () => string = defaultKey) {
  let current: { key: string; fingerprint: string } | null = null;
  return {
    keyFor(body: unknown): string {
      const fingerprint = JSON.stringify(body);
      if (!current || current.fingerprint !== fingerprint) current = { key: newKey(), fingerprint };
      return current.key;
    },
    /** Forget the key: the next attempt is a new one even with the same body. */
    reset() {
      current = null;
    },
  };
}

function defaultKey(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (c?.randomUUID) return c.randomUUID();
  return `k-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 12)}`;
}
