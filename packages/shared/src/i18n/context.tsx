import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from 'react';
import type { Locale } from './index';
import { LOCALE_MESSAGES } from './locales.js';
import { getAvailableLocales, getLocale, loadTranslations, setLocale, SUPPORTED_LOCALES, t } from './index';

let initialLocale: Locale | null = null;

function readStoredLocale(): Locale {
  if ((globalThis as any).window === undefined) return 'en';
  try {
    const stored = (globalThis as any).window.localStorage.getItem('myanmart.locale');
    if (stored && SUPPORTED_LOCALES.includes(stored as Locale)) {
      return stored as Locale;
    }
    if (typeof navigator !== 'undefined' && navigator.language) {
      const supported = SUPPORTED_LOCALES.some((l) =>
        l === 'my' ? navigator.language.toLowerCase().startsWith('my') : l === navigator.language.toLowerCase(),
      );
      if (supported) {
        const locales = getAvailableLocales();
        return locales.length > 0 ? (locales[0] as Locale) : 'en';
      }
    }
  } catch {
    // ignore storage errors
  }
  return 'en';
}

export function setInitialLocale(locale: Locale | null) {
  initialLocale = locale;
}

export function loadInitialLocale(): Locale {
  if (initialLocale !== null) {
    const saved = initialLocale;
    initialLocale = null;
    return saved;
  }
  return readStoredLocale();
}

interface I18nContextValue {
  locale: Locale;
  availableLocales: Locale[];
  setLocale: (locale: Locale) => void;
  t: typeof t;
}

const I18nContext = createContext<I18nContextValue | null>(null);

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => {
    const stored = readStoredLocale();
    if (initialLocale !== null) {
      initialLocale = null;
      return stored;
    }
    return stored;
  });

  // Ensure translations are available on the very first render.
  loadTranslations({ locale, translations: LOCALE_MESSAGES, fallbackLocale: 'en' });

  const setLocaleCallback = useCallback((next: Locale) => {
    setLocaleState(next);
    try {
      (globalThis as any).window.localStorage.setItem('myanmart.locale', next);
    } catch {
      // ignore storage errors
    }
    setLocale(next);
  }, []);

  const value = useMemo<I18nContextValue>(
    () => ({
      locale,
      availableLocales: getAvailableLocales(),
      setLocale: setLocaleCallback,
      t: (key: string, values: Record<string, string | number> = {}) => t(key, values),
    }),
    [locale, setLocaleCallback],
  );

  useEffect(() => {
    loadTranslations({
      locale,
      translations: LOCALE_MESSAGES,
      fallbackLocale: 'en',
    });
  }, [locale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const context = useContext(I18nContext);
  if (!context) {
    throw new Error('useI18n must be used within an I18nProvider');
  }
  return context;
}

export function useLocale(): Locale {
  return getLocale();
}
