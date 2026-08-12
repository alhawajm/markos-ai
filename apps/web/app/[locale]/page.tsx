import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { MarketingLanding } from "./_components/marketing-landing";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return locale === "ar"
    ? {
        title: "MARKOS AI | دعم تسويق إنستغرام",
        description: "خطط وأنشئ وانشر وافهم تسويقك على إنستغرام مع MARKOS AI."
      }
    : {
        title: "MARKOS AI | Instagram marketing support",
        description: "Plan, create, publish, and understand your Instagram marketing with MARKOS AI."
      };
}

export default async function LandingPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <MarketingLanding locale={locale as Locale} />;
}
