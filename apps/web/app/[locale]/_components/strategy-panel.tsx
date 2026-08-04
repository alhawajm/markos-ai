"use client";

import { useEffect, useState } from "react";
import { ArrowRight, CalendarDays, Download, FileText, RefreshCcw, Sparkles, Target, Zap } from "lucide-react";
import type { Locale, StrategyRecord } from "@markos/shared-types";
import { MeteredActionNotice, quotaBlockedMessage, quotaErrorMessage, useMeteredActionState } from "./metered-action";
import { VaultGroundingNotice, useVaultGroundingState, vaultGapMessage } from "./vault-grounding";
import { useMarkosClient, useMarkosSession } from "./browser-session";


export function StrategyPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [strategies, setStrategies] = useState<StrategyRecord[]>(() => [demoStrategy(locale)]);
  const [objective, setObjective] = useState(text(locale, "defaultObjective"));
  const [horizonDays, setHorizonDays] = useState(90);
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
      setStrategies([demoStrategy(locale)]);
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const nextStrategies = await client.strategies();
      setStrategies(nextStrategies.length > 0 ? nextStrategies : [demoStrategy(locale)]);
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
      setStrategies([demoStrategy(locale, objective, horizonDays)]);
      setMessage(text(locale, "previewGenerated"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const strategy = await client.generateStrategy(
        objective.trim()
          ? {
              horizonDays,
              objective: objective.trim()
            }
          : {
              horizonDays
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

  const active = strategies[0] ?? demoStrategy(locale, objective, horizonDays);

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
                {session ? text(locale, "vaultGrounded") : text(locale, "previewMode")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{text(locale, "subtitle")}</p>
            <div className="mt-5 flex flex-wrap gap-4">
              <HeroStat color="#22C55E" label={text(locale, "horizon")} value={`${active.content.horizonDays} ${text(locale, "days")}`} />
              <HeroStat color="#F59E0B" label={text(locale, "pillars")} value={active.content.pillars.length.toString()} />
              <HeroStat color="#E94560" label={text(locale, "nextActions")} value={active.content.nextActions.length.toString()} />
            </div>
          </div>
          <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50" disabled={isBusy} onClick={refreshStrategies} type="button">
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

          <div className="mt-4">
            <MeteredActionNotice locale={locale} usage={strategyUsage} />
          </div>
          <div className="mt-3">
            <VaultGroundingNotice locale={locale} state={vaultGrounding} />
          </div>

          <button className="mt-5 inline-flex h-11 w-full items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-4 text-sm font-extrabold text-white shadow-[0_3px_12px_rgba(233,69,96,.3)] disabled:opacity-50" disabled={isBusy || strategyUsage.blocked || vaultGrounding.blocked} onClick={generate} type="button">
            <Zap size={16} />
            {text(locale, "generateCta")}
          </button>
          <p className="mt-3 min-h-5 text-sm leading-6 text-muted">{message}</p>
        </aside>

        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-extrabold uppercase tracking-[.14em] text-accent">{text(locale, "latest")}</p>
              <h3 className="mt-1 font-display text-2xl font-extrabold tracking-normal text-navy">{active.title}</h3>
              <p className="mt-2 text-sm leading-6 text-muted">{active.content.summary}</p>
            </div>
            <button className="inline-flex h-10 items-center gap-2 rounded-xl border border-[#E8ECF2] bg-canvas px-3 text-sm font-bold text-muted" type="button">
              <Download size={15} />
              {text(locale, "export")}
            </button>
          </div>

          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <PlanWindow label="30" text={active.content.objectives[0] ?? text(locale, "stabilize")} />
            <PlanWindow label="60" text={active.content.objectives[1] ?? text(locale, "scale")} />
            <PlanWindow label="90" text={active.content.objectives[2] ?? text(locale, "optimize")} />
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{text(locale, "contentPillars")}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "pillarsSub")}</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-600">{text(locale, "ready")}</span>
          </div>
          <div className="mt-5 grid gap-3">
            {active.content.pillars.map((pillar, index) => (
              <div className="rounded-xl border border-[#E8ECF2] bg-canvas p-4" key={pillar.name}>
                <div className="flex items-start gap-3">
                  <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-midnavy text-xs font-extrabold text-white">{index + 1}</span>
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
        </article>

        <article className="rounded-2xl border-2 border-midnavy bg-card p-5 shadow-[0_4px_24px_rgba(233,69,96,.18)]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#E94560,#6366F1)] text-white">
              <FileText size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-navy">{text(locale, "nextActions")}</h3>
              <p className="text-sm text-muted">{text(locale, "nextActionsSub")}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2">
            {active.content.nextActions.map((action) => (
              <a className="flex items-center justify-between gap-3 rounded-xl bg-canvas px-3 py-3 text-sm font-bold text-navy" href={`/${locale}/content`} key={action}>
                <span>{action}</span>
                <ArrowRight size={15} className="text-accent" />
              </a>
            ))}
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <h3 className="text-[15px] font-bold text-navy">{text(locale, "cadence")}</h3>
          <div className="mt-5 grid gap-3">
            {active.content.weeklyCadence.map((week) => (
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

        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <h3 className="text-[15px] font-bold text-navy">{text(locale, "grounding")}</h3>
          <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "groundingSub")}</p>
          <div className="mt-5 grid gap-2">
            {active.content.retrievedContext.map((chunk) => (
              <span className="rounded-xl border border-[#E8ECF2] bg-canvas px-3 py-2 text-sm font-bold text-muted" key={chunk.id}>
                {chunk.section} / {chunk.key}
              </span>
            ))}
          </div>
        </article>
      </section>
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

function PlanWindow({ label, text: body }: { label: string; text: string }) {
  return (
    <div className="rounded-xl border border-[#E8ECF2] bg-canvas p-4">
      <p className="font-display text-2xl font-extrabold tracking-normal text-accent">{label}</p>
      <p className="mt-2 text-sm font-bold leading-6 text-navy">{body}</p>
    </div>
  );
}

function demoStrategy(locale: Locale, objective = text(locale, "defaultObjective"), horizonDays = 90): StrategyRecord {
  const now = "2026-06-15T09:00:00.000Z";
  const arabic = locale === "ar";

  return {
    content: {
      horizonDays,
      kpis: [
        { name: "Reach", target: "+18%" },
        { name: "Engagement", target: "4.8%" }
      ],
      nextActions: arabic ? ["توليد سكربت ريل", "جدولة كاروسيل الجمعة", "مراجعة نقاط ألم الجمهور"] : ["Generate a Reel script", "Schedule the Friday carousel", "Review audience pain points"],
      objectives: arabic ? ["تثبيت إيقاع النشر الأسبوعي", "زيادة الاستفسارات المؤهلة", "إعادة التعلم إلى الخزنة"] : ["Stabilize weekly content cadence", "Grow qualified campaign inquiries", "Feed learnings back into the Vault"],
      pillars: [
        {
          contentAngles: arabic ? ["إثبات التغطية", "الاعتمادية", "الدعم المحلي"] : ["Coverage proof", "Reliability", "Local support"],
          name: arabic ? "اتصال دائم" : "Always-on connectivity",
          rationale: arabic ? "ابدأ بالثقة والسرعة للعملاء الذين يقارنون باقات الاتصالات." : "Lead with trust and speed for customers comparing telecom plans."
        },
        {
          contentAngles: arabic ? ["سير عمل الأعمال", "أدوات السحابة", "الدعم"] : ["SMB workflows", "Cloud tools", "Support"],
          name: arabic ? "تمكين نمو الأعمال" : "Business growth enablement",
          rationale: arabic ? "اجعل Zain Arabia تبدو كشريك تحول رقمي، وليس مجرد مزود خدمة." : "Make Zain Arabia feel like a digital transformation partner, not just a service provider."
        },
        {
          contentAngles: arabic ? ["باقات الطلاب", "باقات العائلة", "عروض رمضان"] : ["Student plans", "Family bundles", "Ramadan offers"],
          name: arabic ? "عروض في وقتها" : "Timely offers",
          rationale: arabic ? "حوّل الاحتياجات الموسمية إلى أسباب واضحة وسهلة لاتخاذ إجراء." : "Turn seasonal needs into clear, low-friction reasons to act."
        }
      ],
      retrievedContext: [
        { id: "ctx-company", key: "company", score: 0.96, section: "COMPANY", value: { name: "Zain Arabia" }, version: 1 },
        { id: "ctx-audience", key: "target-audience", score: 0.92, section: "AUDIENCE", value: { location: "Bahrain" }, version: 1 },
        { id: "ctx-tone", key: "brand-tone", score: 0.88, section: "TONE", value: { tone: "Professional" }, version: 1 }
      ],
      risks: arabic ? ["العروض العامة قد لا تحقق أداء جيدا دون إثبات محلي."] : ["Generic offers may underperform without local proof."],
      summary: arabic
        ? `${objective}. يجب أن يركز MARKOS على الاعتمادية، الملاءمة المحلية، وعروض واضحة تقود إلى الخطوة التالية.`
        : `${objective}. MARKOS should focus on reliable connectivity, local relevance, and clear next-step offers across Instagram-first content.`,
      weeklyCadence: [
        { actions: arabic ? ["نشر ريل واحد", "جدولة كاروسيل واحد", "تحديث رؤية AI"] : ["Publish one Reel", "Schedule one carousel", "Refresh AI insight"], focus: arabic ? "إيقاع التأسيس" : "Foundation cadence", week: 1 },
        { actions: arabic ? ["اختبار خطاف العرض", "مقارنة نوافذ نشر المنافسين"] : ["Test offer hook", "Compare competitor posting windows"], focus: arabic ? "استجابة الجمهور" : "Audience response", week: 2 },
        { actions: arabic ? ["تعزيز أفضل ركيزة", "حفظ تعلم الأداء"] : ["Double down on best pillar", "Save performance learning"], focus: arabic ? "حلقة التحسين" : "Optimization loop", week: 3 }
      ]
    },
    createdAt: now,
    horizonDays,
    id: "demo-strategy",
    title: arabic ? "استراتيجية نمو إنستغرام لمدة 90 يوما" : "90-day Instagram Growth Strategy",
    updatedAt: now,
    version: 1,
    workspaceId: "demo-workspace"
  };
}

function text(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      cadence: "الإيقاع الأسبوعي",
      contentPillars: "ركائز المحتوى",
      days: "يوم",
      defaultObjective: "زيادة الاستفسارات المؤهلة من إنستغرام خلال 90 يوما",
      export: "تصدير",
      failed: "فشل الطلب",
      generate: "توليد استراتيجية",
      generateCta: "توليد بالذكاء",
      generateSub: "مبنية على الخزنة والتحليلات",
      generated: "تم توليد الاستراتيجية",
      grounding: "السياق المسترجع",
      groundingSub: "مصادر الخزنة التي توجه الخطة",
      horizon: "الأفق",
      latest: "أحدث استراتيجية",
      nextActions: "الخطوات التالية",
      nextActionsSub: "حوّل الخطة إلى تنفيذ",
      pillars: "الركائز",
      pillarsSub: "رسائل قابلة للتنفيذ",
      previewGenerated: "تم تحديث استراتيجية المعاينة.",
      previewMode: "معاينة",
      ready: "جاهز",
      refresh: "تحديث",
      scale: "توسيع الاستفسارات المؤهلة",
      stabilize: "تثبيت إيقاع النشر",
      subtitle: "حوّل ذاكرة الأعمال إلى خطة 30/60/90 واضحة، ركائز محتوى، وخطوات تنفيذ.",
      title: "الاستراتيجية",
      vaultGrounded: "مبنية على الخزنة",
      week: "الأسبوع",
      objective: "الهدف",
      optimize: "تحسين الأداء من التحليلات"
    },
    en: {
      cadence: "Weekly Cadence",
      contentPillars: "Content Pillars",
      days: "days",
      defaultObjective: "Increase qualified Instagram inquiries over the next 90 days",
      export: "Export",
      failed: "Request failed",
      generate: "Generate Strategy",
      generateCta: "Generate with AI",
      generateSub: "Grounded in Vault and analytics",
      generated: "Strategy generated",
      grounding: "Retrieved Context",
      groundingSub: "Vault sources guiding this plan",
      horizon: "Horizon",
      latest: "Latest Strategy",
      nextActions: "Next Actions",
      nextActionsSub: "Turn the plan into work",
      pillars: "Pillars",
      pillarsSub: "Actionable message territories",
      previewGenerated: "Preview strategy updated.",
      previewMode: "Preview mode",
      ready: "Ready",
      refresh: "Refresh",
      scale: "Scale qualified inquiries",
      stabilize: "Stabilize publishing cadence",
      subtitle: "Turn business memory into a clear 30/60/90 plan, content pillars, and execution steps.",
      title: "Strategy",
      vaultGrounded: "Vault grounded",
      week: "Week",
      objective: "Objective",
      optimize: "Optimize from analytics"
    }
  };

  return dictionary[locale][key] ?? key;
}
