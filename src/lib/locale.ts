import type { Locale } from "date-fns";
import { enUS, fr, ja, ko, zhCN } from "date-fns/locale";
import type { AppLanguage } from "@/lib/i18n";

const DATE_FNS_LOCALES: Record<AppLanguage, Locale> = {
  en: enUS,
  zh: zhCN,
  fr,
  ja,
  ko,
};

const HTML_LANG: Record<AppLanguage, string> = {
  en: "en",
  zh: "zh-CN",
  fr: "fr",
  ja: "ja",
  ko: "ko",
};

export function resolveAppLanguage(lang: string): AppLanguage {
  const code = lang.split("-")[0] as AppLanguage;
  if (code in DATE_FNS_LOCALES) {
    return code;
  }
  return "en";
}

export function getDateFnsLocale(lang: string): Locale {
  return DATE_FNS_LOCALES[resolveAppLanguage(lang)];
}

export function getHtmlLang(lang: string): string {
  return HTML_LANG[resolveAppLanguage(lang)];
}

export function syncDocumentLanguage(lang: string): void {
  if (typeof document !== "undefined") {
    document.documentElement.lang = getHtmlLang(lang);
  }
}
