export type Locale = 'en' | 'my';

export const SUPPORTED_LOCALES: Locale[] = ['en', 'my'];

export interface PluralRules {
  zero?: (n: number) => string;
  one?: (n: number) => string;
  two?: (n: number) => string;
  few?: (n: number) => string;
  many?: (n: number) => string;
  other?: (n: number) => string;
}

export interface CompiledMessage {
  message: string;
  values?: Record<string, string | number>;
  plural?: PluralRules;
}

export interface Translation {
  [key: string]: string | CompiledMessage | Translation | undefined;
}

export interface I18nOptions {
  locale: Locale;
  translations: Record<Locale, Translation>;
  fallbackLocale?: Locale;
}

let currentLocale: Locale = 'en';
let translations: Record<Locale, Translation> = {
  en: {} as Translation,
  my: {} as Translation,
};
let fallbackLocale: Locale = 'en';

function interpolate(message: string, values: Record<string, string | number> = {}): string {
  return message.replace(/\{([^}]+)\}/g, (_match, key) => {
    const value = values[key];
    return value === undefined ? `{${key}}` : String(value);
  });
}

function isTranslation(value: unknown): value is Translation {
  return typeof value === 'object' && value !== null;
}

function isCompiledMessage(node: unknown): node is CompiledMessage {
  return typeof node === 'object' && node !== null && 'message' in node;
}

export function compileMessage(
  node: string | CompiledMessage | Translation,
  values: Record<string, string | number> = {},
): CompiledMessage {
  if (typeof node === 'string') {
    return { message: node, values };
  }
  if (typeof node === 'object' && node !== null) {
    const maybe = node as CompiledMessage & Record<string, unknown>;
    const { message, values: nodeValues, plural, ...rest } = maybe;
    const resolvedValues = { ...values, ...nodeValues };
    if (plural) {
      return {
        message: '',
        values: resolvedValues,
        plural,
      };
    }
    for (const key of Object.keys(rest)) {
      const child = rest[key];
      if (typeof child === 'string' || typeof child === 'object' || Array.isArray(child)) {
        // nested translation keys are not supported in i18n v1; skip
      }
    }
    return { message: message ?? '', values: resolvedValues };
  }
  return { message: '', values };
}

export function formatPlural(
  message: CompiledMessage,
  count: number,
  values: Record<string, string | number> = {},
): string {
  const { plural, message: base } = message;
  if (!plural) {
    return interpolate(base, values);
  }
  const keys = Object.keys(plural) as (keyof PluralRules)[];
  let key: keyof PluralRules | undefined = undefined;
  for (const k of keys) {
    if (k === 'other') {
      key = k;
      break;
    }
    const num = Number(count);
    if (k === 'zero') {
      if (num === 0) { key = k; break; }
    } else if (k === 'one') {
      if (num === 1) { key = k; break; }
    } else if (k === 'two') {
      if (num === 2) { key = k; break; }
    } else if (k === 'few') {
      if ([2, 3, 4].includes(num)) { key = k; break; }
    } else if (k === 'many') {
      if (num % 10 === 0 || (num >= 10 && num < 20)) { key = k; break; }
    }
  }
  const fn = key ? plural[key] : undefined;
  return fn ? interpolate(fn(count), values) : base;
}

export function loadTranslations(options: I18nOptions): void {
  currentLocale = options.locale;
  translations = options.translations;
  fallbackLocale = options.fallbackLocale ?? 'en';
}

export function setLocale(locale: Locale): void {
  currentLocale = locale;
}

export function getLocale(): Locale {
  return currentLocale;
}

export function t(key: string, values: Record<string, string | number> = {}): string {
  const segments = key.split('.');
  let node: Translation | undefined = translations[currentLocale];
  let i = 0;

  while (i < segments.length) {
    const seg = segments[i];
    if (node && typeof node === 'object' && seg !== undefined && seg in node) {
      node = node[seg] as Translation | undefined;
    } else {
      node = undefined;
      break;
    }
    i++;
  }

  if (node === undefined || node === null) {
    node = translations[fallbackLocale];
    if (node) {
      let path = '';
      for (let j = 0; j <= i; j++) {
        path += (j > 0 ? '.' : '') + segments[j];
      }
      if (path in node) {
        node = node[path] as Translation;
      } else {
        return key;
      }
    } else {
      return key;
    }
  }

  if (typeof node === 'string') {
    return interpolate(node, values);
  }
  if (isTranslation(node) && isCompiledMessage(node)) {
    const msg = node;
    if ('plural' in msg && msg.plural) {
      return formatPlural(msg, Number(values.count ?? 1), { ...msg.values, ...values });
    }
    return interpolate(msg.message, { ...msg.values, ...values });
  }
  return key;
}

export function formatMessage(key: string, values: Record<string, string | number> = {}): string {
  return t(key, values);
}

export function getTranslations(): Record<Locale, Translation> {
  return translations;
}

export function getAvailableLocales(): Locale[] {
  return SUPPORTED_LOCALES;
}

export function getActiveLocale(): Locale {
  return currentLocale;
}

export function capitalizeFirst(text: string): string {
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export { I18nProvider, useI18n, useLocale } from './context.js';
