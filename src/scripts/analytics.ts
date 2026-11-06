/**
 * Browser events of the purchase path (spec 62 §8.2). Meta and GA4 calls go
 * out only when their scripts exist, and tracking.ts loads them only after the
 * visitor accepted cookies — so without consent these are no-ops. Purchase is
 * never sent from the browser: the platform sends it from the server (§8.3).
 */
import { readConsent } from './consent.ts';

export interface AnalyticsItem {
  id: string;
  name: string;
  price: number;
  quantity: number;
}

function consented(): boolean {
  try {
    return readConsent()?.granted === true;
  } catch {
    return false;
  }
}

function meta(event: string, params: Record<string, unknown>) {
  if (consented() && typeof window.fbq === 'function') window.fbq('track', event, params);
}

function ga(event: string, params: Record<string, unknown>) {
  if (consented() && typeof window.gtag === 'function') window.gtag('event', event, params);
}

/** Amounts arrive in minor units; Meta and GA4 want major units. */
const major = (minor: number) => Math.round(minor) / 100;

export function trackViewContent(item: AnalyticsItem, currency: string) {
  meta('ViewContent', { content_ids: [item.id], content_name: item.name, content_type: 'product', value: major(item.price), currency });
  ga('view_item', { currency, value: major(item.price), items: [{ item_id: item.id, item_name: item.name, price: major(item.price) }] });
}

export function trackAddToCart(item: AnalyticsItem, totalMinor: number, currency: string) {
  meta('AddToCart', { content_ids: [item.id], content_name: item.name, content_type: 'product', value: major(totalMinor), currency, num_items: item.quantity });
  ga('add_to_cart', { currency, value: major(totalMinor), items: [{ item_id: item.id, item_name: item.name, price: major(item.price), quantity: item.quantity }] });
}

export function trackBeginCheckout(item: AnalyticsItem, totalMinor: number, currency: string) {
  meta('InitiateCheckout', { content_ids: [item.id], value: major(totalMinor), currency, num_items: item.quantity });
  ga('begin_checkout', { currency, value: major(totalMinor), items: [{ item_id: item.id, item_name: item.name, price: major(item.price), quantity: item.quantity }] });
}
