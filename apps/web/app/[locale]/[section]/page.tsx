import type { Locale } from "@markos/shared-types";
import { AppShell, type SectionSlug } from "../_components/app-shell";

const sections = ["vault", "strategy", "content", "schedule", "analytics", "ai", "settings"] as const;
type RouteSection = (typeof sections)[number];

export function generateStaticParams() {
  return ["ar", "en"].flatMap((locale) => sections.map((section) => ({ locale, section })));
}

export default function SectionPage({ params }: { params: { locale: Locale; section: string } }) {
  const locale = params.locale === "en" ? "en" : "ar";
  const section: SectionSlug = sections.includes(params.section as RouteSection)
    ? (params.section as RouteSection)
    : "dashboard";

  return <AppShell activeSection={section} locale={locale} />;
}
