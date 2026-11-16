import type { Locale, WorkspaceAssistantArtifact } from "@markos/shared-types";
import { ArrowUpRight } from "lucide-react";
export function AssistantArtifactCard({ artifact, locale }: { artifact: WorkspaceAssistantArtifact; locale: Locale }) {
  const ar = locale === "ar",
    campaign = artifact.kind === "CAMPAIGN",
    content = artifact.kind === "CONTENT";
  const label = campaign ? (ar ? "حملة" : "Campaign") : content ? (ar ? "مسودة محتوى" : "Content draft") : ar ? "استراتيجية" : "Strategy";
  const href = campaign
    ? `/${locale}/app/campaigns?campaign=${artifact.id}`
    : content
      ? `/${locale}/app/content-studio?item=${artifact.id}`
      : `/${locale}/app/strategy?plan=${artifact.id}`;
  return (
    <a className="workspace-artifact-card" dir={ar ? "rtl" : "ltr"} href={href} aria-label={`${ar ? "فتح" : "Open"} ${artifact.title || label}`}>
      <small>
        {label}
        {artifact.contentType ? ` · ${artifact.contentType}` : ""}
      </small>
      <h3 dir="auto">{artifact.title || label}</h3>
      {artifact.summary ? <p dir="auto">{artifact.summary}</p> : null}
      {campaign ? (
        <div className="workspace-artifact-stats">
          {artifact.postCount !== undefined ? (
            <span>
              <strong>{artifact.postCount.toLocaleString(locale)}</strong>
              {ar ? "منشورًا مخططًا" : "planned posts"}
            </span>
          ) : null}
          {artifact.durationDays ? (
            <span>
              <strong>{artifact.durationDays.toLocaleString(locale)}</strong>
              {ar ? "أيام" : "days"}
            </span>
          ) : null}
          {artifact.publishesPerDay ? (
            <span>
              <strong>{artifact.publishesPerDay.toLocaleString(locale)}</strong>
              {ar ? "يوميًا" : "per day"}
            </span>
          ) : null}
        </div>
      ) : null}
      {artifact.startsAt ? (
        <small>
          {new Date(artifact.startsAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Bahrain" })}
          {artifact.endsAt ? ` – ${new Date(artifact.endsAt).toLocaleDateString(locale, { dateStyle: "medium", timeZone: "Asia/Bahrain" })}` : ""}
        </small>
      ) : null}
      <span className="workspace-artifact-open">
        {campaign ? (ar ? "فتح الحملة" : "Open campaign") : content ? (ar ? "فتح المسودة" : "Open draft") : ar ? "فتح الاستراتيجية" : "Open strategy"}
        <ArrowUpRight size={18} />
      </span>
    </a>
  );
}
