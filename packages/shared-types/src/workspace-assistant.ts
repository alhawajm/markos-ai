export interface WorkspaceAssistantProposal {
  action: "CONTENT" | "EDIT_CONTENT" | "CAMPAIGN" | "STRATEGY";
  summary: string;
  instruction: string;
  contentType: "POST" | "CAROUSEL" | "REEL" | "STORY" | null;
  contentItemId: string | null;
  durationDays: 3 | 7 | 14 | null;
  startsAt?: string | null;
  publishesPerDay?: 1 | 2 | 3 | null;
}
export interface WorkspaceAssistantTurn {
  id: string;
  message: string;
  reply: string;
  status: "THINKING" | "DISCUSSION" | "PROPOSED" | "EXECUTING" | "COMPLETED" | "FAILED";
  proposal: WorkspaceAssistantProposal | null;
  confirmationToken?: string;
  contentItemId?: string;
  campaignRequestId?: string;
  strategy?: Record<string, unknown>;
  errorCode?: string;
  createdAt: string;
}
