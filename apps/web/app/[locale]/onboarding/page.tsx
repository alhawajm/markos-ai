import type { Locale } from "@markos/shared-types";
import { OnboardingRoute } from "../_components/onboarding-route";

export function generateStaticParams() {
  return ["ar", "en"].map((locale) => ({ locale }));
}

export default async function OnboardingPage({ params, searchParams }: { params: Promise<{ locale: string }>; searchParams: Promise<{ mode?: string }> }) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <OnboardingRoute editMode={resolvedSearchParams.mode === "edit"} locale={locale} />;
}
