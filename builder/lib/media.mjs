// Posters and photos: the feed gives signed links valid for about a day, so the
// builder downloads each media file once (by its id — a media id never changes
// its bytes), shrinks it and keeps it in the data volume. The site links to
// /_site/media/<id>.jpg, never to the platform.
import { existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

export const MEDIA_URL_PREFIX = '/_site/media/';
/** Longest side of a stored image: posters are shown at most ~900 px wide. */
export const MAX_SIDE = 1400;

export function mediaFileName(id) {
  return `${id}.jpg`;
}

/** Default image optimizer: sharp, JPEG q82, at most MAX_SIDE px, transparency on white. */
export async function optimizeImage(buf) {
  const { default: sharp } = await import('sharp');
  return sharp(buf, { failOn: 'none' })
    .rotate()
    .resize({ width: MAX_SIDE, height: MAX_SIDE, fit: 'inside', withoutEnlargement: true })
    .flatten({ background: '#ffffff' })
    .jpeg({ quality: 82, mozjpeg: true })
    .toBuffer();
}

/**
 * Makes sure every media ref is in `dir`. Returns { files, errors }: `files`
 * maps media id -> site path for every file present, `errors` lists the ids
 * that could not be fetched (the build then shows no image there).
 */
export async function syncMedia(refs, dir, { fetch: doFetch = fetch, optimize = optimizeImage, log = () => {} } = {}) {
  mkdirSync(dir, { recursive: true });
  const files = {};
  const errors = [];
  for (const { id, url } of refs) {
    const name = mediaFileName(id);
    const path = join(dir, name);
    if (existsSync(path)) {
      files[id] = MEDIA_URL_PREFIX + name;
      continue;
    }
    try {
      const res = await doFetch(url, { headers: { Accept: 'image/*' } });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const type = res.headers.get('content-type') || '';
      if (!type.startsWith('image/')) throw new Error(`not an image (${type || 'no content type'})`);
      const buf = Buffer.from(await res.arrayBuffer());
      writeFileSync(path, await optimize(buf));
      files[id] = MEDIA_URL_PREFIX + name;
      log(`media ${id}: downloaded`);
    } catch (e) {
      errors.push({ id, error: String(e?.message ?? e) });
      log(`media ${id}: ${e?.message ?? e}`);
    }
  }
  return { files, errors };
}
