import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { AuthPreview } from "../auth-preview";

export const metadata: Metadata = {
  title: "Create your account | MARKOS AI",
  robots: { follow: false, index: false }
};

export default async function DesignPreviewSignupPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <AuthPreview locale={locale} mode="signup" />;
}
