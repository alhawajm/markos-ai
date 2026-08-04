"use client";

import { useCallback, useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import {
  BarChart3,
  Brain,
  Calendar,
  ChevronLeft,
  Home,
  Lightbulb,
  Palette,
  Settings,
  Sparkles,
  Zap
} from "lucide-react";
import type { Locale } from "@markos/shared-types";
import {
  CampaignBuilderPanel,
  ContentStudioPanel,
  DailyBriefingPanel,
  FinalAnalyticsPanel,
  FinalDashboard,
  FinalVaultPanel,
  OpportunitiesPanel
} from "./final-command-panels";
import { SettingsPanel } from "./settings-panel";
import { initializeBrowserSession, watchBrowserSession } from "./browser-session";

export type SectionSlug =
  | "analytics"
  | "briefing"
  | "campaign-builder"
  | "content-studio"
  | "dashboard"
  | "knowledge"
  | "opportunities"
  | "settings";

type Icon = ComponentType<{ className?: string; size?: number; strokeWidth?: number }>;

const navItems: Array<{
  icon: Icon;
  label: string;
  notify?: boolean;
  slug: SectionSlug;
}> = [
  { icon: Home, label: "Command Center", slug: "dashboard" },
  { icon: Calendar, label: "Daily Briefing", slug: "briefing" },
  { icon: Lightbulb, label: "Opportunities", slug: "opportunities" },
  { icon: Zap, label: "Campaign Builder", notify: true, slug: "campaign-builder" },
  { icon: Palette, label: "Content Studio", notify: true, slug: "content-studio" },
  { icon: BarChart3, label: "Analytics", slug: "analytics" },
  { icon: Brain, label: "Knowledge Vault", slug: "knowledge" },
  { icon: Settings, label: "Settings", slug: "settings" }
];

export function AppShell({ activeSection, locale }: { activeSection: SectionSlug; locale: Locale }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);

  const checkSession = useCallback(() => {
    setSessionCheckFailed(false);
    void initializeBrowserSession(locale)
      .then(() => setSessionChecked(true))
      .catch(() => setSessionCheckFailed(true));
  }, [locale]);

  useEffect(() => {
    checkSession();
    return watchBrowserSession(locale);
  }, [checkSession, locale]);

  if (!sessionChecked) {
    return (
      <main className="lux-page grid min-h-screen place-items-center px-6 text-white">
        <section className="lux-card max-w-md rounded-[2rem] p-8 text-center">
          <span className="lux-ai-core mx-auto" />
          <h1 className="mt-8 text-3xl font-black">{sessionCheckFailed ? (locale === "ar" ? "تعذر فتح MARKOS" : "Could not open MARKOS") : locale === "ar" ? "جارٍ فتح MARKOS" : "Opening MARKOS"}</h1>
          <p className="mt-3 text-base leading-relaxed text-[#9AA7BD]">
            {sessionCheckFailed
              ? locale === "ar"
                ? "تعذر تجديد جلستك مؤقتاً. تحقق من اتصالك ثم حاول مرة أخرى."
                : "Your session could not be renewed temporarily. Check your connection and try again."
              : locale === "ar"
                ? "نتحقق من جلسة مساحة العمل قبل تحميل مركز القيادة."
                : "Checking your workspace session before loading the command center."}
          </p>
          {sessionCheckFailed ? (
            <button className="mt-6 rounded-full bg-[#D4AF37] px-6 py-3 font-black text-[#0F1419]" onClick={checkSession} type="button">
              {locale === "ar" ? "حاول مرة أخرى" : "Try again"}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="lux-page min-h-screen min-w-0 overflow-x-hidden text-white">
      <aside className="fixed inset-y-0 left-0 z-40 hidden w-[4.75rem] border-r border-[#81D8D0]/12 bg-[#102027]/72 px-3 py-5 backdrop-blur-3xl lg:flex lg:flex-col lg:items-center xl:w-20 xl:px-4 xl:py-8">
        <Link
          aria-label="MARKOS AI Command Center"
          className="mb-10 grid h-12 w-12 place-items-center rounded-full border-2 border-[#D4AF37] bg-[#0F1419] text-[#81D8D0] shadow-[0_0_28px_rgba(129,216,208,.22)] xl:mb-14 xl:h-14 xl:w-14"
          href={`/${locale}/app`}
        >
          <Sparkles size={27} strokeWidth={1.8} />
        </Link>

        <nav aria-label="Primary" className="flex flex-1 flex-col gap-3 xl:gap-5">
          {navItems.map((item) => {
            const Icon = item.icon;
            const active = item.slug === activeSection;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                aria-label={item.label}
                className={
                  active
                    ? "group relative grid h-12 w-12 place-items-center rounded-full bg-gradient-to-br from-[#81D8D0] to-[#D4AF37] text-[#0F1419] shadow-[0_0_24px_rgba(212,175,55,.28)] xl:h-14 xl:w-14"
                    : "group relative grid h-12 w-12 place-items-center rounded-full border border-[#81D8D0]/14 bg-[#81D8D0]/5 text-[#8B95A8] transition hover:border-[#81D8D0]/35 hover:text-[#81D8D0] xl:h-14 xl:w-14"
                }
                href={localizedHref(locale, item.slug)}
                key={item.slug}
              >
                {active ? <span className="absolute -left-3 h-9 w-1.5 rounded-r-full bg-[#81D8D0] xl:-left-4 xl:h-10" /> : null}
                {item.notify ? <span className="absolute right-1.5 top-1.5 h-2.5 w-2.5 rounded-full bg-[#D4AF37] shadow-[0_0_12px_rgba(212,175,55,.55)]" /> : null}
                <Icon size={24} strokeWidth={active ? 2 : 1.7} />
                <span className="pointer-events-none absolute left-full z-50 ml-4 w-max max-w-56 translate-x-1 whitespace-nowrap rounded-xl border border-[#81D8D0]/20 bg-[#111920] px-4 py-2 text-sm font-semibold text-white opacity-0 shadow-[0_18px_50px_rgba(0,0,0,.45)] transition group-hover:translate-x-0 group-hover:opacity-100">
                  {item.label}
                </span>
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="fixed bottom-0 left-0 right-0 z-40 max-w-full overflow-hidden border-t border-[#81D8D0]/12 bg-[#102027]/90 px-2 py-2 backdrop-blur-3xl lg:hidden">
        <nav className="grid grid-cols-5 gap-1" aria-label="Mobile primary">
          {navItems.slice(0, 5).map((item) => {
            const Icon = item.icon;
            const active = item.slug === activeSection;
            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={active ? "grid min-h-11 place-items-center rounded-xl bg-[#D4AF37] text-[#0F1419]" : "grid min-h-11 place-items-center rounded-xl border border-[#81D8D0]/12 text-[#8B95A8]"}
                href={localizedHref(locale, item.slug)}
                key={item.slug}
              >
                <Icon size={19} />
              </Link>
            );
          })}
        </nav>
      </div>

      <section className="min-h-screen w-full max-w-full min-w-0 overflow-x-hidden px-4 py-5 pb-20 lg:ml-[4.75rem] lg:w-[calc(100%-4.75rem)] lg:px-5 lg:py-5 lg:pb-9 xl:ml-20 xl:w-[calc(100%-5rem)] xl:px-7 2xl:px-9">
        <div className="mx-auto w-full max-w-full min-w-0 xl:max-w-[1280px] 2xl:max-w-[1360px]">
          <LocaleSwitch activeSection={activeSection} locale={locale} />
          {activeSection === "dashboard" ? <FinalDashboard locale={locale} /> : null}
          {activeSection === "briefing" ? <DailyBriefingPanel locale={locale} /> : null}
          {activeSection === "opportunities" ? <OpportunitiesPanel locale={locale} /> : null}
          {activeSection === "campaign-builder" ? <CampaignBuilderPanel locale={locale} /> : null}
          {activeSection === "content-studio" ? <ContentStudioPanel locale={locale} /> : null}
          {activeSection === "analytics" ? <FinalAnalyticsPanel locale={locale} /> : null}
          {activeSection === "knowledge" ? <FinalVaultPanel /> : null}
          {activeSection === "settings" ? <SettingsPanel locale={locale} /> : null}
        </div>
      </section>
    </main>
  );
}

function LocaleSwitch({ activeSection, locale }: { activeSection: SectionSlug; locale: Locale }) {
  const arabicLabel = "\u0627\u0644\u0639\u0631\u0628\u064a\u0629";
  const languageLinkClass = (linkLocale: Locale) =>
    linkLocale === locale
      ? "shrink-0 rounded-full border border-[#81D8D0]/42 bg-[#81D8D0]/16 px-5 py-2 text-sm font-bold text-white shadow-[0_0_22px_rgba(129,216,208,.14)]"
      : "shrink-0 rounded-full border border-[#81D8D0]/18 bg-[#81D8D0]/7 px-5 py-2 text-sm font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/38 hover:text-white";

  return (
    <div className="mb-6 flex flex-wrap items-center justify-start gap-4 sm:justify-between">
      <Link className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#81D8D0]/14 bg-[#81D8D0]/5 px-4 py-2 text-sm font-bold text-[#9AA7BD] transition hover:text-white" href={localizedHref(locale, "dashboard")}>
        <ChevronLeft size={16} />
        MARKOS AI
      </Link>
      <div className="flex items-center gap-2" aria-label="Language switcher">
        <Link aria-current={locale === "ar" ? "page" : undefined} className={languageLinkClass("ar")} href={localizedHref("ar", activeSection)}>
          {arabicLabel}
        </Link>
        <Link aria-current={locale === "en" ? "page" : undefined} className={languageLinkClass("en")} href={localizedHref("en", activeSection)}>
          English
        </Link>
      </div>
    </div>
  );
}

function localizedHref(locale: Locale, section: SectionSlug): string {
  return section === "dashboard" ? `/${locale}/app` : `/${locale}/app/${section}`;
}
