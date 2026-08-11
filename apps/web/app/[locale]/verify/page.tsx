import type { Locale } from "@markos/shared-types";
import { EmailVerificationPanel } from "../_components/email-verification-panel";

export default async function VerifyEmailPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <EmailVerificationPanel locale={locale} />;
}
