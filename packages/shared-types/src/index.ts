export const locales = ["ar", "en"] as const;
export type Locale = (typeof locales)[number];

export const planCodes = [
  "STARTER",
  "GROWTH",
  "PREMIUM",
  "ENTERPRISE",
] as const;
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
  "READONLY_ADMIN",
] as const;
export type Role = (typeof roles)[number];

export const permissions = [
  "workspace:read",
  "workspace:audit:read",
  "workspace:data:export",
  "workspace:data:erase",
  "admin:read",
  "admin:manage",
  "billing:read",
  "billing:manage",
  "instagram:manage",
  "vault:read",
  "vault:write",
  "onboarding:read",
  "onboarding:write",
  "strategy:read",
  "strategy:generate",
  "content:read",
  "content:write",
  "content:schedule",
  "agent:run",
  "media:read",
  "media:write",
  "analytics:read",
  "analytics:sync",
  "publishing:run",
  "prompt:read",
  "prompt:manage",
] as const;
export type Permission = (typeof permissions)[number];

export const paymentGatewayCodes = ["CREDIMAX", "BENEFIT", "STRIPE"] as const;
export type PaymentGatewayCode = (typeof paymentGatewayCodes)[number];

export const vaultSections = [
  "COMPANY",
  "STORY",
  "PRODUCTS",
  "AUDIENCE",
  "COMPETITORS",
  "BRAND",
  "TONE",
  "OBJECTIVES",
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
  "FAILED",
] as const;
export type ContentStatus = (typeof contentStatuses)[number];

export const mediaTypes = [
  "IMAGE",
  "VIDEO",
  "BRAND_ASSET",
  "AI_GENERATED",
] as const;
export type MediaType = (typeof mediaTypes)[number];

export const instagramMetricTypes = [
  "ACCOUNT",
  "AUDIENCE",
  "POST",
  "REEL",
  "STORY",
] as const;
export type InstagramMetricType = (typeof instagramMetricTypes)[number];

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

export interface EmailVerificationChallenge {
  alreadyVerified: boolean;
  email: string;
  expiresAt: string;
  verificationToken?: string;
}

export interface EmailVerificationResult {
  email: string;
  isVerified: boolean;
}

export interface GoogleLoginConfigurationStatus {
  configured: boolean;
  missing: string[];
}

export interface MfaTotpSetup {
  enabled: boolean;
  otpauthUri: string;
  secret: string;
}

