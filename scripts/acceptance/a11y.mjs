// Accessibility acceptance: modal keyboard behaviour, axe on key pages, contrast of the two brand backgrounds.
// NEW_ORIGIN=... node scripts/acceptance/a11y.mjs
import { AxeBuilder } from '@axe-core/playwright';
import { browser, ctx, NEW } from './lib.mjs';
const consent = encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() }));
const b = await browser();
const res = [];
const log = (ok, msg) => { res.push(`${ok ? 'PASS' : 'FAIL'} ${msg}`); console.log(res.at(-1)); };
async function page(path, vp = 'desktop', locale = 'ru-RU') {
  const c = await ctx(b, vp, { locale });
  const host = new URL(NEW).hostname;
  await c.addCookies([{ name: 'age_gate', value: '1', domain: host, path: '/' }, { name: 'vc_consent', value: consent, domain: host, path: '/' }]);
  const p = await c.newPage();
  await p.route('**/api.arenasoldout.com/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort())); // never write to the platform
  await p.goto(NEW + path, { waitUntil: 'load' });
  await p.waitForTimeout(800);
  return p;
}
async function axe(p, name) {
  const r = await new AxeBuilder({ page: p }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa']).analyze();
  const bad = r.violations.filter((v) => ['critical', 'serious'].includes(v.impact));
  log(bad.length === 0, `axe ${name}: ${r.violations.length} violations, critical/serious ${bad.length}` + bad.map((v) => `\n   - ${v.id} (${v.impact}): ${v.nodes.length} nodes e.g. ${v.nodes[0].html.slice(0, 120)}`).join(''));
  return r;
}
for (const l of [['ru', '', 'ru-RU'], ['en', '/en', 'en-GB'], ['he', '/he', 'he-IL']]) {
  const [lang, pre, loc] = l;
  const ev = `${pre}/event/e33/`;
  const p = await page(ev, 'desktop', loc);
  await axe(p, `${lang} event page`);
  const btn = p.locator('[data-vino-buy]').first();
  await btn.focus();
  await p.keyboard.press('Enter');
  await p.waitForSelector('#vino-booking-modal');
  await p.waitForTimeout(600);
  const inside = () => p.evaluate(() => document.querySelector('.vino-modal-box').contains(document.activeElement));
  log(await inside(), `${lang} modal: focus moved inside on open`);
  await axe(p, `${lang} event page with modal open`);
  let ok = true;
  for (let i = 0; i < 25; i++) { await p.keyboard.press('Tab'); if (!(await inside())) ok = false; }
  for (let i = 0; i < 25; i++) { await p.keyboard.press('Shift+Tab'); if (!(await inside())) ok = false; }
  log(ok, `${lang} modal: focus trapped over 50 Tab/Shift+Tab presses`);
  // validation: press pay with empty fields, never with data
  const pay = p.locator('.vino-modal-btn-primary');
  if (await pay.count()) {
    await pay.first().click();
    await p.waitForTimeout(300);
    const st = await p.evaluate(() => {
      const bad = [...document.querySelectorAll('#vino-booking-modal [aria-invalid="true"]')];
      return { n: bad.length, described: bad.every((e) => { const id = e.getAttribute('aria-describedby'); return id && document.getElementById(id)?.textContent.trim(); }), focusOnFirst: document.activeElement === bad[0], alert: !!document.querySelector('#vino-booking-modal [role=alert]') };
    });
    log(st.n > 0 && st.described && st.alert, `${lang} modal: ${st.n} invalid fields with aria-invalid + aria-describedby text, role=alert ${st.alert}, focus on first ${st.focusOnFirst}`);
  }
  const live = await p.evaluate(() => [...document.querySelectorAll('#vino-booking-modal .vino-modal-timer')].map((e) => e.getAttribute('aria-live') || (e.closest('[aria-live]')?.getAttribute('aria-live')) || 'none'));
  log(live.every((x) => x !== 'assertive'), `${lang} modal: reservation text is static, aria-live ${live.join(',')}`);
  const dir = await p.evaluate(() => { const box = document.querySelector('.vino-modal-box'); const close = document.querySelector('.vino-modal-close').getBoundingClientRect(); const bx = box.getBoundingClientRect(); return { dir: getComputedStyle(box).direction, closeSide: close.left - bx.left < bx.right - close.right ? 'left' : 'right' }; });
  log(lang !== 'he' || (dir.dir === 'rtl' && dir.closeSide === 'left'), `${lang} modal: direction ${dir.dir}, close button on the ${dir.closeSide}`);
  await p.keyboard.press('Escape');
  await p.waitForTimeout(300);
  const closed = await p.evaluate(() => !document.querySelector('#vino-booking-modal'));
  const back = await p.evaluate(() => document.activeElement?.hasAttribute('data-vino-buy'));
  log(closed, `${lang} modal: Esc closes`);
  log(back, `${lang} modal: focus returned to the buy button`);
  await p.context().close();
}
for (const [name, path] of [['home', '/'], ['order-status', '/order-status/'], ['my-tickets', '/my-tickets/'], ['contact', '/contact-us/'], ['he order-status', '/he/order-status/']]) {
  const p = await page(path, 'desktop', path.startsWith('/he') ? 'he-IL' : 'ru-RU');
  await axe(p, name);
  await p.context().close();
}
for (const [name, path] of [['upcoming', '/upcoming-events/'], ['past', '/past-events/'], ['about', '/about-us/'], ['private', '/private-events/'], ['terms', '/terms-conditions/'], ['en home', '/en/'], ['he home', '/he/'], ['he about', '/he/wdwthynw/'], ['404', '/nonexistent-zzz/']]) {
  const p = await page(path, 'desktop', path.startsWith('/he') ? 'he-IL' : 'ru-RU');
  await axe(p, name);
  await p.context().close();
}
// age gate and cookie banner states: no cookies at all
for (const [name, loc, path] of [['ru', 'ru-RU', '/'], ['he', 'he-IL', '/he/']]) {
  const c = await ctx(b, 'desktop', { locale: loc });
  const p = await c.newPage();
  await p.goto(NEW + path, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  await axe(p, `${name} age gate (no cookies)`);
  await c.close();
  const c2 = await ctx(b, 'mobile', { locale: loc });
  await c2.addCookies([{ name: 'age_gate', value: '1', domain: new URL(NEW).hostname, path: '/' }]);
  const p2 = await c2.newPage();
  await p2.goto(NEW + path, { waitUntil: 'load' }); await p2.waitForTimeout(1200);
  await axe(p2, `${name} cookie banner (mobile)`);
  await c2.close();
}
const mp = await page('/event/e33/', 'mobile');
await axe(mp, 'ru event page mobile');
await b.close();
console.log('\n' + res.filter((x) => x.startsWith('FAIL')).length + ' failures');
