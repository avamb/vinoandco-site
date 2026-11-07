// Measures the photo + text sections (home, about, private, contact) on the new site and on WordPress
// at desktop widths, scrolling each section into view so lazy backgrounds and images load.
//   node scripts/acceptance/split-geom.mjs [--site wp|new] [--path /] [--widths 1280,1536,1985] [--css FILE]
// Prints, per section: photo box, dot pattern box, text box, heading / paragraph / drop cap / button boxes and type.
import { chromium } from '@playwright/test';
import { readFileSync } from 'node:fs';

const args = process.argv.slice(2);
const opt = (n, d) => { const i = args.indexOf('--' + n); return i >= 0 ? args[i + 1] : d; };
const site = opt('site', 'new');
const origin = site === 'wp' ? 'https://vinoandco.events' : opt('origin', 'https://new.vinoandco.events');
const path = opt('path', '/');
const widths = opt('widths', '1280,1536,1985').split(',').map(Number);
const css = opt('css', '') ? readFileSync(opt('css'), 'utf8') : null;
const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';

const b = await chromium.launch();
for (const w of widths) {
  const c = await b.newContext({ viewport: { width: w, height: 1000 }, userAgent: UA });
  const host = new URL(origin).hostname;
  await c.addCookies([
    { name: 'age_gate', value: '1', domain: host, path: '/' },
    { name: 'vc_consent', value: encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() })), domain: host, path: '/' },
    { name: 'cookie_notice_accepted', value: 'true', domain: host, path: '/' },
  ]);
  const p = await c.newPage();
  await p.addInitScript(() => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); });
  await p.route('**/*', (r) => (css && /\/_site\/assets\/[^/]+\.css/.test(r.request().url()) ? r.fulfill({ status: 200, contentType: 'text/css', body: css }) : r.continue()));
  await p.goto(origin + path, { waitUntil: 'load' });
  await p.waitForTimeout(1500);
  const y = p.locator('.age-gate__submit--yes'); if (site === 'wp' && (await y.count())) { await y.first().click().catch(() => {}); await p.waitForTimeout(800); }
  const H = await p.evaluate(() => document.documentElement.scrollHeight);
  for (let yy = 0; yy < H; yy += 600) { await p.evaluate((v) => scrollTo(0, v), yy); await p.waitForTimeout(150); }
  await p.evaluate(() => scrollTo(0, 0)); await p.waitForTimeout(500);
  const out = await p.evaluate(() => {
    const R = (el) => { const r = el.getBoundingClientRect(); return `${Math.round(r.left)}–${Math.round(r.right)} (${Math.round(r.width)}) y${Math.round(r.top + scrollY)} h${Math.round(r.height)}`; };
    const res = [];
    // sections = the nearest ancestor holding both a large picture and a heading
    const heads = [...document.querySelectorAll('h2, h4, h3')].filter((h) => h.getBoundingClientRect().width > 0 && h.closest('main, .elementor, body'));
    for (const h of heads) {
      let sec = h.parentElement, pic = null;
      while (sec && sec !== document.body) {
        const cands = [...sec.querySelectorAll('img, div, figure')].filter((e) => {
          if (e.contains(h)) return false;
          const r = e.getBoundingClientRect(); const bg = getComputedStyle(e).backgroundImage;
          return r.width > 250 && r.height > 250 && (e.tagName === 'IMG' || (bg && bg !== 'none' && !/group-|dot|svg/i.test(bg)));
        });
        if (cands.length) { pic = cands.sort((a, b) => b.getBoundingClientRect().width * b.getBoundingClientRect().height - a.getBoundingClientRect().width * a.getBoundingClientRect().height)[0]; break; }
        sec = sec.parentElement;
      }
      // text box: the heading's ancestor that is a sibling-level container of the photo
      let box = h; while (box.parentElement && !box.parentElement.contains(pic)) box = box.parentElement;
      const p1 = [...box.querySelectorAll('p')].find((x) => x.textContent.trim().length > 20);
      const btn = box.querySelector('a.elementor-button, .vc-btn');
      const dots = [...(sec || document.body).querySelectorAll('*')].find((e) => /group-(11|24)|dot/i.test(getComputedStyle(e).backgroundImage) || /group-(11|24)/.test(getComputedStyle(e, '::before').backgroundImage));
      const cs = p1 ? getComputedStyle(p1) : null; const fl = p1 ? getComputedStyle(p1, '::first-letter') : null;
      const hs = getComputedStyle(h);
      res.push([
        `== "${h.textContent.trim().slice(0, 28)}"  ${h.tagName} ${hs.fontSize}/${hs.lineHeight} w${hs.fontWeight}`,
        `   photo ${pic ? R(pic) + ' ' + (pic.tagName === 'IMG' ? 'img' : 'bg') + ' radius ' + getComputedStyle(pic).borderRadius : '-'}`,
        `   text  ${R(box)}   heading ${R(h)}`,
        p1 ? `   para  ${R(p1)} ${cs.fontSize}/${cs.lineHeight} ${cs.fontFamily.split(',')[0]} | drop cap ${fl.fontSize}/${fl.lineHeight} float ${fl.float} mr ${fl.marginRight} ml ${fl.marginLeft} mt ${fl.marginTop} pad ${fl.padding}` : '   para -',
        btn ? `   button ${R(btn)} ${getComputedStyle(btn).fontSize}` : '   button -',
        dots ? `   dots  ${R(dots)}` : '   dots -',
      ].join('\n'));
    }
    return res.join('\n');
  });
  console.log(`\n##### ${site} ${w} ${path}\n${out}`);
  await c.close();
}
await b.close();
