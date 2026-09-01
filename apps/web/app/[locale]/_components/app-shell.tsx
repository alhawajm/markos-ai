"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import Link from "next/link";
import { BarChart3, Brain, CalendarDays, ChevronLeft, ChevronRight, Home, Palette, Settings, Sparkles, Target, type LucideIcon } from "lucide-react";
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

type NavItem = {
  icon: LucideIcon;
  slug: SectionSlug;
};

const primaryNavItems: NavItem[] = [
  { icon: Home, slug: "dashboard" },
  { icon: Target, slug: "strategy" },
  { icon: Palette, slug: "content-studio" },
  { icon: CalendarDays, slug: "calendar" },
  { icon: BarChart3, slug: "analytics" },
  { icon: Brain, slug: "knowledge" }
];
const settingsNavItem: NavItem = { icon: Settings, slug: "settings" };
const navItems: NavItem[] = [...primaryNavItems, settingsNavItem];
const SIDEBAR_COLLAPSED_KEY = "markos.sidebar.collapsed";

export function AppShell({ activeSection, locale }: { activeSection: SectionSlug; locale: Locale }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [sidebarPreferenceReady, setSidebarPreferenceReady] = useState(false);
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

  useEffect(() => {
    let preferenceReadyFrame = 0;
    try {
      setSidebarCollapsed(window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true");
    } catch {
      // A local display preference is optional when browser storage is unavailable.
    } finally {
      preferenceReadyFrame = window.requestAnimationFrame(() => setSidebarPreferenceReady(true));
    }

    return () => window.cancelAnimationFrame(preferenceReadyFrame);
  }, []);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((current) => {
      const next = !current;
      try {
        window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
      } catch {
        // Keep the in-memory choice even when browser storage is unavailable.
      }
      return next;
    });
  }, []);

  if (!sessionChecked) {
    return (
      <main className="sunlit-theme sunlit-app grid min-h-screen place-items-center px-6">
        <section className="sunlit-panel max-w-md rounded-[2rem] p-9 text-center">
          <span className="mx-auto grid h-16 w-16 place-items-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
            <Sparkles size={28} />
          </span>
          <h1 className="mt-7 text-3xl font-bold text-[var(--sunlit-ink)]">
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
            <button className="sunlit-primary mt-6 rounded-xl px-6 py-3 font-bold" onClick={checkSession} type="button">
              {locale === "ar" ? "حاول مرة أخرى" : "Try again"}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  const SidebarToggleIcon = sidebarCollapsed ? (locale === "ar" ? ChevronLeft : ChevronRight) : locale === "ar" ? ChevronRight : ChevronLeft;

  return (
    <main className="sunlit-theme sunlit-app min-h-screen min-w-0 overflow-x-clip" dir={locale === "ar" ? "rtl" : "ltr"}>
      <div
        className={`grid min-h-screen ${sidebarCollapsed ? "lg:grid-cols-[5.75rem_minmax(0,1fr)]" : "lg:grid-cols-[15.25rem_minmax(0,1fr)]"} ${
          sidebarPreferenceReady ? "lg:transition-[grid-template-columns] lg:duration-200 lg:ease-out motion-reduce:transition-none" : ""
        }`}
        data-sidebar-collapsed={sidebarCollapsed}
      >
        <aside
          className="relative hidden border-e border-[var(--sunlit-line)] bg-white/95 px-6 py-5 backdrop-blur-xl lg:sticky lg:top-0 lg:z-40 lg:flex lg:h-screen lg:self-start lg:flex-col lg:overflow-visible"
          data-app-sidebar
        >
          <Link
            className={`grid min-h-[44px] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center rounded-xl text-[var(--sunlit-ink)] ${
              sidebarCollapsed ? "w-[2.75rem] gap-0" : "w-full gap-2"
            }`}
            href={`/${locale}/app`}
          >
            <span className="grid h-[40px] w-[40px] shrink-0 place-items-center justify-self-center rounded-xl bg-[var(--sunlit-ink)] text-[var(--sunlit-yellow)] shadow-[0_10px_24px_rgb(32_33_43_/_16%)]">
              <Sparkles size={21} strokeWidth={2.2} />
            </span>
            <span
              className={`min-w-0 overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 motion-reduce:transition-none ${
                sidebarCollapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100"
              }`}
            >
              <span className="block text-lg font-bold tracking-tight">MARKOS AI</span>
              <span className="block text-xs font-semibold text-[var(--sunlit-muted)]">{locale === "ar" ? "استوديو التسويق" : "Marketing studio"}</span>
            </span>
          </Link>

          <button
            aria-controls="markos-primary-navigation"
            aria-expanded={!sidebarCollapsed}
            aria-label={
              sidebarCollapsed ? (locale === "ar" ? "توسيع الشريط الجانبي" : "Expand sidebar") : locale === "ar" ? "طي الشريط الجانبي" : "Collapse sidebar"
            }
            className="group absolute -end-[20px] top-[54px] z-50 grid h-[40px] w-[40px] place-items-center rounded-full outline-none"
            onClick={toggleSidebar}
            type="button"
          >
            <span className="grid h-[28px] w-[28px] place-items-center rounded-full border border-[var(--sunlit-line-strong)] bg-white text-[var(--sunlit-muted)] shadow-[0_8px_20px_rgb(32_33_43_/_10%)] transition group-hover:border-[var(--sunlit-coral)] group-hover:text-[var(--sunlit-coral-deep)] group-focus-visible:ring-2 group-focus-visible:ring-[var(--sunlit-aqua)]">
              <SidebarToggleIcon aria-hidden="true" size={14} strokeWidth={2.4} />
            </span>
          </button>

          <nav aria-label="Primary" className="mt-8 grid gap-2" id="markos-primary-navigation">
            {primaryNavItems.map((item) => (
              <SidebarNavLink activeSection={activeSection} collapsed={sidebarCollapsed} item={item} key={item.slug} locale={locale} />
            ))}
          </nav>

          <div className="mt-auto border-t border-[var(--sunlit-line)] pt-4">
            <SidebarNavLink activeSection={activeSection} collapsed={sidebarCollapsed} item={settingsNavItem} locale={locale} />
          </div>
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
              <p className="truncate text-lg font-bold tracking-tight text-[var(--sunlit-ink)]">{sectionLabel(locale, activeSection)}</p>
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

function SidebarNavLink({ activeSection, collapsed, item, locale }: { activeSection: SectionSlug; collapsed: boolean; item: NavItem; locale: Locale }) {
  const Icon = item.icon;
  const active = item.slug === activeSection;
  const label = sectionLabel(locale, item.slug);

  return (
    <Link
      aria-current={active ? "page" : undefined}
      className={`group relative grid min-h-[44px] min-w-0 grid-cols-[2.75rem_minmax(0,1fr)] items-center rounded-xl border outline-none transition ${
        collapsed ? "w-[2.75rem] gap-0" : "w-full gap-2"
      } ${
        active
          ? "sunlit-sidebar-link-active border-[rgb(255_102_90_/_26%)] bg-[var(--sunlit-paper-deep)] font-extrabold text-[var(--sunlit-ink)]"
          : "border-transparent font-bold text-[var(--sunlit-ink-soft)] hover:border-[var(--sunlit-line)] hover:bg-[var(--sunlit-paper)] hover:text-[var(--sunlit-ink)]"
      }`}
      href={localizedHref(locale, item.slug)}
    >
      <span
        className={`grid h-9 w-9 shrink-0 place-items-center justify-self-center rounded-lg transition ${
          active
            ? "bg-white text-[var(--sunlit-coral-deep)] shadow-[0_5px_14px_rgb(255_102_90_/_10%)]"
            : "text-[var(--sunlit-muted)] group-hover:text-[var(--sunlit-ink)]"
        }`}
      >
        <Icon aria-hidden="true" size={20} strokeWidth={active ? 2.35 : 1.95} />
      </span>
      <span
        className={`overflow-hidden whitespace-nowrap transition-[max-width,opacity] duration-150 motion-reduce:transition-none ${
          collapsed ? "max-w-0 opacity-0" : "max-w-40 opacity-100"
        }`}
      >
        {label}
      </span>
      {collapsed ? (
        <span
          aria-hidden="true"
          className={`pointer-events-none absolute top-1/2 z-50 -translate-y-1/2 whitespace-nowrap rounded-lg bg-[var(--sunlit-ink)] px-3 py-2 text-xs font-extrabold text-white opacity-0 shadow-[0_12px_30px_rgb(32_33_43_/_20%)] transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100 ${
            locale === "ar" ? "right-full mr-6" : "left-full ml-6"
          }`}
          data-sidebar-tooltip={item.slug}
        >
          {label}
        </span>
      ) : null}
    </Link>
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
