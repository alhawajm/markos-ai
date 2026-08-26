"use client";

import { useCallback, useEffect, useRef, useState, type ComponentType } from "react";
import Link from "next/link";
import { BarChart3, Brain, CalendarDays, Home, Palette, Settings, Sparkles, Target } from "lucide-react";
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
import { StrategyPanel } from "./strategy-panel";
import { CalendarPanel } from "./calendar-panel";
import { initializeBrowserSession, watchBrowserSession } from "./browser-session";

export type SectionSlug =
  | "analytics"
  | "briefing"
  | "calendar"
  | "campaign-builder"
  | "content-studio"
  | "dashboard"
  | "knowledge"
  | "opportunities"
  | "settings"
  | "strategy";

type Icon = ComponentType<{
  className?: string;
  size?: number;
  strokeWidth?: number;
}>;

const navItems: Array<{
  icon: Icon;
  slug: SectionSlug;
}> = [
  { icon: Home, slug: "dashboard" },
  { icon: Target, slug: "strategy" },
  { icon: Palette, slug: "content-studio" },
  { icon: CalendarDays, slug: "calendar" },
  { icon: BarChart3, slug: "analytics" },
  { icon: Brain, slug: "knowledge" },
  { icon: Settings, slug: "settings" }
];

export function AppShell({ activeSection, locale }: { activeSection: SectionSlug; locale: Locale }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const mobileNavRef = useRef<HTMLElement>(null);
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

  useEffect(() => {
    if (activeSection === "settings") return;
    window.sessionStorage.setItem("markos.settings.returnTo", localizedHref(locale, activeSection));
  }, [activeSection, locale]);

  useEffect(() => {
    mobileNavRef.current?.querySelector<HTMLElement>('[aria-current="page"]')?.scrollIntoView({ behavior: "auto", block: "nearest", inline: "center" });
  }, [activeSection, locale, sessionChecked]);

  if (!sessionChecked) {
    return (
      <main className="sunlit-theme sunlit-app grid min-h-screen place-items-center px-6">
        <section className="sunlit-panel max-w-md rounded-[2rem] p-9 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
            <Sparkles size={28} />
          </span>
          <h1 className="mt-7 text-3xl font-black text-[var(--sunlit-ink)]">
            {sessionCheckFailed ? (locale === "ar" ? "تعذر فتح MARKOS" : "Could not open MARKOS") : locale === "ar" ? "جارٍ فتح MARKOS" : "Opening MARKOS"}
          </h1>
          <p className="mt-3 text-base leading-relaxed text-[var(--sunlit-muted)]">
            {sessionCheckFailed
              ? locale === "ar"
                ? "تعذر تجديد جلستك مؤقتاً. تحقق من اتصالك ثم حاول مرة أخرى."
                : "Your session could not be renewed temporarily. Check your connection and try again."
              : locale === "ar"
                ? "نتحقق من جلسة مساحة العمل قبل تحميل مركز القيادة."
                : "Checking your workspace session before loading the command center."}
          </p>
          {sessionCheckFailed ? (
            <button className="sunlit-primary mt-6 rounded-xl px-6 py-3 font-black" onClick={checkSession} type="button">
              {locale === "ar" ? "حاول مرة أخرى" : "Try again"}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  return (
    <main className="sunlit-theme sunlit-app min-h-screen min-w-0 overflow-x-clip" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div className="grid min-h-screen lg:grid-cols-[17.5rem_minmax(0,1fr)]">
        <aside
          className="hidden border-e border-[var(--sunlit-line)] bg-white/80 px-5 py-6 backdrop-blur-xl lg:sticky lg:top-0 lg:z-40 lg:flex lg:h-screen lg:self-start lg:flex-col lg:overflow-y-auto"
          data-app-sidebar
        >
          <Link className="flex items-center gap-3 rounded-2xl px-2 py-2 text-[var(--sunlit-ink)]" href={`/${locale}/app`}>
            <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--sunlit-ink)] text-[var(--sunlit-yellow)] shadow-[0_12px_28px_rgb(32_33_43_/_18%)]">
              <Sparkles size={21} strokeWidth={2.2} />
            </span>
            <span>
              <span className="block text-lg font-black tracking-tight">MARKOS AI</span>
              <span className="block text-xs font-semibold text-[var(--sunlit-muted)]">{locale === "ar" ? "استوديو التسويق" : "Marketing studio"}</span>
            </span>
          </Link>

          <nav aria-label="Primary" className="mt-10 grid gap-2">
            <p className="px-3 text-[11px] font-extrabold uppercase tracking-[.14em] text-[var(--sunlit-muted)]">
              {locale === "ar" ? "مساحة العمل" : "Workspace"}
            </p>
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.slug === activeSection;
              const label = sectionLabel(locale, item.slug);
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex min-h-12 items-center gap-3 rounded-xl border border-[rgb(217_63_122_/_22%)] bg-[var(--sunlit-paper-deep)] px-3.5 font-extrabold text-[var(--sunlit-ink)] shadow-[inset_4px_0_0_var(--sunlit-coral)]"
                      : "flex min-h-12 items-center gap-3 rounded-xl border border-transparent px-3.5 font-bold text-[var(--sunlit-ink-soft)] transition hover:border-[var(--sunlit-line)] hover:bg-white"
                  }
                  href={localizedHref(locale, item.slug)}
                  key={item.slug}
                >
                  <span
                    className={
                      active
                        ? "grid h-8 w-8 place-items-center rounded-lg bg-white text-[var(--sunlit-pink)]"
                        : "grid h-8 w-8 place-items-center rounded-lg bg-[var(--sunlit-paper)] text-[var(--sunlit-muted)]"
                    }
                  >
                    <Icon size={18} strokeWidth={active ? 2.3 : 1.9} />
                  </span>
                  <span>{label}</span>
                </Link>
              );
            })}
          </nav>
        </aside>

        <section className="min-w-0">
          <header className="sticky top-0 z-30 border-b border-[var(--sunlit-line)] bg-white/92 px-5 py-3 backdrop-blur-xl sm:px-7 lg:hidden">
            <div className="mx-auto flex max-w-[1500px] items-center gap-3">
              <Link
                aria-label="MARKOS AI"
                className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-ink)] text-[var(--sunlit-yellow)]"
                href={`/${locale}/app`}
              >
                <Sparkles size={19} />
              </Link>
              <p className="truncate text-lg font-black tracking-tight text-[var(--sunlit-ink)]">{sectionLabel(locale, activeSection)}</p>
            </div>
          </header>

          <nav
            className="flex gap-2 overflow-x-auto border-b border-[var(--sunlit-line)] bg-white/75 px-4 py-3 lg:hidden"
            aria-label="Mobile primary"
            ref={mobileNavRef}
          >
            {navItems.map((item) => {
              const Icon = item.icon;
              const active = item.slug === activeSection;
              return (
                <Link
                  aria-current={active ? "page" : undefined}
                  className={
                    active
                      ? "flex shrink-0 items-center gap-2 rounded-xl bg-[var(--sunlit-paper-deep)] px-3 py-2 font-bold text-[var(--sunlit-pink)]"
                      : "flex shrink-0 items-center gap-2 rounded-xl px-3 py-2 font-bold text-[var(--sunlit-muted)]"
                  }
                  href={localizedHref(locale, item.slug)}
                  key={item.slug}
                >
                  <Icon size={16} />
                  {sectionLabel(locale, item.slug)}
                </Link>
              );
            })}
          </nav>

          <div
            className={
              activeSection === "calendar"
                ? "mx-auto w-full max-w-[1500px] min-w-0 px-5 py-5 sm:px-7 xl:px-8 xl:py-6 2xl:px-10"
                : "mx-auto w-full max-w-[1500px] min-w-0 px-5 py-7 sm:px-7 xl:px-10 xl:py-9 2xl:px-12"
            }
          >
            {activeSection === "dashboard" ? <FinalDashboard locale={locale} /> : null}
            {activeSection === "briefing" ? <DailyBriefingPanel locale={locale} /> : null}
            {activeSection === "strategy" ? <StrategyPanel locale={locale} /> : null}
            {activeSection === "opportunities" ? <OpportunitiesPanel locale={locale} /> : null}
            {activeSection === "campaign-builder" ? <CampaignBuilderPanel locale={locale} /> : null}
            {activeSection === "content-studio" ? <ContentStudioPanel locale={locale} /> : null}
            {activeSection === "calendar" ? <CalendarPanel locale={locale} /> : null}
            {activeSection === "analytics" ? <FinalAnalyticsPanel locale={locale} /> : null}
            {activeSection === "knowledge" ? <FinalVaultPanel locale={locale} /> : null}
          </div>
        </section>
      </div>
    </main>
  );
}

function sectionLabel(locale: Locale, section: SectionSlug): string {
  const labels: Record<Locale, Record<SectionSlug, string>> = {
    ar: {
      analytics: "التحليلات",
      briefing: "الموجز اليومي",
      calendar: "التقويم",
      "campaign-builder": "منشئ الحملات",
      "content-studio": "إنشاء المحتوى",
      dashboard: "نظرة عامة",
      knowledge: "ملف النشاط",
      opportunities: "الفرص",
      settings: "الإعدادات",
      strategy: "الاستراتيجية"
    },
    en: {
      analytics: "Insights",
      briefing: "Daily briefing",
      calendar: "Calendar",
      "campaign-builder": "Campaign builder",
      "content-studio": "Create",
      dashboard: "Overview",
      knowledge: "Business profile",
      opportunities: "Opportunities",
      settings: "Settings",
      strategy: "Strategy"
    }
  };

  return labels[locale][section];
}

function localizedHref(locale: Locale, section: SectionSlug): string {
  return section === "dashboard" ? `/${locale}/app` : `/${locale}/app/${section}`;
}
