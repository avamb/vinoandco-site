// Cloudflare cache purge after a publish (spec 62 §9 "CDN"): the changed HTML,
// sitemap and removed addresses. The zone belongs to the site owner's
// Cloudflare account; the token (Zone.Cache Purge) and the zone id come only
// from the builder's environment (CF_API_TOKEN, CF_ZONE_ID). Without them the
// purge is skipped, never an error.

/** Cloudflare accepts at most 30 URLs per purge call. */
export const PURGE_BATCH = 30;
/** Past this many URLs one "purge everything" is cheaper than many calls. */
export const PURGE_EVERYTHING_OVER = 300;

export function purgeUrls(siteUrl, paths) {
  const origin = siteUrl.replace(/\/+$/, '');
  const urls = new Set();
  for (const p of paths) {
    if (p === '/404.html') continue;
    urls.add(origin + p);
    // A page answers at /x/ and, through the old WordPress rule, at /x too.
    if (p.endsWith('/') && p !== '/') urls.add(origin + p.slice(0, -1));
  }
  return [...urls];
}

export async function purgeCloudflare(urls, { token, zoneId, fetch: doFetch = fetch, log = () => {} } = {}) {
  if (!token || !zoneId) return { skipped: true, reason: 'CF_API_TOKEN / CF_ZONE_ID not set' };
  if (!urls.length) return { skipped: true, reason: 'nothing changed' };
  const endpoint = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(zoneId)}/purge_cache`;
  const call = async (body) => {
    const res = await doFetch(endpoint, {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    let json = null;
    try {
      json = await res.json();
    } catch {
      /* not JSON */
    }
    if (!res.ok || json?.success === false) {
      const msg = json?.errors?.map((e) => `${e.code} ${e.message}`).join('; ') || `HTTP ${res.status}`;
      throw new Error(`cloudflare purge failed: ${msg}`);
    }
  };
  if (urls.length > PURGE_EVERYTHING_OVER) {
    await call({ purge_everything: true });
    log(`cloudflare: purged everything (${urls.length} urls changed)`);
    return { skipped: false, everything: true, count: urls.length };
  }
  for (let i = 0; i < urls.length; i += PURGE_BATCH) {
    await call({ files: urls.slice(i, i + PURGE_BATCH) });
  }
  log(`cloudflare: purged ${urls.length} url(s)`);
  return { skipped: false, everything: false, count: urls.length };
}
