import type { APIRoute } from 'astro';
import { indexing, siteUrl } from '../../site.config.ts';

/** Staging (SITE_INDEXING=false) disallows everything; production allows all but personal pages. */
export const GET: APIRoute = () => {
  const body = indexing
    ? ['User-agent: *', 'Disallow: /order-status/', 'Disallow: /my-tickets/', 'Disallow: /en/order-status/', 'Disallow: /en/my-tickets/', 'Disallow: /he/order-status/', 'Disallow: /he/my-tickets/', '', `Sitemap: ${new URL('/sitemap.xml', siteUrl).href}`, ''].join('\n')
    : ['User-agent: *', 'Disallow: /', ''].join('\n');
  return new Response(body, { headers: { 'Content-Type': 'text/plain; charset=utf-8' } });
};
