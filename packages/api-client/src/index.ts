import type {
  AgentName,
  AgentRunRecord,
  AdminBahrainLaunchReadiness,
  AdminBillingOperations,
  AdminGatewayReadiness,
  AdminModelConfiguration,
  AnalyticsChatResult,
  AnalyticsDigestResult,
  AnalyticsEmailDeliveryResult,
  AnalyticsLearningResult,
  AnalyticsLiveReadiness,
  AnalyticsSummary,
  AnalyticsSyncResult,
  ApiEnvelope,
  AuditLogRecord,
  AuthSession,
  AiImageGenerationResult,
  BillingCheckoutResult,
  BillingPaymentCaptureResult,
  BillingPlanCatalogItem,
  BillingSummary,
  BillingUpgradeResult,
  BillingVatComplianceReport,
  BusinessProfile,
  ContentRecord,
  ContentStatus,
  ContentType,
  EmailVerificationChallenge,
  EmailVerificationResult,
  HealthResponse,
  InstagramConnection,
  InstagramDisconnectResult,
  InstagramOAuthStart,
  InstagramTokenRefreshResult,
  KnowledgeVaultEntry,
  KnowledgeVaultHistoryEntry,
  Locale,
  MediaAssetRecord,
  MediaType,
  MfaStatus,
  MfaTotpSetup,
  OnboardingState,
  PromptTemplateRecord,
  PromptVariantSelection,
  PublishAttemptRecord,
  PublishDueContentResult,
  PublishingLiveReadiness,
  PublishReadiness,
  StrategyRecord,
  VaultCompletenessScore,
  VaultRagChunk,
  VaultSection,
  WorkspaceDataErasureResult,
  WorkspaceDataExport
} from "@markos/shared-types";

export interface MarkosApiClientOptions {
  baseUrl: string;
  accessToken?: string;
  onSessionExpired?: () => Promise<void> | void;
  renewAccessToken?: () => Promise<string>;
  workspaceId?: string;
}

export class MarkosApiError extends Error {
  constructor(
    message: string,
    readonly status: number,
    readonly code?: string,
    readonly details?: unknown[]
  ) {
    super(message);
    this.name = "MarkosApiError";
  }
}

export class MarkosApiClient {
  private readonly baseUrl: string;
  private accessToken: string | undefined;
  private readonly onSessionExpired: (() => Promise<void> | void) | undefined;
  private readonly renewAccessToken: (() => Promise<string>) | undefined;
  private readonly workspaceId: string | undefined;

  constructor(options: MarkosApiClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.accessToken = options.accessToken;
    this.onSessionExpired = options.onSessionExpired;
    this.renewAccessToken = options.renewAccessToken;
    this.workspaceId = options.workspaceId;
  }

  async health(): Promise<HealthResponse> {
    const response = await this.request<HealthResponse>("/v1/health");
    return response.data;
  }

  async register(input: { email: string; password: string; fullName: string; workspaceName?: string; locale?: "ar" | "en" }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/register", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async login(input: { email: string; password: string; totpCode?: string }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/login", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async loginWithGoogle(input: { idToken: string; locale?: "ar" | "en"; totpCode?: string; workspaceName?: string }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/google", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async setupMfaTotp(): Promise<MfaTotpSetup> {
    const response = await this.request<MfaTotpSetup>("/v1/auth/mfa/totp/setup", {
      method: "POST"
    });
    return response.data;
  }

  async enableMfaTotp(input: { code: string }): Promise<MfaStatus> {
    const response = await this.request<MfaStatus>("/v1/auth/mfa/totp/enable", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async refreshSession(): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/refresh", {
      browserSession: true,
      method: "POST"
    });
    return response.data;
  }

  async logout(): Promise<void> {
    await this.request<{ loggedOut: true }>("/v1/auth/logout", {
      browserSession: true,
      method: "POST"
    });
  }

