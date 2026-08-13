import type { ReactNode } from "react";
import { directionForLocale } from "@markos/i18n";
import type { Locale } from "@markos/shared-types";

const supportedLocales = ["ar", "en"] as const;

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default async function LocaleLayout({ children, params }: { children: ReactNode; params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = supportedLocales.includes(resolvedParams.locale as Locale) ? (resolvedParams.locale as Locale) : "ar";

  return (
    <div className="max-w-full overflow-x-hidden" lang={locale} dir={directionForLocale(locale)}>
      {children}
    </div>
  );
}
