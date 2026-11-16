"use client";
import { useEffect, useState } from "react";
import type { Locale, WorkspaceAssistantTurn } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import { GuidanceResult } from "./workspace-assistant";
import "./task-library.css";

export function StrategyPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  return <SavedStrategy key={`${session?.user.id}:${session?.workspace.id}`} locale={locale} />;
}
function SavedStrategy({ locale }: { locale: Locale }) {
  const api = useMarkosClient(locale),
    ar = locale === "ar";
  const [strategy, setStrategy] = useState<WorkspaceAssistantTurn | null | undefined>(),
    [error, setError] = useState(false),
    [retry, setRetry] = useState(0);
  const [plan, setPlan] = useState<string | null | undefined>();
  useEffect(() => setPlan(new URLSearchParams(window.location.search).get("plan")), []);
  useEffect(() => {
    if (plan === undefined) return;
    let live = true;
    setError(false);
    const refresh = () =>
      api
        .currentStrategy(plan ?? undefined)
        .then((value) => {
          if (live) {
            setStrategy(value);
            setError(false);
          }
        })
        .catch(() => {
          if (live) setError(true);
        });
    void refresh();
    const timer = setInterval(() => {
      if (!document.hidden) void refresh();
    }, 10000);
    return () => {
      live = false;
      clearInterval(timer);
    };
  }, [api, retry, plan]);
  return (
    <section className="task-workspace" aria-labelledby="strategy-title">
      <header className="task-workspace-header">
        <h1 id="strategy-title">{ar ? "الاستراتيجية" : "Strategy"}</h1>
        <a className="sunlit-primary" href={`/${locale}/app`}>
          {strategy?.strategy ? (ar ? "تحديث مع ماركوس" : "Update with MARKOS") : ar ? "التخطيط مع ماركوس" : "Plan with MARKOS"}
        </a>
      </header>
      {error ? (
        <div role="alert">
          <p>{ar ? "تعذّر تحميل الاستراتيجية." : "Couldn’t load your strategy."}</p>
          <button className="sunlit-secondary" onClick={() => setRetry((n) => n + 1)}>
            {ar ? "إعادة المحاولة" : "Try again"}
          </button>
        </div>
      ) : strategy === undefined ? (
        <p role="status">{ar ? "جارٍ تحميل استراتيجيتك…" : "Loading your strategy…"}</p>
      ) : strategy?.strategy ? (
        <div className="task-strategy-document">
          <p>
            {ar ? "آخر خطة محفوظة" : "Latest saved plan"} · {new Date(strategy.createdAt).toLocaleDateString(locale, { dateStyle: "medium" })}
          </p>
          <GuidanceResult value={strategy.strategy} locale={locale} />
        </div>
      ) : (
        <div className="task-workspace-empty">
          <h2>{ar ? "وجهة واضحة لنشاطك" : "A clear direction for your business"}</h2>
          <p>
            {ar
              ? "ناقش أهدافك مع ماركوس في الرئيسية. ستظهر استراتيجيتك هنا لمراجعتها والرجوع إليها."
              : "Discuss your goals with MARKOS on Home. Your strategy will be saved here to review and return to."}
          </p>
        </div>
      )}
    </section>
  );
}
