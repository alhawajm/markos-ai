import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { AuthPreview } from "../auth-preview";

export const metadata: Metadata = {
  title: "Reset your password | MARKOS AI",
  robots: { follow: false, index: false }
};

export default async function DesignPreviewForgotPasswordPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <AuthPreview locale={locale} mode="forgot-password" />;
}
