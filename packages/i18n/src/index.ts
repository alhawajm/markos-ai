import type { Locale } from "@markos/shared-types";

const dictionaries = {
  ar: {
    "app.name": "MARKOS AI",
    "shell.title": "نظام التسويق الذكي",
    "shell.subtitle": "ابدأ من الأساس: مساحة عمل آمنة، ذاكرة أعمال، وتجربة عربية من الشاشة الأولى.",
    "nav.dashboard": "لوحة التحكم",
    "nav.vault": "الخزنة",
    "nav.strategy": "الاستراتيجية",
    "nav.content": "المحتوى",
    "nav.schedule": "الجدولة",
    "nav.analytics": "التحليلات",
    "nav.ai": "المستشار الذكي",
    "nav.settings": "الإعدادات",
    "status.foundation": "مرحلة التأسيس"
  },
  en: {
    "app.name": "MARKOS AI",
    "shell.title": "AI Marketing Operating System",
    "shell.subtitle": "Foundation first: secure workspace, business memory, and Arabic-ready UX from screen one.",
    "nav.dashboard": "Dashboard",
    "nav.vault": "Vault",
    "nav.strategy": "Strategy",
    "nav.content": "Content",
    "nav.schedule": "Schedule",
    "nav.analytics": "Analytics",
    "nav.ai": "AI Consultant",
    "nav.settings": "Settings",
    "status.foundation": "Foundation phase"
  }
} as const;

type TranslationKey = keyof typeof dictionaries.en;

export function directionForLocale(locale: Locale): "rtl" | "ltr" {
  return locale === "ar" ? "rtl" : "ltr";
}

export function t(locale: Locale, key: TranslationKey): string {
  return dictionaries[locale][key];
}
