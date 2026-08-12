import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { LegalDocument } from "../_components/legal-document";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: locale === "ar" ? "شروط الخدمة | MARKOS AI" : "Terms of Service | MARKOS AI",
    robots: { follow: false, index: false }
  };
}

export default async function TermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <LegalDocument kind="terms" locale={locale} />;
}