export interface MfaStatus {
  enabled: boolean;
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

export interface KnowledgeVaultHistoryEntry {
  id: string;
  workspaceId: string;
  knowledgeVaultId: string;
  section: VaultSection;
  key: string;
  value: Record<string, unknown>;
  version: number;
  createdAt: string;
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

export const agentNames = [
  "MARKETING_STRATEGIST",
  "CONTENT_PLANNER",
  "CONTENT_CREATOR",
  "REEL_SCRIPT",
  "IMAGE_PROMPT",
  "ANALYTICS_CONSULTANT",
  "RECOMMENDATION_ENGINE",
  "BUSINESS_GROWTH_ADVISOR",
] as const;
export type AgentName = (typeof agentNames)[number];

export interface AgentRunRecord {
  id: string;
  workspaceId: string;
  agent: AgentName;
  promptVersion: string;
  request: {
    task: string;
    locale: Locale;
    retrievedContext: VaultRagChunk[];
    inputs?: Record<string, unknown>;
  };
  output: Record<string, unknown>;
  tokensIn: number;
  tokensOut: number;
  model: string;
  createdAt: string;
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

export interface ContentToneLock {
  requiredLanguages: ["ar", "en"];
  toneWords: string[];
  voiceNotes?: string;
  brandHints: Record<string, unknown>;
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

export interface MediaAssetRecord {
  id: string;
  workspaceId: string;
  type: MediaType;
  filename: string;
  publicUrl: string;
  mimeType: string;
  sizeBytes: number;
  width?: number;
  height?: number;
  durationSeconds?: number;
  createdAt: string;
  updatedAt: string;
}

export interface AiImageGenerationResult {
  contentItem: ContentRecord;
  mediaAsset: MediaAssetRecord;
  model: string;
  prompt: string;
  promptVersion: string;
}

export interface PromptTemplateRecord {
  id: string;
  workspaceId: string;
  agent: string;
  version: string;
  body: string;
  variantOf?: string;
  trafficPct: number;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVariantSelection {
  selected?: PromptTemplateRecord;
  candidates: PromptTemplateRecord[];
  seed: string;
}

export interface InstagramConnection {
  connected: boolean;
  status?:
    | "DISCONNECTED"
    | "CONNECTING"
    | "CONNECTED"
    | "REAUTHORIZE_REQUIRED"
    | "AUTHORIZATION_FAILED"
    | "REFRESH_FAILED";
  accountId?: string;
  username?: string;
  accountType?: string;
  profilePictureUrl?: string;
  tokenExpiresAt?: string;
  lastSyncedAt?: string;
  recentMedia?: InstagramRecentMedia[];
}

export interface InstagramRecentMedia {
  id: string;
  mediaType: string;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp?: string;
}

export interface InstagramOAuthStart {
  authorizationUrl: string;
  stateExpiresAt: string;
}

export interface InstagramDisconnectResult {
  connection: InstagramConnection;
  providerRevocation: {
    status: "ACTION_REQUIRED" | "CONFIRMED" | "UNCONFIRMED" | "NOT_APPLICABLE";
    manualRevocationUrl?: string;
  };
}

export interface InstagramTokenRefreshResult {
  refreshed: boolean;
  workspaceId?: string;
  reason?: string;
  connection?: InstagramConnection;
}

export interface AuditLogRecord {
  id: string;
  actorId?: string;
  workspaceId: string;
  action: string;
  targetType: string;
  targetId?: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
}

export interface WorkspaceDataExport {
  exportedAt: string;
  workspace: {
    id: string;
    name: string;
    slug: string;
    ownerUserId: string;
    onboardingStatus: string;
    onboardingScore: number;
    vatPricingMode: string;
    createdAt: string;
    updatedAt: string;
  };
  owner: {
    id: string;
    email: string;
    fullName: string;
    locale: Locale;
    isVerified: boolean;
    planStatus: string;
    trialEndsAt?: string;
    createdAt: string;
    updatedAt: string;
  };
  records: Record<string, unknown[]>;
}

export interface WorkspaceDataErasureResult {
  erasedAt: string;
  ownerAnonymized: boolean;
  userId: string;
  workspaceId: string;
  counts: Record<string, number>;
}

export interface InstagramAnalyticsRecord {
  id: string;
  workspaceId: string;
  contentItemId?: string;
  metricType: InstagramMetricType;
  dataDate: string;
  metrics: Record<string, unknown>;
  syncedAt: string;
  createdAt: string;
  updatedAt: string;
}

export interface AnalyticsSummary {
  days: number;
  byMetricType: Array<{
    metricType: InstagramMetricType;
    totals: AnalyticsMetricTotals;
  }>;
  daily: Array<{
    dataDate: string;
    totals: AnalyticsMetricTotals;
  }>;
  from: string;
  to: string;
  latestSyncedAt?: string;
  topContent: Array<{
    contentItemId: string;
    contentType: ContentType;
    caption?: string;
    dataDate: string;
    engagement: number;
    metrics: AnalyticsMetricTotals;
  }>;
  totals: AnalyticsMetricTotals;
  records: InstagramAnalyticsRecord[];
}

export interface AnalyticsMetricTotals {
  comments: number;
  engagement: number;
  followers: number;
  impressions: number;
  likes: number;
  reach: number;
  saves: number;
  shares: number;
  views: number;
}

export interface AnalyticsSyncResult {
  created: number;
  from: string;
  learning?: AnalyticsLearningResult;
  mode: "dry_run" | "live";
  records: InstagramAnalyticsRecord[];
  to: string;
  workspaceId: string;
}

export interface AnalyticsLearningResult {
  entry: KnowledgeVaultEntry;
  key: string;
  observations: string[];
  recordCount: number;
  topContentCount: number;
  workspaceId: string;
}

export interface AnalyticsDigestResult {
  days: number;
  generatedAt: string;
  locale: Locale;
  run: AgentRunRecord;
}

export interface AnalyticsChatResult {
  days: number;
  locale: Locale;
  question: string;
  run: AgentRunRecord;
}

export interface AnalyticsEmailDeliveryResult {
  attachmentBytes: number;
  delivered: boolean;
  filename: string;
  messageId?: string;
  mode: "dry_run";
  month: string;
  recipients: string[];
  skippedReason?: string;
  workspaceId: string;
}

export interface AnalyticsEmailDeliveryForAllWorkspacesResult {
  attempted: number;
  delivered: number;
  results: AnalyticsEmailDeliveryResult[];
  skipped: number;
}

export interface AnalyticsLiveReadiness {
  connection: InstagramConnection;
  mode: "dry_run" | "live";
  ready: boolean;
  reasons: string[];
  requiredEnv: string[];
  requiredScopes: string[];
}

export interface BillingVatBreakdown {
  currency: "BHD";
  grossMinor: number;
  netMinor: number;
  vatMinor: number;
  vatPricingMode: "EXCLUSIVE" | "INCLUSIVE";
  vatRateBps: number;
}

export interface BillingPlanCatalogItem {
  active: boolean;
  code: PlanCode;
  currency: "BHD";
  id: string;
  limits: Record<string, unknown>;
  name: string;
  priceMinor: number;
}

export interface BillingInvoiceRecord extends BillingVatBreakdown {
  id: string;
  issuedAt?: string;
  paidAt?: string;
  status: "DRAFT" | "PAID" | "FAILED" | "VOID";
  workspaceId: string;
}

export interface BillingVatComplianceCheck {
  code:
    | "BHD_CURRENCY"
    | "INTEGER_MINOR_UNITS"
    | "NON_NEGATIVE_AMOUNTS"
    | "VAT_RATE"
    | "VAT_BREAKDOWN"
    | "GROSS_TOTAL"
    | "ISSUED_AT"
    | "PAYMENT_RECONCILIATION";
  details: string;
  passed: boolean;
}

export interface BillingVatComplianceReport {
  checks: BillingVatComplianceCheck[];
  compliant: boolean;
  generatedAt: string;
  invoice: BillingInvoiceRecord;
  workspaceId: string;
}

export interface BillingPaymentRecord {
  amountMinor: number;
  currency: "BHD";
  gateway: PaymentGatewayCode;
  gatewayRef?: string;
  id: string;
  invoiceId?: string;
  status: "INITIATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
  workspaceId: string;
}

export interface BillingSubscriptionRecord {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: string;
  currentPeriodStart: string;
  gateway: PaymentGatewayCode | string;
  id: string;
  planCode: PlanCode;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
}

export interface BillingCheckoutResult {
  checkoutMode: "dry_run";
  gateway: PaymentGatewayCode;
  invoice: BillingInvoiceRecord;
  payment: BillingPaymentRecord;
  plan: BillingPlanCatalogItem;
  redirectUrl: string;
  vat: BillingVatBreakdown;
}

export interface BillingProrationBreakdown {
  creditMinor: number;
  currentPlanCode: PlanCode;
  currentPlanPriceMinor: number;
  remainingDays: number;
  remainingPeriodRatioBps: number;
  targetPlanCode: PlanCode;
  targetPlanPriceMinor: number;
  totalPeriodDays: number;
  upgradeNetMinor: number;
}

export interface BillingUpgradeResult extends BillingCheckoutResult {
  proration: BillingProrationBreakdown;
}

export interface BillingPaymentCaptureResult {
  invoice: BillingInvoiceRecord;
  payment: BillingPaymentRecord;
  subscription: BillingSubscriptionRecord;
  workspaceId: string;
}

export interface BillingSummary {
  invoices: BillingInvoiceRecord[];
  payments: BillingPaymentRecord[];
  plans: BillingPlanCatalogItem[];
  subscription?: BillingSubscriptionRecord;
  workspaceId: string;
}

export interface AdminBillingOperations {
  invoices: BillingInvoiceRecord[];
  payments: BillingPaymentRecord[];
  subscriptions: BillingSubscriptionRecord[];
}

export interface AdminGatewayReadiness {
  callbackConfigured: boolean;
  code: PaymentGatewayCode;
  credentialKeys: string[];
  dryRun: boolean;
  ready: boolean;
  reasons: string[];
}

export interface AdminBahrainLaunchPlanReadiness {
  checkoutReady: boolean;
  code: Extract<PlanCode, "STARTER" | "GROWTH">;
  currency: "BHD";
  grossMinor: number;
  limitsReady: boolean;
  netMinor: number;
  planActive: boolean;
  priceMinor: number;
  reasons: string[];
  vatMinor: number;
  vatRateBps: number;
}

export interface AdminBahrainLaunchReadiness {
  gatewayReady: boolean;
  gateways: AdminGatewayReadiness[];
  liveReady: boolean;
  planCatalogReady: boolean;
  plans: AdminBahrainLaunchPlanReadiness[];
  reasons: string[];
  requiredGateways: Extract<PaymentGatewayCode, "CREDIMAX" | "BENEFIT">[];
}

export interface AdminModelConfiguration {
  editable: boolean;
  models: Array<{
    key: string;
    source: "database" | "environment";
    updatedAt?: string;
    value?: string;
  }>;
  source: "database" | "environment" | "mixed";
}

export interface PublishReadiness {
  ready: boolean;
  reasons: string[];
  connection: InstagramConnection;
  contentItem?: ContentRecord;
}

export interface PublishingLiveReadiness {
  mode: "dry_run" | "live";
  ready: boolean;
  reasons: string[];
  connection: InstagramConnection;
  requiredEnv: string[];
}

export interface InstagramPublishPayload {
  accountId: string;
  contentItemId: string;
  caption: string;
  contentType: Extract<ContentType, "CAROUSEL" | "POST" | "REEL" | "STORY">;
  mediaUrls: string[];
}

export interface InstagramPublishResult {
  dryRun: boolean;
  instagramPostId?: string;
  payload: InstagramPublishPayload;
  status: "DRY_RUN" | "PUBLISHED";
}

export interface InstagramPublishingLimit {
  quotaDurationSeconds: number;
  quotaTotal: number;
  quotaUsage: number;
}

export interface PublishAttemptRecord {
  contentItemId: string;
  dryRun: boolean;
  publishingLimit?: InstagramPublishingLimit;
  reasons: string[];
  result?: InstagramPublishResult;
  status: "BLOCKED" | "DRY_RUN" | "FAILED" | "PUBLISHED";
}

export interface PublishDueContentResult {
  attempted: number;
  attempts: PublishAttemptRecord[];
}
