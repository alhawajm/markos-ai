"use client";
import { useEffect, useRef, useState } from "react";
import type { CampaignGenerationJobRecord, Locale } from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";
import styles from "./campaign-review.module.css";

export function CampaignGenerationStatus({
  locale,
  newJob,
  onComplete,
  onReviewBrief,
  onHasWorkChange
}: {
  locale: Locale;
  newJob: CampaignGenerationJobRecord | undefined;
  onComplete: () => void;
  onReviewBrief: () => void;
  onHasWorkChange: (hasWork: boolean) => void;
}) {
  const client = useMarkosClient(locale);
  const [jobs, setJobs] = useState<CampaignGenerationJobRecord[]>([]);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState<string>();
  const observed = useRef(new Map<string, string>());
  const ar = locale === "ar";
  useEffect(() => {
    if (newJob) {
      onHasWorkChange(newJob.status !== "COMPLETED");
      observed.current.set(newJob.id, newJob.status);
      setJobs((current) => [newJob, ...current.filter((job) => job.id !== newJob.id)]);
    }
  }, [newJob, onHasWorkChange]);
  useEffect(() => {
    let active = true;
    let timer: ReturnType<typeof setTimeout>;
    async function poll() {
      let pending = false;
      try {
        const rows = await client.campaignGenerations();
        if (!active) return;
        let completed = false;
        for (const row of rows) {
          if (row.status === "COMPLETED" && ["QUEUED", "RUNNING"].includes(observed.current.get(row.id) ?? "")) completed = true;
          observed.current.set(row.id, row.status);
        }
        setJobs(rows);
        onHasWorkChange(rows.some((row) => row.status !== "COMPLETED"));
        setError("");
        if (completed) onComplete();
        pending = rows.some((row) => ["QUEUED", "RUNNING"].includes(row.status));
      } catch {
        if (active)
          setError(
            ar
              ? "تعذر تحديث حالة التخطيط. ستتم إعادة المحاولة؛ لا ترسل الحملة مرة أخرى."
              : "Planning status could not refresh. Retrying; please avoid submitting the campaign again."
          );
      } finally {
        if (active)
          timer = setTimeout(
            () => {
              void poll();
            },
            pending ? 2500 : 15000
          );
      }
    }
    void poll();
    return () => {
      active = false;
      clearTimeout(timer);
    };
  }, [client, onComplete, onHasWorkChange, ar]);
  async function resume(job: CampaignGenerationJobRecord) {
    setBusy(job.id);
    try {
      const value = await client.resumeCampaignGeneration(job.requestId);
      observed.current.set(value.id, value.status);
      setJobs((current) => current.map((row) => (row.id === value.id ? value : row)));
      setError("");
    } catch {
      setError(ar ? "تعذرت متابعة التخطيط. حاول مجددًا." : "Planning could not resume. Please try again.");
    } finally {
      setBusy(undefined);
    }
  }
  const visible = jobs.filter((job) => job.status !== "COMPLETED").slice(0, 5);
  if (!visible.length && !error) return null;
  return (
    <section className={styles.cardList} aria-label={ar ? "حالة إنشاء الحملات" : "Campaign planning status"} aria-live="polite">
      {error ? (
        <p className={styles.error} role="alert">
          {error}
        </p>
      ) : null}
      {visible.map((job) => (
        <article className={styles.card} key={job.id}>
          <div className={styles.cardHeader}>
            <div>
              <h2>{job.objective || (ar ? "حملة جديدة" : "New campaign")}</h2>
              <p>
                {job.status === "FAILED" ? (ar ? "توقف التخطيط" : "Planning stopped") : ar ? "جارٍ إعداد الحملة" : "Drafting your campaign"}
                {job.progress ? ` · ${job.progress.completedWeeks}/${job.progress.totalWeeks} ${ar ? "أسابيع محفوظة" : "weeks saved"}` : ""}
              </p>
            </div>
          </div>
          <p className={styles.objective}>
            {job.status === "FAILED"
              ? job.canResume
                ? ar
                  ? "الأسابيع المكتملة محفوظة. تابع لإعادة محاولة الخطوة غير المكتملة فقط."
                  : "Completed weeks are saved. Continue to retry only the unfinished step."
                : ar
                  ? "لم تتغير حملاتك المحفوظة. راجع ملخصك وابدأ محاولة جديدة."
                  : "Your saved campaigns are unchanged. Review your brief and start a new attempt."
              : ar
                ? "يمكنك مغادرة هذه الصفحة والعودة لاحقًا؛ يستمر التخطيط في الخلفية."
                : "You can leave this page and return later; planning continues in the background."}
          </p>
          {job.canResume ? (
            <button
              type="button"
              className={styles.button}
              disabled={!!busy}
              onClick={() => {
                void resume(job);
              }}
            >
              {busy === job.id ? (ar ? "جارٍ المتابعة…" : "Resuming…") : ar ? "متابعة التخطيط" : "Continue planning"}
            </button>
          ) : job.status === "FAILED" ? (
            <button type="button" className={styles.button} onClick={onReviewBrief}>
              {job.requestId === newJob?.requestId ? (ar ? "مراجعة الملخص" : "Review brief") : ar ? "حملة جديدة" : "New campaign"}
            </button>
          ) : null}
        </article>
      ))}
    </section>
  );
}
