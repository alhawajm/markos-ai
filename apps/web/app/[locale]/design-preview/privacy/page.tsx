import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { LegalDocumentPreview } from "../legal-document-preview";

export const metadata: Metadata = {
  title: "Privacy Policy | MARKOS AI",
  robots: { follow: false, index: false }
};

export default async function DesignPreviewPrivacyPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <LegalDocumentPreview kind="privacy" locale={locale} />;
}
