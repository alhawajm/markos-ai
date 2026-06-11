import type {
  ApiEnvelope,
  AuthSession,
  ContentRecord,
  ContentStatus,
  ContentType,
  HealthResponse,
  InstagramConnection,
  InstagramOAuthStart,
  InstagramTokenRefreshResult,
  KnowledgeVaultEntry,
  MediaAssetRecord,
  MediaType,
  OnboardingState,
  PublishAttemptRecord,
  PublishDueContentResult,
  PublishReadiness,
  StrategyRecord,
  VaultCompletenessScore,
  VaultRagChunk,
  VaultSection
} from "@markos/shared-types";

export interface MarkosApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  workspaceId?: string;
}

export class MarkosApiClient {
  private readonly baseUrl: string;
  private readonly accessToken: string | undefined;
  private readonly workspaceId: string | undefined;

  constructor(options: MarkosApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken;
    this.workspaceId = options.workspaceId;
  }

  async health(): Promise<HealthResponse> {
    const response = await this.request<HealthResponse>("/v1/health");
    return response.data;
  }

  async register(input: {
    email: string;
    password: string;
    fullName: string;
    workspaceName?: string;
    locale?: "ar" | "en";
  }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/register", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async login(input: { email: string; password: string }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/login", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async onboarding(): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>("/v1/onboarding");
    return response.data;
  }

