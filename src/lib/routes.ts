/**
 * Every page of the site and its address in each language (spec 62 §4).
 * Addresses are the WordPress ones, including the transliterated Hebrew slugs.
 */
import { languages, type LanguageCode } from '../../site.config.ts';

export type PageKey =
  | 'home'
  | 'upcoming'
  | 'past'
  | 'private'
  | 'about'
  | 'contact'
  | 'terms'
  | 'privacy'
  | 'refund'
  | 'orderStatus'
  | 'myTickets';

export const pagePaths: Record<PageKey, Record<LanguageCode, string>> = {
  home: { ru: '/', en: '/en/', he: '/he/' },
  upcoming: { ru: '/upcoming-events/', en: '/en/upcoming-events/', he: '/he/yrwy-krwby/' },
  past: { ru: '/past-events/', en: '/en/past-events/', he: '/he/yrwy-kwdmy/' },
  private: { ru: '/private-events/', en: '/en/private-events/', he: '/he/yrwy-phrtyy/' },
  about: { ru: '/about-us/', en: '/en/about-us/', he: '/he/wdwthynw/' },
  contact: { ru: '/contact-us/', en: '/en/contact-us/', he: '/he/swr-kshr/' },
  terms: { ru: '/terms-conditions/', en: '/en/terms-conditions/', he: '/he/thny-whgblwth/' },
  privacy: { ru: '/privacy-policy/', en: '/en/privacy-policy/', he: '/he/mdynywth-phrtywth/' },
  refund: { ru: '/refund_returns/', en: '/en/return-policy/', he: '/he/mdynywth-hxzrwth/' },
  orderStatus: { ru: '/order-status/', en: '/en/order-status/', he: '/he/order-status/' },
  myTickets: { ru: '/my-tickets/', en: '/en/my-tickets/', he: '/he/my-tickets/' },
};

/** Personal pages: no-store, no third-party scripts, no indexing (spec 62 §5.6). */
export const personalPages: PageKey[] = ['orderStatus', 'myTickets'];

export function pagePath(key: PageKey, lang: LanguageCode): string {
  return pagePaths[key][lang];
}

export function eventPath(slug: string, lang: LanguageCode): string {
  const prefix = languages.find((l) => l.code === lang)?.prefix ?? '';
  return `${prefix}/event/${slug}/`;
}

export function notFoundPath(lang: LanguageCode): string {
  return lang === 'ru' ? '/404/' : `/${lang}/404/`;
}

/** Astro `params.path` for a site path ('/' -> undefined, '/en/x/' -> 'en/x'). */
export function toParam(path: string): string | undefined {
  const p = path.replace(/^\/+|\/+$/g, '');
  return p === '' ? undefined : p;
}
