import type { Locale } from "@markos/shared-types";
import { SettingsPage } from "../../_components/settings-page";

export default async function AppSettingsPage({
  params,
}: {
  params: Promise<{ locale: string }>;
}) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <SettingsPage locale={locale} />;
}
