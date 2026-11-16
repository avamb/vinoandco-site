/**
 * Keeps the landing page's sales-link ref (?sl= / ?ref=), utm labels and click ids (fbclid, gclid) in the
 * tab's sessionStorage (and, for 30 days, localStorage unless declined) until checkout/start (spec 62 §8.3). Runs on every
 * public page; personal pages do not load it.
 */
import { captureAttribution, clearLongAttribution, ATTRIBUTION_KEY } from '../arena/attribution.ts';
import { captureClickIds } from '../arena/buyer-context.ts';
import { readConsent, CONSENT_EVENT } from './consent.ts';

try {
  let allowed = true;
  try {
    allowed = readConsent()?.granted !== false;
  } catch {
    /* no cookie access: treat as not declined */
  }
  captureAttribution(new URL(location.href), sessionStorage, new Date(), ATTRIBUTION_KEY, { store: localStorage, allowed });
  window.addEventListener(CONSENT_EVENT, (e) => {
    if ((e as CustomEvent<{ granted?: boolean }>).detail?.granted === false) {
      try {
        clearLongAttribution(localStorage);
      } catch {
        /* blocked */
      }
    }
  });
  captureClickIds(new URL(location.href), sessionStorage);
} catch {
  /* storage blocked: the purchase simply carries no attribution */
}