  async saveOnboardingModule(module: string, body: Record<string, unknown>): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>(`/v1/onboarding/${module}`, {
      body,
      method: "PUT"
    });
    return response.data;
  }

  async completeOnboarding(): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>("/v1/onboarding/complete", {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  async vault(): Promise<Record<VaultSection, KnowledgeVaultEntry[]>> {
    const response = await this.request<Record<VaultSection, KnowledgeVaultEntry[]>>("/v1/vault");
    return response.data;
  }

  async vaultScore(): Promise<VaultCompletenessScore> {
    const response = await this.request<VaultCompletenessScore>("/v1/vault/score");
    return response.data;
  }

  async saveVaultSection(
    section: VaultSection,
    input: { entries: Array<{ key: string; value: Record<string, unknown> }> }
  ): Promise<KnowledgeVaultEntry[]> {
    const response = await this.request<KnowledgeVaultEntry[]>(`/v1/vault/${section}`, {
      body: input,
      method: "PUT"
    });
    return response.data;
  }

  async searchVault(input: { query: string; section?: VaultSection; topK?: number }): Promise<VaultRagChunk[]> {
    const response = await this.request<VaultRagChunk[]>("/v1/vault/rag/search", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async strategies(): Promise<StrategyRecord[]> {
    const response = await this.request<StrategyRecord[]>("/v1/strategy");
    return response.data;
  }

  async generateStrategy(input: { objective?: string; horizonDays?: number }): Promise<StrategyRecord> {
    const response = await this.request<StrategyRecord>("/v1/strategy/generate", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async contentItems(): Promise<ContentRecord[]> {
    const response = await this.request<ContentRecord[]>("/v1/content");
    return response.data;
  }

  async mediaAssets(): Promise<MediaAssetRecord[]> {
    const response = await this.request<MediaAssetRecord[]>("/v1/media");
    return response.data;
  }

  async registerPublicMedia(input: {
    type?: MediaType;
    filename: string;
    publicUrl: string;
    mimeType: string;
    sizeBytes: number;
    width?: number;
    height?: number;
    durationSeconds?: number;
  }): Promise<MediaAssetRecord> {
    const response = await this.request<MediaAssetRecord>("/v1/media/public-url", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async uploadMedia(input: {
    type?: MediaType;
    filename: string;
    mimeType: string;
    base64Data: string;
    width?: number;
    height?: number;
    durationSeconds?: number;
  }): Promise<MediaAssetRecord> {
    const response = await this.request<MediaAssetRecord>("/v1/media/upload", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async generateContent(input: {
    topic: string;
    contentType?: ContentType;
    count?: number;
    strategyId?: string;
  }): Promise<ContentRecord[]> {
    const response = await this.request<ContentRecord[]>("/v1/content/generate", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async updateContent(
    contentItemId: string,
    input: {
      captionEn?: string | null;
      captionAr?: string | null;
      hashtags?: string[];
      callToAction?: string | null;
      contentPillar?: string | null;
      carousel?: Record<string, unknown> | null;
      reelScript?: Record<string, unknown> | null;
    }
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(`/v1/content/${contentItemId}`, {
      body: input,
      method: "PATCH"
    });
    return response.data;
  }

  async updateContentStatus(contentItemId: string, status: Extract<ContentStatus, "DRAFT" | "IN_REVIEW" | "APPROVED">): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(`/v1/content/${contentItemId}/status`, {
      body: {
        status
      },
      method: "POST"
    });
    return response.data;
  }

  async scheduleContent(contentItemId: string, scheduledAt: string): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(`/v1/content/${contentItemId}/schedule`, {
      body: {
        scheduledAt
      },
      method: "POST"
    });
    return response.data;
  }

  async unscheduleContent(contentItemId: string): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(`/v1/content/${contentItemId}/unschedule`, {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  async attachMediaToContent(contentItemId: string, mediaAssetId: string): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(`/v1/content/${contentItemId}/media`, {
      body: {
        mediaAssetId
      },
      method: "POST"
    });
    return response.data;
  }

  async detachMediaFromContent(contentItemId: string, mediaAssetId: string): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(`/v1/content/${contentItemId}/media/${mediaAssetId}`, {
      method: "DELETE"
    });
    return response.data;
  }

  async instagramConnection(): Promise<InstagramConnection> {
    const response = await this.request<InstagramConnection>("/v1/workspace/instagram");
    return response.data;
  }

  async instagramOAuthStart(input: { locale?: "ar" | "en" } = {}): Promise<InstagramOAuthStart> {
    const response = await this.request<InstagramOAuthStart>("/v1/workspace/instagram/oauth/start", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async connectInstagram(input: { accountId: string; accessToken: string; tokenExpiresAt: string }): Promise<InstagramConnection> {
    const response = await this.request<InstagramConnection>("/v1/workspace/instagram", {
      body: input,
      method: "PUT"
    });
    return response.data;
  }

  async disconnectInstagram(): Promise<InstagramConnection> {
    const response = await this.request<InstagramConnection>("/v1/workspace/instagram", {
      method: "DELETE"
    });
    return response.data;
  }

  async refreshInstagramToken(): Promise<InstagramTokenRefreshResult> {
    const response = await this.request<InstagramTokenRefreshResult>("/v1/workspace/instagram/refresh", {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  async publishReadiness(contentItemId: string): Promise<PublishReadiness> {
    const response = await this.request<PublishReadiness>(`/v1/workspace/publish-readiness/${contentItemId}`);
    return response.data;
  }

  async publishContentDryRun(contentItemId: string): Promise<PublishAttemptRecord> {
    const response = await this.request<PublishAttemptRecord>(`/v1/publishing/content/${contentItemId}/dry-run`, {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  async runDuePublishing(): Promise<PublishDueContentResult> {
    const response = await this.request<PublishDueContentResult>("/v1/publishing/run-due", {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  private async request<TData>(
    path: string,
    options: { body?: Record<string, unknown>; method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT" } = {}
  ): Promise<ApiEnvelope<TData>> {
    const headers: Record<string, string> = {
      Accept: "application/json"
    };

    if (options.body !== undefined) {
      headers["Content-Type"] = "application/json";
    }

    if (this.accessToken !== undefined) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    if (this.workspaceId !== undefined) {
      headers["X-Workspace-Id"] = this.workspaceId;
    }

    const init: RequestInit = {
      headers,
      method: options.method ?? "GET"
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, init);

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as { error?: { message?: string } } | undefined;
      throw new Error(body?.error?.message ?? `MARKOS API request failed: ${response.status}`);
    }

    return (await response.json()) as ApiEnvelope<TData>;
  }
}
