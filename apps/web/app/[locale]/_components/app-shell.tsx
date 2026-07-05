"use client";

import { useEffect, useState, type ComponentType } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
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
  FinalSettingsPanel,
  FinalVaultPanel,
  OpportunitiesPanel
} from "./final-command-panels";

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
  const router = useRouter();
  const [sessionChecked, setSessionChecked] = useState(false);

  useEffect(() => {
    const stored = window.localStorage.getItem("markos.session");

    if (!stored) {
      router.replace(`/${locale}/login`);
      return;
    }

    try {
      if (isValidStoredSession(JSON.parse(stored))) {
        setSessionChecked(true);
        return;
      }

      window.localStorage.removeItem("markos.session");
      router.replace(`/${locale}/login`);
    } catch {
      window.localStorage.removeItem("markos.session");
      router.replace(`/${locale}/login`);
    }
  }, [locale, router]);

  if (!sessionChecked) {
    return (
      <main className="lux-page grid min-h-screen place-items-center px-6 text-white">
        <section className="lux-card max-w-md rounded-[2rem] p-8 text-center">
          <span className="lux-ai-core mx-auto" />
          <h1 className="mt-8 text-3xl font-black">Opening MARKOS</h1>
          <p className="mt-3 text-base leading-relaxed text-[#9AA7BD]">Checking your workspace session before loading the command center.</p>
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
          {activeSection === "settings" ? <FinalSettingsPanel /> : null}
        </div>
      </section>
    </main>
  );
}

function LocaleSwitch({ activeSection, locale }: { activeSection: SectionSlug; locale: Locale }) {
  const otherLocale = locale === "en" ? "ar" : "en";
  const arabicLabel = "\u0627\u0644\u0639\u0631\u0628\u064a\u0629";
  return (
    <div className="mb-6 flex flex-wrap items-center justify-start gap-4 sm:justify-between">
      <Link className="inline-flex shrink-0 items-center gap-2 rounded-full border border-[#81D8D0]/14 bg-[#81D8D0]/5 px-4 py-2 text-sm font-bold text-[#9AA7BD] transition hover:text-white" href={localizedHref(locale, "dashboard")}>
        <ChevronLeft size={16} />
        MARKOS AI
      </Link>
      <Link className="shrink-0 rounded-full border border-[#81D8D0]/18 bg-[#81D8D0]/7 px-5 py-2 text-sm font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/38 hover:text-white" href={localizedHref(otherLocale, activeSection)}>
        {otherLocale === "ar" ? arabicLabel : "English"}
      </Link>
    </div>
  );
}

function localizedHref(locale: Locale, section: SectionSlug): string {
  return section === "dashboard" ? `/${locale}/app` : `/${locale}/app/${section}`;
}

function isValidStoredSession(value: unknown): value is {
  tokens: { accessToken: string };
  user: { id: string };
  workspace: { id: string };
} {
  if (typeof value !== "object" || value === null) return false;

  const session = value as {
    tokens?: { accessToken?: unknown };
    user?: { id?: unknown };
    workspace?: { id?: unknown };
  };

  return (
    typeof session.tokens?.accessToken === "string" &&
    session.tokens.accessToken.length > 0 &&
    typeof session.user?.id === "string" &&
    session.user.id.length > 0 &&
    typeof session.workspace?.id === "string" &&
    session.workspace.id.length > 0
  );
}
