"use client";
import { useCallback, useEffect, useState } from "react";
import { canReadContentReports, canReviewContentReports, type ContentReportMedia, type ContentReportRecord, type Locale } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";

const button = "min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 font-semibold disabled:opacity-50";
export function ContentReportQueue({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  return session && canReadContentReports(session.roles) ? (
    <Queue key={`${session.user.id}:${session.workspace.id}`} locale={locale} manage={canReviewContentReports(session.roles)} />
  ) : null;
}
function Queue({ locale, manage }: { locale: Locale; manage: boolean }) {
  const api = useMarkosClient(locale);
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [rows, setRows] = useState<ContentReportRecord[] | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [selected, setSelected] = useState<string | null>(null),
    [note, setNote] = useState("");
  const load = useCallback(async () => {
    setRows(await api.contentReports());
  }, [api]);
  useEffect(() => {
    let active = true;
    void api
      .contentReports()
      .then((data) => {
        if (active) setRows(data);
      })
      .catch(() => {
        if (active) setError(locale === "ar" ? "تعذر تحميل البلاغات. حاول التحديث." : "Could not load reports. Try refreshing.");
      });
    return () => {
      active = false;
    };
  }, [api, locale]);
  async function review(id: string, status: "RESOLVED" | "DISMISSED") {
    setBusy(true);
    setError("");
    try {
      await api.reviewContentReport(id, { status, note: note.trim() });
      setSelected(null);
      await load();
    } catch {
      setError(t("Could not update this report. Refresh before trying again.", "تعذر تحديث البلاغ. حدّث القائمة قبل المحاولة مجددًا."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <section className="grid gap-4" aria-labelledby="report-queue-title">
      <h3 id="report-queue-title" className="font-semibold">
        {t("Content reports", "بلاغات المحتوى")}
      </h3>
      {error ? <p role="alert">{error}</p> : null}
      <button
        className={button}
        disabled={busy}
        onClick={() => {
          setError("");
          void load().catch(() => setError(t("Could not load reports.", "تعذر تحميل البلاغات.")));
        }}
      >
        {t("Refresh reports", "تحديث البلاغات")}
      </button>
      {!rows ? (
        <p>{t("Loading…", "جارٍ التحميل…")}</p>
      ) : !rows.length ? (
        <p>{t("No open content reports.", "لا توجد بلاغات محتوى مفتوحة.")}</p>
      ) : (
        rows.map((row) => (
          <article key={row.id} className="grid gap-3 rounded-xl border border-[var(--border)] p-4">
            <strong>
              {row.reason} · {row.source}
            </strong>
            <p className="break-all text-sm">
              {row.createdAt} · {row.workspaceId}
            </p>
            <p className="whitespace-pre-wrap break-words" dir="auto">
              {row.excerpt}
            </p>
            <p className="whitespace-pre-wrap break-words" dir="auto">
              {row.note}
            </p>
            {row.mediaAssetIds.length ? <ReportMedia id={row.id} locale={locale} /> : null}
            {manage ? (
              selected === row.id ? (
                <form
                  className="grid gap-3"
                  onSubmit={(e) => {
                    e.preventDefault();
                    void review(row.id, "RESOLVED");
                  }}
                >
                  <label className="grid gap-2">
                    {t("Investigation and action taken", "نتيجة التحقيق والإجراء المتخذ")}
                    <textarea rows={3} value={note} onChange={(e) => setNote(e.target.value)} minLength={3} maxLength={1500} required disabled={busy} />
                  </label>
                  <div className="flex flex-wrap gap-3">
                    <button className={button} disabled={busy || note.trim().length < 3}>
                      {t("Resolve report", "إغلاق البلاغ بعد المعالجة")}
                    </button>
                    <button type="button" className={button} disabled={busy || note.trim().length < 3} onClick={() => void review(row.id, "DISMISSED")}>
                      {t("Dismiss report", "استبعاد البلاغ")}
                    </button>
                    <button type="button" className={button} disabled={busy} onClick={() => setSelected(null)}>
                      {t("Cancel", "إلغاء")}
                    </button>
                  </div>
                </form>
              ) : (
                <button
                  className={button}
                  onClick={() => {
                    setSelected(row.id);
                    setNote("");
                  }}
                >
                  {t("Review report", "مراجعة البلاغ")}
                </button>
              )
            ) : null}
          </article>
        ))
      )}
    </section>
  );
}
function ReportMedia({ id, locale }: { id: string; locale: Locale }) {
  const api = useMarkosClient(locale);
  const [media, setMedia] = useState<ContentReportMedia[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState(false);
  return (
    <div className="grid gap-2">
      <button
        className={button}
        disabled={busy}
        onClick={() => {
          setBusy(true);
          setError(false);
          void api
            .contentReportMedia(id)
            .then(setMedia)
            .catch(() => setError(true))
            .finally(() => setBusy(false));
        }}
      >
        {locale === "ar" ? "عرض الوسائط المبلغ عنها" : "View reported media"}
      </button>
      {media?.map((asset) => (
        <a key={asset.id} className={button} href={asset.url} target="_blank" rel="noreferrer">
          {asset.filename}
        </a>
      ))}
      {media?.length === 0 ? <p>{locale === "ar" ? "تم حذف هذه الوسائط." : "This media was removed."}</p> : null}
      {error ? <p role="alert">{locale === "ar" ? "تعذر تحميل الوسائط. حاول مجددًا." : "Could not load media. Try again."}</p> : null}
    </div>
  );
}
