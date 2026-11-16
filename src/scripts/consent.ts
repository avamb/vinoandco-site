/**
 * Cookie notice state (spec 62 §8.1): one shared choice for analytics and
 * advertising (decline), stored in the necessary cookie `vc_consent`.
 * The same value is later passed to the platform as `tracking_consent`.
 */

export const CONSENT_COOKIE = 'vc_consent';
/** Bump when the banner text changes; an old choice is then asked again. */
export const CONSENT_VERSION = '2026-11-06';
export const CONSENT_EVENT = 'vc:consent';

export interface Consent {
  granted: boolean;
  version: string;
  at: string;
}

export function readConsent(): Consent | null {
  const raw = document.cookie
    .split('; ')
    .find((c) => c.startsWith(`${CONSENT_COOKIE}=`))
    ?.slice(CONSENT_COOKIE.length + 1);
  if (!raw) return null;
  try {
    const c = JSON.parse(decodeURIComponent(raw)) as Consent;
    return c.version === CONSENT_VERSION ? c : null;
  } catch {
    return null;
  }
}

/**
 * Notice mode (owner decision 2026-11-16): tracking is on for everyone unless
 * the visitor explicitly declined (current-version cookie with granted:false).
 */
export function trackingAllowed(): boolean {
  try {
    return readConsent()?.granted !== false;
  } catch {
    return true;
  }
}

export function writeConsent(granted: boolean): Consent {
  const c: Consent = { granted, version: CONSENT_VERSION, at: new Date().toISOString() };
  let cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(c))}; path=/; max-age=31536000; SameSite=Lax`;
  if (location.protocol === 'https:') cookie += '; Secure';
  document.cookie = cookie;
  return c;
}
