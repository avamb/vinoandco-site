// node geom.mjs <path> [vp] : top-level section rects on WP and new
import { browser, ctx, NEW, WP } from './lib.mjs';
const path = process.argv[2], vp = process.argv[3] || 'desktop';
const b = await browser();
for (const [n, base] of [['new', NEW], ['wp', WP]]) {
  const c = await ctx(b, vp);
  const p = await c.newPage();
  await p.goto(base + path, { waitUntil: 'load' });
  await p.waitForTimeout(1000);
  const r = await p.evaluate((n) => {
    const root = n === 'wp' ? document.querySelector('[data-elementor-type="wp-post"], [data-elementor-type="wp-page"], [data-elementor-type="product"]') : document.querySelector('main') || document.body;
    const kids = [...(n === 'wp' ? root.querySelectorAll(':scope > .elementor-element, :scope > .elementor > .elementor-element') : root.children)];
    return kids.map((k) => { const r = k.getBoundingClientRect(); const cs = getComputedStyle(k); return `${k.tagName}.${(k.className || '').toString().slice(0, 40)} y=${Math.round(r.top + scrollY)} h=${Math.round(r.height)} pad=${cs.paddingTop}/${cs.paddingBottom} bg=${cs.backgroundColor}`; });
  }, n);
  console.log('--', n); console.log(r.join('\n'));
  await c.close();
}
await b.close();
