export const instagramLearningFields = ["toneWords", "voiceNotes", "aestheticWords", "contentDirection"] as const;
export type InstagramLearningField = (typeof instagramLearningFields)[number];
export interface InstagramLearningPost {
  id: string;
  caption: string;
  mediaType: string;
  timestamp: string;
  permalink?: string;
  metrics: Record<string, number>;
  selection: "LATEST" | "STRONGEST";
}
export interface InstagramLearningEvidence {
  accountId: string;
  username: string;
  profile: Record<string, string | number>;
  discovered: number;
  historyComplete: boolean;
  metricsCovered: number;
  warnings: string[];
  posts: InstagramLearningPost[];
}
export interface InstagramLearningSuggestion {
  field: InstagramLearningField;
  value: string | string[];
  reasoning: string;
  sourcePostIds: string[];
}
export interface InstagramLearningResult {
  summary: string;
  limitations: string[];
  suggestions: InstagramLearningSuggestion[];
}
export interface InstagramLearningRecord {
  id: string;
  status: "PENDING" | "COLLECTING" | "ANALYZING" | "READY" | "APPROVED" | "SKIPPED" | "FAILED";
  expectedVersion: number;
  current: Record<InstagramLearningField, string | string[]>;
  evidence?: InstagramLearningEvidence;
  result?: InstagramLearningResult;
  error?: string;
}
