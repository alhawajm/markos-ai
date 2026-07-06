import type { Locale } from "@markos/shared-types";
import { OnboardingPanel } from "../_components/onboarding-panel";

export function generateStaticParams() {
  return ["ar", "en"].map((locale) => ({ locale }));
}

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <OnboardingPanel locale={locale} />;
}
