import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { LegalDocument } from "../_components/legal-document";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: locale === "ar" ? "سياسة الخصوصية | MARKOS AI" : "Privacy Policy | MARKOS AI",
    robots: { follow: false, index: false }
  };
}

export default async function PrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <LegalDocument kind="privacy" locale={locale} />;
}
