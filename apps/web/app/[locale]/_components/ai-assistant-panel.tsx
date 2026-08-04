"use client";

import { useState } from "react";
import {
  ArrowRight,
  BarChart3,
  Bot,
  CalendarClock,
  Database,
  FileText,
  Loader2,
  MessageSquareText,
  Send,
  Sparkles,
  Target
} from "lucide-react";
import type { AgentName, AgentRunRecord, Locale, VaultRagChunk } from "@markos/shared-types";
import { MeteredActionNotice, quotaBlockedMessage, quotaErrorMessage, useMeteredActionState } from "./metered-action";
import { VaultGroundingNotice, useVaultGroundingState, vaultGapMessage } from "./vault-grounding";
import { useMarkosClient, useMarkosSession } from "./browser-session";


type ChatMessage = {
  id: string;
  role: "assistant" | "user";
  body: string;
  run?: AgentRunRecord;
};

const agentOptions: Array<{ agent: AgentName; icon: typeof Sparkles; route: string }> = [
  { agent: "BUSINESS_GROWTH_ADVISOR", icon: Sparkles, route: "strategy" },
  { agent: "CONTENT_CREATOR", icon: FileText, route: "content" },
  { agent: "CONTENT_PLANNER", icon: CalendarClock, route: "schedule" },
  { agent: "ANALYTICS_CONSULTANT", icon: BarChart3, route: "analytics" }
];

const demoContext: VaultRagChunk[] = [
  {
    id: "demo-company",
    key: "profile",
    score: 0.91,
    section: "COMPANY",
    value: { name: "Zain Arabia", industry: "Telecom", location: "Bahrain" },
    version: 3
  },
  {
    id: "demo-audience",
    key: "primary_audience",
    score: 0.87,
    section: "AUDIENCE",
    value: { segment: "Young professionals", painPoint: "Reliable connectivity and digital transformation support" },
    version: 2
  },
  {
    id: "demo-objectives",
    key: "growth_goals",
    score: 0.82,
    section: "OBJECTIVES",
    value: { focus: "Increase qualified Instagram inquiries in 90 days" },
    version: 1
  }
];

