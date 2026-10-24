import en from './en.json';
import my from './my.json';

export const LOCALE_FILES: Record<import('./index').Locale, unknown> = {
  en,
  my,
};

export const LOCALE_MESSAGES: Record<import('./index').Locale, import('./index').Translation> = {
  en: en as unknown as import('./index').Translation,
  my: my as unknown as import('./index').Translation,
};


