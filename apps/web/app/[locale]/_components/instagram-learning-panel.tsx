"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { Check, ExternalLink, LoaderCircle } from "lucide-react";
import type { InstagramLearningField, InstagramLearningRecord, Locale } from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";

const primary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-base font-semibold text-[var(--on-primary)] disabled:opacity-50";
const secondary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-3 text-base font-medium disabled:opacity-50";
const labels: Record<InstagramLearningField, [string, string]> = {
  toneWords: ["Tone", "النبرة"],
  voiceNotes: ["Writing preferences", "تفضيلات الكتابة"],
  aestheticWords: ["Personality & visual direction", "الشخصية والتوجه البصري"],
  contentDirection: ["Content direction", "توجه المحتوى"],
  colors: ["Observed palette", "لوحة الألوان المرصودة"]
};
const display = (value: string | string[] | undefined) => (Array.isArray(value) ? value.join("\n") : (value ?? ""));

export function InstagramLearningPanel({ locale, username }: { locale: Locale; username: string }) {
  const client = useMarkosClient(locale);
  const ar = locale === "ar";
  const [run, setRun] = useState<InstagramLearningRecord | null>(null);
  const [attempt, setAttempt] = useState(0);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [values, setValues] = useState<Partial<Record<InstagramLearningField, string>>>({});
  const [selected, setSelected] = useState<InstagramLearningField[]>([]);
  const [editing, setEditing] = useState<InstagramLearningField | null>(null);
  const reviewedRun = useRef<string | null>(null);
  const scrollRegion = useRef<HTMLDivElement>(null);
  const [step, setStep] = useState(0);
  function changeStep(next: number) {
    setStep(next);
    setEditing(null);
    scrollRegion.current?.scrollTo({ top: 0 });
  }

  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let finished = false;
    function receive(next: InstagramLearningRecord) {
      if (!active || finished) return;
      setRun(next);
      if (!["PENDING", "COLLECTING", "ANALYZING"].includes(next.status)) {
        finished = true;
        setError("");
        if (timer) clearTimeout(timer);
      }
      if (next.status === "READY" && reviewedRun.current !== next.id) {
        reviewedRun.current = next.id;
        setValues(Object.fromEntries((next.result?.suggestions ?? []).map((item) => [item.field, display(item.value)])));
        setSelected((next.result?.suggestions ?? []).filter((item) => item.field !== "colors").map((item) => item.field));
      }
    }
    async function poll() {
      try {
        const next = await client.instagramLearning();
        if (!active || finished || !next) return;
        receive(next);
        if (["COLLECTING", "ANALYZING", "PENDING"].includes(next.status)) timer = setTimeout(() => void poll(), 2000);
      } catch {
        if (active && !finished) setError(ar ? "تعذر تحديث التقدم. أعد المحاولة للتحقق من النتيجة." : "Could not refresh progress. Retry to check the result.");
      }
    }
    setError("");
    void client
      .startInstagramLearning()
      .then(async (next) => {
        if (!active) return;
        receive(next);
        if (next.status === "PENDING" || (next.status === "FAILED" && attempt > 0)) {
          finished = false;
          receive({ ...next, status: "COLLECTING" });
          timer = setTimeout(() => void poll(), 2000);
          receive(await client.analyzeInstagramLearning(next.id, locale));
        } else if (["COLLECTING", "ANALYZING"].includes(next.status)) timer = setTimeout(() => void poll(), 2000);
      })
      .catch(() => {
        if (active && !finished)
          setError(ar ? "لم يكتمل الاستكشاف. أعد المحاولة للتحقق من حالته." : "Exploration could not be completed. Retry to check its status.");
      });
    return () => {
      active = false;
      if (timer) clearTimeout(timer);
    };
  }, [client, locale, ar, attempt]);

  async function save(skip: boolean) {
    if (!run || busy) return;
    setBusy(true);
    setError("");
    try {
      const changes = selected.map((field) => ({
        field,
        value: ["toneWords", "aestheticWords", "colors"].includes(field)
          ? (values[field] ?? "")
              .split("\n")
              .map((v) => v.trim())
              .filter(Boolean)
          : (values[field] ?? "")
      }));
      setRun(
        skip ? await client.skipInstagramLearning(run.id) : await client.approveInstagramLearning(run.id, { expectedVersion: run.expectedVersion, changes })
      );
    } catch (e) {
      setError(e instanceof Error ? e.message : ar ? "لم تُحفظ التغييرات. تظل تعديلاتك هنا." : "Changes were not saved. Your edits are still here.");
    } finally {
      setBusy(false);
    }
  }

  const completed = run?.status === "APPROVED" || run?.status === "SKIPPED";
  const failed = run?.status === "FAILED";
  const reviewing = run?.status === "READY";
  const suggestions = run?.result?.suggestions ?? [];
  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <h2 className="text-2xl font-semibold">
        {completed
          ? ar
            ? "اكتمل الإعداد"
            : "Setup complete"
          : reviewing
            ? ar
              ? "راجع ما تعلمه ماركوس"
              : "Review what MARKOS learned"
            : ar
              ? "ماركوس يتعرف على حسابك"
              : "MARKOS is getting to know your account"}
      </h2>
      <p className="mt-2 text-base text-[var(--text-muted)]" dir="auto">
        @{username}
      </p>
      {error ? (
        <div role="alert" className="my-4 rounded-xl border border-[var(--danger)] p-4 text-[var(--danger)]">
          {error}
        </div>
      ) : null}
      {reviewing ? (
        <nav aria-label={ar ? "مراجعة التعلم" : "Learning review"} className="my-4 flex shrink-0 gap-2">
          {[ar ? "الهوية والأسلوب" : "Brand & Voice", ar ? "الاستراتيجية التسويقية" : "Marketing Strategy"].map((label, index) => (
            <button
              key={label}
              type="button"
              disabled={busy}
              aria-current={step === index ? "step" : undefined}
              className={
                "min-h-11 flex-1 rounded-xl px-3 py-2 text-sm font-medium " +
                (step === index
                  ? "bg-[var(--accent-soft)] text-[var(--link)] ring-1 ring-[var(--accent)]"
                  : "bg-[var(--surface-muted)] text-[var(--text-muted)]")
              }
              onClick={() => changeStep(index)}
            >
              {index + 1}. {label}
            </button>
          ))}
        </nav>
      ) : null}
      {completed ? (
        <>
          <p className="mt-5 leading-7">
            {run.status === "APPROVED"
              ? ar
                ? "حُفظت التغييرات التي اخترتها في ملف النشاط. سيستخدمها ماركوس في الحملات وإنشاء المحتوى."
                : "Your selected changes are saved in Business profile. MARKOS will use them in Campaigns and Create."
              : ar
                ? "تم ربط حسابك. يمكنك المتابعة باستخدام معلومات نشاطك الحالية."
                : "Your account is connected. You can continue using your current business information."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <Link className={primary} href={`/${locale}/app`}>
              {ar ? "الانتقال للنظرة العامة" : "Go to Overview"}
            </Link>
            <Link className={secondary} href={`/${locale}/app/knowledge`}>
              {ar ? "عرض ملف النشاط" : "View Business profile"}
            </Link>
          </div>
        </>
      ) : failed || (error && !reviewing) ? (
        <>
          <p className="mt-5 leading-7">
            {ar ? "تعذر إكمال التعلم. لم تُحفظ أي تغييرات في ملف النشاط." : "Learning could not be completed. No business profile changes were saved."}
          </p>
          <div className="mt-6 flex flex-wrap gap-3">
            <button type="button" className={primary} onClick={() => setAttempt((v) => v + 1)}>
              {ar ? "إعادة المحاولة" : "Retry"}
            </button>
            {run ? (
              <button type="button" disabled={busy || ["COLLECTING", "ANALYZING"].includes(run.status)} className={secondary} onClick={() => void save(true)}>
                {ar ? "المتابعة دون التعلم" : "Continue without learning"}
              </button>
            ) : (
              <Link className={secondary} href={`/${locale}/app`}>
                {ar ? "الانتقال للنظرة العامة" : "Go to Overview"}
              </Link>
            )}
          </div>
        </>
      ) : reviewing ? (
        <>
          <div ref={scrollRegion} data-testid="learning-review-scroll" className="min-h-0 flex-1 overflow-y-auto overscroll-contain pe-2">
            <p className="mb-4 text-[15px] leading-6 text-[var(--text-muted)]">
              {ar
                ? "حسّن الأوصاف والمرئيات والحملات القادمة. أنت تختار ما يُضاف إلى ملف نشاطك."
                : "Help future captions, visuals, and campaigns reflect your business. You choose what becomes part of your Business Profile."}
            </p>
            <details className="mb-4 rounded-xl bg-[var(--info-soft)] p-4">
              <summary className="cursor-pointer font-medium text-[var(--info)]">{ar ? "ملخص التعلم وحدوده" : "Learning summary & limitations"}</summary>
              <p className="mt-3 whitespace-pre-wrap leading-7" dir="auto">
                {run.result?.summary}
              </p>
              {run.evidence ? (
                <p className="mt-4 rounded-xl bg-[var(--surface-muted)] p-4 text-[15px] leading-6">
                  {ar
                    ? `تم اختيار ${run.evidence.posts.length} منشورات من ${run.evidence.discovered} منشوراً متاحاً. المقارنة حسب التفاعلات المتاحة، وقد تختلف المقاييس بين المنشورات.`
                    : `${run.evidence.posts.length} posts selected from ${run.evidence.discovered} available posts. Ranking uses available interactions; metric coverage can differ between posts.`}
                  {!run.evidence.historyComplete
                    ? ar
                      ? " البحث محدود ولا يمثل ترتيباً لجميع المنشورات السابقة."
                      : "This is a bounded search, not an all-time ranking."
                    : ""}
                  {run.evidence.warnings.includes("INSIGHTS_PARTIAL")
                    ? ar
                      ? " بعض طلبات الإحصاءات لم تنجح؛ النتائج جزئية."
                      : "Some insights requests failed; performance evidence is partial."
                    : ""}
                </p>
              ) : null}
              {run.result?.limitations.length ? (
                <ul className="my-4 list-disc space-y-2 ps-5 text-[15px] leading-6 text-[var(--text-muted)]">
                  {run.result.limitations.map((item) => (
                    <li key={item} dir="auto">
                      {item}
                    </li>
                  ))}
                </ul>
              ) : null}
            </details>
            {(step === 0 ? ["brand"] : ["strategy"]).map((section) => {
              const fields = suggestions.filter((item) => (item.field === "contentDirection") === (section === "strategy"));

              return (
                <section key={section} className="mt-4">
                  <h3 className="mb-4 text-xl font-semibold">
                    {section === "brand" ? (ar ? "الهوية والأسلوب" : "Brand & Voice") : ar ? "الاستراتيجية التسويقية" : "Marketing Strategy"}
                  </h3>
                  {!fields.length ? (
                    <p className="rounded-xl bg-[var(--success-soft)] p-4 text-[var(--success)]">
                      {ar
                        ? "لا توجد تغييرات مدعومة لاقتراحها هنا. احتفظ بمعلوماتك الحالية وتابع."
                        : "No supported changes to suggest here. Keep your current information and continue."}
                    </p>
                  ) : null}
                  {section === "brand" && run.current.colors?.length ? (
                    <div className="mb-4">
                      <p className="mb-2 text-sm text-[var(--text-muted)]">{ar ? "ألوان نشاطك المحفوظة" : "Your saved brand colors"}</p>
                      <LearningPalette value={display(run.current.colors)} />
                    </div>
                  ) : null}
                  <div className="space-y-4">
                    {fields.map((item) => (
                      <article
                        key={item.field}
                        className={
                          "rounded-xl border p-4 " +
                          (selected.includes(item.field) ? "border-[var(--accent)] bg-[var(--accent-soft)]" : "border-[var(--border)]")
                        }
                      >
                        <div className="mb-4 flex items-center justify-between gap-3">
                          <label className="flex items-center gap-3 font-semibold">
                            <input
                              type="checkbox"
                              disabled={busy}
                              className="h-5 w-5 accent-[var(--accent)]"
                              checked={selected.includes(item.field)}
                              onChange={(event) =>
                                setSelected((list) => (event.target.checked ? [...list, item.field] : list.filter((field) => field !== item.field)))
                              }
                            />
                            {labels[item.field][ar ? 1 : 0]}
                          </label>
                          <button
                            type="button"
                            disabled={busy}
                            className="min-h-11 px-3 text-[var(--link)]"
                            onClick={() => setEditing(editing === item.field ? null : item.field)}
                          >
                            {editing === item.field ? (ar ? "تم" : "Done") : ar ? "تعديل" : "Edit"}
                          </button>
                        </div>
                        {item.field === "colors" ? (
                          <p className="mb-4 text-sm leading-6 text-[var(--text-muted)]">
                            {ar
                              ? "ألوان مقترحة من صور المنشورات، وليست ألواناً رسمية مؤكدة. اخترها فقط إذا أردت اعتمادها لنشاطك."
                              : "Suggested from post images, not verified official brand colors. Select this only if you want to adopt the palette."}
                          </p>
                        ) : null}
                        <div className="grid gap-5 sm:grid-cols-2">
                          <div>
                            <p className="mb-2 text-sm text-[var(--text-muted)]">{ar ? "الحالي" : "Current"}</p>
                            <p className="whitespace-pre-wrap leading-7" dir="auto">
                              {display(run.current[item.field]) || (ar ? "غير محدد" : "Not set")}
                            </p>
                          </div>
                          <div className="rounded-xl bg-[var(--surface-muted)] p-4">
                            <p className="mb-2 text-sm text-[var(--text-muted)]">{ar ? "المقترح" : "Proposed"}</p>
                            {item.field === "colors" ? <LearningPalette value={values.colors ?? ""} /> : null}
                            {editing === item.field ? (
                              <label className="grid gap-2">
                                <span className="sr-only">{labels[item.field][ar ? 1 : 0]}</span>
                                <textarea
                                  aria-label={labels[item.field][ar ? 1 : 0]}
                                  disabled={busy}
                                  dir="auto"
                                  className="sunlit-field min-h-36 w-full resize-y rounded-xl px-3 py-2 text-base leading-7"
                                  maxLength={item.field === "voiceNotes" ? 1000 : 2000}
                                  value={values[item.field] ?? ""}
                                  onChange={(event) => setValues((current) => ({ ...current, [item.field]: event.target.value }))}
                                />
                                {item.field === "colors" ? (
                                  <div className="flex flex-wrap gap-3">
                                    {(values.colors ?? "").split("\n").map((color, index) => (
                                      <input
                                        key={index}
                                        type="color"
                                        aria-label={ar ? "اللون " + (index + 1) : "Palette color " + (index + 1)}
                                        disabled={busy}
                                        className="h-11 w-12 cursor-pointer rounded border border-[var(--border-strong)] bg-[var(--surface)]"
                                        value={/^#[0-9a-f]{6}$/i.test(color.trim()) ? color.trim() : "#000000"}
                                        onChange={(event) =>
                                          setValues((current) => {
                                            const colors = (current.colors ?? "").split("\n");
                                            colors[index] = event.target.value;
                                            return { ...current, colors: colors.join("\n") };
                                          })
                                        }
                                      />
                                    ))}
                                  </div>
                                ) : null}
                                {["toneWords", "aestheticWords", "colors"].includes(item.field) ? (
                                  <span className="text-sm text-[var(--text-muted)]">{ar ? "عنصر واحد في كل سطر." : "One item per line."}</span>
                                ) : null}
                              </label>
                            ) : (
                              <p dir="auto" className="whitespace-pre-wrap leading-7">
                                {values[item.field]}
                              </p>
                            )}
                          </div>
                        </div>
                        <p dir="auto" className="mt-4 text-[15px] leading-6 text-[var(--text-muted)]">
                          {item.reasoning}
                        </p>
                        <div className="mt-3 flex flex-wrap gap-3">
                          {item.sourcePostIds.map((id, index) => {
                            const post = run.evidence?.posts.find((p) => p.id === id);
                            return post?.permalink ? (
                              <a
                                className="inline-flex min-h-10 items-center gap-2 text-sm text-[var(--link)]"
                                key={id}
                                href={post.permalink}
                                target="_blank"
                                rel="noreferrer"
                              >
                                {ar ? `منشور داعم ${index + 1}` : `Supporting post ${index + 1}`}
                                <ExternalLink size={14} />
                              </a>
                            ) : null;
                          })}
                        </div>
                      </article>
                    ))}
                  </div>
                </section>
              );
            })}
            <details className="my-6 rounded-xl border border-[var(--border)] p-4">
              <summary className="cursor-pointer font-medium">{ar ? "المنشورات التي تمت مراجعتها" : "Posts examined"}</summary>
              <div className="mt-4 divide-y divide-[var(--border)]">
                {run.evidence?.posts.map((post) => (
                  <article className="py-4" key={post.id}>
                    <p className="mb-2 inline-flex rounded-lg bg-[var(--info-soft)] px-3 py-1 text-sm text-[var(--info)]">
                      {post.selection === "STRONGEST" ? (ar ? "من الأقوى التي وُجدت" : "Among strongest found") : ar ? "من أحدث المنشورات" : "Recent post"} ·{" "}
                      {post.mediaType}
                    </p>
                    <p dir="auto" className="line-clamp-4 whitespace-pre-wrap leading-7">
                      {post.caption || (ar ? "دون وصف" : "No caption")}
                    </p>
                    <p className="mt-2 text-sm text-[var(--text-muted)]">
                      {["likes", "comments", "saves", "shares"]
                        .map((metric, i) => `${ar ? ["الإعجابات", "التعليقات", "الحفظ", "المشاركات"][i] : metric}: ${post.metrics[metric] ?? "—"}`)
                        .join(" · ")}
                    </p>
                    {post.permalink ? (
                      <a href={post.permalink} target="_blank" rel="noreferrer" className="mt-2 inline-flex min-h-10 items-center gap-2 text-[var(--link)]">
                        {ar ? "عرض على إنستغرام" : "View on Instagram"}
                        <ExternalLink size={16} />
                      </a>
                    ) : null}
                  </article>
                ))}
              </div>
            </details>
          </div>
          <div
            className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4"
            data-testid="learning-review-actions"
          >
            <button
              type="button"
              disabled={busy}
              className="min-h-11 text-sm text-[var(--text-muted)] underline underline-offset-4"
              onClick={() => void save(true)}
            >
              {ar ? "الاحتفاظ بالملف الحالي والمتابعة" : "Keep current profile and continue"}
            </button>
            <div className="grid w-full grid-cols-[auto_minmax(0,1fr)] items-center gap-3 sm:w-auto sm:grid-cols-[auto_auto_16rem]">
              <span className="hidden text-sm text-[var(--text-muted)] sm:inline" aria-live="polite">
                {ar ? selected.length + " مختارة" : selected.length + " selected"}
              </span>
              <button type="button" disabled={busy || step === 0} className={secondary} onClick={() => changeStep(0)}>
                {ar ? "السابق" : "Back"}
              </button>
              {step === 0 ? (
                <button type="button" className={primary + " h-16"} onClick={() => changeStep(1)}>
                  {ar ? "التالي" : "Next"}
                </button>
              ) : (
                <button type="button" disabled={busy || !selected.length} className={primary + " h-16"} onClick={() => void save(false)}>
                  {busy ? <LoaderCircle size={18} className="animate-spin" /> : <Check size={18} />}
                  {ar ? "اعتماد التغييرات المختارة" : "Use selected changes"}
                </button>
              )}
            </div>
          </div>
        </>
      ) : (
        <div role="status" className="mt-6 space-y-5">
          <p className="flex items-center gap-3 text-lg">
            <LoaderCircle className="animate-spin motion-reduce:animate-none" size={22} />
            {run?.status === "ANALYZING"
              ? ar
                ? "جارٍ تحليل الأنماط وإعداد تغييرات للمراجعة…"
                : "Finding patterns and preparing changes for your review…"
              : ar
                ? "جارٍ قراءة الملف والبحث عن المنشورات الحديثة والأقوى…"
                : "Reading the profile and finding recent and stronger posts…"}
          </p>
          {run?.evidence ? (
            <p className="text-[var(--text-muted)]">
              {ar ? `تم اختيار ${run.evidence.posts.length} منشورات للتحليل.` : `${run.evidence.posts.length} posts selected for analysis.`}
            </p>
          ) : null}
          <p className="leading-7 text-[var(--text-muted)]">
            {ar
              ? "ابقَ هنا حتى تكتمل المراجعة. لن يتغير ملف نشاطك قبل موافقتك."
              : "Stay here to finish the review. Your business profile changes only after your approval."}
          </p>
        </div>
      )}
    </div>
  );
}

function LearningPalette({ value }: { value: string }) {
  return (
    <div className="mb-3 flex flex-wrap gap-3" dir="ltr">
      {value
        .split("\n")
        .map((color) => color.trim())
        .filter((color) => /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i.test(color))
        .map((color, index) => (
          <span key={index} className="inline-flex items-center gap-2 rounded-lg bg-[var(--surface)] p-2 text-sm">
            <span aria-hidden="true" className="h-8 w-8 rounded-md border border-[var(--border-strong)]" style={{ backgroundColor: color }} />
            {color}
          </span>
        ))}
    </div>
  );
}
