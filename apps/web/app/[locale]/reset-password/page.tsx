import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { AuthPage } from "../_components/auth-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: locale === "ar" ? "اختيار كلمة مرور جديدة | MARKOS AI" : "Choose a new password | MARKOS AI",
    robots: { follow: false, index: false }
  };
}

export default async function ResetPasswordPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ expired?: string }>;
}) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const locale: Locale = resolvedParams.locale === "ar" ? "ar" : "en";

  return <AuthPage locale={locale} mode="reset-password" resetLinkExpired={resolvedSearchParams.expired === "1"} />;
}
