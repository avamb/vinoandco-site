/**
 * Vino&Co side of the purchase modal: platform error codes -> the site's own
 * words (src/i18n/*.json `modal.errors`), and the bits of site state the
 * modal hands to the order status page. Platform rules live in src/arena/cart.ts.
 */
import { ArenaApiError, ArenaNetworkError } from '../arena/client.ts';

export type ErrorKey =
  | 'generic'
  | 'timeout'
  | 'unavailable'
  | 'openOrder'
  | 'createFailed'
  | 'bodyMismatch'
  | 'rateLimited'
  | 'consentRequired'
  | 'consentOutdated'
  | 'discountUsed'
  | 'discountUnavailable'
  | 'promoNotFound'
  | 'promoNotApplicable'
  | 'promoMinimum'
  | 'promoExhausted'
  | 'promoPerCustomer'
  | 'promoOwnReferral'
  | 'promoNotActive';

const BY_CODE: Record<string, ErrorKey> = {
  'reservation.over_capacity': 'unavailable',
  'reservation.seats_conflict': 'unavailable',
  'session.sold_out': 'unavailable',
  'session.cancelled': 'unavailable',
  'session.sales_not_started': 'unavailable',
  'tier.closed': 'unavailable',
  'tier.not_on_sale': 'unavailable',
  'tier.not_found': 'unavailable',
  'checkout.tier_not_found': 'unavailable',
  'feed.session_not_on_feed': 'unavailable',
  'reservation.tier_gate_failed': 'unavailable',
  'checkout.open_order_exists': 'openOrder',
  'idempotency.body_mismatch': 'bodyMismatch',
  'feed.rate_limited': 'rateLimited',
  'checkout.rate_limited': 'rateLimited',
  'promo.rate_limited': 'rateLimited',
  'checkout.consent_required': 'consentRequired',
  'marketing.consent_outdated': 'consentOutdated',
  'marketing.discount_used': 'discountUsed',
  'marketing.discount_unavailable': 'discountUnavailable',
  'promo.not_found': 'promoNotFound',
  'promo.not_applicable': 'promoNotApplicable',
  'promo.session_not_applicable': 'promoNotApplicable',
  'promo.expired': 'promoNotApplicable',
  'promo.not_yet_valid': 'promoNotApplicable',
  'promo.currency_mismatch': 'promoNotApplicable',
  'promo.minimum_not_reached': 'promoMinimum',
  'promo.exhausted': 'promoExhausted',
  'promo.per_customer_limit': 'promoPerCustomer',
  'promo.own_referral_code': 'promoOwnReferral',
  'promo.not_active': 'promoNotActive',
  'checkout.payment_not_configured': 'createFailed',
  'checkout.payment_provider_unsupported': 'createFailed',
  'checkout.payment_start_failed': 'createFailed',
  'checkout.start_failed': 'createFailed',
  'checkout.confirm_failed': 'createFailed',
};

/** The dictionary key for an error thrown by the platform client. */
export function errorKey(e: unknown): ErrorKey {
  if (e instanceof ArenaNetworkError) return e.timeout ? 'timeout' : 'generic';
  if (e instanceof ArenaApiError) {
    if (BY_CODE[e.code]) return BY_CODE[e.code];
    if (e.code.startsWith('promo.')) return 'promoNotApplicable';
    if (e.status === 429) return 'rateLimited';
  }
  return 'generic';
}

export function isPromoError(e: unknown): boolean {
  return e instanceof ArenaApiError && e.code.startsWith('promo.');
}

/** "%s" placeholders in order, as in the WordPress plugin strings. */
export function fmt(template: string, ...values: (string | number)[]): string {
  let i = 0;
  return template.replace(/%s/g, () => String(values[i++] ?? ''));
}

/** sessionStorage keys shared by the modal and the order status page (personal, per tab). */
export const CHECKOUT_TOKEN_KEY = 'vc_checkout_token';
export const LAST_EVENT_KEY = 'vc_last_event';

/** Leaving the site for the payment page (an object so tests can intercept it). */
export const nav = {
  go(url: string) {
    window.location.assign(url);
  },
};
