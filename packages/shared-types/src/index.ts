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
