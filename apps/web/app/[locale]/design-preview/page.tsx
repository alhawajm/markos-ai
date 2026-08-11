import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { SunlitLandingPreview } from "./sunlit-landing-preview";

export const metadata: Metadata = {
  title: "MARKOS AI | Instagram marketing support",
  description: "Plan, create, publish, and understand your Instagram marketing with MARKOS AI.",
  robots: {
    follow: false,
    index: false
  }
};

export default async function DesignPreviewLandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <SunlitLandingPreview locale={locale} />;
}
