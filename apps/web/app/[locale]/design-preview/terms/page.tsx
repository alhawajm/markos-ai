import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { LegalDocumentPreview } from "../legal-document-preview";

export const metadata: Metadata = {
  title: "Terms of Service | MARKOS AI",
  robots: { follow: false, index: false }
};

export default async function DesignPreviewTermsPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <LegalDocumentPreview kind="terms" locale={locale} />;
}
