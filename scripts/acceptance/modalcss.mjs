import { chromium } from '@playwright/test';
import { NEW } from './lib.mjs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const b = await chromium.launch();
const props = ['x', 'y', 'width', 'height', 'fontSize', 'fontFamily', 'fontWeight', 'color', 'backgroundColor', 'borderTopWidth', 'borderTopColor', 'borderRadius', 'padding', 'margin', 'boxShadow', 'letterSpacing', 'textTransform'];
for (const vp of [['desktop', 1366, 900], ['mobile', 390, 844]]) for (const [n, base, path, trig] of [['new', NEW, '/event/e33/', '[data-vino-buy]'], ['wp', 'https://vinoandco.events', '/event/premera-vina-v-tel-avive/', 'button.vino-book-trigger']]) {
  const c = await b.newContext({ viewport: { width: vp[1], height: vp[2] }, userAgent: UA, isMobile: vp[0] === 'mobile' });
  const host = new URL(base).hostname;
  await c.addCookies(n === 'new' ? [{ name: 'age_gate', value: '1', domain: host, path: '/' }, { name: 'vc_consent', value: encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() })), domain: host, path: '/' }] : [{ name: 'cookie_notice_accepted', value: 'true', domain: host, path: '/' }]);
  const p = await c.newPage(); await p.route('**/api.arenasoldout.com/**', (r) => (r.request().method() === 'GET' ? r.continue() : r.abort()));
  await p.goto(base + path, { waitUntil: 'load' }); await p.waitForTimeout(1200);
  if (n === 'wp') { const y = p.locator('.age-gate__submit--yes'); if (await y.count()) { await y.first().click().catch(() => {}); await p.waitForTimeout(1200); } }
  await p.locator(trig).filter({ visible: true }).first().click(); await p.waitForTimeout(2500);
  const r = await p.evaluate(([props]) => {
    const sels = { box: '.vino-modal-box', header: '.vino-modal-header', title: '.vino-modal-header h2, #vino-modal-title', close: '.vino-modal-close', summary: '.vino-booking-summary', qlabel: '.vino-modal-field label', qbtn: '.vino-qty-btn', qinput: '#vino-modal-qty', timer: '.vino-modal-timer', name: '#vino-field-fullname', email: '#vino-field-email', promo: '.vino-promo-toggle', pay: '.vino-modal-btn-primary', back: '.vino-modal-back-link' };
    return Object.entries(sels).map(([k, s]) => { const e = document.querySelector(s); if (!e) return `${k}: none`; const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${k}: ` + props.map((q) => { const v = q === 'x' ? Math.round(r.left) : q === 'y' ? Math.round(r.top) : q === 'width' ? Math.round(r.width) : q === 'height' ? Math.round(r.height) : cs[q]; return `${q}=${String(v).slice(0, 40)}`; }).join(' '); });
  }, [props]);
  console.log('--', n, vp[0]); console.log(r.join('\n')); await c.close();
}
await b.close();
