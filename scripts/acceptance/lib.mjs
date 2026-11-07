import { chromium } from '@playwright/test';
export const NEW = process.env.NEW_ORIGIN || 'https://new.vinoandco.events';
export const WP = 'https://vinoandco.events';
export const VP = { desktop: { width: 1366, height: 900 }, mobile: { width: 390, height: 844 } };
export const paths = {
  ru: { home: '/', upcoming: '/upcoming-events/', past: '/past-events/', private: '/private-events/', about: '/about-us/', contact: '/contact-us/', terms: '/terms-conditions/', privacy: '/privacy-policy/', refund: '/refund_returns/' },
  en: { home: '/en/', upcoming: '/en/upcoming-events/', past: '/en/past-events/', private: '/en/private-events/', about: '/en/about-us/', contact: '/en/contact-us/', terms: '/en/terms-conditions/', privacy: '/en/privacy-policy/', refund: '/en/return-policy/' },
  he: { home: '/he/', upcoming: '/he/yrwy-krwby/', past: '/he/yrwy-kwdmy/', private: '/he/yrwy-phrtyy/', about: '/he/wdwthynw/', contact: '/he/swr-kshr/', terms: '/he/thny-whgblwth/', privacy: '/he/mdynywth-phrtywth/', refund: '/he/mdynywth-hxzrwth/' },
};
export async function browser() { return chromium.launch(); }
export async function ctx(b, vp, extra = {}) {
  return b.newContext({ viewport: VP[vp], locale: 'ru-RU', deviceScaleFactor: 1, isMobile: vp === 'mobile', ...extra });
}
export async function passGates(page, host) {
  // new site: cookies. WP: click gate / banner if present.
  await page.evaluate(() => { try { document.cookie = 'age_gate=1; path=/'; } catch {} });
}
