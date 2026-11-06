/**
 * Page texts copied from WordPress (src/content/{ru,en,he}/). JSON for pages
 * built from blocks, HTML for legal documents (kept as they are, Р-5).
 */
import type { LanguageCode } from '../../site.config.ts';

export interface PageMeta {
  title: string;
  description: string;
}

export interface HomeContent extends PageMeta {
  hero: { title: string; subtitle: string; text: string; clubButton: string };
  features: { title: string; text: string }[];
  sections: { title: string; text: string; button: string; href: string }[];
}

export interface BlocksContent extends PageMeta {
  h1: string;
  h2: string[];
  h4: string[];
  texts: string[];
  buttons: string[];
}

export interface LegalContent extends PageMeta {
  h1: string;
  html: string;
}

const json = import.meta.glob<{ default: unknown }>('../content/{ru,en,he}/*.json', { eager: true });
const html = import.meta.glob<string>('../content/{ru,en,he}/*.html', { eager: true, query: '?raw', import: 'default' });

function load<T>(lang: LanguageCode, name: string): T {
  const mod = json[`../content/${lang}/${name}.json`];
  if (!mod) throw new Error(`missing content ${lang}/${name}.json`);
  return mod.default as T;
}

export function homeContent(lang: LanguageCode): HomeContent {
  return load<HomeContent>(lang, 'home');
}

export function blocksContent(lang: LanguageCode, name: 'about' | 'private' | 'contact' | 'upcoming' | 'past'): BlocksContent {
  return load<BlocksContent>(lang, name);
}

export function legalContent(lang: LanguageCode, name: 'terms' | 'privacy' | 'refund'): LegalContent {
  const meta = load<PageMeta & { h1: string }>(lang, `${name}.meta`);
  const body = html[`../content/${lang}/${name}.html`];
  if (body === undefined) throw new Error(`missing content ${lang}/${name}.html`);
  return { ...meta, html: body };
}

/** WordPress absolute links inside copied texts become site-relative. */
export function localizeLinks(s: string): string {
  return s.replace(/https:\/\/vinoandco\.events(?=\/|")/g, '');
}
