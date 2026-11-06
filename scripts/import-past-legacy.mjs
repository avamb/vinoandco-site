// One-off: Bil24-era past events from the WordPress export -> src/content/past-legacy/.
//
//   node scripts/import-past-legacy.mjs            write the JSON cards, download and shrink the posters
//   node scripts/import-past-legacy.mjs --no-fetch JSON only (posters already in public/_site/img/past/)
//
// Source: docs/reference/wp-products-export.json (36 WooCommerce products, ru
// with WPML translations). Products of today's platform events are left out:
// an `arena_event_id`, or a numeric `bil24_action_id` of 267450 or more (the
// first event migrated to the platform). The rest are the Bil24-era events the
// platform does not have; each keeps its WordPress address in every language
// it had, and gets the ru one in the languages it had not.
//
// Edit the generated JSON by hand afterwards if needed; re-running overwrites it.
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const root = decodeURIComponent(new URL('../', import.meta.url).pathname).replace(/^\/([A-Za-z]:)/, '$1');
const products = JSON.parse(readFileSync(join(root, 'docs/reference/wp-products-export.json'), 'utf8'));
const outDir = join(root, 'src/content/past-legacy');
const imgDir = join(root, 'public/_site/img/past');
const fetchPosters = !process.argv.includes('--no-fetch');
const FIRST_PLATFORM_ACTION = 267450;

const isPlatform = (p) => Boolean(p.arena_event_id) || (/^\d+$/.test(p.bil24_action_id) && Number(p.bil24_action_id) >= FIRST_PLATFORM_ACTION);
const legacy = products.filter((p) => !isPlatform(p));

/** WordPress keeps a non-Latin slug percent-encoded; the page folder is the decoded one. */
const slugOf = (s) => {
  try {
    return decodeURIComponent(s);
  } catch {
    return s;
  }
};

/** "2025-11-14 19:00:00" (Israel local time) -> "2025-11-14T19:00", or null. */
const dateOf = (s) => (s && /^\d{4}-\d{2}-\d{2} \d{2}:\d{2}/.test(s) ? s.slice(0, 16).replace(' ', 'T') : null);

/** WordPress excerpt -> paragraphs; tags are cleaned again at build time (src/lib/sanitize.ts). */
const excerptHtml = (s) =>
  (s ?? '')
    .replace(/\r\n/g, '\n')
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => `<p>${p.replace(/\n/g, '<br>')}</p>`)
    .join('');

/** Titles carry stray zero-width and direction marks from the WordPress editor. */
const clean = (s) => (s ?? '').replace(/[​‎‏﻿]/g, '').trim();

const city = (s) => (s === 'Нетания' ? 'Netanya' : s);

async function poster(url, name) {
  if (!url) return null;
  const file = `${name}.jpg`;
  const path = join(imgDir, file);
  if (fetchPosters && !existsSync(path)) {
    const res = await fetch(url, { headers: { 'User-Agent': 'vinoandco-site importer' } });
    if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`);
    const { default: sharp } = await import('sharp');
    const buf = await sharp(Buffer.from(await res.arrayBuffer()), { failOn: 'none' })
      .rotate()
      .resize({ width: 900, height: 900, fit: 'inside', withoutEnlargement: true })
      .flatten({ background: '#ffffff' })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer();
    writeFileSync(path, buf);
    console.log(`poster ${file}: ${Math.round(buf.length / 1024)} KB`);
  }
  return existsSync(path) || fetchPosters ? `/_site/img/past/${file}` : null;
}

mkdirSync(outDir, { recursive: true });
mkdirSync(imgDir, { recursive: true });
for (const f of readdirSync(outDir)) if (f.endsWith('.json')) rmSync(join(outDir, f));

let n = 0;
for (const p of legacy) {
  const en = p.translations?.en;
  const he = p.translations?.he;
  const ruSlug = slugOf(p.slug);
  const card = {
    wp_id: p.id,
    date: dateOf(p.date),
    city: city(p.city || ''),
    venue: p.venue || '',
    address: p.address || '',
    poster: await poster(p.poster, `wp-${p.id}`),
    poster_source: p.poster || null,
    slug: { ru: ruSlug, en: en?.slug ? slugOf(en.slug) : ruSlug, he: he?.slug ? slugOf(he.slug) : ruSlug },
    /** Languages WordPress had a page in; the others repeat the ru text (as Р-7 for events). */
    translated: { ru: true, en: Boolean(en?.slug), he: Boolean(he?.slug) },
    title: { ru: clean(p.title), en: clean(en?.title || p.title), he: clean(he?.title || p.title) },
    description_html: { ru: excerptHtml(p.excerpt), en: excerptHtml(en?.excerpt || p.excerpt), he: excerptHtml(he?.excerpt || p.excerpt) },
  };
  writeFileSync(join(outDir, `wp-${p.id}.json`), JSON.stringify(card, null, 2) + '\n');
  n++;
}
console.log(`${n} past events written to src/content/past-legacy/ (${products.length - n} platform events left out)`);
