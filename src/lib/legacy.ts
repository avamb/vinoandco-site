/**
 * Past events from before the Arena platform (Bil24 era): static cards in
 * src/content/past-legacy/, one JSON per WordPress product, generated once by
 * scripts/import-past-legacy.mjs from docs/reference/wp-products-export.json.
 * Posters live in public/_site/img/past/. Each keeps its WordPress address in
 * every language (`slug`); a language WordPress had no page in repeats the ru
 * text at the ru slug.
 */
import type { LanguageCode } from '../../site.config.ts';
import { sanitizeHtml } from './sanitize.ts';

export interface LegacyEvent {
  wp_id: number;
  /** Israel local time "2025-11-14T19:00", or null when WordPress had no date. */
  date: string | null;
  city: string;
  venue: string;
  address: string;
  poster: string | null;
  slug: Record<LanguageCode, string>;
  translated: Record<LanguageCode, boolean>;
  title: Record<LanguageCode, string>;
  description_html: Record<LanguageCode, string>;
}

const files = import.meta.glob<{ default: LegacyEvent }>('../content/past-legacy/*.json', { eager: true });

/** Sort key shared with the platform's past events: local date-time, newest first; undated last. */
export function legacySortKey(e: LegacyEvent): string {
  return e.date ?? `0000-${String(e.wp_id).padStart(8, '0')}`;
}

export function legacyEvents(): LegacyEvent[] {
  return Object.values(files)
    .map((m) => m.default)
    .map((e) => ({ ...e, description_html: Object.fromEntries(Object.entries(e.description_html).map(([k, v]) => [k, sanitizeHtml(v)])) as Record<LanguageCode, string> }))
    .sort((a, b) => legacySortKey(b).localeCompare(legacySortKey(a)));
}
