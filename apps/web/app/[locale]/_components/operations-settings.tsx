"use client";
import { useCallback, useEffect, useState } from "react";
import type { AdminModelConfiguration, DeliveryOperations, Locale } from "@markos/shared-types";
import { useMarkosClient, useMarkosSession } from "./browser-session";
const button = "min-h-11 rounded-xl border border-[var(--border)] px-4 py-2 font-semibold disabled:opacity-50";
export function OperationsSettings({ locale }: { locale: Locale }) {
  const api = useMarkosClient(locale),
    session = useMarkosSession();
  const ar = locale === "ar",
    t = (en: string, arabic: string) => (ar ? arabic : en);
  const [operations, setOperations] = useState<DeliveryOperations | null>(null),
    [models, setModels] = useState<AdminModelConfiguration | null>(null);
  const [edits, setEdits] = useState<Record<string, string>>({}),
    [busy, setBusy] = useState(false),
    [error, setError] = useState("");
  const manage = session?.roles.some((r) => r === "SUPER_ADMIN" || r === "PRODUCT_ADMIN") ?? false;
  const load = useCallback(async () => {
    const [o, m] = await Promise.all([api.deliveryOperations(), api.adminModelConfiguration()]);
    setOperations(o);
    setModels(m);
  }, [api]);
  const fail = () => setError(t("Could not complete the operation. Refresh and try again.", "تعذّر إكمال العملية. حدّث الصفحة وحاول مجددًا."));
  useEffect(() => {
    void load().catch(fail);
  }, [load]);
  async function run(action: () => Promise<unknown>) {
    setBusy(true);
    setError("");
    try {
      await action();
      await load();
    } catch {
      fail();
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-5">
      <h2 className="text-xl font-semibold">{t("Platform operations", "عمليات المنصة")}</h2>
      <p>
        {t(
          "These administrator controls affect all workspaces. Changes are recorded in the audit history.",
          "تؤثر أدوات المسؤول هذه على جميع المساحات وتُسجّل التغييرات في سجل التدقيق."
        )}
      </p>
      {error ? <p role="alert">{error}</p> : null}
      <button className={button} disabled={busy} onClick={() => void run(load)}>
        {t("Refresh operations", "تحديث العمليات")}
      </button>
      <h3 className="font-semibold">{t("Delivery and account cleanup", "الإرسال وتنظيف بيانات الحساب")}</h3>
      {!operations ? (
        <p>{t("Loading…", "جارٍ التحميل…")}</p>
      ) : !operations.failures.length ? (
        <p>{t("No failed delivery or deletion jobs.", "لا توجد مهام إرسال أو حذف فاشلة.")}</p>
      ) : (
        operations.failures.map((job) => (
          <div className="grid gap-3 rounded-xl border border-[var(--border)] p-4" key={job.id}>
            <strong>
              {job.kind === "REPORT"
                ? t("Report email", "بريد التقرير")
                : job.kind === "PUSH"
                  ? t("Phone alert", "إشعار الهاتف")
                  : t("Account cleanup", "تنظيف بيانات الحساب")}
            </strong>
            <p className="break-all">{job.workspaceId}</p>
            <p>{job.failureCode}</p>
            {job.status === "UNKNOWN" ? (
              <p>
                {t(
                  "Result unconfirmed. Investigate before retrying to avoid duplicate delivery.",
                  "النتيجة غير مؤكدة. تحقّق قبل إعادة المحاولة لتجنب تكرار الإرسال."
                )}
              </p>
            ) : manage ? (
              <button
                className={button}
                disabled={busy}
                onClick={() => {
                  if (window.confirm(t("Retry this confirmed failure?", "إعادة محاولة هذه المهمة الفاشلة؟")))
                    void run(() => api.retryDelivery({ kind: job.kind, id: job.id }));
                }}
              >
                {t("Retry confirmed failure", "إعادة محاولة الفشل المؤكد")}
              </button>
            ) : null}
          </div>
        ))
      )}
      <h3 className="font-semibold">{t("AI model configuration", "إعدادات نماذج الذكاء الاصطناعي")}</h3>
      {models?.models.map((model) => (
        <div className="grid gap-3 border-t border-[var(--border)] pt-4" key={model.key}>
          <label className="grid gap-2">
            <span className="break-all">{model.key}</span>
            <input
              className="min-h-11 min-w-0 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3"
              value={edits[model.key] ?? model.value ?? ""}
              disabled={!manage || busy}
              onChange={(e) => setEdits((previous) => ({ ...previous, [model.key]: e.target.value }))}
            />
          </label>
          {manage ? (
            <button
              className={button}
              disabled={busy || !edits[model.key]?.trim() || edits[model.key] === model.value}
              onClick={() => {
                if (window.confirm(t("Use this model for new requests across all workspaces?", "استخدام هذا النموذج للطلبات الجديدة في جميع المساحات؟")))
                  void run(async () => {
                    await api.updateAdminModelSetting(model.key as Parameters<typeof api.updateAdminModelSetting>[0], { value: edits[model.key]!.trim() });
                    setEdits({});
                  });
              }}
            >
              {t("Save model for all workspaces", "حفظ النموذج لجميع المساحات")}
            </button>
          ) : null}
        </div>
      ))}
    </div>
  );
}
