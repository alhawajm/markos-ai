"use client";
import { useRef, useState } from "react";
import type { Locale } from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";
import { GuidanceResult } from "./workspace-assistant";
import { TaskFeedback } from "./task-feedback";

export function InsightsAdvisor({ locale, days }: { locale: Locale; days: number }) {
  const api = useMarkosClient(locale),
    ar = locale === "ar";
  const [question, setQuestion] = useState(""),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [output, setOutput] = useState<Record<string, unknown> | null>(null);
  const working = useRef(false);
  async function ask() {
    if (working.current) return;
    working.current = true;
    setBusy(true);
    setError("");
    try {
      const response = await api.runAgent({
        agent: "ANALYTICS_CONSULTANT",
        locale,
        task:
          question.trim() ||
          (ar ? "اشرح النتائج المتاحة واقترح ثلاث خطوات عملية تالية." : "Explain the available results and suggest three practical next actions."),
        inputs: { analyticsDays: days }
      });
      setOutput(response.output);
    } catch {
      setError(
        ar ? "تعذّر شرح النتائج الآن. سؤالك محفوظ هنا للمحاولة مجددًا." : "Couldn’t explain the results right now. Your question is kept here to retry."
      );
    } finally {
      working.current = false;
      setBusy(false);
    }
  }
  return (
    <section className="sunlit-panel rounded-2xl p-5 sm:p-6" aria-labelledby="insights-advice-title">
      <h2 id="insights-advice-title" className="text-xl font-semibold">
        {ar ? "ماذا تعني هذه النتائج لنشاطك؟" : "What does this mean for your business?"}
      </h2>
      <form
        className="mt-4 grid gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          void ask();
        }}
      >
        <label className="grid gap-2">
          <span>{ar ? "اسأل عن أدائك" : "Ask about your performance"}</span>
          <textarea
            className="sunlit-field min-h-24 rounded-xl p-3"
            value={question}
            dir="auto"
            disabled={busy}
            maxLength={1000}
            onChange={(e) => setQuestion(e.target.value)}
            placeholder={ar ? "ما الذي أركّز عليه بعد ذلك؟" : "What should I focus on next?"}
          />
        </label>
        <button className="sunlit-primary min-h-11 justify-self-start rounded-xl px-5 py-3" disabled={busy}>
          {ar ? "اشرح أدائي" : "Explain my performance"}
        </button>
      </form>
      {busy ? <TaskFeedback label={ar ? "أراجع بياناتك وأرتّب الخطوات التالية" : "Reviewing your data and shaping next steps"} locale={locale} /> : null}
      {error ? (
        <p role="alert" className="mt-4">
          {error}
        </p>
      ) : null}
      {output && !busy ? <GuidanceResult value={output} locale={locale} /> : null}
    </section>
  );
}
