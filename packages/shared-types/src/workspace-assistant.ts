export interface WorkspaceAssistantProposal {
  action: "CONTENT" | "EDIT_CONTENT" | "CAMPAIGN" | "STRATEGY";
  summary: string;
  instruction: string;
  contentType: "POST" | "CAROUSEL" | "REEL" | "STORY" | null;
  contentItemId: string | null;
  durationDays: 3 | 7 | 14 | 30 | 60 | 90 | null;
  startsAt?: string | null;
  publishesPerDay?: 1 | 2 | 3 | null;
}
export interface WorkspaceAssistantTurn {
  chatId?: string;
  postDesign?: true;
  result?: WorkspaceAssistantArtifact;
  intent?: import("./task-intents").TaskIntent;
  id: string;
  message: string;
  reply: string;
  status: "THINKING" | "DISCUSSION" | "PROPOSED" | "EXECUTING" | "COMPLETED" | "FAILED";
  proposal: WorkspaceAssistantProposal | null;
  confirmationToken?: string;
  contentItemId?: string;
  campaignRequestId?: string;
  campaignId?: string;
  campaign?: CampaignGenerationJobRecord;
  strategy?: Record<string, unknown>;
  errorCode?: string;
  createdAt: string;
}
export interface WorkspaceChatRecord {
  id: string;
  title: string;
  legacy: boolean;
  createdAt: string;
  updatedAt: string;
}
export interface WorkspaceChatSelection {
  id: string;
  isNew: boolean;
  legacy?: boolean;
  title?: string;
}
export interface WorkspaceChatPage {
  items: WorkspaceChatRecord[];
  nextCursor: string | null;
}
export interface WorkspaceChatMessages {
  turns: WorkspaceAssistantTurn[];
  nextBefore: string | null;
}
export interface WorkspaceAssistantArtifact {
  kind: "CAMPAIGN" | "CONTENT" | "STRATEGY";
  id: string;
  title: string;
  summary: string;
  status?: string;
  contentType?: "POST" | "CAROUSEL" | "REEL" | "STORY";
  startsAt?: string;
  endsAt?: string;
  durationDays?: number;
  publishesPerDay?: number;
  postCount?: number;
}
import type { CampaignGenerationJobRecord } from "./index";
