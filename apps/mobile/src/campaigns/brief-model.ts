import { campaignReferenceLimits, type CampaignReferenceFileInput } from "@markos/shared-types";
export type Reference = { id: string; filename: string; mimeType: CampaignReferenceFileInput["mimeType"]; sizeBytes: number; uri: string };
export type Brief = {
  objective: string;
  description: string;
  files: Reference[];
  durationDays: 3 | 7 | 14;
  publishesPerDay: number;
  startDate: string;
  pendingSince?: string;
  requestId?: string;
  requestLocale?: "en" | "ar";
};
export const mimeByExtension: Record<string, Reference["mimeType"]> = {
  pdf: "application/pdf",
  docx: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  txt: "text/plain",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  png: "image/png",
  webp: "image/webp"
};
export function localDate(date = new Date()): string {
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
}
export function bahrainDate(date = new Date()): string {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Bahrain",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    numberingSystem: "latn"
  }).formatToParts(date);
  const value = (type: string) => parts.find((part) => part.type === type)!.value;
  return `${value("year")}-${value("month")}-${value("day")}`;
}
export function newBrief(): Brief {
  return { objective: "", description: "", files: [], durationDays: 14, publishesPerDay: 1, startDate: bahrainDate() };
}
export function validateReferences(files: Pick<Reference, "filename" | "mimeType" | "sizeBytes">[]): "count" | "type" | "size" | "total" | null {
  if (files.length > campaignReferenceLimits.files) return "count";
  if (files.some((file) => !Object.values(mimeByExtension).includes(file.mimeType))) return "type";
  if (files.some((file) => !Number.isFinite(file.sizeBytes) || file.sizeBytes <= 0 || file.sizeBytes > campaignReferenceLimits.fileBytes)) return "size";
  if (files.reduce((sum, file) => sum + file.sizeBytes, 0) > campaignReferenceLimits.totalBytes) return "total";
  return null;
}
export function validDate(value: string): boolean {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const date = new Date(`${value}T12:00:00`);
  return Number.isFinite(date.getTime()) && localDate(date) === value;
}
// Campaign days belong to the workspace's Bahrain calendar, irrespective of the phone's time zone.
export function campaignStart(value: string): string {
  if (!validDate(value)) throw new Error("Invalid start date");
  return new Date(`${value}T00:00:00+03:00`).toISOString();
}
export function ownedReferenceUri(directoryUri: string, uri: string): boolean {
  const root = directoryUri.replace(/\/$/, "") + "/";
  if (!uri.startsWith(root)) return false;
  const filename = uri.slice(root.length);
  return /^[a-zA-Z0-9-]+\.(pdf|docx|txt|jpe?g|png|webp)$/.test(filename);
}