export function AiAssistantPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [selectedAgent, setSelectedAgent] = useState<AgentName>("BUSINESS_GROWTH_ADVISOR");
  const [prompt, setPrompt] = useState(copy(locale, "defaultPrompt"));
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      body: copy(locale, "welcome"),
      id: "welcome",
      role: "assistant"
    }
  ]);
  const [activeContext, setActiveContext] = useState<VaultRagChunk[]>(demoContext);
  const [error, setError] = useState("");
  const [isRunning, setIsRunning] = useState(false);
  const vaultGrounding = useVaultGroundingState({ area: "assistant", locale });
  const aiUsage = useMeteredActionState({
    fallbackTotal: 1000,
    fallbackUsed: 680,
    label: locale === "ar" ? "توليدات الذكاء" : "AI generations",
    metric: "AI_GENERATION"
  });

  const client = useMarkosClient(locale);

  async function askMarkos() {
    const task = prompt.trim();
    if (task.length < 8 || isRunning) return;
    if (vaultGrounding.blocked) {
      setError(vaultGapMessage(locale));
      return;
    }

    if (aiUsage.blocked) {
      setError(quotaBlockedMessage(locale));
      return;
    }

    setError("");
    setIsRunning(true);
    setMessages((current) => [...current, { body: task, id: `user-${Date.now()}`, role: "user" }]);

    if (!session) {
      const demoRun = buildDemoRun(selectedAgent, task, locale);
      setActiveContext(demoRun.request.retrievedContext);
      setMessages((current) => [
        ...current,
        {
          body: summarizeRun(demoRun, locale),
          id: demoRun.id,
          role: "assistant",
          run: demoRun
        }
      ]);
      setIsRunning(false);
      return;
    }

    try {
      const run = await client.runAgent({
        agent: selectedAgent,
        locale,
        task
      });
      setActiveContext(run.request.retrievedContext);
      setMessages((current) => [
        ...current,
        {
          body: summarizeRun(run, locale),
          id: run.id,
          role: "assistant",
          run
        }
      ]);
    } catch (requestError) {
      setError(quotaErrorMessage(locale, requestError) ?? (requestError instanceof Error ? requestError.message : copy(locale, "failed")));
    } finally {
      setIsRunning(false);
    }
  }

  const selectedRoute = agentOptions.find((option) => option.agent === selectedAgent)?.route ?? "content";

  return (
    <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px]">
      <div className="rounded-[20px] bg-[linear-gradient(135deg,#14182b_0%,#102f54_55%,#24203f_100%)] p-5 text-white shadow-card xl:col-span-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff4b6e]">
              <Sparkles size={13} />
              {copy(locale, "eyebrow")}
            </div>
            <h1 className="mt-4 font-display text-[28px] font-bold leading-tight text-white">{copy(locale, "title")}</h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">{copy(locale, "subtitle")}</p>
          </div>
          <div className="grid grid-cols-3 gap-2 rounded-[18px] border border-white/10 bg-white/5 p-3 text-center">
            <Metric value="8" label={copy(locale, "agents")} />
            <Metric value={vaultGrounding.blocked ? "0" : String(activeContext.length)} label={copy(locale, "sources")} />
            <Metric value={messages.filter((message) => message.role === "assistant").length.toString()} label={copy(locale, "answers")} />
          </div>
        </div>
      </div>

      <div className="grid gap-4">
        <div className="rounded-card border border-border bg-card p-4 shadow-card">
          <div className="flex flex-wrap gap-2">
            {agentOptions.map((option) => {
              const Icon = option.icon;
              const isActive = selectedAgent === option.agent;
              return (
                <button
                  className={
                    isActive
                      ? "inline-flex items-center gap-2 rounded-button border border-accent bg-accent/10 px-3 py-2 text-xs font-bold text-accent"
                      : "inline-flex items-center gap-2 rounded-button border border-border bg-canvas px-3 py-2 text-xs font-semibold text-muted hover:text-navy"
                  }
                  key={option.agent}
                  onClick={() => setSelectedAgent(option.agent)}
                  type="button"
                >
                  <Icon size={15} />
                  {agentLabel(option.agent, locale)}
                </button>
              );
            })}
          </div>
        </div>

        <div className="min-h-[420px] rounded-card border border-border bg-card p-4 shadow-card">
          <div className="grid gap-3">
            {messages.map((message) => (
              <article
                className={
                  message.role === "user"
                    ? "ms-auto max-w-[78%] rounded-[18px] bg-accent px-4 py-3 text-sm font-semibold leading-6 text-white"
                    : "max-w-[86%] rounded-[18px] border border-border bg-canvas px-4 py-3 text-sm leading-6 text-navy"
                }
                key={message.id}
              >
                <p>{message.body}</p>
                {message.run ? (
                  <div className="mt-3 flex flex-wrap gap-2 border-t border-border/70 pt-3 text-[11px] font-semibold text-muted">
                    <span>{message.run.model}</span>
                    <span>{message.run.tokensIn + message.run.tokensOut} tokens</span>
                    <span>{message.run.request.retrievedContext.length} sources</span>
                  </div>
                ) : null}
              </article>
            ))}
            {isRunning ? (
              <div className="inline-flex w-fit items-center gap-2 rounded-full border border-border bg-canvas px-3 py-2 text-xs font-semibold text-muted">
                <Loader2 className="animate-spin" size={14} />
                {copy(locale, "thinking")}
              </div>
            ) : null}
          </div>
        </div>

        <div className="rounded-card border border-border bg-card p-4 shadow-card">
          <label className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">{copy(locale, "promptLabel")}</label>
          <textarea
            className="mt-3 min-h-28 w-full resize-none rounded-[18px] border border-border bg-canvas px-4 py-3 text-sm leading-6 text-navy outline-none focus:border-accent"
            onChange={(event) => setPrompt(event.target.value)}
            value={prompt}
          />
          <div className="mt-3">
            <MeteredActionNotice locale={locale} usage={aiUsage} />
          </div>
          <div className="mt-3">
            <VaultGroundingNotice locale={locale} state={vaultGrounding} />
          </div>
          <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
            <p className="min-h-5 text-xs text-accent">{error}</p>
            <button
              className="inline-flex items-center justify-center gap-2 rounded-button bg-accent px-5 py-3 text-sm font-bold text-white shadow-[0_12px_24px_rgba(239,62,91,.24)] disabled:opacity-60"
              disabled={isRunning || prompt.trim().length < 8 || aiUsage.blocked || vaultGrounding.blocked}
              onClick={askMarkos}
              type="button"
            >
              <Send size={16} />
              {copy(locale, "ask")}
            </button>
          </div>
        </div>
      </div>

      <aside className="grid gap-4">
        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent/10 text-accent">
              <Database size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-navy">{copy(locale, "contextTitle")}</h2>
              <p className="text-xs text-muted">{copy(locale, "contextSubtitle")}</p>
            </div>
          </div>

          {vaultGrounding.blocked ? (
            <div className="mt-4">
              <VaultGroundingNotice locale={locale} state={vaultGrounding} />
            </div>
          ) : (
            <div className="mt-4 grid gap-3">
              {activeContext.map((chunk) => (
                <article className="rounded-[18px] border border-border bg-canvas p-3" key={chunk.id}>
                  <div className="flex items-center justify-between gap-3">
                    <span className="rounded-full bg-navy px-2 py-1 text-[10px] font-bold uppercase text-white">{chunk.section}</span>
                    <span className="text-[11px] font-semibold text-emerald-600">{Math.round(chunk.score * 100)}%</span>
                  </div>
                  <p className="mt-2 text-sm font-bold text-navy">{formatKey(chunk.key)}</p>
                  <p className="mt-1 line-clamp-2 text-xs leading-5 text-muted">{formatValue(chunk.value)}</p>
                </article>
              ))}
            </div>
          )}
        </div>

        <div className="rounded-card border border-border bg-card p-5 shadow-card">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-[#FEEAF0] text-accent">
              <Target size={20} />
            </div>
            <div>
              <h2 className="text-base font-bold text-navy">{copy(locale, "actionsTitle")}</h2>
              <p className="text-xs text-muted">{copy(locale, "actionsSubtitle")}</p>
            </div>
          </div>
          <div className="mt-4 grid gap-2">
            <ActionLink href={`/${locale}/${selectedRoute}`} label={copy(locale, "openMatched")} />
            <ActionLink href={`/${locale}/content`} label={copy(locale, "createContent")} />
            <ActionLink href={`/${locale}/vault`} label={copy(locale, "updateVault")} />
          </div>
        </div>
      </aside>
    </section>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <p className="font-display text-xl font-bold text-white">{value}</p>
      <p className="text-[10px] font-bold uppercase tracking-[0.12em] text-white/50">{label}</p>
    </div>
  );
}

