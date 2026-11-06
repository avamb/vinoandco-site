// Sanity check of the build: required pages in ru/en/he, one <h1>, lang/dir,
// title, no inline style attributes (CSP), personal pages noindex.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const root = decodeURIComponent(new URL('../', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const dist = join(root, 'dist');
const required = {
  ru: ['/', '/upcoming-events/', '/past-events/', '/private-events/', '/about-us/', '/contact-us/', '/terms-conditions/', '/privacy-policy/', '/refund_returns/', '/order-status/', '/my-tickets/'],
  en: ['/en/', '/en/upcoming-events/', '/en/past-events/', '/en/private-events/', '/en/about-us/', '/en/contact-us/', '/en/terms-conditions/', '/en/privacy-policy/', '/en/return-policy/', '/en/order-status/', '/en/my-tickets/'],
  he: ['/he/', '/he/yrwy-krwby/', '/he/yrwy-kwdmy/', '/he/yrwy-phrtyy/', '/he/wdwthynw/', '/he/swr-kshr/', '/he/thny-whgblwth/', '/he/mdynywth-phrtywth/', '/he/mdynywth-hxzrwth/', '/he/order-status/', '/he/my-tickets/'],
};
const errors = [];
let n = 0;
for (const [lang, paths] of Object.entries(required)) {
  for (const p of paths) {
    const file = join(dist, p, 'index.html');
    if (!existsSync(file)) { errors.push(`missing ${p}`); continue; }
    n++;
    const html = readFileSync(file, 'utf8');
    if (!html.includes(`<html lang="${lang}" dir="${lang === 'he' ? 'rtl' : 'ltr'}"`)) errors.push(`${p}: wrong lang/dir`);
    if (!/<title>[^<]+<\/title>/.test(html)) errors.push(`${p}: no title`);
    const h1 = (html.match(/<h1[\s>]/g) || []).length;
    if (h1 !== 1) errors.push(`${p}: ${h1} <h1>`);
    if (/\sstyle="/.test(html)) errors.push(`${p}: inline style attribute`);
    if (/(order-status|my-tickets)/.test(p) && !html.includes('noindex')) errors.push(`${p}: personal page without noindex`);
    if (/(order-status|my-tickets)/.test(p) && /googletagmanager|fbevents|tracking/.test(html)) errors.push(`${p}: tracking on a personal page`);
  }
}
for (const f of ['404.html', 'en/404/index.html', 'he/404/index.html', 'robots.txt', 'sitemap.xml', '.nginx/csp-hashes.conf', '.nginx/redirects.conf']) {
  if (!existsSync(join(dist, f))) errors.push(`missing ${f}`);
}
if (errors.length) {
  console.error(errors.join('\n'));
  process.exit(1);
}
console.log(`dist: ${n} required pages in ru/en/he OK`);
