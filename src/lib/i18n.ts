import ru from '../i18n/ru.json';
import en from '../i18n/en.json';
import he from '../i18n/he.json';
import { languages, type Language, type LanguageCode } from '../../site.config.ts';

export type UiStrings = typeof ru;

const dict: Record<LanguageCode, UiStrings> = { ru, en, he };

export function ui(lang: LanguageCode): UiStrings {
  return dict[lang];
}

export function language(lang: LanguageCode): Language {
  const l = languages.find((x) => x.code === lang);
  if (!l) throw new Error(`unknown language ${lang}`);
  return l;
}
