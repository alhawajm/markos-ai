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
    <main dir={ar ? "rtl" : "ltr"} className="sunlit-theme min-h-screen bg-[var(--background)] px-5 py-8 text-[var(--text)] sm:py-12">
      <div className="mx-auto max-w-4xl">
        <p className="mb-8 text-xl font-semibold">MARKOS AI</p>
        <h1 className="text-3xl font-semibold">{ar ? "لنربط نشاطك بإنستغرام" : "Bring your Instagram into MARKOS"}</h1>
        <p className="mt-3 max-w-2xl text-base leading-7 text-[var(--text-muted)]">
          {ar
            ? "أمّن حسابك، ثم اربط إنستغرام. ستراجع ما يتعلمه ماركوس قبل إضافته إلى ملف نشاطك."
            : "Secure your account, then connect Instagram. You’ll review what MARKOS learns before adding it to your business profile."}
        </p>
        <ol className="my-8 grid gap-3 sm:grid-cols-3" aria-label={ar ? "خطوات الإعداد" : "Setup steps"}>
          {steps.map((label, index) => (
            <li
              key={label}
              aria-current={ready && index === step ? "step" : undefined}
              className={`flex items-center gap-3 rounded-xl px-4 py-3 ${index === step ? "bg-[var(--surface)] ring-1 ring-[var(--border-strong)]" : "text-[var(--text-muted)]"}`}
            >
              <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-[var(--surface-muted)]">
                {ready && index < step ? <Check size={18} /> : index + 1}
              </span>
              {label}
            </li>
          ))}
        </ol>
        {error ? (
          <div role="alert" className="mb-5 rounded-xl border border-[var(--danger)] p-4 text-[var(--danger)]">
            {error}
            {!ready ? (
              <button type="button" className={`${setupSecondary} ms-3`} onClick={() => setAttempt((v) => v + 1)}>
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
          <section className="rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-6 sm:p-8">
            {connection?.connected ? (
              <InstagramLearningPanel key={owner} locale={locale} username={connection.username ?? ""} />
            ) : !enabled ? (
              <>
                <ShieldCheck aria-hidden="true" className="mb-4 text-[var(--accent)]" size={30} />
                <h2 className="text-2xl font-semibold">{ar ? "أمّن حسابك" : "Secure your account"}</h2>
                <p className="mt-3 max-w-2xl leading-7 text-[var(--text-muted)]">
                  {ar
                    ? "استخدم تطبيق مصادقة لإضافة حماية لحسابك قبل ربط إنستغرام."
                    : "Use an authenticator app to add account protection before connecting Instagram."}
                </p>
                {!setup ? (
                  <button
                    type="button"
                    disabled={busy}
                    className={`${setupPrimary} mt-6`}
                    onClick={() => void action(async () => setSetup(await client.setupMfaTotp()))}
                  >
                    {busy ? <LoaderCircle size={18} className="animate-spin" /> : null}
                    {ar ? "إعداد تطبيق المصادقة" : "Set up authenticator"}
                  </button>
                ) : (
                  <form
                    className="mt-6 grid gap-6 sm:grid-cols-[auto_1fr]"
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
                    <div className="w-fit rounded-xl bg-white p-4">
                      <QRCodeSVG value={setup.otpauthUri} size={180} title={ar ? "رمز إعداد المصادقة" : "Authenticator setup QR code"} />
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
                      <button disabled={busy || code.length !== 6} className={setupPrimary}>
                        {ar ? "تأكيد ومتابعة" : "Verify and continue"}
                      </button>
                    </div>
                  </form>
                )}
              </>
            ) : (
              <>
                <Instagram aria-hidden="true" className="mb-4 text-[var(--accent)]" size={30} />
                <h2 className="text-2xl font-semibold">{ar ? "اربط حساب إنستغرام الاحترافي" : "Connect your professional Instagram account"}</h2>
                <p className="mt-3 leading-7 text-[var(--text-muted)]">
                  {ar
                    ? "ستنتقل إلى إنستغرام للسماح بالوصول إلى ملفك ومحتواك وإحصاءاتك والنشر من ماركوس، ثم تعود هنا لمراجعة ما تعلمه."
                    : "Instagram will ask you to allow profile, content, insights, and publishing access. Then you’ll return here to review what MARKOS learns."}
                </p>
                <button
                  type="button"
                  disabled={busy}
                  className={`${setupPrimary} mt-6`}
                  onClick={() =>
                    void action(async () => {
                      const result = await client.instagramOAuthStart({ locale, returnTo: `/${locale}/instagram-setup` });
                      window.location.assign(result.authorizationUrl);
                    })
                  }
                >
                  {busy ? <LoaderCircle size={18} className="animate-spin" /> : null}
                  {ar ? "الربط بإنستغرام" : "Connect Instagram"}
                </button>
              </>
            )}
          </section>
        )}
        {ready && !connection?.connected ? (
          <div className="mt-6 flex flex-wrap items-center gap-4">
            <Link href={`/${locale}/app`} className={setupSecondary}>
              {ar ? "لاحقاً" : "Do this later"}
            </Link>
            <p className="text-sm text-[var(--text-muted)]">
              {ar
                ? "يمكنك استكشاف ماركوس والعودة للربط من النظرة العامة أو ملف النشاط."
                : "Explore MARKOS and return from Overview or Business profile when you’re ready."}
            </p>
          </div>
        ) : null}
      </div>
    </main>
  );
}
