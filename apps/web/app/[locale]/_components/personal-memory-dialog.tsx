"use client";
import { useEffect, useState } from "react";
import { X } from "lucide-react";
import type { Locale, PersonalMemory } from "@markos/shared-types";
import { useMarkosClient } from "./browser-session";
import { useModalDialog } from "./use-modal-dialog";
import { TaskFeedback } from "./task-feedback";
import "./content-studio.css";

export function PersonalMemoryDialog({ locale, onClose }: { locale: Locale; onClose: () => void }) {
  const api = useMarkosClient(locale);
  const t = (en: string, ar: string) => (locale === "ar" ? ar : en);
  const [items, setItems] = useState<PersonalMemory[] | null>(null),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose, closeDisabled: busy });
  useEffect(() => {
    let live = true;
    void api
      .personalMemory()
      .then((data) => {
        if (live) setItems(data);
      })
      .catch(() => {
        if (live) setError(locale === "ar" ? "تعذّر تحميل الذاكرة. أغلق اللوحة وحاول مجددًا." : "Couldn’t load memory. Close this panel and try again.");
      });
    return () => {
      live = false;
    };
  }, [api, locale]);
  async function forget(id: string) {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      await api.forgetMemory(id);
      setItems((current) => current?.filter((item) => item.id !== id) ?? []);
    } catch {
      setError(t("Couldn’t forget this preference. Try again.", "تعذّر نسيان هذا التفضيل. حاول مجددًا."));
    } finally {
      setBusy(false);
    }
  }
  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      className="studio-dialog"
      aria-labelledby="memory-title"
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <header className="mb-4 flex items-center justify-between gap-4">
        <h2 id="memory-title" className="text-xl font-semibold">
          {t("What MARKOS remembers", "ما يتذكره ماركوس")}
        </h2>
        <button className="studio-button" aria-label={t("Close", "إغلاق")} disabled={busy} onClick={onClose}>
          <X size={18} />
        </button>
      </header>
      <p className="mb-4">
        {t(
          "These personal defaults apply to your work in this workspace. Your business profile stays the source for company facts.",
          "تُطبّق هذه التفضيلات الشخصية على عملك في هذه المساحة. يظل ملف النشاط مصدر معلومات الشركة."
        )}
      </p>
      {!items && !error ? <TaskFeedback label={t("Loading your preferences", "جارٍ تحميل تفضيلاتك")} locale={locale} /> : null}
      {items?.length === 0 ? (
        <p>
          {t("Nothing saved yet. Tell MARKOS “Remember that I prefer…” in chat.", "لا توجد تفضيلات محفوظة بعد. أخبر ماركوس في المحادثة: «تذكّر أنني أفضل…».")}
        </p>
      ) : null}
      <ul className="grid gap-3">
        {items?.map((item) => (
          <li key={item.id} className="flex items-start justify-between gap-4 border-b border-[var(--border)] py-3">
            <p dir="auto">{item.text}</p>
            <button
              className="studio-button"
              disabled={busy}
              onClick={() => void forget(item.id)}
              aria-label={t(`Forget: ${item.text}`, `نسيان: ${item.text}`)}
            >
              {t("Forget", "نسيان")}
            </button>
          </li>
        ))}
      </ul>
      <p className="mt-4 text-sm">
        {t(
          "MARKOS also uses your approved business knowledge and content, plus shared marketing guidance. Private conversations are never added to shared guidance.",
          "يستخدم ماركوس أيضًا معرفة نشاطك ومحتواه المعتمدين، إلى جانب إرشادات تسويق مشتركة. لا تُضاف المحادثات الخاصة إلى الإرشادات المشتركة."
        )}
      </p>
      {error ? (
        <p role="alert" className="mt-4">
          {error}
        </p>
      ) : null}
    </dialog>
  );
}
