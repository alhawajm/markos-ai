import type { Metadata } from "next";
import type { Locale } from "@markos/shared-types";
import { AuthPage } from "../_components/auth-page";

export async function generateMetadata({ params }: { params: Promise<{ locale: string }> }): Promise<Metadata> {
  const { locale } = await params;

  return {
    title: locale === "ar" ? "تسجيل الدخول | MARKOS AI" : "Log in | MARKOS AI",
    robots: { follow: false, index: false }
  };
}

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <AuthPage locale={locale} mode="login" />;
}
