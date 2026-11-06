/**
 * Meta Pixel and GA4, loaded ONLY after the visitor accepts cookies (Р-10,
 * spec 62 §8.1). Never included on personal pages (order status, my tickets).
 * Ids come from the build environment via data attributes on <body>.
 * Google Consent Mode starts as `denied` and is updated to `granted` on consent.
 */
import { readConsent, CONSENT_EVENT } from './consent.ts';

type Gtag = (...args: unknown[]) => void;
type Fbq = ((...args: unknown[]) => void) & { queue?: unknown[]; loaded?: boolean; version?: string; push?: unknown };

declare global {
  interface Window {
    dataLayer?: unknown[];
    gtag?: Gtag;
    fbq?: Fbq;
    _fbq?: Fbq;
  }
}

let loaded = false;

function loadScript(src: string) {
  const s = document.createElement('script');
  s.async = true;
  s.src = src;
  document.head.appendChild(s);
}

function loadGa4(id: string) {
  window.dataLayer = window.dataLayer || [];
  const gtag: Gtag = function () {
    // gtag expects the arguments object itself
    // eslint-disable-next-line prefer-rest-params
    window.dataLayer!.push(arguments);
  };
  window.gtag = gtag;
  gtag('consent', 'default', { ad_storage: 'denied', analytics_storage: 'denied', ad_user_data: 'denied', ad_personalization: 'denied' });
  gtag('consent', 'update', { ad_storage: 'granted', analytics_storage: 'granted', ad_user_data: 'granted', ad_personalization: 'granted' });
  gtag('js', new Date());
  gtag('config', id);
  loadScript(`https://www.googletagmanager.com/gtag/js?id=${encodeURIComponent(id)}`);
}

function loadPixel(id: string) {
  if (window.fbq) return;
  const fbq: Fbq = function (...args: unknown[]) {
    fbq.queue!.push(args);
  } as Fbq;
  fbq.queue = [];
  fbq.loaded = true;
  fbq.version = '2.0';
  window.fbq = fbq;
  window._fbq = fbq;
  loadScript('https://connect.facebook.net/en_US/fbevents.js');
  fbq('init', id);
  fbq('track', 'PageView');
}

function start() {
  if (loaded) return;
  const { ga4Id, metaPixelId } = document.body.dataset;
  loaded = true;
  if (ga4Id) loadGa4(ga4Id);
  if (metaPixelId) loadPixel(metaPixelId);
}

if (readConsent()?.granted) start();
window.addEventListener(CONSENT_EVENT, (e) => {
  if ((e as CustomEvent<{ granted: boolean }>).detail.granted) start();
});
