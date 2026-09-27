"use client";
import { useCallback, useEffect, useState } from "react";
import type { Locale, NotificationPreferences, ReportDeliveryRecord, AccountDeletionPreview } from "@markos/shared-types";
import { MarkosApiError } from "@markos/api-client";
import { useMarkosClient, useMarkosSession, logoutBrowserSession, refreshBrowserSession } from "./browser-session";

const button = "min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-4 py-2 font-semibold disabled:opacity-50";
const field = "min-h-11 rounded-xl border border-[var(--border)] bg-[var(--surface)] px-3 py-2";
const errorCopy = (error: unknown, ar: boolean) =>
  error instanceof MarkosApiError && error.code === "ACCOUNT_DELETE_CHANGED"
    ? ar
      ? "تغيّرت المساحات. حدّث القائمة وراجعها مجددًا."
      : "Workspaces changed. Refresh the list and review again."
    : error instanceof MarkosApiError && ["ACCOUNT_DELETE_AUTH_FAILED", "MFA_INVALID"].includes(error.code ?? "")
      ? ar
        ? "تحقّق من كلمة المرور أو رمز التأكيد ورمز المصادقة."
        : "Check your password or email confirmation code, and your authenticator code."
      : ar
        ? "تعذّر إكمال الطلب. حاول مجددًا."
        : "Could not complete the request. Try again.";

