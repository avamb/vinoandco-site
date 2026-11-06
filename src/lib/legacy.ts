/**
 * Past events from before the Arena platform (Bil24 era): static cards kept in
 * src/content/past-legacy/, one JSON file per event, poster under
 * public/_site/img/past/. They are listed after the platform's past events.
 */
import type { LanguageCode } from '../../site.config.ts';

export interface LegacyEvent {
  slug: string;
  date: string;
  poster: string;
  title: Record<LanguageCode, string>;
}

const files = import.meta.glob<{ default: LegacyEvent }>('../content/past-legacy/*.json', { eager: true });

export function legacyEvents(): LegacyEvent[] {
  return Object.values(files)
    .map((m) => m.default)
    .sort((a, b) => b.date.localeCompare(a.date));
}
