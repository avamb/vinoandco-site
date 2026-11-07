import { chromium } from '@playwright/test';
import { NEW } from './lib.mjs';
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const b = await chromium.launch();
for (const vp of [['desktop', 1366, 900], ['mobile', 390, 844]]) for (const [n, base] of [['new', NEW + '/'], ['wp', 'https://vinoandco.events/']]) {
  const c = await b.newContext({ viewport: { width: vp[1], height: vp[2] }, userAgent: UA, isMobile: vp[0] === 'mobile' });
  const p = await c.newPage(); await p.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
  await p.goto(base); await p.waitForTimeout(3500);
  const r = await p.evaluate(() => {
    const w = document.querySelector('.age-gate__wrapper'); if (!w) return ['no gate'];
    const out = [];
    for (const el of w.querySelectorAll('*')) {
      const r = el.getBoundingClientRect(); if (r.width < 5 || r.height < 5) continue;
      if (el.children.length > 3) { const cs = getComputedStyle(el); if (!/age-gate__(form|wrapper|inner|buttons|challenge)/.test(el.className)) continue; }
      const s = getComputedStyle(el);
      out.push(`${el.tagName.toLowerCase()}.${String(el.className).slice(0, 30)} x=${Math.round(r.left)} y=${Math.round(r.top)} w=${Math.round(r.width)} h=${Math.round(r.height)} fs=${s.fontSize}/${s.lineHeight} ${s.fontFamily.split(',')[0]} fw=${s.fontWeight} c=${s.color} bg=${s.backgroundColor} br=${s.borderRadius} pad=${s.padding} ${el.textContent.trim().slice(0, 20)}`);
    }
    return out;
  });
  console.log('--', n, vp[0]); console.log(r.join('\n'));
  await c.close();
}
await b.close();
