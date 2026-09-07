import type { ContentRecord, ContentType } from "@markos/shared-types";

const BAHRAIN_TIME_ZONE = "Asia/Bahrain";
const BAHRAIN_UTC_OFFSET = "+03:00";

export interface ContentDraftFields {
  brief: string;
  campaignGoal: string;
  caption: string;
  contentPillar: string;
  contentType: ContentType;
  plannedAtInput: string;
  tone: string;
  visualDirection: string;
}

export interface ContentDraftPayload {
  brief: string | null;
  campaignGoal: string | null;
  caption: string;
  contentType: ContentType;
  contentPillar: string | null;
  plannedAt: string | null;
  tone: string | null;
  visualDirection: string | null;
}

export function emptyContentDraftFields(contentType: ContentType = "POST"): ContentDraftFields {
  return {
    brief: "",
    campaignGoal: "",
    caption: "",
    contentPillar: "",
    contentType,
    plannedAtInput: "",
    visualDirection: "",
    tone: ""
  };
}

export function contentDraftFieldsFromRecord(record: ContentRecord): ContentDraftFields {
  return {
    brief: record.brief ?? "",
    campaignGoal: record.campaignGoal ?? "",
    caption: record.caption ?? "",
    contentPillar: record.contentPillar ?? "",
    contentType: record.contentType,
    plannedAtInput: record.plannedAt ? bahrainInputValue(record.plannedAt) : "",
    visualDirection: record.visualDirection ?? "",
    tone: record.tone ?? ""
  };
}

export function contentDraftHasMeaningfulWork(fields: ContentDraftFields): boolean {
  const normalized = normalizeContentDraft(fields);
  return (
    normalized.contentType !== "POST" ||
    normalized.brief.length > 0 ||
    normalized.campaignGoal.length > 0 ||
    normalized.caption.trim().length > 0 ||
    normalized.contentPillar.length > 0 ||
    normalized.plannedAtInput.length > 0 ||
    normalized.visualDirection.length > 0 ||
    normalized.tone.length > 0
  );
}

export function contentDraftIsDirty(fields: ContentDraftFields, baseline: ContentDraftFields): boolean {
  return JSON.stringify(normalizeContentDraft(fields)) !== JSON.stringify(normalizeContentDraft(baseline));
}

export function contentDraftPayload(fields: ContentDraftFields): ContentDraftPayload {
  return {
    brief: fields.brief.trim() || null,
    campaignGoal: fields.campaignGoal.trim() || null,
    caption: fields.caption,
    contentType: fields.contentType,
    contentPillar: fields.contentPillar.trim() || null,
    plannedAt: plannedAtInputToIso(fields.plannedAtInput),
    visualDirection: fields.visualDirection.trim() || null,
    tone: fields.tone.trim() || null
  };
}

export function plannedAtInputToIso(value: string): string | null {
  if (!value) return null;
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(value)) {
    throw new Error("Choose a valid planned date and time.");
  }

  const date = new Date(`${value}:00${BAHRAIN_UTC_OFFSET}`);
  if (!Number.isFinite(date.getTime()) || bahrainInputValue(date.toISOString()) !== value) {
    throw new Error("Choose a valid planned date and time.");
  }

  return date.toISOString();
}

export function bahrainInputValue(value: string): string {
  const date = new Date(value);
  const parts = new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    hour: "2-digit",
    hourCycle: "h23",
    minute: "2-digit",
    month: "2-digit",
    timeZone: BAHRAIN_TIME_ZONE,
    year: "numeric"
  }).formatToParts(date);
  const part = (type: Intl.DateTimeFormatPartTypes) => parts.find((item) => item.type === type)?.value ?? "";
  return `${part("year")}-${part("month")}-${part("day")}T${part("hour")}:${part("minute")}`;
}

function normalizeContentDraft(fields: ContentDraftFields) {
  return {
    brief: fields.brief.trim(),
    campaignGoal: fields.campaignGoal.trim(),
    caption: fields.caption,
    contentType: fields.contentType,
    contentPillar: fields.contentPillar.trim(),
    plannedAtInput: fields.plannedAtInput,
    visualDirection: fields.visualDirection.trim(),
    tone: fields.tone.trim()
  };
}
