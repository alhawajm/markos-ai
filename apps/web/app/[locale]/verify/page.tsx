import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { AuthPage } from "../_components/auth-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: locale === "ar" ? "تحقق من بريدك الإلكتروني | MARKOS AI" : "Check your email | MARKOS AI",
    robots: { follow: false, index: false }
  };
}

export default async function VerifyEmailPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams: Promise<{ email?: string; token?: string }>;
}) {
  const [resolvedParams, resolvedSearchParams] = await Promise.all([params, searchParams]);
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <AuthPage initialEmail={resolvedSearchParams.email ?? ""} initialToken={resolvedSearchParams.token ?? ""} locale={locale} mode="verify" />;
}
