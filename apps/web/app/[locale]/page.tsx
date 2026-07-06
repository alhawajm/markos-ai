import type { Locale } from "@markos/shared-types";
import { PublicLandingPage } from "./_components/public-entry";

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <PublicLandingPage locale={locale as Locale} />;
}