function ActionLink({ href, label }: { href: string; label: string }) {
  return (
    <a className="flex items-center justify-between rounded-[16px] border border-border bg-canvas px-3 py-3 text-sm font-bold text-navy hover:border-accent hover:text-accent" href={href}>
      {label}
      <ArrowRight size={16} />
    </a>
  );
}

function buildDemoRun(agent: AgentName, task: string, locale: Locale): AgentRunRecord {
  return {
    agent,
    createdAt: new Date().toISOString(),
    id: `demo-${Date.now()}`,
    model: "preview-grounded-agent",
    output: {
      recommendation:
        locale === "ar"
          ? "ابدأ بحملة إنستغرام قصيرة تربط الاعتمادية بسرعة الخدمة، ثم حوّل أفضل منشور إلى ريل مع دعوة واضحة للتواصل."
          : "Start with a short Instagram campaign around reliability and speed, then turn the strongest post into a Reel with a clear inquiry CTA.",
      nextActions:
        locale === "ar"
          ? ["أنشئ سكربت ريل", "جدول أفضل وقت نشر", "حدّث الخزنة بنتيجة الحملة"]
          : ["Generate a Reel script", "Schedule the best posting window", "Write campaign learnings back to the Vault"]
    },
    promptVersion: `${agent.toLowerCase()}.preview`,
    request: {
      locale,
      retrievedContext: demoContext,
      task
    },
    tokensIn: 420,
    tokensOut: 210,
    workspaceId: "preview"
  };
}

