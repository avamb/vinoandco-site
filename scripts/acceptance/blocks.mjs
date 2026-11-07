// node blocks.mjs <path> [vp] [fromY] [toY]: print main visual blocks (images, headings, p, buttons) with rect + font
import { browser, ctx, NEW, WP } from './lib.mjs';
const [path, vp = 'desktop', y0 = '0', y1 = '99999'] = process.argv.slice(2);
const b = await browser();
for (const [n, base] of [['new', NEW], ['wp', WP]]) {
  const c = await ctx(b, vp); const p = await c.newPage();
  await p.goto(base + path, { waitUntil: 'load' }); await p.addStyleTag({ content: '.elementor-invisible{visibility:visible!important;opacity:1!important}.animated{animation:none!important;opacity:1!important}.elementor-element{animation:none!important;transform:none!important}' }); await p.waitForTimeout(800);
  await p.evaluate(async () => { for (let y = 0; y < document.body.scrollHeight; y += 500) { scrollTo(0, y); await new Promise((r) => setTimeout(r, 200)); } scrollTo(0, 0); }); await p.waitForTimeout(1500);
  const r = await p.evaluate(([n, y0, y1]) => {
    const root = n === 'wp' ? document.querySelector('[data-elementor-type="wp-page"], [data-elementor-type="product"], [data-elementor-type="wp-post"]') : document.querySelector('main');
    const out = [];
    for (const el of root.querySelectorAll('img:not([class*=emoji]), h1, h2, h3, h4, p, a.elementor-button, a.vc-btn, button, label, input, select, textarea')) {
      const r = el.getBoundingClientRect(); const y = r.top + scrollY; if (y < +y0 || y > +y1 || r.width < 2) continue;
      const s = getComputedStyle(el);
      out.push(`${el.tagName.toLowerCase()} x=${Math.round(r.left)} y=${Math.round(y)} w=${Math.round(r.width)} h=${Math.round(r.height)} fs=${s.fontSize}/${s.lineHeight} ${s.fontFamily.split(',')[0]} fw=${s.fontWeight} c=${s.color} ${(el.textContent || el.alt || '').trim().slice(0, 28)}`);
    }
    for (const el of root.querySelectorAll('*')) { const cs = getComputedStyle(el); const r = el.getBoundingClientRect(); const y = r.top + scrollY; if (cs.backgroundImage.startsWith('url') && r.width > 150 && y >= +y0 && y <= +y1) out.push(`BG ${el.tagName.toLowerCase()}.${String(el.className).slice(0,30)} x=${Math.round(r.left)} y=${Math.round(y)} w=${Math.round(r.width)} h=${Math.round(r.height)} ${cs.backgroundImage.slice(-40)}`); }
    return out;
  }, [n, y0, y1]);
  console.log('--', n, vp); console.log(r.join('\n'));
  await c.close();
}
await b.close();
