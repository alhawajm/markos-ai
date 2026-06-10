import type { ReactNode } from "react";
import { directionForLocale } from "@markos/i18n";
import type { Locale } from "@markos/shared-types";

const supportedLocales = ["ar", "en"] as const;

export function generateStaticParams() {
  return supportedLocales.map((locale) => ({ locale }));
}

export default function LocaleLayout({
  children,
  params
}: {
  children: ReactNode;
  params: { locale: Locale };
}) {
  const locale = supportedLocales.includes(params.locale) ? params.locale : "ar";

  return <div lang={locale} dir={directionForLocale(locale)}>{children}</div>;
}
