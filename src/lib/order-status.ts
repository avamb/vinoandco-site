/**
 * Order status page rules (spec 62 §5.5, §5.6). Pure functions, so the page
 * island stays a renderer and the rules are tested on their own.
 */
import type { CheckoutPublicStatus } from '../arena/types.ts';
import { CHECKOUT_TOKEN_KEY } from './purchase.ts';

export interface KeyValueStore {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
}

/**
 * The checkout token: from the address (return from AllPay, link in the
 * reminder e-mail) or, after a reload, from the tab's sessionStorage. The
 * token never stays in the address: `cleanUrl` is the address without it.
 */
export function takeToken(href: string, store: KeyValueStore | null): { token: string | null; cleanUrl: string | null } {
  const url = new URL(href);
  const fromUrl = url.searchParams.get('checkout_token');
  if (fromUrl) {
    try {
      store?.setItem(CHECKOUT_TOKEN_KEY, fromUrl);
    } catch {
      /* storage blocked: this view still works */
    }
    url.searchParams.delete('checkout_token');
    return { token: fromUrl, cleanUrl: url.pathname + url.search + url.hash };
  }
  let stored: string | null = null;
  try {
    stored = store?.getItem(CHECKOUT_TOKEN_KEY) ?? null;
  } catch {
    stored = null;
  }
  return { token: stored, cleanUrl: null };
}

/** Polling: every 2 s for the first 20 s, then every 5 s up to 2 minutes, then stop (null). */
export function nextPollDelay(elapsedMs: number): number | null {
  if (elapsedMs < 20_000) return 2_000;
  if (elapsedMs < 120_000) return 5_000;
  return null;
}

export type StatusView = 'pending' | 'paid' | 'failed' | 'expired' | 'cancelled' | 'refunded' | 'review';

/** The screen for a platform status. Unknown values read as pending (keep checking). */
export function viewOf(status: CheckoutPublicStatus): StatusView {
  switch (status) {
    case 'paid':
    case 'completed':
      return 'paid';
    case 'failed':
    case 'abandoned':
      return 'failed';
    case 'expired':
      return 'expired';
    case 'cancelled':
      return 'cancelled';
    case 'refunded':
    case 'partially_refunded':
      return 'refunded';
    case 'needs_help':
    case 'manual_review':
      return 'review';
    default:
      return 'pending';
  }
}

/** Final screens: polling stops. */
export function isFinal(v: StatusView): boolean {
  return v !== 'pending';
}

/** Share buttons of the WordPress thank-you page (Elementor share-buttons), as plain links. */
export function shareLinks(url: string, text: string): { name: string; href: string }[] {
  const u = encodeURIComponent(url);
  const t = encodeURIComponent(text);
  return [
    { name: 'Facebook', href: `https://www.facebook.com/sharer/sharer.php?u=${u}` },
    { name: 'LinkedIn', href: `https://www.linkedin.com/sharing/share-offsite/?url=${u}` },
    { name: 'Reddit', href: `https://www.reddit.com/submit?url=${u}&title=${t}` },
    { name: 'Telegram', href: `https://t.me/share/url?url=${u}&text=${t}` },
    { name: 'WhatsApp', href: `https://wa.me/?text=${t}%20${u}` },
    { name: 'Email', href: `mailto:?subject=${t}&body=${u}` },
    { name: 'Threads', href: `https://www.threads.net/intent/post?text=${t}%20${u}` },
  ];
}
