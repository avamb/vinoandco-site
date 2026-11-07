// Opens the purchase modal on staging/local and on WordPress (up to the details step, never pays) and screenshots it.
import { chromium } from '@playwright/test';
import { NEW, VP } from './lib.mjs';
const out = process.env.SHOTS + '/';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const b = await chromium.launch();
const consent = encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() }));
for (const vp of ['desktop', 'mobile']) for (const lang of ['ru', 'he']) {
  for (const [n, base, path] of [['new', NEW, lang === 'ru' ? '/event/e33/' : '/he/event/e33/'], ['wp', 'https://vinoandco.events', lang === 'ru' ? '/event/premera-vina-v-tel-avive/' : '/he/event/bkhwrh-shl-yy-ndryy-mkrby-wynth-klyy/']]) {
    const c = await b.newContext({ viewport: VP[vp], userAgent: UA, isMobile: vp === 'mobile', locale: lang === 'he' ? 'he-IL' : 'ru-RU' });
    const host = new URL(base).hostname;
    await c.addCookies(n === 'new' ? [{ name: 'age_gate', value: '1', domain: host, path: '/' }, { name: 'vc_consent', value: consent, domain: host, path: '/' }] : [{ name: 'cookie_notice_accepted', value: 'true', domain: host, path: '/' }]);
    const p = await c.newPage();
    await p.route('**/api.arenasoldout.com/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
    await p.goto(base + path, { waitUntil: 'load' }); await p.waitForTimeout(1500);
    if (n === 'wp') { const y = p.locator('.age-gate__submit--yes'); if (await y.count()) { await y.first().click().catch(() => {}); await p.waitForTimeout(1500); } }
    const sel = n === 'new' ? '[data-vino-buy]' : 'button.vino-book-trigger';
    const btn = p.locator(sel).filter({ visible: true }).first();
    if (!(await btn.count())) { console.log('no buy button', n, vp, lang); await c.close(); continue; }
    try { await btn.click({ timeout: 8000 }); } catch { console.log('click failed', n, vp, lang); await c.close(); continue; }
    await p.waitForTimeout(2500);
    await p.screenshot({ path: `${out}modal-${n}-${vp}-${lang}.png` });
    await c.close();
  }
}
await b.close();
