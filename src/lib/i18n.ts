import i18n from "i18next";
import { initReactI18next } from "react-i18next";
import en from "@/locales/en.json";
import zh from "@/locales/zh.json";
import fr from "@/locales/fr.json";
import ja from "@/locales/ja.json";
import ko from "@/locales/ko.json";

export const LANGUAGE_STORAGE_KEY = "edusync_lang";

export type AppLanguage = "en" | "zh" | "fr" | "ja" | "ko";

const VALID_LANGUAGES: AppLanguage[] = ["en", "zh", "fr", "ja", "ko"];

export function getStoredLanguage(): AppLanguage {
  try {
    const stored = localStorage.getItem(LANGUAGE_STORAGE_KEY);
    if (stored && VALID_LANGUAGES.includes(stored as AppLanguage)) {
      return stored as AppLanguage;
    }
  } catch {
    // ignore
  }
  return "en";
}

export async function changeAppLanguage(lang: AppLanguage): Promise<void> {
  await i18n.changeLanguage(lang);
  try {
    localStorage.setItem(LANGUAGE_STORAGE_KEY, lang);
  } catch {
    // ignore
  }
}

void i18n.use(initReactI18next).init({
  resources: {
    en: { translation: en },
    zh: { translation: zh },
    fr: { translation: fr },
    ja: { translation: ja },
    ko: { translation: ko },
  },
  lng: getStoredLanguage(),
  fallbackLng: {
    fr: ["en"],
    ja: ["en"],
    ko: ["en"],
    default: ["en"],
  },
  interpolation: {
    escapeValue: false,
  },
});

export default i18n;
