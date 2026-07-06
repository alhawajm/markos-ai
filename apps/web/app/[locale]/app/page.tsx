import type { Locale } from "@markos/shared-types";
import { AppShell } from "../_components/app-shell";

export default async function AppDashboardPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <AppShell activeSection="dashboard" locale={locale} />;
}
