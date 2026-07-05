import { redirect } from "next/navigation";

const sections = ["briefing", "opportunities", "campaign-builder", "content-studio", "analytics", "knowledge", "settings"] as const;
const legacySections = ["vault", "strategy", "content", "schedule", "audience", "channels", "ai", "admin"] as const;
type RouteSection = (typeof sections)[number] | (typeof legacySections)[number];
type CanonicalSection = (typeof sections)[number] | "dashboard";

const legacySectionMap: Record<(typeof legacySections)[number], CanonicalSection> = {
  admin: "settings",
  ai: "dashboard",
  audience: "opportunities",
  channels: "settings",
  content: "content-studio",
  schedule: "campaign-builder",
  strategy: "briefing",
  vault: "knowledge"
};

export function generateStaticParams() {
  return ["ar", "en"].flatMap((locale) => [...sections, ...legacySections].map((section) => ({ locale, section })));
}

export default async function SectionPage({ params }: { params: Promise<{ locale: string; section: string }> }) {
  const resolvedParams = await params;
  const locale = resolvedParams.locale === "en" ? "en" : "ar";
  const routeSection = resolvedParams.section as RouteSection;
  const section = sections.includes(routeSection as (typeof sections)[number])
    ? routeSection
    : legacySections.includes(routeSection as (typeof legacySections)[number])
      ? legacySectionMap[routeSection as (typeof legacySections)[number]]
      : "dashboard";

  redirect(section === "dashboard" ? `/${locale}/app` : `/${locale}/app/${section}`);
}
