import { browser, ctx, NEW, WP } from './lib.mjs';
const [path] = process.argv.slice(2);
const b = await browser();
for (const [n, base] of [['new', NEW], ['wp', WP]]) {
  const c = await ctx(b, 'desktop'); const p = await c.newPage(); await p.goto(base + path, { waitUntil: 'load' }); await p.waitForTimeout(800);
  const r = await p.evaluate(() => [...document.querySelectorAll('li')].filter((l) => l.getBoundingClientRect().top + scrollY > 400 && l.getBoundingClientRect().top + scrollY < 900).slice(0, 6).map((l) => { const r = l.getBoundingClientRect(); const s = getComputedStyle(l); const ul = l.parentElement; const us = getComputedStyle(ul); return `li x=${Math.round(r.left)} y=${Math.round(r.top + scrollY)} h=${Math.round(r.height)} mb=${s.marginBottom} lh=${s.lineHeight} ul-pad=${us.paddingLeft}/${us.paddingRight} ul-mt=${us.marginTop} ul-mb=${us.marginBottom} lst=${s.listStyleType} ${l.textContent.trim().slice(0, 25)}`; }));
  console.log('--', n); console.log(r.join('\n')); await c.close();
}
await b.close();
