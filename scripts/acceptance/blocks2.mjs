// like blocks.mjs but with explicit per-site paths: node blocks2.mjs <newPath> <wpPath> [vp] [y0] [y1]
import { browser, ctx, NEW, WP } from './lib.mjs';
const [np, wp, vp = 'desktop', y0 = '0', y1 = '99999'] = process.argv.slice(2);
const b = await browser();
for (const [n, base, path] of [['new', NEW, np], ['wp', WP, wp]]) {
  const c = await ctx(b, vp); const p = await c.newPage();
  await p.goto(base + path, { waitUntil: 'load' }); await p.waitForTimeout(1500);
  const r = await p.evaluate(([y0, y1]) => {
    const out = [];
    for (const el of document.querySelectorAll('main *, [data-elementor-type="product"] *, .product *, article *')) {
      if (!['IMG','H1','H2','H3','P','A','BUTTON','SPAN','DIV','LABEL','SELECT','INPUT'].includes(el.tagName)) continue;
      if (el.children.length > 2 && el.tagName !== 'IMG') continue;
      const r = el.getBoundingClientRect(); const y = r.top + scrollY; if (y < +y0 || y > +y1 || r.width < 20 || r.height < 8) continue;
      const t = (el.textContent || el.alt || '').trim().slice(0, 30); if (!t && el.tagName !== 'IMG') continue;
      const s = getComputedStyle(el);
      out.push(`${el.tagName.toLowerCase()} x=${Math.round(r.left)} y=${Math.round(y)} w=${Math.round(r.width)} h=${Math.round(r.height)} fs=${s.fontSize}/${s.lineHeight} ${s.fontFamily.split(',')[0]} fw=${s.fontWeight} c=${s.color} ${t}`);
    }
    return out;
  }, [y0, y1]);
  console.log('--', n, vp); console.log(r.slice(0, 40).join('\n'));
  await c.close();
}
await b.close();
