import { browser, ctx, NEW, WP, VP } from './lib.mjs';
const b = await browser();
const out = process.env.SHOTS + '/';
import { mkdirSync } from 'node:fs';
mkdirSync(out, { recursive: true });
for (const [name, base] of [['new', NEW], ['wp', WP]]) for (const vp of ['desktop', 'mobile']) for (const l of ['ru', 'he']) {
  const c = await ctx(b, vp);
  const p = await c.newPage();
  await p.goto(base + (l === 'ru' ? '/' : '/' + l + '/'), { waitUntil: 'networkidle' }).catch(() => {});
  await p.waitForTimeout(1500);
  await p.screenshot({ path: `${out}gate-${name}-${vp}-${l}.png` });
  const html = await p.evaluate(() => [...document.querySelectorAll('button,a.age-gate__button,[class*=age-gate] *')].filter(e=>e.children.length===0).slice(0,12).map((e) => e.tagName + '.' + e.className + ':' + e.textContent.trim().slice(0, 30)));
  console.log(name, vp, l, JSON.stringify(html));
  await c.close();
}
await b.close();
