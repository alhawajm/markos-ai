"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { ArrowLeft, ArrowRight, Sparkles, UserRound } from "lucide-react";
import type { Locale } from "@markos/shared-types";
import { initializeBrowserSession, useMarkosSession, watchBrowserSession } from "./browser-session";
import { SettingsPanel } from "./settings-panel";

const SETTINGS_RETURN_KEY = "markos.settings.returnTo";

export function SettingsPage({ locale }: { locale: Locale }) {
  const [sessionChecked, setSessionChecked] = useState(false);
  const [sessionCheckFailed, setSessionCheckFailed] = useState(false);
  const [returnTo, setReturnTo] = useState(`/${locale}/app`);
  const session = useMarkosSession();

  const checkSession = useCallback(() => {
    setSessionCheckFailed(false);
    void initializeBrowserSession(locale)
      .then(() => setSessionChecked(true))
      .catch(() => setSessionCheckFailed(true));
  }, [locale]);

  useEffect(() => {
    const storedReturnTo = window.sessionStorage.getItem(SETTINGS_RETURN_KEY);
    const storedAppPath = storedReturnTo?.match(/^\/(?:ar|en)(\/app(?:\/[^?#]+)?)/)?.[1];
    if (storedAppPath && !storedAppPath.includes("/settings")) {
      setReturnTo(`/${locale}${storedAppPath}`);
    }
    checkSession();
    return watchBrowserSession(locale);
  }, [checkSession, locale]);

  if (!sessionChecked) {
    return (
      <main className="sunlit-theme sunlit-app grid min-h-screen place-items-center px-6" dir={locale === "ar" ? "rtl" : "ltr"}>
        <section className="sunlit-panel max-w-md rounded-[2rem] p-9 text-center">
          <span className="mx-auto grid h-14 w-14 place-items-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
            <Sparkles size={25} />
          </span>
          <h1 className="mt-6 text-2xl font-bold text-[var(--sunlit-ink)]">
            {sessionCheckFailed
              ? locale === "ar"
                ? "تعذر فتح الإعدادات"
                : "Could not open Settings"
              : locale === "ar"
                ? "جارٍ فتح الإعدادات"
                : "Opening Settings"}
          </h1>
          {sessionCheckFailed ? (
            <button className="sunlit-primary mt-5 rounded-xl px-5 py-3 font-bold" onClick={checkSession} type="button">
              {locale === "ar" ? "حاول مرة أخرى" : "Try again"}
            </button>
          ) : null}
        </section>
      </main>
    );
  }

  const BackIcon = locale === "ar" ? ArrowRight : ArrowLeft;
  const firstName = session?.user.fullName.split(/\s+/)[0] || (locale === "ar" ? "الحساب" : "Account");

  return (
    <main className="sunlit-theme sunlit-app min-h-screen min-w-0 overflow-x-clip" dir={locale === "ar" ? "rtl" : "ltr"}>
      <header className="sticky top-0 z-40 border-b border-[var(--sunlit-line)] bg-[rgb(255_250_245_/_90%)] px-5 py-3 backdrop-blur-xl sm:px-7 xl:px-10">
        <div className="mx-auto flex max-w-[1380px] items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              aria-label={locale === "ar" ? "العودة إلى مساحة العمل" : "Back to workspace"}
              className="grid h-11 w-11 shrink-0 place-items-center rounded-xl border border-[var(--sunlit-line)] bg-white text-[var(--sunlit-ink)] transition hover:border-[var(--sunlit-line-strong)]"
              href={returnTo}
            >
              <BackIcon size={19} />
            </Link>
            <Link className="flex min-w-0 items-center gap-3" href={`/${locale}/app`}>
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-ink)] text-[var(--sunlit-yellow)]">
                <Sparkles size={18} />
              </span>
              <span className="hidden sm:block">
                <span className="block text-sm font-bold text-[var(--sunlit-ink)]">MARKOS AI</span>
                <span className="block text-xs font-semibold text-[var(--sunlit-muted)]">{locale === "ar" ? "إعدادات مساحة العمل" : "Workspace settings"}</span>
              </span>
            </Link>
          </div>

          <div className="flex shrink-0 items-center gap-2">
            <div className="flex items-center rounded-xl border border-[var(--sunlit-line)] bg-white/80 p-1" aria-label="Language switcher">
              <Link
                className={locale === "ar" ? activeLanguageClass : languageClass}
                href="/ar/app/settings"
                onClick={(event) => {
                  event.preventDefault();
                  window.location.assign(`/ar/app/settings${window.location.hash}`);
                }}
              >
                العربية
              </Link>
              <Link
                className={locale === "en" ? activeLanguageClass : languageClass}
                href="/en/app/settings"
                onClick={(event) => {
                  event.preventDefault();
                  window.location.assign(`/en/app/settings${window.location.hash}`);
                }}
              >
                English
              </Link>
            </div>
            <div className="hidden min-h-11 items-center gap-2 rounded-xl border border-[var(--sunlit-line)] bg-white px-3.5 font-bold text-[var(--sunlit-ink)] sm:flex">
              <span className="grid h-7 w-7 place-items-center rounded-lg bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
                <UserRound size={15} />
              </span>
              <span>{firstName}</span>
            </div>
          </div>
        </div>
      </header>

      <div className="mx-auto w-full max-w-[1380px] min-w-0 px-5 py-7 sm:px-7 xl:px-10 xl:py-9">
        <SettingsPanel locale={locale} />
      </div>
    </main>
  );
}

const activeLanguageClass = "shrink-0 rounded-lg bg-[var(--sunlit-ink)] px-3 py-2 text-xs font-extrabold text-white";
const languageClass =
  "shrink-0 rounded-lg px-3 py-2 text-xs font-extrabold text-[var(--sunlit-muted)] transition hover:bg-[var(--sunlit-paper)] hover:text-[var(--sunlit-ink)]";
