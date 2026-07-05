import type { Locale } from "@markos/shared-types";
import { AuthPortal } from "../_components/public-entry";

export default async function LoginPage({ params }: { params: Promise<{ locale: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";

  return <AuthPortal locale={locale} mode="login" />;
}
