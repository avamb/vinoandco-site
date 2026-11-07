/**
 * Site-wide configuration: domain, languages, platform channel, tracking ids.
 *
 * Everything here is PUBLIC. Values that differ between staging and production
 * (origin, indexing, feed token, pixel / GA4 ids) are read from the build
 * environment, never hard-coded. See `.env.example`.
 */

type Env = Record<string, string | undefined>;
const env: Env = (globalThis as { process?: { env?: Env } }).process?.env ?? {};

export type LanguageCode = 'ru' | 'en' | 'he';

export interface Language {
  code: LanguageCode;
  /** Name in the language itself (language switcher). */
  name: string;
  dir: 'ltr' | 'rtl';
  /** BCP 47 tag for Intl and hreflang. */
  intl: string;
  /** URL prefix: '' for the default language, '/en', '/he'. */
  prefix: string;
}

export const languages: Language[] = [
  { code: 'ru', name: 'Русский', dir: 'ltr', intl: 'ru-RU', prefix: '' },
  { code: 'en', name: 'English', dir: 'ltr', intl: 'en-GB', prefix: '/en' },
  { code: 'he', name: 'עברית', dir: 'rtl', intl: 'he-IL', prefix: '/he' },
];

export const defaultLanguage: LanguageCode = 'ru';

/** Public origin of this build (production or staging). */
export const siteUrl: string = env.SITE_URL || 'https://vinoandco.events';

/**
 * Indexing switch. Staging (new.vinoandco.events) builds with SITE_INDEXING=false:
 * every page carries noindex and robots.txt disallows everything.
 * Defaults to false so an accidental build never gets indexed.
 */
export const indexing: boolean = env.SITE_INDEXING === 'true';

/** Arena platform: public API origin and the site's channel feed token (public). */
export const arena = {
  apiBase: env.PUBLIC_ARENA_API || 'https://api.arenasoldout.com',
  feedToken: env.PUBLIC_FEED_TOKEN || '',
  /**
   * Staging only: feed token of the TEST channel. Empty in production, and then no test event
   * is ever built, whatever a snapshot says. Used for that event's checkout calls.
   */
  testFeedToken: (env.PUBLIC_TEST_FEED_TOKEN || '').trim(),
  /** Path to an events snapshot written by the builder; empty = sample snapshot. */
  snapshotPath: env.EVENTS_SNAPSHOT || '',
};

/** Tracking ids. Loaded only after the visitor accepts cookies (Р-10, §8.1). */
export const tracking = {
  metaPixelId: env.PUBLIC_META_PIXEL_ID || '',
  ga4Id: env.PUBLIC_GA4_ID || '',
};

/**
 * Cloudflare Turnstile (site forms). The SITE key is public; the secret key is
 * held by the platform. Empty = the forms say they are unavailable and send nothing.
 */
export const turnstile = {
  siteKey: env.PUBLIC_TURNSTILE_SITE_KEY || '',
};

export const brand = {
  name: 'Vino&Co',
  email: 'info@vinoandco.events',
  facebook: 'https://www.facebook.com/vinoandcowinetastings',
  instagram: 'https://www.instagram.com/vino.and.co/',
  shop: 'https://www.einatwinery.com/',
  /** Venue-less fallback zone for formatting dates (Israel). */
  defaultTimezone: 'Asia/Jerusalem',
};

/** Static files of the new site live under this prefix (§4.1: rollback routing). */
export const assetPrefix = '/_site';
