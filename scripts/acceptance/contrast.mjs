import { AxeBuilder } from '@axe-core/playwright';
import { browser, ctx, NEW } from './lib.mjs';
const consent = encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() }));
const b = await browser();
for (const [path, modal] of (process.argv.slice(2).length ? process.argv.slice(2) : ['/', '/my-tickets/', '/contact-us/', '/event/e33/#modal']).map((x) => [x.replace('#modal', ''), x.includes('#modal')])) {
  const c = await ctx(b, 'desktop'); const host = new URL(NEW).hostname;
  await c.addCookies([{ name: 'age_gate', value: '1', domain: host, path: '/' }, { name: 'vc_consent', value: consent, domain: host, path: '/' }]);
  const p = await c.newPage(); await p.goto(NEW + path, { waitUntil: 'load' }); await p.waitForTimeout(600);
  if (modal) { await p.locator('[data-vino-buy]').first().click(); await p.waitForSelector('#vino-booking-modal'); await p.waitForTimeout(500); }
  const r = await new AxeBuilder({ page: p }).withRules(['color-contrast']).analyze();
  console.log('##', path, modal ? '(modal)' : '');
  for (const v of r.violations) for (const n of v.nodes) { const d = n.any[0]?.data || {}; console.log(`  ${d.contrastRatio} fg=${d.fgColor} bg=${d.bgColor} fs=${d.fontSize} ${n.target.join(' ')} :: ${n.html.slice(0, 90)}`); }
  await c.close();
}
await b.close();
