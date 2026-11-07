// Mobile audit of the new site (and the WordPress reference): screenshots at phone widths plus
// programmatic checks for horizontal overflow, colliding / too close interactive elements, small
// touch targets, clipped text, elements hidden under another layer, the type scale and the
// spacing / radius values each component uses.
//
//   node scripts/acceptance/mobile-audit.mjs                       new site, 360/375/390/430, ru/en/he
//   node scripts/acceptance/mobile-audit.mjs --site wp --widths 375 --langs ru
//   node scripts/acceptance/mobile-audit.mjs --widths 1280 --no-shots   desktop values for the consistency table
//   options: --origin URL  --only home,event,...  --out DIR  --tag NAME  --no-shots
//            --css FILE   serve this stylesheet instead of the page's own /_site/assets/*.css (checks a local CSS
//                         build against the real staging pages before it is deployed)
//
// Never pays: every non-GET request to the platform API is aborted, and the modal is driven only
// to the buyer form. Output: <out>/<width>/<lang>-<page>.png, <out>/audit-<tag>.json and a readable
// <out>/audit-<tag>.txt.
import { chromium } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const args = process.argv.slice(2);
const opt = (name, def) => { const i = args.indexOf('--' + name); return i >= 0 ? args[i + 1] : def; };
const flag = (name) => args.includes('--' + name);
const site = opt('site', 'new');
const origin = opt('origin', site === 'wp' ? 'https://vinoandco.events' : 'https://new.vinoandco.events');
const widths = opt('widths', '360,375,390,430').split(',').map(Number);
const langs = opt('langs', site === 'wp' ? 'ru' : 'ru,en,he').split(',');
const only = opt('only', '') ? opt('only').split(',') : null;
const out = opt('out', 'docs/acceptance/2026-11-07/mobile');
const tag = opt('tag', `${site}-${widths.join('_')}`);
const shots = !flag('no-shots');
const cssFile = opt('css', '');
const cssBody = cssFile ? (await import('node:fs')).readFileSync(cssFile, 'utf8') : null;

const P = {
  ru: { home: '/', upcoming: '/upcoming-events/', past: '/past-events/', private: '/private-events/', about: '/about-us/', contact: '/contact-us/', mytickets: '/my-tickets/', privacy: '/privacy-policy/', terms: '/terms-conditions/' },
  en: { home: '/en/', upcoming: '/en/upcoming-events/', past: '/en/past-events/', private: '/en/private-events/', about: '/en/about-us/', contact: '/en/contact-us/', mytickets: '/en/my-tickets/', privacy: '/en/privacy-policy/', terms: '/en/terms-conditions/' },
  he: { home: '/he/', upcoming: '/he/yrwy-krwby/', past: '/he/yrwy-kwdmy/', private: '/he/yrwy-phrtyy/', about: '/he/wdwthynw/', contact: '/he/swr-kshr/', mytickets: '/he/my-tickets/', privacy: '/he/mdynywth-phrtywth/', terms: '/he/thny-whgblwth/' },
};
const prefix = { ru: '', en: '/en', he: '/he' };
const EV = 'premera-vina-v-tel-avive', IZR = 'izrail-takie-raznye-belye', PAST = 'vinnyj-kviz-na-kryshe', TEST = 'test-proverka-pokupki-na-saite-ne-pokupat';

function plan(lang) {
  const p = P[lang];
  const list = Object.entries(p).map(([name, path]) => ({ name, path, state: 'page' }));
  const ev = (s) => `${prefix[lang]}/event/${s}/`;
  const events = site === 'wp' && lang !== 'ru' ? [] : [
    { name: 'event', path: ev(EV), state: 'page' },
    { name: 'event-modal1', path: ev(EV), state: 'modal1' },
    { name: 'event-modal2', path: ev(EV), state: 'modal2' },
    { name: 'event-izrail', path: ev(IZR), state: 'page' },
    { name: 'past-event', path: ev(PAST), state: 'page' },
    ...(site === 'wp' ? [] : [
      { name: 'test-event', path: ev(TEST), state: 'page' },
      { name: 'test-modal1', path: ev(TEST), state: 'modal1' },
      { name: 'test-modal2', path: ev(TEST), state: 'modal2' },
    ]),
  ];
  const states = [
    { name: 'gate', path: p.home, state: 'gate' },
    { name: 'banner', path: p.home, state: 'banner' },
    { name: 'menu', path: p.home, state: 'menu' },
  ];
  return [...list.filter((x) => !(site === 'wp' && x.name === 'mytickets')), ...events, ...states]
    .filter((x) => !only || only.includes(x.name));
}

