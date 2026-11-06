import type { APIRoute } from 'astro';
import { languages, siteUrl } from '../../site.config.ts';
import { eventPath, pagePaths, personalPages, type PageKey } from '../lib/routes.ts';
import { siteEvents } from '../lib/events.ts';

/**
 * /sitemap.xml at the same address as on WordPress (Slim SEO). Lists every page
 * with its language alternates; unlisted events and personal pages stay out (§6.3, §5.6).
 */
export const GET: APIRoute = () => {
  const groups: Record<string, string>[] = [];
  for (const [key, paths] of Object.entries(pagePaths) as [PageKey, Record<string, string>][]) {
    if (personalPages.includes(key)) continue;
    groups.push(paths);
  }
  for (const e of siteEvents()) {
    if (!e.listed) continue;
    groups.push(Object.fromEntries(languages.map((l) => [l.code, eventPath(e.slug, l.code)])));
  }
  const abs = (p: string) => new URL(p, siteUrl).href;
  const urls = groups.flatMap((g) =>
    languages.map((l) => {
      const alts = languages.map((a) => `    <xhtml:link rel="alternate" hreflang="${a.code}" href="${abs(g[a.code]!)}"/>`).join('\n');
      return `  <url>\n    <loc>${abs(g[l.code]!)}</loc>\n${alts}\n    <xhtml:link rel="alternate" hreflang="x-default" href="${abs(g.ru!)}"/>\n  </url>`;
    }),
  );
  const body = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9" xmlns:xhtml="http://www.w3.org/1999/xhtml">\n${urls.join('\n')}\n</urlset>\n`;
  return new Response(body, { headers: { 'Content-Type': 'application/xml; charset=utf-8' } });
};
