import type { Locale } from "@markos/shared-types";
import { OnboardingRoute } from "../_components/onboarding-route";

export function generateStaticParams() {
  return ["ar", "en"].map((locale) => ({ locale }));
}

export default async function OnboardingPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <OnboardingRoute locale={locale} />;
}
