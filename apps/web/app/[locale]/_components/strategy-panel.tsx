"use client";

import { useEffect, useMemo, useState } from "react";
import { RefreshCcw, Sparkles, Target } from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type { AuthSession, Locale, StrategyRecord } from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function StrategyPanel({ locale }: { locale: Locale }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [strategies, setStrategies] = useState<StrategyRecord[]>([]);
  const [objective, setObjective] = useState("");
  const [horizonDays, setHorizonDays] = useState(90);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const client = useMemo(() => {
    const options = {
      baseUrl: apiBaseUrl
    } satisfies { baseUrl: string; accessToken?: string; workspaceId?: string };

    return new MarkosApiClient(
      session
        ? {
            ...options,
            accessToken: session.tokens.accessToken,
            workspaceId: session.workspace.id
          }
        : options
    );
  }, [session]);

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);
    if (stored) {
      setSession(JSON.parse(stored) as AuthSession);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshStrategies(client, setStrategies, setMessage);
  }, [client, session]);

  async function generate() {
    setIsBusy(true);
    setMessage("");

    try {
      const payload = objective.trim()
        ? {
            horizonDays,
            objective: objective.trim()
          }
        : {
            horizonDays
          };
      const strategy = await client.generateStrategy(payload);
      setStrategies((current) => [strategy, ...current.filter((item) => item.id !== strategy.id)]);
      setMessage(copy(locale, "generated"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  if (!session) {
    return (
      <section className="mt-8 rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-accent">
          <Target size={20} />
          <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{copy(locale, "signInFirst")}</p>
      </section>
    );
  }

  const active = strategies[0];

  return (
    <section className="mt-8 grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
            <p className="mt-1 text-sm text-muted">{session.workspace.name}</p>
          </div>
          <button
            aria-label={copy(locale, "refresh")}
            className="rounded-button border border-border p-2 text-muted hover:text-navy"
            disabled={isBusy}
            onClick={() => refreshStrategies(client, setStrategies, setMessage)}
            type="button"
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        <label className="mt-5 block">
          <span className="text-xs font-medium text-muted">{copy(locale, "objective")}</span>
          <textarea
            className="mt-1 min-h-28 w-full resize-y rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            onChange={(event) => setObjective(event.target.value)}
            placeholder={copy(locale, "objectivePlaceholder")}
            value={objective}
          />
        </label>

        <label className="mt-3 block">
          <span className="text-xs font-medium text-muted">{copy(locale, "horizon")}</span>
          <input
            className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            max={180}
            min={30}
            onChange={(event) => setHorizonDays(Number(event.target.value))}
            step={30}
            type="number"
            value={horizonDays}
          />
        </label>

        <button
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={isBusy}
          onClick={generate}
          type="button"
        >
          <Sparkles size={16} />
          {copy(locale, "generate")}
        </button>
        <p className="mt-3 min-h-5 text-sm text-muted">{message}</p>
      </aside>

      <div className="rounded-card border border-border bg-card p-5 shadow-card">
        {active ? (
          <article>
            <div className="border-b border-border pb-4">
              <p className="text-xs font-medium uppercase tracking-normal text-accent">{copy(locale, "latest")}</p>
              <h2 className="mt-1 text-xl font-semibold text-navy">{active.title}</h2>
              <p className="mt-2 text-sm text-muted">
                {active.content.horizonDays} {copy(locale, "days")} · v{active.version}
              </p>
            </div>

            <p className="mt-4 text-sm leading-6 text-muted">{active.content.summary}</p>

            <div className="mt-5 grid gap-4 lg:grid-cols-2">
              <StrategyBlock title={copy(locale, "objectives")} items={active.content.objectives} />
              <StrategyBlock title={copy(locale, "nextActions")} items={active.content.nextActions} />
            </div>

            <div className="mt-5 grid gap-3">
              <h3 className="text-sm font-semibold text-navy">{copy(locale, "pillars")}</h3>
              {active.content.pillars.map((pillar) => (
                <div className="rounded-card border border-border p-3" key={pillar.name}>
                  <h4 className="text-sm font-semibold text-navy">{pillar.name}</h4>
                  <p className="mt-1 text-sm text-muted">{pillar.rationale}</p>
                  <p className="mt-2 text-xs text-muted">{pillar.contentAngles.join(" / ")}</p>
                </div>
              ))}
            </div>

            <div className="mt-5 grid gap-3">
              <h3 className="text-sm font-semibold text-navy">{copy(locale, "cadence")}</h3>
              {active.content.weeklyCadence.map((week) => (
                <div className="rounded-card border border-border p-3" key={week.week}>
                  <h4 className="text-sm font-semibold text-navy">
                    {copy(locale, "week")} {week.week}: {week.focus}
                  </h4>
                  <ul className="mt-2 list-inside list-disc text-sm leading-6 text-muted">
                    {week.actions.map((action) => (
                      <li key={action}>{action}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>

            <div className="mt-5">
              <h3 className="text-sm font-semibold text-navy">{copy(locale, "grounding")}</h3>
              <div className="mt-2 flex flex-wrap gap-2">
                {active.content.retrievedContext.map((chunk) => (
                  <span className="rounded-button border border-border px-2 py-1 text-xs text-muted" key={chunk.id}>
                    {chunk.section}/{chunk.key}
                  </span>
                ))}
              </div>
            </div>
          </article>
        ) : (
          <div className="rounded-card border border-dashed border-border p-6 text-sm text-muted">{copy(locale, "empty")}</div>
        )}
      </div>
    </section>
  );
}

function StrategyBlock({ items, title }: { items: string[]; title: string }) {
  return (
    <div className="rounded-card border border-border p-3">
      <h3 className="text-sm font-semibold text-navy">{title}</h3>
      <ul className="mt-2 list-inside list-disc text-sm leading-6 text-muted">
        {items.map((item) => (
          <li key={item}>{item}</li>
        ))}
      </ul>
    </div>
  );
}

async function refreshStrategies(
  client: MarkosApiClient,
  setStrategies: (strategies: StrategyRecord[]) => void,
  setMessage: (message: string) => void
) {
  try {
    setStrategies(await client.strategies());
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Request failed");
  }
}

function copy(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      cadence: "الإيقاع الأسبوعي",
      days: "يوم",
      empty: "لا توجد استراتيجية محفوظة بعد. أنشئ واحدة بعد تعبئة الخزنة.",
      failed: "تعذر تنفيذ الطلب",
      generate: "إنشاء استراتيجية",
      generated: "تم إنشاء الاستراتيجية",
      grounding: "السياق المسترجع",
      horizon: "أفق الخطة بالأيام",
      latest: "أحدث استراتيجية",
      nextActions: "الخطوات التالية",
      objective: "الهدف",
      objectivePlaceholder: "مثال: زيادة طلبات العملاء من إنستغرام",
      objectives: "الأهداف",
      pillars: "ركائز المحتوى",
      refresh: "تحديث",
      signInFirst: "سجل الدخول من لوحة التحكم أولا ثم أكمل الخزنة قبل إنشاء الاستراتيجية.",
      title: "الاستراتيجية",
      week: "الأسبوع"
    },
    en: {
      cadence: "Weekly Cadence",
      days: "days",
      empty: "No saved strategy yet. Generate one after filling the Vault.",
      failed: "Request failed",
      generate: "Generate strategy",
      generated: "Strategy generated",
      grounding: "Retrieved Context",
      horizon: "Plan horizon in days",
      latest: "Latest Strategy",
      nextActions: "Next Actions",
      objective: "Objective",
      objectivePlaceholder: "Example: increase qualified Instagram inquiries",
      objectives: "Objectives",
      pillars: "Content Pillars",
      refresh: "Refresh",
      signInFirst: "Sign in from the dashboard first, then complete the Vault before generating strategy.",
      title: "Strategy",
      week: "Week"
    }
  };

  return dictionary[locale][key] ?? key;
}
