import { browser, ctx, WP } from './lib.mjs';
const vp = process.argv[2] || 'desktop';
const b = await browser(); const c = await ctx(b, vp); const p = await c.newPage();
await p.goto(WP + '/', { waitUntil: 'load' }); await p.waitForTimeout(2500);
const r = await p.evaluate(() => {
  const q = (s) => [...document.querySelectorAll(s)].map((e) => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return `${s} x=${Math.round(r.left)} y=${Math.round(r.top + scrollY)} w=${Math.round(r.width)} h=${Math.round(r.height)} bg=${cs.backgroundColor} col=${cs.color} fs=${cs.fontSize}`; });
  return [...q('.elementor-widget-loop-carousel'), ...q('.swiper'), ...q('.swiper-slide:not(.swiper-slide-duplicate)'), ...q('.elementor-swiper-button'), ...q('.swiper-pagination'), ...q('.swiper-pagination-bullet'), document.querySelector('.swiper').outerHTML.slice(0, 600), JSON.stringify(document.querySelector('.elementor-widget-loop-carousel').dataset.settings)];
});
console.log(r.join('\n'));
await b.close();
