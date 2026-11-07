import { browser, ctx, NEW, WP } from './lib.mjs';
const out = process.env.SHOTS + '/';
const consent = encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() }));
const b = await browser();
for (const vp of ['desktop', 'mobile']) for (const [site, base, path] of [['new', NEW, '/event/e33/'], ['wp', WP, '/event/premera-vina-v-tel-avive/']]) {
  const c = await ctx(b, vp); const host = new URL(base).hostname;
  await c.addCookies(site === 'new' ? [{ name: 'age_gate', value: '1', domain: host, path: '/' }, { name: 'vc_consent', value: consent, domain: host, path: '/' }] : [{ name: 'cookie_notice_accepted', value: 'true', domain: host, path: '/' }]);
  const p = await c.newPage(); await p.goto(base + path, { waitUntil: 'load' }); await p.waitForTimeout(2000);
  await p.screenshot({ path: `${out}event-${site}-${vp}-ru.png`, fullPage: true }); await c.close();
}
await b.close();
