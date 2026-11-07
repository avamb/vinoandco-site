import { browser, ctx, NEW, WP } from './lib.mjs';
const [path, vp = 'desktop'] = process.argv.slice(2);
const b = await browser();
for (const [n, base] of [['new', NEW], ['wp', WP]]) {
  const c = await ctx(b, vp); const p = await c.newPage();
  await p.goto(base + path, { waitUntil: 'load' }); await p.waitForTimeout(800);
  const r = await p.evaluate((n) => {
    const hero = n === 'wp' ? document.querySelector('[data-elementor-type="wp-page"] > .elementor-element') : document.querySelector('.vc-hero');
    const hr = hero.getBoundingClientRect(); const cs = getComputedStyle(hero);
    const f = (el) => { if (!el) return null; const r = el.getBoundingClientRect(); const s = getComputedStyle(el); return `x=${Math.round(r.left)} y=${Math.round(r.top - hr.top)} w=${Math.round(r.width)} h=${Math.round(r.height)} fs=${s.fontSize} lh=${s.lineHeight} ff=${s.fontFamily.slice(0,25)} fw=${s.fontWeight} col=${s.color} mb=${s.marginBottom}`; };
    const h1 = hero.querySelector('h1, h2, .elementor-heading-title'); const ps = [...hero.querySelectorAll('p')];
    return [`hero h=${Math.round(hr.height)} pad=${cs.paddingTop}/${cs.paddingBottom} mt=${cs.marginTop} minh=${cs.minHeight}`, 'h1 ' + f(h1), ...ps.slice(0, 2).map((x, i) => 'p' + i + ' ' + f(x))];
  }, n);
  console.log('--', n, vp); console.log(r.join('\n'));
  await c.close();
}
await b.close();
