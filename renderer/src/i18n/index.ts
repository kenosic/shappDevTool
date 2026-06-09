import { useCallback } from "react";
import { create } from "zustand";
import { zh } from "./locales/zh";
import { en } from "./locales/en";

export type Lang = "zh" | "en";

const DICTS: Record<Lang, Record<string, string>> = { zh, en };

const STORAGE_KEY = "devtool-lang";

export type TParams = Record<string, string | number>;

function detectInitialLang(): Lang {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "zh" || saved === "en") return saved;
  } catch {
    // ignore
  }
  return typeof navigator !== "undefined" && navigator.language.toLowerCase().startsWith("zh")
    ? "zh"
    : "en";
}

function interpolate(template: string, params?: TParams): string {
  if (!params) return template;
  return template.replace(/\{(\w+)\}/g, (_, key) =>
    key in params ? String(params[key]) : `{${key}}`
  );
}

/** Translate a key for an explicit language. Falls back to zh, then the key itself. */
export function translate(lang: Lang, key: string, params?: TParams): string {
  const template = DICTS[lang][key] ?? DICTS.zh[key] ?? key;
  return interpolate(template, params);
}

interface I18nState {
  lang: Lang;
  setLang: (lang: Lang) => void;
}

export const useI18nStore = create<I18nState>((set) => ({
  lang: detectInitialLang(),
  setLang: (lang) => {
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // ignore
    }
    set({ lang });
  },
}));

/** Standalone translation for use outside React components (e.g. zustand stores). */
export function t(key: string, params?: TParams): string {
  return translate(useI18nStore.getState().lang, key, params);
}

/** React hook returning a translation function bound to the current language. */
export function useT(): (key: string, params?: TParams) => string {
  const lang = useI18nStore((s) => s.lang);
  return useCallback((key: string, params?: TParams) => translate(lang, key, params), [lang]);
}

/** Returns the BCP-47 locale string matching the current language. */
export function localeTag(lang: Lang): string {
  return lang === "zh" ? "zh-CN" : "en-US";
}
