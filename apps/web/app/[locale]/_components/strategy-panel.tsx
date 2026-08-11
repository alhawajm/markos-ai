"use client";

import { useEffect, useState } from "react";
import { CalendarDays, FileText, RefreshCcw, Sparkles, Target, Zap } from "lucide-react";
import type { Locale, StrategyRecord } from "@markos/shared-types";
import { quotaBlockedMessage, quotaErrorMessage, useMeteredActionState } from "./metered-action";
import { useVaultGroundingState, vaultGapMessage } from "./vault-grounding";
import { useMarkosClient, useMarkosSession } from "./browser-session";

export function StrategyPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [objective, setObjective] = useState(text(locale, "defaultObjective"));
  const [horizonDays, setHorizonDays] = useState(30);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const vaultGrounding = useVaultGroundingState({ area: "strategy", locale });
  const strategyUsage = useMeteredActionState({
    fallbackTotal: 3,
    fallbackUsed: 1,
    label: locale === "ar" ? "استراتيجيات الذكاء" : "AI strategies",
    metric: "STRATEGY"
  });

  const client = useMarkosClient(locale);

  useEffect(() => {
    if (!session) {
      return;
    }

    void refreshStrategies();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refreshStrategies() {
    if (!session) {
      setStrategies([]);
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const nextStrategies = await client.strategies();
      setStrategies(nextStrategies);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function generate() {
    if (vaultGrounding.blocked) {
      setMessage(vaultGapMessage(locale));
      return;
    }

    if (strategyUsage.blocked) {
      setMessage(quotaBlockedMessage(locale));
      return;
    }

    if (!session) {
      setMessage(text(locale, "sessionRequired"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const strategy = await client.generateStrategy(
        objective.trim()
          ? {
              horizonDays,
              locale,
              objective: objective.trim()
            }
          : {
              horizonDays,
              locale
            }
      );
      setStrategies((current) => [strategy, ...current.filter((item) => item.id !== strategy.id)]);
      setMessage(text(locale, "generated"));
    } catch (error) {
      setMessage(quotaErrorMessage(locale, error) ?? (error instanceof Error ? error.message : text(locale, "failed")));
    } finally {
      setIsBusy(false);
    }
  }

  const active = strategies[0] ?? emptyStrategy(locale, horizonDays);

  return (
    <section className="grid gap-5">
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E_0%,#0F3460_58%,#162447_100%)] p-6 text-white shadow-[0_8px_32px_rgba(15,52,96,.24)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[26px] font-bold leading-tight tracking-normal">{text(locale, "title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-accent/30 bg-accent/15 px-3 py-1 text-sm font-bold text-accent">
                <Target size={14} />
                {session ? text(locale, "businessInformed") : text(locale, "previewMode")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{text(locale, "subtitle")}</p>
            {strategies.length > 0 ? (
              <div className="mt-5 flex flex-wrap gap-4">
                <HeroStat color="#22C55E" label={text(locale, "horizon")} value={`${active.content.horizonDays} ${text(locale, "days")}`} />
                <HeroStat color="#F59E0B" label={text(locale, "weeks")} value={active.content.weeklyCadence.length.toString()} />
                <HeroStat color="#E94560" label={text(locale, "priorityActions")} value={Math.min(active.content.nextActions.length, 3).toString()} />
              </div>
            ) : null}
          </div>
          <button
            className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50"
            disabled={isBusy}
            onClick={refreshStrategies}
            type="button"
          >
            <RefreshCcw size={15} />
            {text(locale, "refresh")}
          </button>
        </div>
      </section>

      <section className="grid gap-4 xl:grid-cols-[360px_1fr]">
        <aside className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-accent/10 text-accent">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-navy">{text(locale, "generate")}</h3>
              <p className="text-sm text-muted">{text(locale, "generateSub")}</p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-bold uppercase tracking-[.08em] text-muted">{text(locale, "objective")}</span>
            <textarea
              className="mt-2 min-h-32 w-full resize-y rounded-xl border border-[#E8ECF2] bg-canvas px-4 py-3 text-sm leading-6 text-navy outline-none focus:border-accent"
              onChange={(event) => setObjective(event.target.value)}
              value={objective}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-bold uppercase tracking-[.08em] text-muted">{text(locale, "horizon")}</span>
            <select
              className="mt-2 h-11 w-full rounded-xl border border-[#E8ECF2] bg-canvas px-3 text-sm font-bold text-navy outline-none focus:border-accent"
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              value={horizonDays}
            >
              <option value={30}>30 {text(locale, "days")}</option>
              <option value={60}>60 {text(locale, "days")}</option>
              <option value={90}>90 {text(locale, "days")}</option>
            </select>
          </label>

          <button
            className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-4 text-sm font-extrabold text-white shadow-[0_3px_12px_rgba(233,69,96,.3)] disabled:opacity-50"
            disabled={isBusy}
            onClick={generate}
            type="button"
          >
            <Zap size={16} />
            {text(locale, "generateCta")}
          </button>
          <p className="mt-3 min-h-5 text-sm leading-6 text-muted">{message}</p>
        </aside>

        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div>
            <p className="text-xs font-extrabold uppercase tracking-[.14em] text-accent">{text(locale, "latest")}</p>
            <h3 className="mt-1 font-display text-2xl font-extrabold tracking-normal text-navy">{active.title}</h3>
            <p className="mt-3 max-w-4xl text-sm leading-6 text-muted">{active.content.summary}</p>
          </div>

          {strategies.length > 0 && active.content.nextActions.length > 0 ? (
            <div className="mt-7 border-t border-[#E8ECF2] pt-5">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-accent/10 text-accent">
                  <FileText size={18} />
                </span>
                <div>
                  <h4 className="font-extrabold text-navy">{text(locale, "nextActions")}</h4>
                  <p className="text-sm text-muted">{text(locale, "nextActionsSub")}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {active.content.nextActions.slice(0, 3).map((action, index) => (
                  <div className="flex items-start gap-3 rounded-xl border border-[#E8ECF2] bg-canvas p-4" key={`${index}-${action}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-midnavy text-xs font-extrabold text-white">
                      {index + 1}
                    </span>
                    <p className="text-sm font-bold leading-6 text-navy">{action}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>

      {strategies.length > 0 ? (
        <>
          <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
            <h3 className="text-[15px] font-bold text-navy">{text(locale, "cadence")}</h3>
            <p className="mt-1 text-sm text-muted">{text(locale, "cadenceSub")}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {active.content.weeklyCadence.slice(0, 4).map((week) => (
                <div className="rounded-xl border border-[#E8ECF2] bg-canvas p-4" key={week.week}>
                  <div className="flex items-center gap-2">
                    <CalendarDays size={16} className="text-accent" />
                    <h4 className="font-extrabold text-navy">
                      {text(locale, "week")} {week.week}: {week.focus}
                    </h4>
                  </div>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-muted">
                    {week.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>

          <section className="grid gap-4 xl:grid-cols-2">
            <details className="group rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-navy">
                <span>{text(locale, "contentPillars")}</span>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">
                  {text(locale, "viewDetails")} · {active.content.pillars.length}
                </span>
              </summary>
              <p className="mt-2 text-sm text-muted">{text(locale, "pillarsSub")}</p>
              <div className="mt-5 grid gap-3">
                {active.content.pillars.map((pillar, index) => (
                  <div className="rounded-xl border border-[#E8ECF2] bg-canvas p-4" key={pillar.name}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-midnavy text-xs font-extrabold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <h4 className="font-extrabold text-navy">{pillar.name}</h4>
                        <p className="mt-1 text-sm leading-6 text-muted">{pillar.rationale}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pillar.contentAngles.map((angle) => (
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-muted" key={angle}>
                              {angle}
                            </span>
                          ))}
                        </div>
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </details>

            <details className="group rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-navy">
                <span>{text(locale, "whyTitle")}</span>
                <span className="rounded-full bg-accent/10 px-3 py-1 text-xs text-accent">{text(locale, "viewDetails")}</span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-muted">{text(locale, "whyBody")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{text(locale, "profileSource")}</span>
                <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{text(locale, "audienceSource")}</span>
                <span className="rounded-full bg-canvas px-3 py-1.5 text-xs font-bold text-muted">{text(locale, "brandSource")}</span>
              </div>
            </details>
          </section>
        </>
      ) : null}
    </section>
  );
}

function HeroStat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full shadow-[0_0_7px_currentColor]" style={{ backgroundColor: color, color }} />
      <span className="text-[13px] text-white/50">{label}:</span>
      <span className="text-[13px] font-bold text-white">{value}</span>
    </div>
  );
}

function emptyStrategy(locale: Locale, horizonDays: number): StrategyRecord {
  const now = new Date().toISOString();
  return {
    content: {
      horizonDays,
      kpis: [],
      nextActions: [],
      objectives: [],
      pillars: [],
      retrievedContext: [],
      risks: [],
      summary: text(locale, "emptyBody"),
      weeklyCadence: []
    },
    createdAt: now,
    horizonDays,
    id: "empty-strategy",
    title: text(locale, "emptyTitle"),
    updatedAt: now,
    version: 0,
    workspaceId: ""
  };
}

function text(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      audienceSource: "الجمهور والسوق",
      brandSource: "صوت العلامة والأهداف",
      businessInformed: "مبنية على ملف النشاط",
      cadence: "خطتك الأسبوعية",
      cadenceSub: "خطة عملية توضح ما يجب التركيز عليه كل أسبوع.",
      contentPillars: "ركائز المحتوى",
      days: "يوم",
      defaultObjective: "زيادة الاستفسارات المؤهلة من إنستغرام خلال 30 يوماً",
      emptyBody: "حدد هدفاً واختر مدة الخطة، ثم ولّد أول استراتيجية لنشاطك.",
      emptyTitle: "لم يتم توليد استراتيجية بعد",
      failed: "فشل الطلب",
      generate: "توليد استراتيجية",
      generateCta: "توليد بالذكاء",
      generateSub: "مبنية على ملف النشاط المعتمد",
      generated: "تم توليد الاستراتيجية",
      horizon: "الأفق",
      latest: "أحدث استراتيجية",
      nextActions: "أهم الخطوات",
      nextActionsSub: "ابدأ بهذه الخطوات الثلاث",
      pillarsSub: "رسائل قابلة للتنفيذ",
      previewMode: "معاينة",
      priorityActions: "الخطوات الرئيسية",
      profileSource: "ملف النشاط المعتمد",
      refresh: "تحديث",
      sessionRequired: "سجّل الدخول قبل توليد الاستراتيجية.",
      subtitle: "حوّل ما يعرفه MARKOS عن نشاطك إلى خطة عمل واضحة.",
      title: "الاستراتيجية",
      week: "الأسبوع",
      weeks: "الأسابيع",
      whyBody: "استخدم MARKOS ملف نشاطك المعتمد، وجمهورك، وعروضك، وصوت علامتك، والهدف الذي حددته لبناء هذه الخطة.",
      whyTitle: "لماذا أوصى MARKOS بهذه الخطة؟",
      viewDetails: "عرض التفاصيل",
      objective: "الهدف"
    },
    en: {
      audienceSource: "Audience and market",
      brandSource: "Brand voice and goals",
      businessInformed: "Business-informed",
      cadence: "Your weekly plan",
      cadenceSub: "A practical sequence showing what to focus on each week.",
      contentPillars: "Content Pillars",
      days: "days",
      defaultObjective: "Increase qualified Instagram inquiries over the next 30 days",
      emptyBody: "Set an objective and horizon, then generate the first Strategy for your business.",
      emptyTitle: "No strategy generated yet",
      failed: "Request failed",
      generate: "Generate Strategy",
      generateCta: "Generate with AI",
      generateSub: "Based on your approved Business Profile",
      generated: "Strategy generated",
      horizon: "Horizon",
      latest: "Latest Strategy",
      nextActions: "Priority actions",
      nextActionsSub: "Start with these three moves",
      pillarsSub: "Actionable message territories",
      previewMode: "Preview mode",
      priorityActions: "Priority actions",
      profileSource: "Approved Business Profile",
      refresh: "Refresh",
      sessionRequired: "Sign in before generating a strategy.",
      subtitle: "Turn what MARKOS knows about your business into a clear action plan.",
      title: "Strategy",
      week: "Week",
      weeks: "Weeks",
      whyBody: "MARKOS used your approved Business Profile, audience, offers, brand voice, and stated goal to build this plan.",
      whyTitle: "Why MARKOS recommended this",
      viewDetails: "View details",
      objective: "Objective"
    }
  };

  return dictionary[locale][key] ?? key;
}
