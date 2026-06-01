//i18n setup for the app.

import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import LanguageDetector from 'i18next-browser-languagedetector';

import enTranslations from './locales/en.json';
import swTranslations from './locales/sw.json';

export const SUPPORTED_LANGUAGES = [
  { code: 'en', label: 'English', nativeLabel: 'English' },
  { code: 'sw', label: 'Swahili', nativeLabel: 'Kiswahili' },
];

i18n
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    resources: {
      en: { translation: enTranslations },
      sw: { translation: swTranslations },
    },
    fallbackLng: 'en',
    supportedLngs: ['en', 'sw'],
    interpolation: {
      escapeValue: false, // React already escapes
    },
    detection: {
      // Order: read from localStorage first, then browser, then HTML lang attr
      order: ['localStorage', 'navigator', 'htmlTag'],
      caches: ['localStorage'],
      lookupLocalStorage: 'sales_app_language',
    },
  });

export default i18n;
