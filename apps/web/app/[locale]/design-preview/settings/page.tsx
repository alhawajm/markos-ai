import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { SettingsPreview } from "../settings-preview";

export const metadata: Metadata = {
  title: "Settings | MARKOS AI",
  robots: { follow: false, index: false }
};

export default async function DesignPreviewSettingsPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <SettingsPreview locale={locale} />;
}
