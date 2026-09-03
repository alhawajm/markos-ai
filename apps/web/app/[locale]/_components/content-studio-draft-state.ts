import type { ContentRecord, ContentType } from "@markos/shared-types";

const BAHRAIN_TIME_ZONE = "Asia/Bahrain";
const BAHRAIN_UTC_OFFSET = "+03:00";

export interface ContentDraftFields {
  brief: string;
  callToAction: string;
  campaignGoal: string;
  captionAr: string;
  captionEn: string;
  contentPillar: string;
  contentType: ContentType;
  hashtagsText: string;
  plannedAtInput: string;
  tone: string;
}

export interface ContentDraftPayload {
  brief: string | null;
  callToAction: string | null;
  campaignGoal: string | null;
  captionAr: string | null;
  captionEn: string | null;
  contentType: ContentType;
  contentPillar: string | null;
  hashtags: string[];
  plannedAt: string | null;
  tone: string | null;
}

export function emptyContentDraftFields(contentType: ContentType = "POST"): ContentDraftFields {
  return {
    brief: "",
    callToAction: "",
    campaignGoal: "",
    captionAr: "",
    captionEn: "",
    contentPillar: "",
    contentType,
    hashtagsText: "",
    plannedAtInput: "",
    tone: ""
  };
}

export function contentDraftFieldsFromRecord(record: ContentRecord): ContentDraftFields {
  return {
    brief: record.brief ?? "",
    callToAction: record.callToAction ?? "",
    campaignGoal: record.campaignGoal ?? "",
    captionAr: record.captionAr ?? "",
    captionEn: record.captionEn ?? "",
    contentPillar: record.contentPillar ?? "",
    contentType: record.contentType,
    hashtagsText: record.hashtags.join(" "),
    plannedAtInput: record.plannedAt ? bahrainInputValue(record.plannedAt) : "",
    tone: record.tone ?? ""
  };
}

export function contentDraftHasMeaningfulWork(fields: ContentDraftFields): boolean {
  const normalized = normalizeContentDraft(fields);
  return (
    normalized.contentType !== "POST" ||
    normalized.brief.length > 0 ||
    normalized.campaignGoal.length > 0 ||
    normalized.captionEn.length > 0 ||
    normalized.captionAr.length > 0 ||
    normalized.contentPillar.length > 0 ||
    normalized.hashtags.length > 0 ||
    normalized.callToAction.length > 0 ||
    normalized.plannedAtInput.length > 0 ||
    normalized.tone.length > 0
  );
}

export function contentDraftIsDirty(fields: ContentDraftFields, baseline: ContentDraftFields): boolean {
  return JSON.stringify(normalizeContentDraft(fields)) !== JSON.stringify(normalizeContentDraft(baseline));
}

export function contentDraftPayload(fields: ContentDraftFields): ContentDraftPayload {
  return {
    brief: fields.brief.trim() || null,
    callToAction: fields.callToAction.trim() || null,
    campaignGoal: fields.campaignGoal.trim() || null,
    captionAr: fields.captionAr.trim() || null,
    captionEn: fields.captionEn.trim() || null,
    contentType: fields.contentType,
    contentPillar: fields.contentPillar.trim() || null,
    hashtags: parseDraftHashtags(fields.hashtagsText),
    plannedAt: plannedAtInputToIso(fields.plannedAtInput),
    tone: fields.tone.trim() || null
  };
}

export function parseDraftHashtags(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 30);
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
    callToAction: fields.callToAction.trim(),
    campaignGoal: fields.campaignGoal.trim(),
    captionAr: fields.captionAr.trim(),
    captionEn: fields.captionEn.trim(),
    contentType: fields.contentType,
    contentPillar: fields.contentPillar.trim(),
    hashtags: parseDraftHashtags(fields.hashtagsText),
    plannedAtInput: fields.plannedAtInput,
    tone: fields.tone.trim()
  };
}
