import type { Locale } from "@markos/shared-types";
import { AppShell } from "./_components/app-shell";

export default function AppShellPage({ params }: { params: { locale: Locale } }) {
  const locale = params.locale === "en" ? "en" : "ar";

  return <AppShell activeSection="dashboard" locale={locale} />;
}