  async requestEmailVerification(input: { email: string }): Promise<EmailVerificationChallenge> {
    const response = await this.request<EmailVerificationChallenge>("/v1/auth/verification/request", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async verifyEmail(input: { token: string }): Promise<EmailVerificationResult> {
    const response = await this.request<EmailVerificationResult>("/v1/auth/verify-email", {
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

  async generateBusinessProfile(): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>("/v1/onboarding/profile/generate", {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  async approveBusinessProfile(input: { interactionId: string; profile: BusinessProfile }): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>("/v1/onboarding/profile/approve", {
      body: input,
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

  async saveVaultSection(section: VaultSection, input: { entries: Array<{ key: string; value: Record<string, unknown> }> }): Promise<KnowledgeVaultEntry[]> {
    const response = await this.request<KnowledgeVaultEntry[]>(`/v1/vault/${section}`, {
      body: input,
      method: "PUT"
    });
    return response.data;
  }

  async vaultEntryHistory(section: VaultSection, key: string): Promise<KnowledgeVaultHistoryEntry[]> {
    const response = await this.request<KnowledgeVaultHistoryEntry[]>(`/v1/vault/${section}/${encodeURIComponent(key)}/history`);
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

  async generateStrategy(input: { objective?: string; horizonDays?: number; locale?: Locale }): Promise<StrategyRecord> {
    const response = await this.request<StrategyRecord>("/v1/strategy/generate", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async exportStrategyPdf(strategyId: string): Promise<ArrayBuffer> {
    return this.requestBinary(`/v1/strategy/${strategyId}/pdf`, {
      accept: "application/pdf"
    });
  }

  async runAgent(input: { agent: AgentName; task: string; locale?: "ar" | "en"; inputs?: Record<string, unknown> }): Promise<AgentRunRecord> {
    const response = await this.request<AgentRunRecord>("/v1/agents/run", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async promptTemplates(input: { agent?: string } = {}): Promise<PromptTemplateRecord[]> {
    const search = new URLSearchParams();

    if (input.agent !== undefined) {
      search.set("agent", input.agent);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<PromptTemplateRecord[]>(`/v1/prompts${suffix}`);
    return response.data;
  }

  async createPromptTemplate(input: {
    active?: boolean;
    agent: string;
    body: string;
    trafficPct?: number;
    variantOf?: string;
    version: string;
  }): Promise<PromptTemplateRecord> {
    const response = await this.request<PromptTemplateRecord>("/v1/prompts", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async updatePromptTemplate(
    promptTemplateId: string,
    input: {
      active?: boolean;
      body?: string;
      trafficPct?: number;
      variantOf?: string | null;
    }
  ): Promise<PromptTemplateRecord> {
    const response = await this.request<PromptTemplateRecord>(`/v1/prompts/${promptTemplateId}`, {
      body: input,
      method: "PATCH"
    });
    return response.data;
  }

  async selectPromptVariant(input: { agent: string; seed: string }): Promise<PromptVariantSelection> {
    const response = await this.request<PromptVariantSelection>("/v1/prompts/select", {
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

  async generateContent(input: { topic: string; contentType?: ContentType; count?: number; strategyId?: string }): Promise<ContentRecord[]> {
    const response = await this.request<ContentRecord[]>("/v1/content/generate", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async generateContentForSlot(input: { topic: string; contentType?: ContentType; scheduledAt: string; strategyId?: string }): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>("/v1/content/generate-for-slot", {
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

  async generateContentImage(
    contentItemId: string,
    input: {
      aspectRatio?: "1:1" | "4:5" | "9:16";
      prompt?: string;
    } = {}
  ): Promise<AiImageGenerationResult> {
    const response = await this.request<AiImageGenerationResult>(`/v1/content/${contentItemId}/generate-image`, {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async instagramConnection(): Promise<InstagramConnection> {
    const response = await this.request<InstagramConnection>("/v1/workspace/instagram");
    return response.data;
  }

  async instagramOAuthStart(input: { locale?: "ar" | "en"; returnTo?: string } = {}): Promise<InstagramOAuthStart> {
    const response = await this.request<InstagramOAuthStart>("/v1/workspace/instagram/oauth/start", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async disconnectInstagram(): Promise<InstagramDisconnectResult> {
    const response = await this.request<InstagramDisconnectResult>("/v1/workspace/instagram", {
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

  async auditLogs(input: { limit?: number } = {}): Promise<AuditLogRecord[]> {
    const search = new URLSearchParams();

    if (input.limit !== undefined) {
      search.set("limit", String(input.limit));
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<AuditLogRecord[]>(`/v1/workspace/audit-logs${suffix}`);
    return response.data;
  }

  async exportWorkspaceData(): Promise<WorkspaceDataExport> {
    const response = await this.request<WorkspaceDataExport>("/v1/workspace/data-export");
    return response.data;
  }

  async eraseWorkspaceData(): Promise<WorkspaceDataErasureResult> {
    const response = await this.request<WorkspaceDataErasureResult>("/v1/workspace/data-erasure", {
      body: {
        confirm: "ERASE_WORKSPACE_DATA"
      },
      method: "POST"
    });
    return response.data;
  }

  async billingPlans(): Promise<BillingPlanCatalogItem[]> {
    const response = await this.request<BillingPlanCatalogItem[]>("/v1/billing/plans");
    return response.data;
  }

  async adminPlans(): Promise<BillingPlanCatalogItem[]> {
    const response = await this.request<BillingPlanCatalogItem[]>("/v1/admin/plans");
    return response.data;
  }

  async updateAdminPlanLimits(
    planCode: "STARTER" | "GROWTH" | "PREMIUM" | "ENTERPRISE",
    input: { limits: Record<string, number> }
  ): Promise<BillingPlanCatalogItem> {
    const response = await this.request<BillingPlanCatalogItem>(`/v1/admin/plans/${planCode}/limits`, {
      body: input,
      method: "PATCH"
    });
    return response.data;
  }

  async adminBillingOperations(): Promise<AdminBillingOperations> {
    const response = await this.request<AdminBillingOperations>("/v1/admin/billing/operations");
    return response.data;
  }

  async adminGatewayReadiness(): Promise<AdminGatewayReadiness[]> {
    const response = await this.request<AdminGatewayReadiness[]>("/v1/admin/gateways");
    return response.data;
  }

  async adminBahrainLaunchReadiness(): Promise<AdminBahrainLaunchReadiness> {
    const response = await this.request<AdminBahrainLaunchReadiness>("/v1/admin/bahrain-launch-readiness");
    return response.data;
  }

  async adminModelConfiguration(): Promise<AdminModelConfiguration> {
    const response = await this.request<AdminModelConfiguration>("/v1/admin/model-config");
    return response.data;
  }

  async updateAdminModelSetting(
    key: "LLM_PRIMARY_MODEL" | "LLM_LONGFORM_MODEL" | "IMAGE_MODEL_PRIMARY" | "IMAGE_MODEL_FALLBACK",
    input: { value: string }
  ): Promise<AdminModelConfiguration> {
    const response = await this.request<AdminModelConfiguration>(`/v1/admin/model-config/${key}`, {
      body: input,
      method: "PATCH"
    });
    return response.data;
  }

  async billingSummary(): Promise<BillingSummary> {
    const response = await this.request<BillingSummary>("/v1/billing/summary");
    return response.data;
  }

  async startBillingCheckout(input: {
    gateway?: "CREDIMAX" | "BENEFIT" | "STRIPE";
    planCode: "STARTER" | "GROWTH" | "PREMIUM" | "ENTERPRISE";
  }): Promise<BillingCheckoutResult> {
    const response = await this.request<BillingCheckoutResult>("/v1/billing/checkout", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async captureBillingPayment(paymentId: string): Promise<BillingPaymentCaptureResult> {
    const response = await this.request<BillingPaymentCaptureResult>(`/v1/billing/payments/${paymentId}/capture`, {
      body: {},
      method: "POST"
    });
    return response.data;
  }

  async exportBillingInvoicePdf(invoiceId: string): Promise<ArrayBuffer> {
    return this.requestBinary(`/v1/billing/invoices/${invoiceId}/pdf`, {
      accept: "application/pdf"
    });
  }

  async verifyBillingVatCompliance(invoiceId: string): Promise<BillingVatComplianceReport> {
    const response = await this.request<BillingVatComplianceReport>(`/v1/billing/invoices/${invoiceId}/vat-compliance`);
    return response.data;
  }

  async startBillingUpgrade(input: {
    gateway?: "CREDIMAX" | "BENEFIT" | "STRIPE";
    targetPlanCode: "STARTER" | "GROWTH" | "PREMIUM" | "ENTERPRISE";
  }): Promise<BillingUpgradeResult> {
    const response = await this.request<BillingUpgradeResult>("/v1/billing/upgrade", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async analytics(input: { days?: number } = {}): Promise<AnalyticsSummary> {
    const search = new URLSearchParams();

    if (input.days !== undefined) {
      search.set("days", String(input.days));
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<AnalyticsSummary>(`/v1/analytics${suffix}`);
    return response.data;
  }

  async syncAnalytics(input: { days?: number } = {}): Promise<AnalyticsSyncResult> {
    const response = await this.request<AnalyticsSyncResult>("/v1/analytics/sync", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async analyticsLiveReadiness(): Promise<AnalyticsLiveReadiness> {
    const response = await this.request<AnalyticsLiveReadiness>("/v1/analytics/live-readiness");
    return response.data;
  }

  async writeAnalyticsLearning(input: { days?: number } = {}): Promise<AnalyticsLearningResult> {
    const response = await this.request<AnalyticsLearningResult>("/v1/analytics/learning", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async analyticsDigest(input: { days?: number; locale?: "ar" | "en" } = {}): Promise<AnalyticsDigestResult> {
    const response = await this.request<AnalyticsDigestResult>("/v1/analytics/digest", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async analyticsChat(input: { days?: number; locale?: "ar" | "en"; question: string }): Promise<AnalyticsChatResult> {
    const response = await this.request<AnalyticsChatResult>("/v1/analytics/chat", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async exportMonthlyAnalyticsPdf(input: { locale?: "ar" | "en"; month?: string } = {}): Promise<ArrayBuffer> {
    const search = new URLSearchParams();

    if (input.locale !== undefined) {
      search.set("locale", input.locale);
    }

    if (input.month !== undefined) {
      search.set("month", input.month);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    return this.requestBinary(`/v1/analytics/monthly-pdf${suffix}`, {
      accept: "application/pdf"
    });
  }

  async sendMonthlyAnalyticsEmail(input: { locale?: "ar" | "en"; month?: string } = {}): Promise<AnalyticsEmailDeliveryResult> {
    const response = await this.request<AnalyticsEmailDeliveryResult>("/v1/analytics/monthly-email", {
      body: input,
      method: "POST"
    });
    return response.data;
  }

  async publishReadiness(contentItemId: string): Promise<PublishReadiness> {
    const response = await this.request<PublishReadiness>(`/v1/workspace/publish-readiness/${contentItemId}`);
    return response.data;
  }

  async publishingQueue(): Promise<ContentRecord[]> {
    const response = await this.request<ContentRecord[]>("/v1/publishing/queue");
    return response.data;
  }

  async publishingLiveReadiness(): Promise<PublishingLiveReadiness> {
    const response = await this.request<PublishingLiveReadiness>("/v1/publishing/live-readiness");
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

  async rescheduleFailedPublish(contentItemId: string, scheduledAt: string): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(`/v1/publishing/content/${contentItemId}/reschedule`, {
      body: {
        scheduledAt
      },
      method: "POST"
    });
    return response.data;
  }

  private async request<TData>(
    path: string,
    options: {
      body?: Record<string, unknown>;
      browserSession?: boolean;
      method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
    } = {}
  ): Promise<ApiEnvelope<TData>> {
    const perform = async () => {
      const headers = this.requestHeaders("application/json");

      if (options.body !== undefined) headers["Content-Type"] = "application/json";
      if (options.browserSession) headers["X-Markos-Session"] = "browser";

      const init: RequestInit = {
        credentials: "include",
        headers,
        method: options.method ?? "GET"
      };

      if (options.body !== undefined) init.body = JSON.stringify(options.body);

      const response = await fetch(`${this.baseUrl}${path}`, init);
      if (!response.ok) throw await apiError(response);
      return (await response.json()) as ApiEnvelope<TData>;
    };

    return this.withSessionRenewal(perform);
  }

  private async requestBinary(
    path: string,
    options: { accept: string; method?: "GET" } = {
      accept: "application/octet-stream"
    }
  ): Promise<ArrayBuffer> {
    const perform = async () => {
      const response = await fetch(`${this.baseUrl}${path}`, {
        credentials: "include",
        headers: this.requestHeaders(options.accept),
        method: options.method ?? "GET"
      });

      if (!response.ok) throw await apiError(response);
      return response.arrayBuffer();
    };

    return this.withSessionRenewal(perform);
  }

  private requestHeaders(accept: string): Record<string, string> {
    const headers: Record<string, string> = { Accept: accept };

    if (this.accessToken !== undefined) headers.Authorization = `Bearer ${this.accessToken}`;
    if (this.workspaceId !== undefined) headers["X-Workspace-Id"] = this.workspaceId;
    return headers;
  }

  private async withSessionRenewal<T>(perform: () => Promise<T>): Promise<T> {
    try {
      return await perform();
    } catch (error) {
      if (!isExpiredAccessTokenError(error) || !this.renewAccessToken) throw error;
    }

    try {
      this.accessToken = await this.renewAccessToken();
    } catch (error) {
      if (isTerminalSessionError(error)) await this.onSessionExpired?.();
      throw error;
    }

    try {
      return await perform();
    } catch (error) {
      if (isExpiredAccessTokenError(error)) await this.onSessionExpired?.();
      throw error;
    }
  }
}

async function apiError(response: Response): Promise<MarkosApiError> {
  const body = (await response.json().catch(() => undefined)) as { error?: { code?: unknown; details?: unknown; message?: unknown } } | undefined;
  const code = typeof body?.error?.code === "string" ? body.error.code : undefined;
  const details = Array.isArray(body?.error?.details) ? body.error.details : undefined;
  const message = typeof body?.error?.message === "string" ? body.error.message : `MARKOS API request failed: ${response.status}`;

  return new MarkosApiError(message, response.status, code, details);
}

function isExpiredAccessTokenError(error: unknown): error is MarkosApiError {
  return error instanceof MarkosApiError && error.status === 401 && error.code === "INVALID_TOKEN";
}

function isTerminalSessionError(error: unknown): boolean {
  return (
    error instanceof MarkosApiError &&
    ["INVALID_REFRESH_TOKEN", "REFRESH_TOKEN_REUSE_DETECTED", "MFA_REQUIRED", "MFA_SETUP_REQUIRED"].includes(error.code ?? "")
  );
}
