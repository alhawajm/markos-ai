"use client";

import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, CheckCircle2, Mail, RefreshCcw, ShieldCheck } from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type { Locale } from "@markos/shared-types";
import { getBrowserApiBaseUrl } from "./api-base-url";
import { refreshBrowserSession, useMarkosSession } from "./browser-session";

const pendingEmailKey = "markos.pending-verification-email";

type VerificationState = "idle" | "requesting" | "sent" | "verifying" | "verified" | "error";

export function EmailVerificationPanel({ locale }: { locale: Locale }) {
  const router = useRouter();
  const session = useMarkosSession();
  const client = useMemo(() => new MarkosApiClient({ baseUrl: getBrowserApiBaseUrl() }), []);
  const requestStarted = useRef(false);
  const [email, setEmail] = useState("");
  const [localToken, setLocalToken] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [state, setState] = useState<VerificationState>("idle");
  const arabic = locale === "ar";

  useEffect(() => {
    const pendingEmail = session?.user.email ?? window.sessionStorage.getItem(pendingEmailKey) ?? "";
    setEmail(pendingEmail);

    const params = new URLSearchParams(window.location.search);
    const token = params.get("token");

    if (token) {
      window.history.replaceState({}, "", `/${locale}/verify`);
      void verifyToken(token);
      return;
    }

    if (pendingEmail && !requestStarted.current) {
      requestStarted.current = true;
      void requestVerification(pendingEmail);
    }
    // The initial browser handoff is intentionally handled once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function requestVerification(requestedEmail = email) {
    const normalizedEmail = requestedEmail.trim();

    if (!normalizedEmail) {
      setState("error");
      setMessage(arabic ? "أدخل بريدك الإلكتروني لإرسال رابط التأكيد." : "Enter your email to send a verification link.");
      return;
    }

    setState("requesting");
    setMessage("");
    setLocalToken(null);

    try {
      const challenge = await client.requestEmailVerification({
        email: normalizedEmail,
        locale
      });
      window.sessionStorage.setItem(pendingEmailKey, normalizedEmail);
      setEmail(normalizedEmail);

      if (challenge.alreadyVerified) {
        await finishVerifiedSession();
        return;
      }

      setLocalToken(challenge.verificationToken ?? null);
      setState("sent");
      setMessage(
        challenge.verificationToken
          ? arabic
            ? "تم إنشاء رابط تأكيد محلي. استخدم الزر أدناه للمتابعة في بيئة التطوير."
            : "A local verification link is ready. Use the button below to continue in development."
          : arabic
            ? "أرسلنا رابط التأكيد إلى بريدك الإلكتروني."
            : "We sent a verification link to your email."
      );
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : arabic ? "تعذر إرسال رابط التأكيد." : "The verification link could not be sent.");
    }
  }

  async function verifyToken(token: string) {
    setState("verifying");
    setMessage("");

    try {
      await client.verifyEmail({ token });
      await finishVerifiedSession();
    } catch (error) {
      setState("error");
      setMessage(error instanceof Error ? error.message : arabic ? "رابط التأكيد غير صالح أو منتهي." : "The verification link is invalid or expired.");
    }
  }

  async function finishVerifiedSession() {
    window.sessionStorage.removeItem(pendingEmailKey);
    setState("verified");
    setMessage(arabic ? "تم تأكيد بريدك الإلكتروني." : "Your email is verified.");

    try {
      await refreshBrowserSession();
      router.replace(`/${locale}/onboarding`);
    } catch {
      router.replace(`/${locale}/login?verified=1`);
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void requestVerification();
  }

  return (
    <main className="lux-page grid min-h-screen place-items-center px-5 py-10 text-white">
      <section className="lux-card w-full max-w-xl rounded-[2rem] p-6 sm:p-9">
        <div className="mx-auto grid h-16 w-16 place-items-center rounded-full border border-[#81D8D0]/30 bg-[#81D8D0]/10 text-[#81D8D0]">
          {state === "verified" ? <CheckCircle2 size={31} /> : <ShieldCheck size={31} />}
        </div>
        <p className="mt-7 text-center text-xs font-black uppercase tracking-[0.18em] text-[#D4AF37]">MARKOS AI</p>
        <h1 className="mt-3 text-center font-display text-3xl font-black">{arabic ? "أكد بريدك الإلكتروني" : "Verify your email"}</h1>
        <p className="mx-auto mt-3 max-w-md text-center leading-7 text-[#C7CDD8]">
          {arabic
            ? "نستخدم البريد المؤكد لحماية مساحة عملك قبل حفظ بيانات النشاط أو تشغيل أدوات الذكاء الاصطناعي."
            : "A verified email protects your workspace before business data is saved or AI tools are used."}
        </p>

        <form className="mt-7" onSubmit={submit}>
          <label className="block text-sm font-bold text-[#C7CDD8]" htmlFor="verification-email">
            {arabic ? "البريد الإلكتروني" : "Email"}
          </label>
          <div className="relative mt-2">
            <Mail className="pointer-events-none absolute left-4 top-1/2 -translate-y-1/2 text-[#8B95A8]" size={18} />
            <input
              autoComplete="email"
              className="h-12 w-full rounded-2xl border border-[#81D8D0]/18 bg-[#0F1419]/70 px-12 text-base font-semibold text-white outline-none focus:border-[#81D8D0]/50"
              disabled={state === "requesting" || state === "verifying" || state === "verified"}
              id="verification-email"
              onChange={(event) => setEmail(event.target.value)}
              type="email"
              value={email}
            />
          </div>
          <button
            className="mt-4 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full bg-gradient-to-r from-[#81D8D0] to-[#D4AF37] px-5 font-black text-[#0F1419] disabled:cursor-wait disabled:opacity-60"
            disabled={state === "requesting" || state === "verifying" || state === "verified"}
            type="submit"
          >
            <RefreshCcw size={17} />
            {state === "requesting" ? (arabic ? "جار الإرسال..." : "Sending...") : arabic ? "إرسال رابط التأكيد" : "Send verification link"}
          </button>
        </form>

        {localToken ? (
          <button
            className="mt-3 inline-flex h-12 w-full items-center justify-center gap-2 rounded-full border border-[#D4AF37]/35 bg-[#D4AF37]/10 px-5 font-bold text-[#F5DC86]"
            disabled={state === "verifying"}
            onClick={() => void verifyToken(localToken)}
            type="button"
          >
            {arabic ? "تأكيد محلي والمتابعة" : "Verify locally and continue"} <ArrowRight size={17} />
          </button>
        ) : null}

        {message ? (
          <p
            className={
              state === "error"
                ? "mt-5 rounded-2xl border border-red-400/25 bg-red-400/10 p-4 text-sm leading-6 text-red-100"
                : "mt-5 rounded-2xl border border-[#81D8D0]/20 bg-[#81D8D0]/8 p-4 text-sm leading-6 text-[#D6DEEA]"
            }
          >
            {message}
          </p>
        ) : null}
      </section>
    </main>
  );
}
