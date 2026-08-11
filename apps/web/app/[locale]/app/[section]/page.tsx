import type { Locale } from "@markos/shared-types";
import { AppShell, type SectionSlug } from "../../_components/app-shell";

const sections = ["briefing", "strategy", "opportunities", "campaign-builder", "content-studio", "analytics", "knowledge", "settings"] as const;
type RouteSection = (typeof sections)[number];

export function generateStaticParams() {
  return ["ar", "en"].flatMap((locale) => sections.map((section) => ({ locale, section })));
}

export default async function AppSectionPage({ params }: { params: Promise<{ locale: string; section: string }> }) {
  const resolvedParams = await params;
  const locale: Locale = resolvedParams.locale === "en" ? "en" : "ar";
  const routeSection = resolvedParams.section as RouteSection;
  const section: SectionSlug = sections.includes(routeSection) ? routeSection : "dashboard";

  return <AppShell activeSection={section} locale={locale} />;
}