const UA_MOBILE = 'Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36';
const UA_DESKTOP = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36';
const consent = encodeURIComponent(JSON.stringify({ granted: false, version: '2026-11-06', at: new Date().toISOString() }));

// ---------------------------------------------------------------- in-page measurement
function measure(scopeSel) {
  // the configured viewport: a too wide element makes a mobile browser widen the layout viewport (innerWidth grows with it)
  const vw = window.__auditWidth || window.innerWidth;
  const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
  const r2 = (n) => Math.round(n * 10) / 10;
  const visible = (el) => {
    const s = getComputedStyle(el);
    if (s.visibility === 'hidden' || s.display === 'none' || Number(s.opacity) === 0) return false;
    const r = el.getBoundingClientRect();
    if (r.width < 1 || r.height < 1) return false;
    for (let a = el; a && a !== document.body; a = a.parentElement) {
      const cs = getComputedStyle(a);
      if (cs.display === 'none' || cs.visibility === 'hidden') return false;
      if (a.hasAttribute('hidden')) return false;
      if (cs.clip === 'rect(0px, 0px, 0px, 0px)' || (cs.position === 'absolute' && r.width <= 1)) return false;
    }
    return true;
  };
  const label = (el) => {
    const t = (el.getAttribute('aria-label') || el.textContent || el.value || el.placeholder || el.name || '').replace(/\s+/g, ' ').trim().slice(0, 40);
    const cls = typeof el.className === 'string' ? el.className.split(/\s+/).filter(Boolean).slice(0, 2).join('.') : '';
    return `${el.tagName.toLowerCase()}${el.id ? '#' + el.id : ''}${cls ? '.' + cls : ''} "${t}"`;
  };
  const docRect = (el) => { const r = el.getBoundingClientRect(); return { x: r.left + scrollX, y: r.top + scrollY, w: r.width, h: r.height, fixed: false }; };
  // Links inside running prose are not touch targets of their own (WCAG 2.5.8 inline exception).
  const inProse = (el) => {
    if (el.tagName !== 'A') return false;
    if (getComputedStyle(el).display !== 'inline') return false;
    const p = el.closest('p, li, td, span, label, small');
    if (!p) return false;
    return (p.textContent || '').trim().length > (el.textContent || '').trim().length + 15;
  };
  const ia = [...scope.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea, [role=button], summary')]
    .filter(visible).filter((el) => !el.closest('[aria-hidden="true"]'));
  const items = ia.map((el) => ({ el, r: docRect(el), prose: inProse(el), label: label(el) }));
  // (b) overlapping / too close pairs
  const pairs = [];
  for (let i = 0; i < items.length; i++) for (let j = i + 1; j < items.length; j++) {
    const a = items[i], b = items[j];
    if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
    if (a.prose && b.prose) continue;
    const dx = Math.max(0, b.r.x - (a.r.x + a.r.w), a.r.x - (b.r.x + b.r.w));
    const dy = Math.max(0, b.r.y - (a.r.y + a.r.h), a.r.y - (b.r.y + b.r.h));
    const overlapX = Math.min(a.r.x + a.r.w, b.r.x + b.r.w) - Math.max(a.r.x, b.r.x);
    const overlapY = Math.min(a.r.y + a.r.h, b.r.y + b.r.h) - Math.max(a.r.y, b.r.y);
    const overlap = overlapX > 0.5 && overlapY > 0.5;
    const dist = Math.hypot(dx, dy);
    if (overlap || dist < 8) pairs.push({ a: a.label, b: b.label, kind: overlap ? 'overlap' : dist < 0.5 ? 'touch' : 'close', dist: r2(dist), overlap: overlap ? `${r2(overlapX)}x${r2(overlapY)}` : '', y: Math.round(Math.min(a.r.y, b.r.y)) });
  }
  // (c) small targets
  const small = items.filter((x) => !x.prose && (x.r.w < 44 || x.r.h < 44))
    .map((x) => ({ el: x.label, w: r2(x.r.w), h: r2(x.r.h), y: Math.round(x.r.y) }));
  // (d) clipped / overflowing text
  const clipped = [];
  for (const el of scope.querySelectorAll('h1,h2,h3,h4,h5,h6,button,.vc-btn,a,label,p,li,span,select,input,div')) {
    if (!visible(el)) continue;
    const r = el.getBoundingClientRect();
    const isText = /^(H\d|BUTTON|LABEL|A|SELECT|INPUT)$/.test(el.tagName) || el.classList.contains('vc-btn');
    if (r.right > vw + 0.5 || r.left < -0.5) {
      // only report the outermost offender
      const parentOut = el.parentElement && (() => { const pr = el.parentElement.getBoundingClientRect(); return pr.right > vw + 0.5 || pr.left < -0.5; })();
      if (!parentOut && getComputedStyle(el).position !== 'fixed') clipped.push({ el: label(el), what: 'outside viewport', left: r2(r.left), right: r2(r.right) });
      continue;
    }
    // an absolutely placed ::before/::after (enlarged hit area, ribbon) counts in scrollWidth but clips nothing
    const pseudoOnly = ['::before', '::after'].some((pe) => getComputedStyle(el, pe).position === 'absolute');
    if (isText && !pseudoOnly && el.scrollWidth > el.clientWidth + 1 && el.clientWidth > 0 && el.tagName !== 'SELECT') {
      clipped.push({ el: label(el), what: 'scrollWidth>clientWidth', sw: el.scrollWidth, cw: el.clientWidth, overflow: getComputedStyle(el).overflow });
    }
  }
  // (a) horizontal overflow
  const overflow = { scrollWidth: document.documentElement.scrollWidth, innerWidth: window.innerWidth, width: vw, over: document.documentElement.scrollWidth > vw + 0.5 || window.innerWidth > vw, wide: [...document.querySelectorAll('body *')].filter((e) => { const r = e.getBoundingClientRect(); return r.width > 0 && r.right > vw + 0.5 && getComputedStyle(e).position !== 'fixed'; }).slice(0, 3).map((e) => label(e) + ' right=' + Math.round(e.getBoundingClientRect().right)) };
  // (e) type scale
  const roleOf = (el) => {
    if (/^H[1-6]$/.test(el.tagName)) return el.tagName.toLowerCase();
    if (el.closest('footer, .elementor-location-footer')) return 'footer';
    if (el.closest('.cn-bar, #cookie-notice')) return 'banner';
    if (el.matches('button, .vc-btn, .elementor-button, .vc-card__btn, input[type=submit]')) return 'button';
    if (el.matches('label')) return 'label';
    if (el.matches('.vc-event__sessions a, .vc-share, .vc-card__meta span')) return 'chip';
    if (el.matches('p, li')) return 'body';
    return null;
  };
  const type = {};
  for (const el of scope.querySelectorAll('h1,h2,h3,h4,h5,h6,p,li,button,.vc-btn,.elementor-button,.vc-card__btn,label,.vc-event__sessions a,.vc-share,.vc-card__meta span,footer a,footer p,.cn-bar span')) {
    if (!visible(el)) continue;
    if (!(el.textContent || '').trim()) continue;
    const role = roleOf(el); if (!role) continue;
    const s = getComputedStyle(el);
    const key = `${s.fontSize}/${s.lineHeight} w${s.fontWeight} ${s.fontFamily.split(',')[0].replace(/["']/g, '')}${s.textTransform === 'uppercase' ? ' UC' : ''}`;
    type[role] ??= {};
    type[role][key] ??= { n: 0, sample: (el.textContent || '').replace(/\s+/g, ' ').trim().slice(0, 30) };
    type[role][key].n++;
  }
  // consistency: radius / padding / gap / height of components, section rhythm and gutter
  const groups = {
    card: '.vc-card, .vc-past__item img, .vc-past__item--noimg, .vc-personal__box, .vc-order__event, .vc-order__referral, .vc-mt__order, .vino-booking-summary, .vc-event__past-note, .vc-event__poster img, .vc-card__poster img, .elementor-loop-container .e-loop-item, .vino-event-card',
    button: '.vc-btn, .vc-card__btn, .vino-modal-btn-primary, .vino-modal-close, .vino-promo-apply, .vino-qty-btn, .age-gate__submit, .cn-bar__button, .vc-popup__close, .elementor-button, button.vino-book-trigger, .vino-modal-box button',
    input: 'input:not([type=checkbox]):not([type=radio]):not([type=hidden]), select, textarea',
    chip: '.vc-event__sessions a, .vc-share',
    modal: '.vino-modal-box, .vc-popup, .age-gate, .elementor-popup-modal .dialog-widget-content',
    banner: '.cn-bar__container, #cookie-notice .cookie-notice-container',
    footer: '.vc-footer__inner, .vc-footer__col a, .vc-footer__mobile a, .vc-footer__social a, footer .elementor-element.e-con',
  };
  const comp = {};
  for (const [g, sel] of Object.entries(groups)) {
    for (const el of scope.querySelectorAll(sel)) {
      if (!visible(el)) continue;
      const s = getComputedStyle(el), r = el.getBoundingClientRect();
      const cls = (typeof el.className === 'string' ? el.className.split(/\s+/)[0] : '') || el.tagName.toLowerCase();
      const v = `${cls}: radius ${s.borderRadius}; padding ${s.padding}; gap ${s.gap === 'normal' ? '-' : s.gap}; h ${Math.round(r.height)}`;
      comp[g] ??= {}; comp[g][v] = (comp[g][v] || 0) + 1;
    }
  }
  const main = document.querySelector('main') || document.body;
  const sections = [...main.children].filter(visible).map((el) => {
    const s = getComputedStyle(el); const r = el.getBoundingClientRect();
    const texts = [...el.querySelectorAll('h1,h2,h3,p,img,.vc-btn,.vc-card')].filter(visible).map((t) => t.getBoundingClientRect());
    const left = texts.length ? Math.min(...texts.map((t) => t.left)) : null;
    const right = texts.length ? vw - Math.max(...texts.map((t) => t.right)) : null;
    return { el: label(el).split(' "')[0], mt: s.marginTop, mb: s.marginBottom, pt: s.paddingTop, pb: s.paddingBottom, pi: `${s.paddingLeft} ${s.paddingRight}`, h: Math.round(r.height), gutter: left == null ? null : `${Math.round(left)}/${Math.round(right)}` };
  });
  return { overflow, pairs, small, clipped, type, comp, sections };
}

// Element under the centre of each interactive element in the current viewport (covered by another layer?)
function occlusion(scopeSel) {
  const scope = scopeSel ? document.querySelector(scopeSel) : document.body;
  const res = [];
  for (const el of scope.querySelectorAll('a[href], button, input:not([type=hidden]), select, textarea')) {
    const r = el.getBoundingClientRect();
    // only elements wholly in view: a half-visible one would be probed at a clamped point that belongs to a neighbour
    if (r.width < 2 || r.height < 2 || r.top < 0 || r.bottom > innerHeight || r.left < 0 || r.right > innerWidth) continue;
    const s = getComputedStyle(el); if (s.visibility === 'hidden' || s.display === 'none') continue;
    let hidden = false; for (let a = el; a; a = a.parentElement) if (a.hasAttribute?.('hidden') || getComputedStyle(a).display === 'none') hidden = true;
    if (hidden) continue;
    const cx = Math.min(innerWidth - 1, Math.max(0, r.left + r.width / 2)), cy = Math.min(innerHeight - 1, Math.max(0, r.top + r.height / 2));
    const top = document.elementFromPoint(cx, cy);
    if (!top || top === el || el.contains(top) || top.contains(el) && top.tagName === 'LABEL') continue;
    if (el.closest('label') && el.closest('label').contains(top)) continue;
    const name = (x) => `${x.tagName.toLowerCase()}${typeof x.className === 'string' && x.className ? '.' + x.className.split(/\s+/)[0] : ''}`;
    res.push({ el: `${name(el)} "${(el.getAttribute('aria-label') || el.textContent || '').trim().slice(0, 30)}"`, under: name(top), y: Math.round(r.top + scrollY) });
  }
  return res;
}

// ---------------------------------------------------------------- driver
const b = await chromium.launch();
const results = [];
for (const width of widths) {
  const mobile = width < 768;
  mkdirSync(join(out, String(width)), { recursive: true });
  for (const lang of langs) {
    for (const item of plan(lang)) {
      const c = await b.newContext({
        viewport: { width, height: mobile ? 800 : 900 }, deviceScaleFactor: mobile ? 2 : 1, isMobile: mobile, hasTouch: mobile,
        userAgent: mobile ? UA_MOBILE : UA_DESKTOP, locale: lang === 'he' ? 'he-IL' : lang === 'en' ? 'en-US' : 'ru-RU',
      });
      const host = new URL(origin).hostname;
      const cookies = [];
      if (site === 'new') {
        if (item.state !== 'gate') cookies.push({ name: 'age_gate', value: '1', domain: host, path: '/' });
        if (item.state !== 'gate' && item.state !== 'banner') cookies.push({ name: 'vc_consent', value: consent, domain: host, path: '/' });
      } else if (item.state !== 'gate' && item.state !== 'banner') {
        cookies.push({ name: 'cookie_notice_accepted', value: 'true', domain: host, path: '/' });
      }
      if (cookies.length) await c.addCookies(cookies);
      const p = await c.newPage();
      await p.addInitScript((w) => { Object.defineProperty(navigator, 'webdriver', { get: () => false }); window.__auditWidth = w; }, width);
      await p.route('**/*', (r) => {
        const u = r.request().url();
        if (/api\.arenasoldout\.com/.test(u) && r.request().method() !== 'GET') return r.abort();
        if (/googletagmanager|google-analytics|facebook\.net|connect\.facebook/.test(u)) return r.abort();
        if (cssBody && /\/_site\/assets\/[^/]+\.css(\?|$)/.test(u)) return r.fulfill({ status: 200, contentType: 'text/css', body: cssBody });
        return r.continue();
      });
      const rec = { site, width, lang, page: item.name, state: item.state, path: item.path };
      try {
        await p.goto(origin + item.path, { waitUntil: 'load', timeout: 45000 });
        await p.waitForTimeout(1200);
        if (site === 'wp' && item.state !== 'gate') {
          const y = p.locator('.age-gate__submit--yes'); if (await y.count()) { await y.first().click().catch(() => {}); await p.waitForTimeout(1200); }
        }
        let scope = null, full = true;
        if (item.state === 'gate') { scope = '.age-gate__wrapper'; full = false; }
        if (item.state === 'banner') { scope = null; full = false; }
        if (item.state === 'menu') {
          const t = p.locator(site === 'new' ? '[data-vc-burger]' : '.elementor-menu-toggle').filter({ visible: true }).first();
          if (await t.count()) { await t.click(); await p.waitForTimeout(600); } else rec.note = 'no burger at this width';
          scope = site === 'new' ? '.vc-header' : 'header'; full = false;
        }
        if (item.state === 'modal1' || item.state === 'modal2') {
          const btn = p.locator(site === 'new' ? '[data-vino-buy]' : 'button.vino-book-trigger').filter({ visible: true }).first();
          if (!(await btn.count())) throw new Error('no buy button');
          await btn.click({ timeout: 8000 }); await p.waitForTimeout(2000);
          scope = site === 'new' ? '#vino-booking-modal' : '#vino-booking-modal, .vino-modal'; full = false;
          if (item.state === 'modal2') {
            const sel = p.locator('#vino-modal-category');
            if (await sel.count()) {
              const v = await sel.evaluate((s) => [...s.options].find((o) => o.value && !o.disabled)?.value || '');
              if (v) await sel.selectOption(v);
              const next = p.locator('.vino-modal-btn-primary').first();
              await next.click(); await p.waitForTimeout(1200);
            }
            // open the promo code row so its controls are measured too
            const promo = p.locator('.vino-promo-toggle'); if (await promo.count()) { await promo.first().click().catch(() => {}); await p.waitForTimeout(300); }
          }
        }
        // scroll the page once (lazy images) and collect what sits under another layer
        const occ = [];
        if (full) {
          const H = await p.evaluate(() => document.documentElement.scrollHeight);
          for (let y = 0; y < H && y < 40000; y += 800) {
            await p.evaluate((yy) => window.scrollTo(0, yy), y); await p.waitForTimeout(60);
            for (const o of await p.evaluate(occlusion, scope)) if (!occ.some((x) => x.el === o.el && x.y === o.y)) occ.push(o);
          }
          await p.evaluate(() => window.scrollTo(0, 0)); await p.waitForTimeout(300);
        } else occ.push(...(await p.evaluate(occlusion, scope)));
        Object.assign(rec, await p.evaluate(measure, scope), { occluded: occ });
        if (shots) {
          const file = join(out, String(width), `${site === 'wp' ? 'wp-' : ''}${lang}-${item.name}.png`);
          await p.screenshot({ path: file, fullPage: full });
          rec.shot = file;
          if (item.state === 'modal2') {
            // the sheet scrolls inside; a second shot shows its bottom (pay button, back link)
            await p.evaluate(() => { const bx = document.querySelector('.vino-modal-box'); if (bx) bx.scrollTop = bx.scrollHeight; });
            await p.waitForTimeout(300);
            await p.screenshot({ path: file.replace('.png', '-bottom.png') });
          }
        }
      } catch (e) { rec.error = String(e.message || e).split('\n')[0]; }
      results.push(rec);
      const n = (k) => (rec[k] || []).length;
      console.log(`${site} ${width} ${lang} ${item.name}: overflow=${rec.overflow?.over ? 'YES' : 'no'} pairs=${(rec.pairs || []).filter((x) => x.kind === 'overlap').length}/${n('pairs')} small=${n('small')} clipped=${n('clipped')} occluded=${n('occluded')}${rec.error ? ' ERROR ' + rec.error : ''}`);
      await c.close();
    }
  }
}
await b.close();

// ---------------------------------------------------------------- report
mkdirSync(out, { recursive: true });
writeFileSync(join(out, `audit-${tag}.json`), JSON.stringify(results, null, 1));
const lines = [];
for (const r of results) {
  lines.push(`\n## ${r.site} ${r.width} ${r.lang} ${r.page} (${r.path})${r.error ? '  ERROR: ' + r.error : ''}`);
  if (r.error) continue;
  if (r.overflow.over) lines.push(`  OVERFLOW layout ${r.overflow.innerWidth} / scrollWidth ${r.overflow.scrollWidth} > ${r.overflow.width}: ${r.overflow.wide.join("; ")}`);
  for (const x of r.pairs.filter((x) => x.kind !== 'touch')) lines.push(`  ${x.kind.toUpperCase()} ${x.dist}px ${x.overlap} y=${x.y}: ${x.a}  <->  ${x.b}`);
  const touch = r.pairs.filter((x) => x.kind === 'touch').length; if (touch) lines.push(`  touching pairs (gap 0, e.g. stacked list rows): ${touch}`);
  for (const x of r.occluded) lines.push(`  COVERED y=${x.y}: ${x.el} under ${x.under}`);
  for (const x of r.clipped) lines.push(`  CLIPPED ${x.what}: ${x.el} ${JSON.stringify(x).slice(0, 120)}`);
  if (r.small.length) lines.push(`  small targets (<44): ${r.small.length}: ` + r.small.slice(0, 12).map((x) => `${x.el} ${x.w}x${x.h}`).join('; '));
  for (const [role, v] of Object.entries(r.type)) lines.push(`  type ${role}: ` + Object.entries(v).map(([k, o]) => `${k} x${o.n}`).join(' | '));
}
writeFileSync(join(out, `audit-${tag}.txt`), lines.join('\n'));
console.log(`\nwrote ${join(out, `audit-${tag}.json`)} and .txt (${results.length} runs)`);
