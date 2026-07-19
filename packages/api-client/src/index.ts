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
  BrandBookExportRecord,
  BrandKit,
  CampaignBrief,
  CampaignPackageRecord,
  CampaignStatus,
  ContentRecord,
  ContentStatus,
  ContentType,
  EmailVerificationChallenge,
  EmailVerificationResult,
  GeneratedMediaStatus,
  GeneratedMediaVariantRecord,
  HealthResponse,
  InstagramConnection,
  InstagramOAuthStart,
  InstagramTokenRefreshResult,
  KnowledgeVaultEntry,
  KnowledgeVaultHistoryEntry,
  MediaAssetRecord,
  MediaType,
  MfaStatus,
  MfaTotpSetup,
  OfferRecord,
  OfferStatus,
  OnboardingState,
  PromptTemplateRecord,
  PromptVariantSelection,
  ProductRecord,
  ProductStatus,
  PublishAttemptRecord,
  PublishDueContentResult,
  PublishingLiveReadiness,
  PublishReadiness,
  StrategyRecord,
  VaultCompletenessScore,
  VaultWebsiteIngestCandidate,
  VaultWebsiteIngestDraft,
  VaultWebsiteIngestJob,
  VaultRagChunk,
  VaultSection,
  VisualMode,
  VisualStudioGenerationResult,
  WorkspaceDataErasureResult,
  WorkspaceDataExport,
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
      method: "POST",
    });
    return response.data;
  }

  async login(input: {
    email: string;
    password: string;
    totpCode?: string;
  }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/login", {
      body: input,
      method: "POST",
    });
    return response.data;
  }

  async loginWithGoogle(input: {
    idToken: string;
    locale?: "ar" | "en";
    totpCode?: string;
    workspaceName?: string;
  }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/google", {
      body: input,
      method: "POST",
    });
    return response.data;
  }

  async setupMfaTotp(): Promise<MfaTotpSetup> {
    const response = await this.request<MfaTotpSetup>(
      "/v1/auth/mfa/totp/setup",
      {
        method: "POST",
      },
    );
    return response.data;
  }

  async enableMfaTotp(input: { code: string }): Promise<MfaStatus> {
    const response = await this.request<MfaStatus>("/v1/auth/mfa/totp/enable", {
      body: input,
      method: "POST",
    });
    return response.data;
  }

  async refreshSession(input: { refreshToken: string }): Promise<AuthSession> {
    const response = await this.request<AuthSession>("/v1/auth/refresh", {
      body: input,
      method: "POST",
    });
    return response.data;
  }

  async requestEmailVerification(input: {
    email: string;
  }): Promise<EmailVerificationChallenge> {
    const response = await this.request<EmailVerificationChallenge>(
      "/v1/auth/verification/request",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async verifyEmail(input: {
    token: string;
  }): Promise<EmailVerificationResult> {
    const response = await this.request<EmailVerificationResult>(
      "/v1/auth/verify-email",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async onboarding(): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>("/v1/onboarding");
    return response.data;
  }

  async saveOnboardingModule(
    module: string,
    body: Record<string, unknown>,
  ): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>(
      `/v1/onboarding/${module}`,
      {
        body,
        method: "PUT",
      },
    );
    return response.data;
  }

  async completeOnboarding(): Promise<OnboardingState> {
    const response = await this.request<OnboardingState>(
      "/v1/onboarding/complete",
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async vault(): Promise<Record<VaultSection, KnowledgeVaultEntry[]>> {
    const response =
      await this.request<Record<VaultSection, KnowledgeVaultEntry[]>>(
        "/v1/vault",
      );
    return response.data;
  }

  async vaultScore(): Promise<VaultCompletenessScore> {
    const response =
      await this.request<VaultCompletenessScore>("/v1/vault/score");
    return response.data;
  }

  async saveVaultSection(
    section: VaultSection,
    input: { entries: Array<{ key: string; value: Record<string, unknown> }> },
  ): Promise<KnowledgeVaultEntry[]> {
    const response = await this.request<KnowledgeVaultEntry[]>(
      `/v1/vault/${section}`,
      {
        body: input,
        method: "PUT",
      },
    );
    return response.data;
  }

  async vaultEntryHistory(
    section: VaultSection,
    key: string,
  ): Promise<KnowledgeVaultHistoryEntry[]> {
    const response = await this.request<KnowledgeVaultHistoryEntry[]>(
      `/v1/vault/${section}/${encodeURIComponent(key)}/history`,
    );
    return response.data;
  }

  async searchVault(input: {
    query: string;
    section?: VaultSection;
    topK?: number;
  }): Promise<VaultRagChunk[]> {
    const response = await this.request<VaultRagChunk[]>(
      "/v1/vault/rag/search",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async previewVaultWebsiteIngest(input: {
    url: string;
  }): Promise<VaultWebsiteIngestDraft> {
    const response = await this.request<VaultWebsiteIngestDraft>(
      "/v1/vault/ingest/website/preview",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async queueVaultWebsiteIngest(input: {
    maxPages?: number;
    url: string;
  }): Promise<VaultWebsiteIngestJob> {
    const response = await this.request<VaultWebsiteIngestJob>(
      "/v1/vault/ingest/website/jobs",
      {
        method: "POST",
        body: input,
      },
    );

    return response.data;
  }

  async vaultWebsiteIngestJob(jobId: string): Promise<VaultWebsiteIngestJob> {
    const response = await this.request<VaultWebsiteIngestJob>(
      `/v1/vault/ingest/website/jobs/${jobId}`,
    );
    return response.data;
  }

  async vaultWebsiteIngestDraft(
    draftId: string,
  ): Promise<VaultWebsiteIngestDraft> {
    const response = await this.request<VaultWebsiteIngestDraft>(
      `/v1/vault/ingest/${draftId}`,
    );
    return response.data;
  }

  async approveVaultWebsiteIngest(
    draftId: string,
    input: {
      candidates?: VaultWebsiteIngestCandidate[];
      writeMode?: "MERGE" | "OVERWRITE";
    } = {},
  ): Promise<VaultWebsiteIngestDraft> {
    const response = await this.request<VaultWebsiteIngestDraft>(
      `/v1/vault/ingest/${draftId}/approve`,
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async rejectVaultWebsiteIngest(
    draftId: string,
    input: { reason?: string } = {},
  ): Promise<VaultWebsiteIngestDraft> {
    const response = await this.request<VaultWebsiteIngestDraft>(
      `/v1/vault/ingest/${draftId}/reject`,
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async brandKit(): Promise<BrandKit> {
    const response = await this.request<BrandKit>("/v1/brand-kit");
    return response.data;
  }

  async brandBookExports(
    input: { limit?: number } = {},
  ): Promise<BrandBookExportRecord[]> {
    const search = new URLSearchParams();

    if (input.limit !== undefined) {
      search.set("limit", String(input.limit));
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<BrandBookExportRecord[]>(
      `/v1/brand-book/exports${suffix}`,
    );
    return response.data;
  }

  async createBrandBookExport(): Promise<BrandBookExportRecord> {
    const response = await this.request<BrandBookExportRecord>(
      "/v1/brand-book/exports",
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async brandBookExport(exportId: string): Promise<BrandBookExportRecord> {
    const response = await this.request<BrandBookExportRecord>(
      `/v1/brand-book/exports/${exportId}`,
    );
    return response.data;
  }

  async strategies(): Promise<StrategyRecord[]> {
    const response = await this.request<StrategyRecord[]>("/v1/strategy");
    return response.data;
  }

  async generateStrategy(input: {
    objective?: string;
    horizonDays?: number;
    productId?: string;
    offerId?: string;
  }): Promise<StrategyRecord> {
    const response = await this.request<StrategyRecord>(
      "/v1/strategy/generate",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async exportStrategyPdf(strategyId: string): Promise<ArrayBuffer> {
    return this.requestBinary(`/v1/strategy/${strategyId}/pdf`, {
      accept: "application/pdf",
    });
  }

  async runAgent(input: {
    agent: AgentName;
    task: string;
    locale?: "ar" | "en";
    inputs?: Record<string, unknown>;
  }): Promise<AgentRunRecord> {
    const response = await this.request<AgentRunRecord>("/v1/agents/run", {
      body: input,
      method: "POST",
    });
    return response.data;
  }

  async promptTemplates(
    input: { agent?: string } = {},
  ): Promise<PromptTemplateRecord[]> {
    const search = new URLSearchParams();

    if (input.agent !== undefined) {
      search.set("agent", input.agent);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<PromptTemplateRecord[]>(
      `/v1/prompts${suffix}`,
    );
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
      method: "POST",
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
    },
  ): Promise<PromptTemplateRecord> {
    const response = await this.request<PromptTemplateRecord>(
      `/v1/prompts/${promptTemplateId}`,
      {
        body: input,
        method: "PATCH",
      },
    );
    return response.data;
  }

  async selectPromptVariant(input: {
    agent: string;
    seed: string;
  }): Promise<PromptVariantSelection> {
    const response = await this.request<PromptVariantSelection>(
      "/v1/prompts/select",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async contentItems(): Promise<ContentRecord[]> {
    const response = await this.request<ContentRecord[]>("/v1/content");
    return response.data;
  }

  async campaignPackages(
    input: { limit?: number; status?: CampaignStatus } = {},
  ): Promise<CampaignPackageRecord[]> {
    const search = new URLSearchParams();

    if (input.limit !== undefined) {
      search.set("limit", String(input.limit));
    }

    if (input.status !== undefined) {
      search.set("status", input.status);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<CampaignPackageRecord[]>(
      `/v1/campaigns/packages${suffix}`,
    );
    return response.data;
  }

  async generateCampaignPackage(input: {
    brief: CampaignBrief;
    name?: string;
  }): Promise<CampaignPackageRecord> {
    const response = await this.request<CampaignPackageRecord>(
      "/v1/campaigns/packages/generate",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async approveCampaignPackage(
    campaignId: string,
  ): Promise<CampaignPackageRecord> {
    const response = await this.request<CampaignPackageRecord>(
      `/v1/campaigns/${campaignId}/approve`,
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async rejectCampaignPackageItem(
    campaignId: string,
    contentItemId: string,
    reason: string,
  ): Promise<CampaignPackageRecord> {
    const response = await this.request<CampaignPackageRecord>(
      `/v1/campaigns/${campaignId}/items/${contentItemId}/reject`,
      {
        body: {
          reason,
        },
        method: "POST",
      },
    );
    return response.data;
  }

  async scheduleCampaignPackage(
    campaignId: string,
    input: { startDate?: string; time?: string } = {},
  ): Promise<CampaignPackageRecord> {
    const response = await this.request<CampaignPackageRecord>(
      `/v1/campaigns/${campaignId}/schedule`,
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async mediaAssets(): Promise<MediaAssetRecord[]> {
    const response = await this.request<MediaAssetRecord[]>("/v1/media");
    return response.data;
  }

  async catalogProducts(
    input: { category?: string; q?: string; status?: ProductStatus } = {},
  ): Promise<ProductRecord[]> {
    const search = new URLSearchParams();

    if (input.category !== undefined) {
      search.set("category", input.category);
    }

    if (input.q !== undefined) {
      search.set("q", input.q);
    }

    if (input.status !== undefined) {
      search.set("status", input.status);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<ProductRecord[]>(
      `/v1/catalog/products${suffix}`,
    );
    return response.data;
  }

  async createCatalogProduct(input: {
    benefits?: string[];
    category?: string;
    currency?: string;
    description?: string;
    mediaAssetIds?: string[];
    name: string;
    priceMinor?: number;
    salesChannels?: string[];
    status?: ProductStatus;
  }): Promise<ProductRecord> {
    const response = await this.request<ProductRecord>("/v1/catalog/products", {
      body: input,
      method: "POST",
    });
    return response.data;
  }

  async updateCatalogProduct(
    productId: string,
    input: {
      benefits?: string[];
      category?: string | null;
      currency?: string;
      description?: string | null;
      mediaAssetIds?: string[];
      name?: string;
      priceMinor?: number | null;
      salesChannels?: string[];
      status?: ProductStatus;
    },
  ): Promise<ProductRecord> {
    const response = await this.request<ProductRecord>(
      `/v1/catalog/products/${productId}`,
      {
        body: input,
        method: "PATCH",
      },
    );
    return response.data;
  }

  async archiveCatalogProduct(productId: string): Promise<ProductRecord> {
    const response = await this.request<ProductRecord>(
      `/v1/catalog/products/${productId}`,
      {
        method: "DELETE",
      },
    );
    return response.data;
  }

  async catalogOffers(
    input: { productId?: string; q?: string; status?: OfferStatus } = {},
  ): Promise<OfferRecord[]> {
    const search = new URLSearchParams();

    if (input.productId !== undefined) {
      search.set("productId", input.productId);
    }

    if (input.q !== undefined) {
      search.set("q", input.q);
    }

    if (input.status !== undefined) {
      search.set("status", input.status);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<OfferRecord[]>(
      `/v1/catalog/offers${suffix}`,
    );
    return response.data;
  }

  async createCatalogOffer(input: {
    compareAtPriceMinor?: number;
    currency?: string;
    description?: string;
    endsAt?: string;
    priceMinor?: number;
    productId?: string;
    startsAt?: string;
    status?: OfferStatus;
    terms?: string;
    title: string;
  }): Promise<OfferRecord> {
    const response = await this.request<OfferRecord>("/v1/catalog/offers", {
      body: input,
      method: "POST",
    });
    return response.data;
  }

  async updateCatalogOffer(
    offerId: string,
    input: {
      compareAtPriceMinor?: number | null;
      currency?: string;
      description?: string | null;
      endsAt?: string | null;
      priceMinor?: number | null;
      productId?: string | null;
      startsAt?: string | null;
      status?: OfferStatus;
      terms?: string | null;
      title?: string;
    },
  ): Promise<OfferRecord> {
    const response = await this.request<OfferRecord>(
      `/v1/catalog/offers/${offerId}`,
      {
        body: input,
        method: "PATCH",
      },
    );
    return response.data;
  }

  async archiveCatalogOffer(offerId: string): Promise<OfferRecord> {
    const response = await this.request<OfferRecord>(
      `/v1/catalog/offers/${offerId}`,
      {
        method: "DELETE",
      },
    );
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
    const response = await this.request<MediaAssetRecord>(
      "/v1/media/public-url",
      {
        body: input,
        method: "POST",
      },
    );
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
      method: "POST",
    });
    return response.data;
  }

  async generateContent(input: {
    topic: string;
    contentType?: ContentType;
    count?: number;
    strategyId?: string;
    productId?: string;
    offerId?: string;
  }): Promise<ContentRecord[]> {
    const response = await this.request<ContentRecord[]>(
      "/v1/content/generate",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async generateContentForSlot(input: {
    topic: string;
    contentType?: ContentType;
    scheduledAt: string;
    strategyId?: string;
    productId?: string;
    offerId?: string;
  }): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      "/v1/content/generate-for-slot",
      {
        body: input,
        method: "POST",
      },
    );
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
    },
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/content/${contentItemId}`,
      {
        body: input,
        method: "PATCH",
      },
    );
    return response.data;
  }

  async updateContentStatus(
    contentItemId: string,
    status: Extract<ContentStatus, "DRAFT" | "IN_REVIEW" | "APPROVED">,
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/content/${contentItemId}/status`,
      {
        body: {
          status,
        },
        method: "POST",
      },
    );
    return response.data;
  }

  async scheduleContent(
    contentItemId: string,
    scheduledAt: string,
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/content/${contentItemId}/schedule`,
      {
        body: {
          scheduledAt,
        },
        method: "POST",
      },
    );
    return response.data;
  }

  async unscheduleContent(contentItemId: string): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/content/${contentItemId}/unschedule`,
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async attachMediaToContent(
    contentItemId: string,
    mediaAssetId: string,
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/content/${contentItemId}/media`,
      {
        body: {
          mediaAssetId,
        },
        method: "POST",
      },
    );
    return response.data;
  }

  async detachMediaFromContent(
    contentItemId: string,
    mediaAssetId: string,
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/content/${contentItemId}/media/${mediaAssetId}`,
      {
        method: "DELETE",
      },
    );
    return response.data;
  }

  async generateContentImage(
    contentItemId: string,
    input: {
      aspectRatio?: "1:1" | "4:5" | "9:16";
      prompt?: string;
    } = {},
  ): Promise<AiImageGenerationResult> {
    const response = await this.request<AiImageGenerationResult>(
      `/v1/content/${contentItemId}/generate-image`,
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async visualStudioVariants(
    input: { limit?: number; status?: GeneratedMediaStatus } = {},
  ): Promise<GeneratedMediaVariantRecord[]> {
    const search = new URLSearchParams();

    if (input.limit !== undefined) {
      search.set("limit", String(input.limit));
    }

    if (input.status !== undefined) {
      search.set("status", input.status);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<GeneratedMediaVariantRecord[]>(
      `/v1/media/visual-studio/variants${suffix}`,
    );
    return response.data;
  }

  async generateVisualStudioVariants(input: {
    aspectRatio?: "1:1" | "4:5" | "9:16";
    contentItemId?: string;
    count?: number;
    negativePrompt?: string;
    offerId?: string;
    productId?: string;
    prompt?: string;
    sourceMediaAssetIds?: string[];
    visualMode?: VisualMode;
  }): Promise<VisualStudioGenerationResult> {
    const response = await this.request<VisualStudioGenerationResult>(
      "/v1/media/visual-studio/generate",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async approveGeneratedMediaVariant(
    variantId: string,
  ): Promise<GeneratedMediaVariantRecord> {
    const response = await this.request<GeneratedMediaVariantRecord>(
      `/v1/media/visual-studio/variants/${variantId}/approve`,
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async rejectGeneratedMediaVariant(
    variantId: string,
    reason: string,
  ): Promise<GeneratedMediaVariantRecord> {
    const response = await this.request<GeneratedMediaVariantRecord>(
      `/v1/media/visual-studio/variants/${variantId}/reject`,
      {
        body: {
          reason,
        },
        method: "POST",
      },
    );
    return response.data;
  }

  async attachGeneratedMediaVariantToContent(
    variantId: string,
    contentItemId: string,
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/media/visual-studio/variants/${variantId}/attach-to-content`,
      {
        body: {
          contentItemId,
        },
        method: "POST",
      },
    );
    return response.data;
  }

  async instagramConnection(): Promise<InstagramConnection> {
    const response = await this.request<InstagramConnection>(
      "/v1/workspace/instagram",
    );
    return response.data;
  }

  async instagramOAuthStart(
    input: { locale?: "ar" | "en" } = {},
  ): Promise<InstagramOAuthStart> {
    const response = await this.request<InstagramOAuthStart>(
      "/v1/workspace/instagram/oauth/start",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async connectInstagram(input: {
    accountId: string;
    accessToken: string;
    tokenExpiresAt: string;
  }): Promise<InstagramConnection> {
    const response = await this.request<InstagramConnection>(
      "/v1/workspace/instagram",
      {
        body: input,
        method: "PUT",
      },
    );
    return response.data;
  }

  async disconnectInstagram(): Promise<InstagramConnection> {
    const response = await this.request<InstagramConnection>(
      "/v1/workspace/instagram",
      {
        method: "DELETE",
      },
    );
    return response.data;
  }

  async refreshInstagramToken(): Promise<InstagramTokenRefreshResult> {
    const response = await this.request<InstagramTokenRefreshResult>(
      "/v1/workspace/instagram/refresh",
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async auditLogs(input: { limit?: number } = {}): Promise<AuditLogRecord[]> {
    const search = new URLSearchParams();

    if (input.limit !== undefined) {
      search.set("limit", String(input.limit));
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<AuditLogRecord[]>(
      `/v1/workspace/audit-logs${suffix}`,
    );
    return response.data;
  }

  async exportWorkspaceData(): Promise<WorkspaceDataExport> {
    const response = await this.request<WorkspaceDataExport>(
      "/v1/workspace/data-export",
    );
    return response.data;
  }

  async eraseWorkspaceData(): Promise<WorkspaceDataErasureResult> {
    const response = await this.request<WorkspaceDataErasureResult>(
      "/v1/workspace/data-erasure",
      {
        body: {
          confirm: "ERASE_WORKSPACE_DATA",
        },
        method: "POST",
      },
    );
    return response.data;
  }

  async billingPlans(): Promise<BillingPlanCatalogItem[]> {
    const response =
      await this.request<BillingPlanCatalogItem[]>("/v1/billing/plans");
    return response.data;
  }

  async adminPlans(): Promise<BillingPlanCatalogItem[]> {
    const response =
      await this.request<BillingPlanCatalogItem[]>("/v1/admin/plans");
    return response.data;
  }

  async updateAdminPlanLimits(
    planCode: "STARTER" | "GROWTH" | "PREMIUM" | "ENTERPRISE",
    input: { limits: Record<string, number> },
  ): Promise<BillingPlanCatalogItem> {
    const response = await this.request<BillingPlanCatalogItem>(
      `/v1/admin/plans/${planCode}/limits`,
      {
        body: input,
        method: "PATCH",
      },
    );
    return response.data;
  }

  async adminBillingOperations(): Promise<AdminBillingOperations> {
    const response = await this.request<AdminBillingOperations>(
      "/v1/admin/billing/operations",
    );
    return response.data;
  }

  async adminGatewayReadiness(): Promise<AdminGatewayReadiness[]> {
    const response =
      await this.request<AdminGatewayReadiness[]>("/v1/admin/gateways");
    return response.data;
  }

  async adminBahrainLaunchReadiness(): Promise<AdminBahrainLaunchReadiness> {
    const response = await this.request<AdminBahrainLaunchReadiness>(
      "/v1/admin/bahrain-launch-readiness",
    );
    return response.data;
  }

  async adminModelConfiguration(): Promise<AdminModelConfiguration> {
    const response = await this.request<AdminModelConfiguration>(
      "/v1/admin/model-config",
    );
    return response.data;
  }

  async updateAdminModelSetting(
    key: "LLM_PRIMARY_MODEL" | "IMAGE_MODEL_PRIMARY" | "IMAGE_MODEL_FALLBACK",
    input: { value: string },
  ): Promise<AdminModelConfiguration> {
    const response = await this.request<AdminModelConfiguration>(
      `/v1/admin/model-config/${key}`,
      {
        body: input,
        method: "PATCH",
      },
    );
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
    const response = await this.request<BillingCheckoutResult>(
      "/v1/billing/checkout",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async captureBillingPayment(
    paymentId: string,
  ): Promise<BillingPaymentCaptureResult> {
    const response = await this.request<BillingPaymentCaptureResult>(
      `/v1/billing/payments/${paymentId}/capture`,
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async exportBillingInvoicePdf(invoiceId: string): Promise<ArrayBuffer> {
    return this.requestBinary(`/v1/billing/invoices/${invoiceId}/pdf`, {
      accept: "application/pdf",
    });
  }

  async verifyBillingVatCompliance(
    invoiceId: string,
  ): Promise<BillingVatComplianceReport> {
    const response = await this.request<BillingVatComplianceReport>(
      `/v1/billing/invoices/${invoiceId}/vat-compliance`,
    );
    return response.data;
  }

  async startBillingUpgrade(input: {
    gateway?: "CREDIMAX" | "BENEFIT" | "STRIPE";
    targetPlanCode: "STARTER" | "GROWTH" | "PREMIUM" | "ENTERPRISE";
  }): Promise<BillingUpgradeResult> {
    const response = await this.request<BillingUpgradeResult>(
      "/v1/billing/upgrade",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async analytics(input: { days?: number } = {}): Promise<AnalyticsSummary> {
    const search = new URLSearchParams();

    if (input.days !== undefined) {
      search.set("days", String(input.days));
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    const response = await this.request<AnalyticsSummary>(
      `/v1/analytics${suffix}`,
    );
    return response.data;
  }

  async syncAnalytics(
    input: { days?: number } = {},
  ): Promise<AnalyticsSyncResult> {
    const response = await this.request<AnalyticsSyncResult>(
      "/v1/analytics/sync",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async analyticsLiveReadiness(): Promise<AnalyticsLiveReadiness> {
    const response = await this.request<AnalyticsLiveReadiness>(
      "/v1/analytics/live-readiness",
    );
    return response.data;
  }

  async writeAnalyticsLearning(
    input: { days?: number } = {},
  ): Promise<AnalyticsLearningResult> {
    const response = await this.request<AnalyticsLearningResult>(
      "/v1/analytics/learning",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async analyticsDigest(
    input: { days?: number; locale?: "ar" | "en" } = {},
  ): Promise<AnalyticsDigestResult> {
    const response = await this.request<AnalyticsDigestResult>(
      "/v1/analytics/digest",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async analyticsChat(input: {
    days?: number;
    locale?: "ar" | "en";
    question: string;
  }): Promise<AnalyticsChatResult> {
    const response = await this.request<AnalyticsChatResult>(
      "/v1/analytics/chat",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async exportMonthlyAnalyticsPdf(
    input: { locale?: "ar" | "en"; month?: string } = {},
  ): Promise<ArrayBuffer> {
    const search = new URLSearchParams();

    if (input.locale !== undefined) {
      search.set("locale", input.locale);
    }

    if (input.month !== undefined) {
      search.set("month", input.month);
    }

    const suffix = search.size === 0 ? "" : `?${search.toString()}`;
    return this.requestBinary(`/v1/analytics/monthly-pdf${suffix}`, {
      accept: "application/pdf",
    });
  }

  async sendMonthlyAnalyticsEmail(
    input: { locale?: "ar" | "en"; month?: string } = {},
  ): Promise<AnalyticsEmailDeliveryResult> {
    const response = await this.request<AnalyticsEmailDeliveryResult>(
      "/v1/analytics/monthly-email",
      {
        body: input,
        method: "POST",
      },
    );
    return response.data;
  }

  async publishReadiness(contentItemId: string): Promise<PublishReadiness> {
    const response = await this.request<PublishReadiness>(
      `/v1/workspace/publish-readiness/${contentItemId}`,
    );
    return response.data;
  }

  async publishingQueue(): Promise<ContentRecord[]> {
    const response = await this.request<ContentRecord[]>(
      "/v1/publishing/queue",
    );
    return response.data;
  }

  async publishingLiveReadiness(): Promise<PublishingLiveReadiness> {
    const response = await this.request<PublishingLiveReadiness>(
      "/v1/publishing/live-readiness",
    );
    return response.data;
  }

  async publishContentDryRun(
    contentItemId: string,
  ): Promise<PublishAttemptRecord> {
    const response = await this.request<PublishAttemptRecord>(
      `/v1/publishing/content/${contentItemId}/dry-run`,
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async runDuePublishing(): Promise<PublishDueContentResult> {
    const response = await this.request<PublishDueContentResult>(
      "/v1/publishing/run-due",
      {
        body: {},
        method: "POST",
      },
    );
    return response.data;
  }

  async rescheduleFailedPublish(
    contentItemId: string,
    scheduledAt: string,
  ): Promise<ContentRecord> {
    const response = await this.request<ContentRecord>(
      `/v1/publishing/content/${contentItemId}/reschedule`,
      {
        body: {
          scheduledAt,
        },
        method: "POST",
      },
    );
    return response.data;
  }

  private async request<TData>(
    path: string,
    options: {
      body?: Record<string, unknown>;
      method?: "DELETE" | "GET" | "PATCH" | "POST" | "PUT";
    } = {},
  ): Promise<ApiEnvelope<TData>> {
    const headers: Record<string, string> = {
      Accept: "application/json",
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
      method: options.method ?? "GET",
    };

    if (options.body !== undefined) {
      init.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.baseUrl}${path}`, init);

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | { error?: { message?: string } }
        | undefined;
      throw new Error(
        body?.error?.message ?? `MARKOS API request failed: ${response.status}`,
      );
    }

    return (await response.json()) as ApiEnvelope<TData>;
  }

  private async requestBinary(
    path: string,
    options: { accept: string; method?: "GET" } = {
      accept: "application/octet-stream",
    },
  ): Promise<ArrayBuffer> {
    const headers: Record<string, string> = {
      Accept: options.accept,
    };

    if (this.accessToken !== undefined) {
      headers.Authorization = `Bearer ${this.accessToken}`;
    }

    if (this.workspaceId !== undefined) {
      headers["X-Workspace-Id"] = this.workspaceId;
    }

    const response = await fetch(`${this.baseUrl}${path}`, {
      headers,
      method: options.method ?? "GET",
    });

    if (!response.ok) {
      const body = (await response.json().catch(() => undefined)) as
        | { error?: { message?: string } }
        | undefined;
      throw new Error(
        body?.error?.message ?? `MARKOS API request failed: ${response.status}`,
      );
    }

    return response.arrayBuffer();
  }
}
