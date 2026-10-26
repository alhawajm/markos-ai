import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { LegalDocument } from "../_components/legal-document";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;
  return { title: locale === "ar" ? "الدعم | MARKOS" : "Support | MARKOS" };
}
export default async function SupportPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale } = await params;
  return <LegalDocument kind="support" locale={locale === "ar" ? ("ar" as Locale) : "en"} />;
}
