import type { ContentRecord, ContentType } from "@markos/shared-types";

const BAHRAIN_TIME_ZONE = "Asia/Bahrain";
const BAHRAIN_UTC_OFFSET = "+03:00";

export interface ContentDraftFields {
  callToAction: string;
  captionAr: string;
  captionEn: string;
  contentType: ContentType;
  hashtagsText: string;
  plannedAtInput: string;
}

export interface ContentDraftPayload {
  callToAction: string | null;
  captionAr: string | null;
  captionEn: string | null;
  contentType: ContentType;
  hashtags: string[];
  plannedAt: string | null;
}

export function emptyContentDraftFields(contentType: ContentType = "POST"): ContentDraftFields {
  return {
    callToAction: "",
    captionAr: "",
    captionEn: "",
    contentType,
    hashtagsText: "",
    plannedAtInput: ""
  };
}

export function contentDraftFieldsFromRecord(record: ContentRecord): ContentDraftFields {
  return {
    callToAction: record.callToAction ?? "",
    captionAr: record.captionAr ?? "",
    captionEn: record.captionEn ?? "",
    contentType: record.contentType,
    hashtagsText: record.hashtags.join(" "),
    plannedAtInput: record.plannedAt ? bahrainInputValue(record.plannedAt) : ""
  };
}

export function contentDraftHasMeaningfulWork(fields: ContentDraftFields): boolean {
  const normalized = normalizeContentDraft(fields);
  return (
    normalized.contentType !== "POST" ||
    normalized.captionEn.length > 0 ||
    normalized.captionAr.length > 0 ||
    normalized.hashtags.length > 0 ||
    normalized.callToAction.length > 0 ||
    normalized.plannedAtInput.length > 0
  );
}

export function contentDraftIsDirty(fields: ContentDraftFields, baseline: ContentDraftFields): boolean {
  return JSON.stringify(normalizeContentDraft(fields)) !== JSON.stringify(normalizeContentDraft(baseline));
}

export function contentDraftPayload(fields: ContentDraftFields): ContentDraftPayload {
  return {
    callToAction: fields.callToAction.trim() || null,
    captionAr: fields.captionAr.trim() || null,
    captionEn: fields.captionEn.trim() || null,
    contentType: fields.contentType,
    hashtags: parseDraftHashtags(fields.hashtagsText),
    plannedAt: plannedAtInputToIso(fields.plannedAtInput)
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
    callToAction: fields.callToAction.trim(),
    captionAr: fields.captionAr.trim(),
    captionEn: fields.captionEn.trim(),
    contentType: fields.contentType,
    hashtags: parseDraftHashtags(fields.hashtagsText),
    plannedAtInput: fields.plannedAtInput
  };
}
