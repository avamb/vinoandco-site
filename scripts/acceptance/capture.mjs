// Full-page screenshots of the same pages on staging and on live WordPress.
// SHOTS=<dir> node scripts/acceptance/capture.mjs [langs] [vps] [only-page-keys]
import { browser, ctx, NEW, WP, paths } from './lib.mjs';
const out = process.env.SHOTS + '/';
const langs = (process.argv[2] || 'ru,en,he').split(',');
const vps = (process.argv[3] || 'desktop,mobile').split(',');
const only = process.argv[4]?.split(',');
const consent = encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() }));
const WPCSS = `.elementor-invisible{visibility:visible!important;opacity:1!important}.animated{animation:none!important;opacity:1!important}*{scroll-behavior:auto!important}`;
const b = await browser();
async function shot(site, base, lang, vp, key, path) {
  const c = await ctx(b, vp, lang === 'he' ? { locale: 'he-IL' } : lang === 'en' ? { locale: 'en-GB' } : {});
  const host = new URL(base).hostname;
  await c.addCookies(site === 'new'
    ? [{ name: 'age_gate', value: '1', domain: host, path: '/' }, { name: 'vc_consent', value: consent, domain: host, path: '/' }]
    : [{ name: 'cookie_notice_accepted', value: 'true', domain: host, path: '/' }]);
  const p = await c.newPage();
  await p.goto(base + path, { waitUntil: 'load', timeout: 60000 }).catch((e) => console.log('goto', site, path, e.message));
  if (site === 'wp') await p.addStyleTag({ content: WPCSS });
  await p.waitForTimeout(1200);
  // scroll to trigger lazy images
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 600) { window.scrollTo(0, y); await new Promise((r) => setTimeout(r, 80)); } window.scrollTo(0, 0); });
  await p.waitForTimeout(800);
  await p.screenshot({ path: `${out}${key}-${site}-${vp}-${lang}.png`, fullPage: true }).catch((e) => console.log('shot', e.message));
  await c.close();
}
const extra = { event: (l) => (l === 'ru' ? '/event/e33/' : l === 'en' ? '/en/event/e33/' : '/he/event/e33/') };
for (const lang of langs) for (const vp of vps) {
  const list = { ...paths[lang], event: extra.event(lang), orderStatus: lang === 'ru' ? '/order-status/' : `/${lang}/order-status/`, myTickets: lang === 'ru' ? '/my-tickets/' : `/${lang}/my-tickets/` };
  for (const [key, path] of Object.entries(list)) {
    if (only && !only.includes(key)) continue;
    await shot('new', NEW, lang, vp, key, path);
    if (!process.env.SKIP_WP && !['orderStatus', 'myTickets', 'event'].includes(key)) await shot('wp', WP, lang, vp, key, path);
  }
}
await b.close();
