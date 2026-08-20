"use client";

import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import type { Locale } from "@markos/shared-types";
import { initializeBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";
import { createOnboardingDraftFromVault, type OnboardingDraft } from "./onboarding-draft";
import { OnboardingPanel } from "./onboarding-panel";

type RouteStatus = "checking" | "allowed" | "failed";

export function OnboardingRoute({ editMode, locale }: { editMode: boolean; locale: Locale }) {
  const client = useMarkosClient(locale);
  const router = useRouter();
  const session = useMarkosSession();
  const [attempt, setAttempt] = useState(0);
  const [initialDraft, setInitialDraft] = useState<OnboardingDraft | null>(null);
  const [message, setMessage] = useState("");
  const [status, setStatus] = useState<RouteStatus>("checking");

  const checkOnboarding = useCallback(() => {
    if (!session) return;

    if (!session.user.isVerified) {
      router.replace(`/${locale}/verify`);
      return;
    }

    let active = true;
    setStatus("checking");
    setInitialDraft(null);
    setMessage("");

    void (async () => {
      try {
        const state = await client.onboarding();
        if (!active) return;

        if (!editMode && state.status === "COMPLETE" && state.businessProfile.status === "APPROVED") {
          window.localStorage.removeItem("markos.onboarding.draft.v2");
          router.replace(`/${locale}/app/strategy`);
          return;
        }

        if (editMode) {
          const vault = await client.vault();
          if (!active) return;
          setInitialDraft(createOnboardingDraftFromVault(vault));
        }

        setStatus("allowed");
      } catch (error) {
        if (!active) return;
        setMessage(error instanceof Error ? error.message : locale === "ar" ? "تعذر التحقق من حالة الإعداد." : "Could not check onboarding status.");
        setStatus("failed");
      }
    })();

    return () => {
      active = false;
    };
  }, [client, editMode, locale, router, session]);

  useEffect(() => {
    if (session) return;

    void initializeBrowserSession(locale).catch(() => {
      setMessage(locale === "ar" ? "تعذر تجديد الجلسة." : "Could not renew your session.");
      setStatus("failed");
    });
  }, [attempt, locale, session]);

  useEffect(() => checkOnboarding(), [attempt, checkOnboarding]);

  if (status === "allowed") {
    return <OnboardingPanel editMode={editMode} locale={locale} {...(initialDraft === null ? {} : { initialDraft })} />;
  }

  return (
    <main className="sunlit-theme sunlit-app grid min-h-screen place-items-center px-6">
      <section className="sunlit-panel max-w-md rounded-[2rem] p-9 text-center">
        <span className="mx-auto block h-16 w-16 animate-pulse rounded-2xl bg-[var(--sunlit-aqua-soft)] shadow-[inset_0_0_0_1px_rgb(33_191_174_/_22%)]" />
        <h1 className="mt-7 text-3xl font-black text-[var(--sunlit-ink)]">
          {status === "failed"
            ? locale === "ar"
              ? "تعذر فتح الإعداد"
              : "Could not open onboarding"
            : locale === "ar"
              ? "جارٍ التحقق من الإعداد"
              : "Checking onboarding status"}
        </h1>
        <p className="mt-3 text-base leading-relaxed text-[var(--sunlit-muted)]">
          {status === "failed"
            ? message
            : locale === "ar"
              ? "نتحقق من مساحة العمل قبل فتح خطوات الإعداد."
              : "Checking your workspace before opening the onboarding steps."}
        </p>
        {status === "failed" ? (
          <button className="sunlit-primary mt-6 rounded-xl px-6 py-3 font-black" onClick={() => setAttempt((current) => current + 1)} type="button">
            {locale === "ar" ? "حاول مرة أخرى" : "Try again"}
          </button>
        ) : null}
      </section>
    </main>
  );
}