export function DeliverySettings({ locale }: { locale: Locale }) {
  const api = useMarkosClient(locale),
    session = useMarkosSession(),
    ar = locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  const [preferences, setPreferences] = useState<NotificationPreferences | null>(null),
    [reports, setReports] = useState<ReportDeliveryRecord[]>([]);
  const [busy, setBusy] = useState(false),
    [error, setError] = useState(""),
    [notice, setNotice] = useState("");
  const load = useCallback(async () => {
    const [p, r] = await Promise.all([api.notificationPreferences(), api.reportDeliveries()]);
    setPreferences(p);
    setReports(r);
  }, [api]);
  useEffect(() => {
    if (session) void load().catch((e) => setError(errorCopy(e, ar)));
  }, [load, session, ar]);
  async function change(input: Partial<NotificationPreferences> | "send") {
    if (busy) return;
    setBusy(true);
    setError("");
    setNotice("");
    try {
      if (input === "send") {
        await api.sendMonthlyAnalyticsEmail({ locale });
        setNotice(t("Request saved. Check delivery status below.", "حُفظ الطلب. راجع حالة الإرسال أدناه."));
      } else await api.updateNotificationPreferences(input);
      await load();
    } catch (e) {
      setError(errorCopy(e, ar));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="grid gap-5">
      <h2 className="text-xl font-semibold">{t("Notifications and reports", "الإشعارات والتقارير")}</h2>
      <p>
        {t(
          "Your preferences for this workspace. Phone alerts are enabled from the MARKOS mobile app.",
          "تفضيلاتك لهذه المساحة. فعّل إشعارات الهاتف من تطبيق ماركوس."
        )}
      </p>
      {preferences ? (
        <>
          <label className="flex items-center gap-3">
            <input
              type="checkbox"
              checked={preferences.monthlyReportEmail}
              disabled={busy}
              onChange={(e) => void change({ monthlyReportEmail: e.target.checked })}
            />
            {t("Email my previous month’s PDF report each month", "إرسال تقرير الشهر السابق إلى بريدي كل شهر")}
          </label>
          <p className="text-[var(--muted)]">{session?.user.email}</p>
          <p>
            {preferences.pushPublishing
              ? t("Publishing phone alerts are enabled.", "إشعارات النشر على الهاتف مفعّلة.")
              : t("Publishing phone alerts are off.", "إشعارات النشر على الهاتف متوقفة.")}
          </p>
          {preferences.pushPublishing ? (
            <button type="button" className={button} disabled={busy} onClick={() => void change({ pushPublishing: false })}>
              {t("Turn off phone alerts for this workspace", "إيقاف إشعارات الهاتف لهذه المساحة")}
            </button>
          ) : null}
          <button type="button" className={button} disabled={busy} onClick={() => void change("send")}>
            {t("Email last month’s report once", "إرسال تقرير الشهر السابق مرة واحدة")}
          </button>
          <p className="text-sm text-[var(--muted)]">
            {t(
              "One email per month and recipient. Provider acceptance does not guarantee inbox delivery.",
              "رسالة واحدة لكل شهر ومستلم. قبول مزود البريد لا يضمن وصولها إلى صندوق الوارد."
            )}
          </p>
        </>
      ) : (
        <p>{t("Loading preferences…", "جارٍ تحميل التفضيلات…")}</p>
      )}
      {notice ? <p role="status">{notice}</p> : null}
      {reports.map((r) => (
        <div key={r.id} className="flex flex-wrap justify-between gap-3 border-t border-[var(--border)] pt-3">
          <strong>{r.month}</strong>
          <span>
            {r.status === "ACCEPTED"
              ? t("Accepted by provider", "قبله مزود البريد")
              : ["PENDING", "PROCESSING"].includes(r.status)
                ? t("Queued", "في قائمة الإرسال")
                : r.status === "UNKNOWN"
                  ? t("Unconfirmed — check your inbox", "غير مؤكد — تحقّق من بريدك")
                  : r.status === "CANCELLED"
                    ? t("Cancelled", "أُلغي")
                    : r.status === "SIMULATED"
                      ? t("Simulated; no email sent", "محاكاة؛ لم يُرسل بريد")
                      : t("Failed", "فشل")}
          </span>
        </div>
      ))}
      {error ? <p role="alert">{error}</p> : null}
      <button type="button" className={button} disabled={busy} onClick={() => void load().catch((e) => setError(errorCopy(e, ar)))}>
        {t("Refresh status", "تحديث الحالة")}
      </button>
    </div>
  );
}

export function AccountDeletionSettings({ locale, restoreSession = false }: { locale: Locale; restoreSession?: boolean }) {
  const api = useMarkosClient(locale),
    session = useMarkosSession(),
    ar = locale === "ar";
  const t = (en: string, arabic: string) => (ar ? arabic : en);
  useEffect(() => {
    if (restoreSession && !session) void refreshBrowserSession().catch(() => {});
  }, [restoreSession, session]);
  const [preview, setPreview] = useState<AccountDeletionPreview | null>(null),
    [error, setError] = useState(""),
    [busy, setBusy] = useState(false);
  const [password, setPassword] = useState(""),
    [code, setCode] = useState(""),
    [confirmation, setConfirmation] = useState("");
  const [challengeToken, setChallengeToken] = useState(""),
    [emailCode, setEmailCode] = useState("");
  async function sendCode() {
    setBusy(true);
    setError("");
    try {
      const result = await api.requestAccountDeletionCode();
      setChallengeToken(result.challengeToken);
      setEmailCode("");
    } catch (e) {
      setError(errorCopy(e, ar));
    } finally {
      setBusy(false);
    }
  }
  async function load() {
    setBusy(true);
    setError("");
    try {
      setPreview(await api.accountDeletionPreview());
    } catch (e) {
      setError(errorCopy(e, ar));
    } finally {
      setBusy(false);
    }
  }
  async function erase() {
    if (
      !preview ||
      busy ||
      !window.confirm(
        t(
          "Delete your account and every owned workspace permanently? This affects all members and cannot be undone.",
          "حذف حسابك وكل المساحات التي تملكها نهائيًا؟ يؤثر ذلك على جميع الأعضاء ولا يمكن التراجع."
        )
      )
    )
      return;
    setBusy(true);
    setError("");
    try {
      await api.deleteAccount({
        confirmation: "DELETE",
        confirmationToken: preview.confirmationToken,
        ...(preview.passwordRequired ? { password } : { challengeToken, emailCode }),
        ...(code ? { totpCode: code } : {})
      });
      setPassword("");
      setCode("");
      await logoutBrowserSession(locale);
      window.location.assign(`/${locale}/login`);
    } catch (e) {
      setError(errorCopy(e, ar));
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="mt-6 grid gap-4 rounded-2xl border border-[var(--border)] p-5">
      <h2 className="text-xl font-semibold">{t("Delete your account", "حذف حسابك")}</h2>
      <p>
        {t(
          "This deletes your account and all owned workspaces, removes your memberships elsewhere, and stops scheduled publishing. Export anything you need first. Published Instagram posts remain. Stored files are removed in the background; limited security and transaction records may be retained.",
          "يحذف هذا حسابك والمساحات التي تملكها، ويزيل عضوياتك الأخرى، ويوقف النشر المجدول. صدّر ما تحتاجه أولًا. تبقى منشورات إنستغرام المنشورة. تُحذف الملفات في الخلفية وقد تُحفظ سجلات أمنية ومعاملات محدودة."
        )}
      </p>
      {!session ? (
        <a className={button} href={`/${locale}/login`}>
          {t("Sign in, then return here to delete your account", "سجّل الدخول ثم عد هنا لحذف حسابك")}
        </a>
      ) : (
        <>
          <button type="button" className={button} disabled={busy} onClick={() => void load()}>
            {preview ? t("Refresh workspace list", "تحديث قائمة المساحات") : t("Review account deletion", "مراجعة حذف الحساب")}
          </button>
          {preview ? (
            <>
              <h3 className="font-semibold">{t("Workspaces that will be deleted", "المساحات التي ستُحذف")}</h3>
              {preview.ownedWorkspaces.length ? (
                <ul className="list-inside list-disc">
                  {preview.ownedWorkspaces.map((w) => (
                    <li key={w.id}>{w.name}</li>
                  ))}
                </ul>
              ) : (
                <p>{t("No owned workspaces", "لا توجد مساحات مملوكة")}</p>
              )}
              {preview.otherWorkspaces.length ? (
                <>
                  <h3 className="font-semibold">{t("Workspaces you will leave", "المساحات التي ستغادرها")}</h3>
                  <ul className="list-inside list-disc">
                    {preview.otherWorkspaces.map((w) => (
                      <li key={w.id}>{w.name}</li>
                    ))}
                  </ul>
                </>
              ) : null}
              {preview.passwordRequired ? (
                <label className="grid gap-2">
                  {t("Current password", "كلمة المرور الحالية")}
                  <input
                    className={field}
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    disabled={busy}
                    onChange={(e) => setPassword(e.target.value)}
                  />
                </label>
              ) : (
                <>
                  <button type="button" className={button} disabled={busy} onClick={() => void sendCode()}>
                    {t("Email a confirmation code", "إرسال رمز تأكيد إلى البريد")}
                  </button>
                  {challengeToken ? (
                    <p>
                      {t(
                        "Enter the 8-digit code sent to your email. It expires in 10 minutes.",
                        "أدخل الرمز المكوّن من ٨ أرقام المرسل إلى بريدك. تنتهي صلاحيته خلال ١٠ دقائق."
                      )}
                    </p>
                  ) : null}
                  <label className="grid gap-2">
                    {t("Email confirmation code", "رمز التأكيد بالبريد")}
                    <input
                      className={field}
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      maxLength={8}
                      value={emailCode}
                      disabled={busy}
                      onChange={(e) => setEmailCode(e.target.value)}
                    />
                  </label>
                </>
              )}
              {preview.mfaRequired ? (
                <label className="grid gap-2">
                  {t("Authenticator code", "رمز المصادقة")}
                  <input
                    className={field}
                    inputMode="numeric"
                    maxLength={6}
                    autoComplete="one-time-code"
                    value={code}
                    disabled={busy}
                    onChange={(e) => setCode(e.target.value)}
                  />
                </label>
              ) : null}
              <label className="grid gap-2">
                {t("Type DELETE to confirm", "اكتب DELETE للتأكيد")}
                <input className={field} value={confirmation} disabled={busy} onChange={(e) => setConfirmation(e.target.value)} />
              </label>
              <button
                type="button"
                className={button}
                disabled={
                  busy ||
                  confirmation !== "DELETE" ||
                  (preview.passwordRequired ? !password : !challengeToken || emailCode.length !== 8) ||
                  (preview.mfaRequired && code.length !== 6)
                }
                onClick={() => void erase()}
              >
                {t("Permanently delete account", "حذف الحساب نهائيًا")}
              </button>
            </>
          ) : null}
        </>
      )}
      {error ? <p role="alert">{error}</p> : null}
    </div>
  );
}
