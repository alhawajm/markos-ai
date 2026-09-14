"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { QRCodeSVG } from "qrcode.react";
import { Check, Instagram, LoaderCircle, ShieldCheck } from "lucide-react";
import type { InstagramConnection, Locale, MfaTotpSetup } from "@markos/shared-types";
import { appEntryRedirect } from "./app-entry";
import { createMarkosClient, initializeBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";
import { InstagramLearningPanel } from "./instagram-learning-panel";

export const setupPrimary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl bg-[var(--primary)] px-5 py-3 text-base font-semibold text-[var(--on-primary)] disabled:opacity-50";
export const setupSecondary =
  "inline-flex min-h-12 items-center justify-center gap-2 rounded-xl border border-[var(--border-strong)] bg-[var(--surface)] px-5 py-3 text-base font-medium disabled:opacity-50";

export function InstagramSetup({ locale }: { locale: Locale }) {
  const client = useMarkosClient(locale);
  const router = useRouter();
  const session = useMarkosSession();
  const ar = locale === "ar";
  const [owner, setOwner] = useState("");
  const [attempt, setAttempt] = useState(0);
  const [enabled, setEnabled] = useState(false);
  const [connection, setConnection] = useState<InstagramConnection | null>(null);
  const [setup, setSetup] = useState<MfaTotpSetup | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  useEffect(() => {
    let active = true;
    setOwner("");
    setSetup(null);
    setCode("");
    setError("");
    void initializeBrowserSession(locale)
      .then(async (current) => {
        const api = createMarkosClient(current, locale);
        const redirect = await appEntryRedirect(current, api, locale);
        if (!active) return;
        if (redirect) {
          router.replace(redirect);
          return;
        }
        const [mfa, instagram] = await Promise.all([api.mfaStatus(), api.instagramConnection()]);
        if (!active) return;
        setEnabled(mfa.enabled);
        setConnection(instagram);
        setOwner(`${current.user.id}:${current.workspace.id}`);
        if (new URLSearchParams(window.location.search).get("instagram") === "error") {
          setError(ar ? "لم يكتمل الربط. يمكنك المحاولة مرة أخرى." : "Connection was not completed. You can try again.");
        }
      })
      .catch(() => {
        if (active) setError(ar ? "تعذر تحميل الإعداد. حاول مرة أخرى." : "Could not load setup. Please try again.");
      });
    return () => {
      active = false;
    };
  }, [locale, ar, router, attempt, session?.user.id, session?.workspace.id]);

  async function action(run: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await run();
    } catch (e) {
      setError(e instanceof Error ? e.message : ar ? "تعذر إكمال الخطوة." : "Could not complete this step.");
    } finally {
      setBusy(false);
    }
  }
  const ready = Boolean(session && owner === `${session.user.id}:${session.workspace.id}`);
  const steps = ar ? ["أمان الحساب", "ربط إنستغرام", "التعلم والمراجعة"] : ["Account security", "Connect Instagram", "Learn and review"];
  const step = connection?.connected ? 2 : enabled ? 1 : 0;
  return (
    <main
      dir={ar ? "rtl" : "ltr"}
      className="sunlit-theme flex h-dvh flex-col overflow-hidden bg-[var(--background)] px-4 py-4 text-[var(--text)] sm:px-6 sm:py-6"
    >
      <div className="mx-auto flex min-h-0 w-full max-w-6xl flex-1 flex-col">
        <header className="mb-4 flex shrink-0 flex-wrap items-center gap-x-5 gap-y-2">
          <p className="font-semibold">MARKOS AI</p>
          {!connection?.connected ? <h1 className="text-xl font-semibold">{ar ? "اربط نشاطك بإنستغرام" : "Connect your Instagram"}</h1> : null}
        </header>
        {!connection?.connected ? (
          <p className="mb-4 max-w-3xl text-[15px] leading-6 text-[var(--text-muted)]">
            {ar
              ? "ساعد ماركوس على فهم أسلوب نشاطك لتحسين المحتوى والحملات. ستراجع ما يتعلمه قبل حفظه."
              : "Help MARKOS understand your business’s style for better content and campaigns. Review what it learns before saving."}
          </p>
        ) : null}
        <ol className="mb-4 grid shrink-0 grid-cols-3 gap-2" aria-label={ar ? "خطوات الإعداد" : "Setup steps"}>
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={ready && index === step ? "step" : undefined}
              className={
                "flex items-center gap-2 rounded-xl px-3 py-2 text-sm " +
                (index === step
                  ? "bg-[var(--accent-soft)] font-medium text-[var(--link)]"
                  : index < step
                    ? "bg-[var(--success-soft)] text-[var(--success)]"
                    : "text-[var(--text-muted)]")
              }
            >
              <span className="grid h-7 w-7 shrink-0 place-items-center rounded-full bg-[var(--surface)]">
                {ready && index < step ? <Check size={16} /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {error ? (
          <div role="alert" className="mb-3 shrink-0 rounded-xl border border-[var(--danger)] p-3 text-[var(--danger)]">
            {error}
            {!ready ? (
              <button type="button" className={setupSecondary + " ms-3"} onClick={() => setAttempt((v) => v + 1)}>
                {ar ? "إعادة المحاولة" : "Retry"}
              </button>
            ) : null}
          </div>
        ) : null}
        {!ready ? (
          <div role="status" className="flex items-center gap-3">
            <LoaderCircle className="animate-spin motion-reduce:animate-none" size={20} />
            {ar ? "جارٍ التحقق من الإعداد…" : "Checking setup…"}
          </div>
        ) : (
          <section className="flex min-h-0 flex-1 flex-col rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-4 sm:p-5">
            {connection?.connected ? (
              <InstagramLearningPanel key={owner} locale={locale} username={connection.username ?? ""} />
            ) : (
              <>
                <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain">
                  <div className="mb-3 flex items-center gap-3">
                    {enabled ? (
                      <Instagram aria-hidden="true" className="text-[var(--accent)]" size={26} />
                    ) : (
                      <ShieldCheck aria-hidden="true" className="text-[var(--accent)]" size={26} />
                    )}
                    <h2 className="text-2xl font-semibold">
                      {enabled
                        ? ar
                          ? "اربط حساب إنستغرام الاحترافي"
                          : "Connect your professional Instagram account"
                        : ar
                          ? "أمّن حسابك"
                          : "Secure your account"}
                    </h2>
                  </div>
                  <p className="max-w-3xl text-base leading-7 text-[var(--text-muted)]">
                    {enabled
                      ? ar
                        ? "اسمح بالوصول إلى ملفك ومحتواك وإحصاءاتك والنشر، ثم عد هنا لمراجعة ما تعلمه ماركوس."
                        : "Allow profile, content, insights, and publishing access, then return here to review what MARKOS learns."
                      : ar
                        ? "استخدم تطبيق مصادقة لحماية حسابك قبل ربط إنستغرام."
                        : "Use an authenticator app to protect your account before connecting Instagram."}
                  </p>
                  {!enabled && setup ? (
                    <form
                      id="instagram-mfa-setup"
                      className="mt-5 grid items-start gap-5 sm:grid-cols-[auto_1fr]"
                      onSubmit={(event) => {
                        event.preventDefault();
                        void action(async () => {
                          const result = await client.enableMfaTotp({ code });
                          setEnabled(result.enabled);
                          setSetup(null);
                          setCode("");
                        });
                      }}
                    >
                      <div className="w-fit rounded-xl bg-white p-3">
                        <QRCodeSVG value={setup.otpauthUri} size={160} title={ar ? "رمز إعداد المصادقة" : "Authenticator setup QR code"} />
                      </div>
                      <div className="grid content-start gap-4">
                        <p className="leading-7">
                          {ar
                            ? "امسح الرمز بتطبيق المصادقة، ثم أدخل الرمز المكوّن من 6 أرقام."
                            : "Scan with your authenticator app, then enter its six-digit code."}
                        </p>
                        <details>
                          <summary className="cursor-pointer text-[var(--link)]">{ar ? "إدخال مفتاح الإعداد يدوياً" : "Enter the setup key manually"}</summary>
                          <code className="mt-2 block break-all rounded-lg border border-[var(--border)] p-3" dir="ltr">
                            {setup.secret}
                          </code>
                        </details>
                        <label className="grid gap-2">
                          {ar ? "رمز المصادقة" : "Authenticator code"}
                          <input
                            required
                            autoComplete="one-time-code"
                            inputMode="numeric"
                            pattern="[0-9]{6}"
                            maxLength={6}
                            value={code}
                            onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
                            dir="ltr"
                            className="sunlit-field min-h-12 rounded-xl px-4 text-lg tracking-widest"
                          />
                        </label>
                      </div>
                    </form>
                  ) : null}
                </div>
                <div className="mt-4 flex shrink-0 flex-wrap items-center justify-between gap-3 border-t border-[var(--border)] pt-4">
                  <Link href={"/" + locale + "/app"} className={setupSecondary}>
                    {ar ? "لاحقاً" : "Do this later"}
                  </Link>
                  {!enabled ? (
                    setup ? (
                      <button type="submit" form="instagram-mfa-setup" disabled={busy || code.length !== 6} className={setupPrimary}>
                        {ar ? "تأكيد ومتابعة" : "Verify and continue"}
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={busy}
                        className={setupPrimary}
                        onClick={() => void action(async () => setSetup(await client.setupMfaTotp()))}
                      >
                        {busy ? <LoaderCircle size={18} className="animate-spin" /> : null}
                        {ar ? "إعداد تطبيق المصادقة" : "Set up authenticator"}
                      </button>
                    )
                  ) : (
                    <button
                      type="button"
                      disabled={busy}
                      className={setupPrimary}
                      onClick={() =>
                        void action(async () => {
                          const result = await client.instagramOAuthStart({ locale, returnTo: "/" + locale + "/instagram-setup" });
                          window.location.assign(result.authorizationUrl);
                        })
                      }
                    >
                      {busy ? <LoaderCircle size={18} className="animate-spin" /> : null}
                      {ar ? "الربط بإنستغرام" : "Connect Instagram"}
                    </button>
                  )}
                </div>
              </>
            )}
          </section>
        )}
        {ready && !connection?.connected ? (
          <p className="mt-3 shrink-0 text-sm text-[var(--text-muted)]">
            {ar ? "يمكنك العودة من النظرة العامة أو ملف النشاط." : "You can return from Overview or Business profile."}
          </p>
        ) : null}
      </div>
    </main>
  );
}
