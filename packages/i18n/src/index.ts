import type { Locale } from "@markos/shared-types";

const dictionaries = {
  ar: {
    "app.name": "MARKOS AI",
    "shell.title": "نظام تشغيل التسويق الذكي",
    "shell.subtitle": "ابدأ من الأساس: مساحة عمل آمنة، ذاكرة أعمال قابلة للاسترجاع، وتجربة عربية من الشاشة الأولى.",
    "nav.dashboard": "لوحة التحكم",
    "nav.vault": "الخزنة",
    "nav.campaigns": "الحملات",
    "nav.content": "المحتوى",
    "nav.schedule": "الجدولة",
    "nav.analytics": "التحليلات",
    "nav.audience": "الجمهور",
    "nav.channels": "القنوات",
    "nav.ai": "المستشار الذكي",
    "nav.settings": "الإعدادات",
    "nav.admin": "الإدارة",
    "status.foundation": "مرحلة التأسيس"
  },
  en: {
    "app.name": "MARKOS AI",
    "shell.title": "AI Marketing Operating System",
    "shell.subtitle": "Foundation first: secure workspace, business memory, and Arabic-ready UX from screen one.",
    "nav.dashboard": "Dashboard",
    "nav.vault": "Vault",
    "nav.campaigns": "Campaigns",
    "nav.content": "Content Creator",
    "nav.schedule": "Publishing Queue",
    "nav.analytics": "Analytics",
    "nav.audience": "Audience",
    "nav.channels": "Channels",
    "nav.ai": "AI Assistant",
    "nav.settings": "Settings",
    "nav.admin": "Admin",
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
