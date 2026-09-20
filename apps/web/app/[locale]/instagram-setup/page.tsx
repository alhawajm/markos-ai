import type { Locale } from "@markos/shared-types";
import { InstagramSetup } from "../_components/instagram-setup";

export default async function InstagramSetupPage({ params }: { params: Promise<{ locale: string }> }) {
  const { locale: value } = await params;
  const locale: Locale = value === "en" ? "en" : "ar";
  return <InstagramSetup locale={locale} />;
}
