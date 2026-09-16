import type { ContentRecord } from "./index";

export type ConversationRunStatus = "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "CONFLICT" | "AWAITING_CONFIRMATION" | "DISPATCHING";
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
  confirmation?: { token: string; revision: number; consequences: string[] } | null;
  actions?: AssistantActionState | null;
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

export interface MarkosAuthoringSnapshot {
  id: string;
  contentType: ContentRecord["contentType"];
  revision: number;
  editable: boolean;
  caption: string;
  contentPillar: string | null;
  campaignGoal: string | null;
  tone: string | null;
  brief: string | null;
  mediaItems: Array<{
    id: string;
    position: number;
    mediaKind: "IMAGE" | "VIDEO" | null;
    purpose: string | null;
    title: string | null;
    body: string | null;
    visualDirection: string | null;
    aspectRatio: "SQUARE" | "PORTRAIT" | "VERTICAL" | null;
    generationDurationSeconds: number | null;
    media: { mimeType: string; width: number | null; height: number | null; durationSeconds: number | null } | null;
  }>;
  reelScript: { id: string; hook: string | null; intendedDurationSeconds: number | null; beats: Array<{ id: string; position: number; text: string }> } | null;
}
export interface AssistantActionState {
  editsSaved: boolean;
  revision: number;
  bindings: Record<string, string>;
  confirmation: { token: string; revision: number; consequences: string[] } | null;
  generation: Array<{
    itemId: string;
    status: "PENDING" | "DISPATCHING" | "QUEUED" | "RUNNING" | "ATTACHED" | "LIBRARY_ONLY" | "FAILED" | "UNKNOWN";
    jobId?: string;
    mediaAssetId?: string;
    errorCode?: string;
  }>;
}
