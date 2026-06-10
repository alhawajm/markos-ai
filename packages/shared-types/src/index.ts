export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const planCodes = ["STARTER", "GROWTH", "PREMIUM", "ENTERPRISE"] as const;
export type PlanCode = (typeof planCodes)[number];

export const roles = [
  "OWNER",
  "EDITOR",
  "VIEWER",
  "WORKSPACE_ADMIN",
  "SUPER_ADMIN",
  "PRODUCT_ADMIN",
  "SUPPORT_ADMIN",
  "FINANCE_ADMIN",
  "READONLY_ADMIN"
] as const;
export type Role = (typeof roles)[number];

export const vaultSections = [
  "COMPANY",
  "STORY",
  "PRODUCTS",
  "AUDIENCE",
  "COMPETITORS",
  "BRAND",
  "TONE",
  "OBJECTIVES"
] as const;
export type VaultSection = (typeof vaultSections)[number];

export const contentTypes = ["POST", "CAROUSEL", "STORY", "REEL"] as const;
export type ContentType = (typeof contentTypes)[number];

export const contentStatuses = [
  "DRAFT",
  "IN_REVIEW",
  "APPROVED",
  "SCHEDULED",
  "PUBLISHED",
  "FAILED"
] as const;
export type ContentStatus = (typeof contentStatuses)[number];

export interface ApiEnvelope<TData> {
  data: TData;
  meta?: Record<string, unknown>;
}

export interface ApiErrorEnvelope {
  error: {
    code: string;
    message: string;
    details?: unknown[];
  };
}

export interface HealthResponse {
  service: "web" | "api" | "ai";
  status: "ok" | "degraded";
  timestamp: string;
}

export interface AuthTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface AuthSession {
  user: {
    id: string;
    email: string;
    fullName: string;
    locale: Locale;
    isVerified: boolean;
  };
  workspace: {
    id: string;
    name: string;
    slug: string;
  };
  roles: Role[];
  tokens: AuthTokens;
}

export interface KnowledgeVaultEntry {
  id: string;
  workspaceId: string;
  section: VaultSection;
  key: string;
  value: Record<string, unknown>;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface VaultCompletenessScore {
  score: number;
  completedSections: VaultSection[];
  missingSections: VaultSection[];
  requiredSections: VaultSection[];
  entryCount: number;
}

export interface VaultRagChunk {
  id: string;
  section: VaultSection;
  key: string;
  value: Record<string, unknown>;
  version: number;
  score: number;
}

export interface OnboardingModuleState {
  module: string;
  completed: boolean;
  sections: VaultSection[];
}

export interface OnboardingState {
  status: "NOT_STARTED" | "IN_PROGRESS" | "COMPLETE";
  onboardingScore: number;
  vaultScore: VaultCompletenessScore;
  modules: OnboardingModuleState[];
}

export interface StrategyPillar {
  name: string;
  rationale: string;
  contentAngles: string[];
}

export interface StrategyPlan {
  summary: string;
  horizonDays: number;
  objectives: string[];
  pillars: StrategyPillar[];
  weeklyCadence: Array<{
    week: number;
    focus: string;
    actions: string[];
  }>;
  kpis: Array<{
    name: string;
    target: string;
  }>;
  risks: string[];
  nextActions: string[];
  retrievedContext: VaultRagChunk[];
}

export interface StrategyRecord {
  id: string;
  workspaceId: string;
  title: string;
  horizonDays: number;
  content: StrategyPlan;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContentDraft {
  contentType: ContentType;
  captionEn?: string;
  captionAr?: string;
  hashtags: string[];
  callToAction?: string;
  contentPillar?: string;
  carousel?: Record<string, unknown>;
  reelScript?: Record<string, unknown>;
}

export interface ContentRecord {
  id: string;
  workspaceId: string;
  contentType: ContentType;
  status: ContentStatus;
  captionEn?: string;
  captionAr?: string;
  hashtags: string[];
  callToAction?: string;
  mediaIds: string[];
  carousel?: Record<string, unknown>;
  reelScript?: Record<string, unknown>;
  contentPillar?: string;
  campaignId?: string;
  aiPromptUsed?: string;
  scheduledAt?: string;
  publishedAt?: string;
  instagramPostId?: string;
  failureReason?: string;
  createdAt: string;
  updatedAt: string;
}

export interface InstagramConnection {
  connected: boolean;
  accountId?: string;
  tokenExpiresAt?: string;
}

export interface PublishReadiness {
  ready: boolean;
  reasons: string[];
  connection: InstagramConnection;
  contentItem?: ContentRecord;
}
