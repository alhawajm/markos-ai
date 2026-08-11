import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { AuthPreview } from "../auth-preview";

export const metadata: Metadata = {
  title: "Choose a new password | MARKOS AI",
  robots: { follow: false, index: false }
};

export default async function DesignPreviewResetPasswordPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ expired?: string }>;
}) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <AuthPreview locale={locale} mode="reset-password" resetLinkExpired={resolvedSearchParams.expired === "1"} />;
}
