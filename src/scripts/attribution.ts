/**
 * Keeps the landing page's sales-link ref (?sl= / ?ref=), utm labels and click ids (fbclid, gclid) in the
 * tab's sessionStorage until checkout/start (spec 62 §8.3). Runs on every
 * public page; personal pages do not load it.
 */
import { captureAttribution } from '../arena/attribution.ts';
import { captureClickIds } from '../arena/buyer-context.ts';

try {
  captureAttribution(new URL(location.href), sessionStorage);
  captureClickIds(new URL(location.href), sessionStorage);
} catch {
  /* storage blocked: the purchase simply carries no attribution */
}
