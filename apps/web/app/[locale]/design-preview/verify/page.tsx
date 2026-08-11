import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { AuthPreview } from "../auth-preview";

export const metadata: Metadata = {
  title: "Check your email | MARKOS AI",
  robots: { follow: false, index: false }
};

export default async function DesignPreviewVerifyPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string }>;
}) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <AuthPreview initialEmail={resolvedSearchParams.email ?? ""} locale={locale} mode="verify" />;
}