function summarizeRun(run: AgentRunRecord, locale: Locale): string {
  const output = run.output;
  const recommendation = output.recommendation ?? output.summary ?? output.answer ?? output.result;
  if (typeof recommendation === "string") {
    return recommendation;
  }

  const nextActions = output.nextActions;
  if (Array.isArray(nextActions) && nextActions.every((item) => typeof item === "string")) {
    return nextActions.join(locale === "ar" ? "، " : ", ");
  }

  return locale === "ar"
    ? `تم تشغيل ${agentLabel(run.agent, locale)} مع ${run.request.retrievedContext.length} مصادر من الخزنة. راجع السياق والخطوات المقترحة.`
    : `${agentLabel(run.agent, locale)} ran with ${run.request.retrievedContext.length} Vault sources. Review the context and suggested next actions.`;
}

function agentLabel(agent: AgentName, locale: Locale): string {
  const labels: Record<AgentName, Record<Locale, string>> = {
    ANALYTICS_CONSULTANT: { ar: "محلل الأداء", en: "Analytics" },
    BUSINESS_GROWTH_ADVISOR: { ar: "نمو الأعمال", en: "Growth Advisor" },
    CONTENT_CREATOR: { ar: "منشئ المحتوى", en: "Content Creator" },
    CONTENT_PLANNER: { ar: "مخطط النشر", en: "Planner" },
    IMAGE_PROMPT: { ar: "موجه الصور", en: "Image Prompt" },
    MARKETING_STRATEGIST: { ar: "الاستراتيجي", en: "Strategist" },
    RECOMMENDATION_ENGINE: { ar: "التوصيات", en: "Recommendations" },
    REEL_SCRIPT: { ar: "سكريبت ريل", en: "Reel Script" }
  };

  return labels[agent][locale];
}

function formatKey(key: string): string {
  return key
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function formatValue(value: Record<string, unknown>): string {
  return Object.entries(value)
    .slice(0, 3)
    .map(([key, item]) => `${formatKey(key)}: ${String(item)}`)
    .join(" · ");
}

function copy(locale: Locale, key: string): string {
  const dictionary = {
    ar: {
      actionsSubtitle: "حوّل الإجابة إلى عمل داخل المنتج.",
      actionsTitle: "خطوات مقترحة",
      agents: "وكلاء",
      answers: "إجابات",
      ask: "اسأل MARKOS",
      contextSubtitle: "مصادر RAG التي استخدمها الجواب.",
      contextTitle: "السياق المستخدم",
      createContent: "أنشئ محتوى",
      defaultPrompt: "ما أفضل خطوة تسويقية هذا الأسبوع لزيادة الاستفسارات المؤهلة من إنستغرام؟",
      eyebrow: "AI Assistant",
      failed: "تعذر تشغيل المستشار الذكي.",
      openMatched: "افتح المسار المناسب",
      promptLabel: "سؤالك",
      sources: "مصادر",
      subtitle: "محادثة عملية مع MARKOS: سؤال، سياق من الخزنة، توصية، ثم خطوة تنفيذ واضحة.",
      thinking: "MARKOS يراجع الخزنة والتحليلات...",
      title: "مستشار MARKOS الذكي",
      updateVault: "حدّث الخزنة",
      welcome: "اسألني عن المحتوى، الجدولة، التحليلات، أو الخطوة التالية. سأوضح السياق الذي استخدمته قبل التوصية."
    },
    en: {
      actionsSubtitle: "Turn the answer into product work.",
      actionsTitle: "Suggested actions",
      agents: "Agents",
      answers: "Answers",
      ask: "Ask MARKOS",
      contextSubtitle: "RAG sources used by the answer.",
      contextTitle: "Grounded context",
      createContent: "Create content",
      defaultPrompt: "What is the best marketing move this week to increase qualified Instagram inquiries?",
      eyebrow: "AI Assistant",
      failed: "AI Consultant could not run.",
      openMatched: "Open matched workflow",
      promptLabel: "Your question",
      sources: "Sources",
      subtitle: "A practical MARKOS conversation: question, Vault context, recommendation, then a clear execution step.",
      thinking: "MARKOS is checking the Vault and analytics...",
      title: "MARKOS AI Assistant",
      updateVault: "Update Vault",
      welcome: "Ask me about content, scheduling, analytics, or the next growth move. I will show the context I used before recommending action."
    }
  } as const;

  return dictionary[locale][key as keyof (typeof dictionary)["en"]] ?? key;
}
