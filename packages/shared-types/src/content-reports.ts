import type { Role } from "./index";

export const contentReportSources = ["CONTENT", "ASSISTANT_MESSAGE", "CAMPAIGN", "GENERAL_AI"] as const;
export type ContentReportSource = (typeof contentReportSources)[number];
export const contentReportReasons = ["OFFENSIVE", "HARMFUL", "COPYRIGHT", "INACCURATE", "OTHER"] as const;
export type ContentReportReason = (typeof contentReportReasons)[number];
export const contentReportStatuses = ["OPEN", "RESOLVED", "DISMISSED"] as const;
export type ContentReportStatus = (typeof contentReportStatuses)[number];

export interface ContentReportInput {
  requestId: string;
  source: ContentReportSource;
  sourceId?: string | null;
  reason: ContentReportReason;
  note: string;
}
export interface ContentReportReceipt {
  id: string;
  status: ContentReportStatus;
  createdAt: string;
}
export interface ContentReportRecord extends ContentReportReceipt {
  workspaceId: string;
  source: ContentReportSource;
  sourceId: string | null;
  reason: ContentReportReason;
  note: string;
  excerpt: string;
  mediaAssetIds: string[];
  resolutionNote: string;
  reviewedAt: string | null;
}
export interface ContentReportReviewInput {
  status: "RESOLVED" | "DISMISSED";
  note: string;
}
export interface ContentReportMedia {
  id: string;
  filename: string;
  url: string;
}
export const canReadContentReports = (roles: readonly Role[]) => roles.some((r) => ["SUPER_ADMIN", "PRODUCT_ADMIN", "SUPPORT_ADMIN"].includes(r));
export const canReviewContentReports = (roles: readonly Role[]) => roles.some((r) => ["SUPER_ADMIN", "PRODUCT_ADMIN"].includes(r));
