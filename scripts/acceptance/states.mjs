// Screens without the cookies that hide them: age gate, cookie banner, order status, my tickets (form state)
import { browser, ctx, NEW } from './lib.mjs';
const out = process.env.SHOTS + '/';
const b = await browser();
for (const vp of ['desktop', 'mobile']) for (const [lang, loc, pre] of [['ru', 'ru-RU', ''], ['en', 'en-GB', '/en'], ['he', 'he-IL', '/he']]) {
  const host = new URL(NEW).hostname;
  // age gate: nothing set
  let c = await ctx(b, vp, { locale: loc }); let p = await c.newPage();
  await p.goto(NEW + pre + '/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}gate-new2-${vp}-${lang}.png` }); await c.close();
  // cookie banner: gate passed
  c = await ctx(b, vp, { locale: loc }); await c.addCookies([{ name: 'age_gate', value: '1', domain: host, path: '/' }]); p = await c.newPage();
  await p.goto(NEW + pre + '/', { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await p.screenshot({ path: `${out}banner-new-${vp}-${lang}.png` });
  await c.close();
  // order status without token and my tickets form
  const consent = encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() }));
  for (const [key, path] of [['orderstatus', '/order-status/'], ['mytickets', '/my-tickets/']]) {
    c = await ctx(b, vp, { locale: loc }); await c.addCookies([{ name: 'age_gate', value: '1', domain: host, path: '/' }, { name: 'vc_consent', value: consent, domain: host, path: '/' }]); p = await c.newPage();
    await p.route('**/api.arenasoldout.com/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
    await p.goto(NEW + pre + path, { waitUntil: 'load' }); await p.waitForTimeout(1200);
    await p.screenshot({ path: `${out}${key}-new-${vp}-${lang}.png`, fullPage: true }); await c.close();
  }
}
await b.close();
