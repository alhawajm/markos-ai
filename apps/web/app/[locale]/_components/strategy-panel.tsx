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
    label: locale === "ar" ? "الاستراتيجيات" : "Strategies",
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
    <section className="grid gap-6">
      <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-bold leading-tight tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{text(locale, "title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(33_191_174_/_24%)] bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-aqua-dark)]">
                <Target size={14} />
                {session ? text(locale, "businessInformed") : text(locale, "previewMode")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sunlit-muted)]">{text(locale, "subtitle")}</p>
            {strategies.length > 0 ? (
              <div className="mt-4 flex flex-wrap gap-x-6 gap-y-3">
                <HeroStat color="#21BFAE" label={text(locale, "horizon")} value={`${active.content.horizonDays} ${text(locale, "days")}`} />
                <HeroStat color="#F6C453" label={text(locale, "weeks")} value={active.content.weeklyCadence.length.toString()} />
                <HeroStat color="#FF665A" label={text(locale, "priorityActions")} value={Math.min(active.content.nextActions.length, 3).toString()} />
              </div>
            ) : null}
          </div>
          <button
            className="sunlit-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"
            disabled={isBusy}
            onClick={refreshStrategies}
            type="button"
          >
            <RefreshCcw size={15} />
            {text(locale, "refresh")}
          </button>
        </div>
      </section>

      <section className="grid gap-5 xl:grid-cols-[380px_minmax(0,1fr)]">
        <aside className="sunlit-panel rounded-[1.75rem] p-6">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
              <Sparkles size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-[var(--sunlit-ink)]">{text(locale, "generate")}</h3>
              <p className="text-sm text-[var(--sunlit-muted)]">{text(locale, "generateSub")}</p>
            </div>
          </div>

          <label className="mt-5 block">
            <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-ink-soft)]">{text(locale, "objective")}</span>
            <textarea
              className="sunlit-field mt-2 min-h-36 resize-y rounded-xl px-4 py-3 text-[15px] leading-7 outline-none"
              onChange={(event) => setObjective(event.target.value)}
              value={objective}
            />
          </label>

          <label className="mt-4 block">
            <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-ink-soft)]">{text(locale, "horizon")}</span>
            <select
              className="sunlit-field mt-2 h-12 rounded-xl px-3 text-sm font-extrabold outline-none"
              onChange={(event) => setHorizonDays(Number(event.target.value))}
              value={horizonDays}
            >
              <option value={30}>30 {text(locale, "days")}</option>
              <option value={60}>60 {text(locale, "days")}</option>
              <option value={90}>90 {text(locale, "days")}</option>
            </select>
          </label>

          <button
            className="sunlit-primary mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
            disabled={isBusy}
            onClick={generate}
            type="button"
          >
            <Zap size={16} />
            {text(locale, "generateCta")}
          </button>
          <p className="mt-3 min-h-5 text-sm leading-6 text-[var(--sunlit-muted)]">{message}</p>
        </aside>

        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <div>
            <p className="sunlit-eyebrow">{text(locale, "latest")}</p>
            <h3 className="mt-2 font-display text-3xl font-bold tracking-tight text-[var(--sunlit-ink)]">{active.title}</h3>
            <p className="mt-4 max-w-4xl text-base leading-7 text-[var(--sunlit-muted)]">{active.content.summary}</p>
          </div>

          {strategies.length > 0 && active.content.nextActions.length > 0 ? (
            <div className="mt-7 border-t border-[var(--sunlit-line)] pt-6">
              <div className="flex items-center gap-3">
                <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
                  <FileText size={18} />
                </span>
                <div>
                  <h4 className="font-extrabold text-[var(--sunlit-ink)]">{text(locale, "nextActions")}</h4>
                  <p className="text-sm text-[var(--sunlit-muted)]">{text(locale, "nextActionsSub")}</p>
                </div>
              </div>
              <div className="mt-4 grid gap-3 md:grid-cols-3">
                {active.content.nextActions.slice(0, 3).map((action, index) => (
                  <div className="flex items-start gap-3 rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4" key={`${index}-${action}`}>
                    <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sunlit-ink)] text-xs font-extrabold text-white">
                      {index + 1}
                    </span>
                    <p className="text-sm font-bold leading-6 text-[var(--sunlit-ink)]">{action}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </article>
      </section>

      {strategies.length > 0 ? (
        <>
          <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
            <h3 className="text-xl font-bold text-[var(--sunlit-ink)]">{text(locale, "cadence")}</h3>
            <p className="mt-1 text-sm text-[var(--sunlit-muted)]">{text(locale, "cadenceSub")}</p>
            <div className="mt-5 grid gap-3 md:grid-cols-2">
              {active.content.weeklyCadence.slice(0, 4).map((week) => (
                <div className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-5" key={week.week}>
                  <div className="flex items-center gap-2">
                    <CalendarDays size={17} className="text-[var(--sunlit-pink)]" />
                    <h4 className="font-extrabold text-[var(--sunlit-ink)]">
                      {text(locale, "week")} {week.week}: {week.focus}
                    </h4>
                  </div>
                  <ul className="mt-3 grid gap-2 text-sm leading-6 text-[var(--sunlit-muted)]">
                    {week.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </article>

          <section className="grid gap-4 xl:grid-cols-2">
            <details className="sunlit-panel group rounded-[1.75rem] p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-[var(--sunlit-ink)]">
                <span>{text(locale, "contentPillars")}</span>
                <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-3 py-1.5 text-xs text-[var(--sunlit-pink)]">
                  {text(locale, "viewDetails")} · {active.content.pillars.length}
                </span>
              </summary>
              <p className="mt-2 text-sm text-[var(--sunlit-muted)]">{text(locale, "pillarsSub")}</p>
              <div className="mt-5 grid gap-3">
                {active.content.pillars.map((pillar, index) => (
                  <div className="rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4" key={pillar.name}>
                    <div className="flex items-start gap-3">
                      <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--sunlit-ink)] text-xs font-extrabold text-white">
                        {index + 1}
                      </span>
                      <div>
                        <h4 className="font-extrabold text-[var(--sunlit-ink)]">{pillar.name}</h4>
                        <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">{pillar.rationale}</p>
                        <div className="mt-3 flex flex-wrap gap-2">
                          {pillar.contentAngles.map((angle) => (
                            <span className="rounded-full bg-white px-2.5 py-1 text-xs font-bold text-[var(--sunlit-muted)]" key={angle}>
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

            <details className="sunlit-panel group rounded-[1.75rem] p-6">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-[var(--sunlit-ink)]">
                <span>{text(locale, "whyTitle")}</span>
                <span className="rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs text-[var(--sunlit-aqua-dark)]">
                  {text(locale, "viewDetails")}
                </span>
              </summary>
              <p className="mt-3 text-sm leading-6 text-[var(--sunlit-muted)]">{text(locale, "whyBody")}</p>
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="rounded-full bg-[var(--sunlit-paper)] px-3 py-1.5 text-xs font-bold text-[var(--sunlit-muted)]">
                  {text(locale, "profileSource")}
                </span>
                <span className="rounded-full bg-[var(--sunlit-paper)] px-3 py-1.5 text-xs font-bold text-[var(--sunlit-muted)]">
                  {text(locale, "audienceSource")}
                </span>
                <span className="rounded-full bg-[var(--sunlit-paper)] px-3 py-1.5 text-xs font-bold text-[var(--sunlit-muted)]">
                  {text(locale, "brandSource")}
                </span>
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
      <span className="text-[13px] text-[var(--sunlit-muted)]">{label}:</span>
      <span className="text-[13px] font-bold text-[var(--sunlit-ink)]">{value}</span>
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
      generateCta: "إنشاء الاستراتيجية",
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
      generateCta: "Create Strategy",
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
