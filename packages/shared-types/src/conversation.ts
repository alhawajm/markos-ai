import type { ContentRecord } from "./index";

export type ConversationRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CONFLICT";
export interface ConversationMessageRecord {
  id: string;
  runId: string;
  role: "user" | "assistant";
  text: string;
  createdAt: string;
}
export interface ConversationRunRecord {
  id: string;
  requestId: string;
  status: ConversationRunStatus;
  errorCode: string | null;
  proposedCaption: string | null;
}
export interface ContentConversationRecord {
  id: string | null;
  contentItem: ContentRecord;
  messages: ConversationMessageRecord[];
  latestRun: ConversationRunRecord | null;
}
export interface ConversationTurnInput {
  requestId: string;
  expectedRevision: number;
  message: string;
  locale: "en" | "ar";
}
