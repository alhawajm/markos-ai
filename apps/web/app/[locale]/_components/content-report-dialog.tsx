"use client";
import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";
import type { ContentReportReason, ContentReportSource, Locale } from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";
import { useModalDialog } from "./use-modal-dialog";
import "./content-studio.css";

export function ContentReportDialog({
  locale,
  source,
  sourceId,
  onClose
}: {
  locale: Locale;
  source: ContentReportSource;
  sourceId?: string;
  onClose: () => void;
}) {
  const api = useMarkosClient(locale);
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [reason, setReason] = useState<ContentReportReason>("OFFENSIVE"),
    [note, setNote] = useState("");
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [receipt, setReceipt] = useState("");
  const requestId = useRef(crypto.randomUUID()),
    working = useRef(false),
    mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose, closeDisabled: busy });
  const changed = () => {
    requestId.current = crypto.randomUUID();
    setError("");
  };
  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      aria-labelledby="content-report-title"
      className="studio-dialog"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-xl font-semibold" id="content-report-title">
          {t("Report AI content", "الإبلاغ عن محتوى الذكاء الاصطناعي")}
        </h2>
        <button type="button" className="studio-button" aria-label={t("Close", "إغلاق")} disabled={busy} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      {receipt ? (
        <p role="status">
          {t("Report received. Our team will review it. Reference: ", "تم استلام البلاغ وسيراجعه فريقنا. المرجع: ")}
          {receipt}
        </p>
      ) : (
        <form
          className="grid gap-4"
          onSubmit={(event) => {
            event.preventDefault();
            if (working.current) return;
            working.current = true;
            setBusy(true);
            setError("");
            void api
              .reportContent({ requestId: requestId.current, source, ...(sourceId ? { sourceId } : {}), reason, note: note.trim() })
              .then((saved) => {
                if (mounted.current) setReceipt(saved.id);
              })
              .catch(() => {
                if (mounted.current)
                  setError(t("Could not send the report. Try again; your explanation is preserved.", "تعذر إرسال البلاغ. حاول مجددًا؛ توضيحك محفوظ."));
              })
              .finally(() => {
                working.current = false;
                if (mounted.current) setBusy(false);
              });
          }}
        >
          <p>
            {t(
              "Your explanation and a short content excerpt or media reference are shared with MARKOS moderators. Your draft stays unchanged. Do not include passwords or private account details.",
              "يُرسل توضيحك ومقتطف قصير أو مرجع الوسائط إلى مشرفي ماركوس. تبقى مسودتك كما هي. لا تدرج كلمات المرور أو بيانات الحساب الخاصة."
            )}
          </p>
          <label className="grid gap-2">
            {t("Reason", "السبب")}
            <select
              className="min-h-11 w-full rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]"
              value={reason}
              disabled={busy}
              onChange={(e) => {
                changed();
                setReason(e.target.value as ContentReportReason);
              }}
            >
              <option value="OFFENSIVE">{t("Offensive or inappropriate", "مسيء أو غير لائق")}</option>
              <option value="HARMFUL">{t("Harmful or unsafe", "ضار أو غير آمن")}</option>
              <option value="COPYRIGHT">{t("Copyright or ownership", "حقوق النشر أو الملكية")}</option>
              <option value="INACCURATE">{t("Incorrect or misleading", "غير صحيح أو مضلل")}</option>
              <option value="OTHER">{t("Something else", "سبب آخر")}</option>
            </select>
          </label>
          <label className="grid gap-2">
            {t("What happened?", "ماذا حدث؟")}
            <textarea
              className="w-full resize-y rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2 text-[var(--text)]"
              value={note}
              disabled={busy}
              maxLength={1500}
              minLength={source === "GENERAL_AI" ? 10 : undefined}
              rows={4}
              onChange={(e) => {
                changed();
                setNote(e.target.value);
              }}
              required={source === "GENERAL_AI"}
            />
          </label>
          {error ? <p role="alert">{error}</p> : null}
          <button className="studio-button studio-button-primary" disabled={busy || (source === "GENERAL_AI" && note.trim().length < 10)}>
            {busy ? t("Sending…", "جارٍ الإرسال…") : t("Send report", "إرسال البلاغ")}
          </button>
        </form>
      )}
    </dialog>
  );
}
