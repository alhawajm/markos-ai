import { z } from "zod";

export const localeSchema = z.enum(["ar", "en"]);

export const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(12),
  fullName: z.string().min(2).max(120),
  workspaceName: z.string().min(2).max(120).optional(),
  locale: localeSchema.default("ar")
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1),
  totpCode: z.string().regex(/^\d{6}$/).optional()
});

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1)
});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
  workspaceName: z.string().min(2).max(120).optional(),
  locale: localeSchema.default("ar"),
  totpCode: z.string().regex(/^\d{6}$/).optional()
});

export const enableMfaTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

export const requestEmailVerificationSchema = z.object({
  email: z.string().email()
});

export const verifyEmailSchema = z.object({
  token: z.string().min(32).max(256)
});

export const workspaceIdSchema = z.string().uuid();
export const planCodeSchema = z.enum(["STARTER", "GROWTH", "PREMIUM", "ENTERPRISE"]);
export const paymentGatewayCodeSchema = z.enum(["CREDIMAX", "BENEFIT", "STRIPE"]);

export const vaultSectionSchema = z.enum([
  "COMPANY",
  "STORY",
  "PRODUCTS",
  "AUDIENCE",
  "COMPETITORS",
  "BRAND",
  "TONE",
  "OBJECTIVES"
]);

export const contentTypeSchema = z.enum(["POST", "CAROUSEL", "STORY", "REEL"]);
export const contentStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED"]);
export const campaignStatusSchema = z.enum(["DRAFT", "GENERATED", "IN_REVIEW", "APPROVED", "SCHEDULED", "ARCHIVED"]);
export const mediaTypeSchema = z.enum(["IMAGE", "VIDEO", "BRAND_ASSET", "AI_GENERATED"]);
export const visualModeSchema = z.enum(["PRODUCT_PHOTO", "LIFESTYLE_STORY", "AD_CREATIVE", "BACKGROUND_VARIANT"]);
export const generatedMediaStatusSchema = z.enum(["PENDING_REVIEW", "APPROVED", "REJECTED"]);
export const productStatusSchema = z.enum(["ACTIVE", "ARCHIVED"]);
export const offerStatusSchema = z.enum(["ACTIVE", "PAUSED", "EXPIRED", "ARCHIVED"]);
export const agentNameSchema = z.enum([
  "MARKETING_STRATEGIST",
  "CONTENT_PLANNER",
  "CONTENT_CREATOR",
  "REEL_SCRIPT",
  "IMAGE_PROMPT",
  "ANALYTICS_CONSULTANT",
  "RECOMMENDATION_ENGINE",
  "BUSINESS_GROWTH_ADVISOR"
]);
export const promptAgentSchema = z.enum([
  "STRATEGIST",
  "CONTENT",
  "IMAGE",
  "MARKETING_STRATEGIST",
  "CONTENT_PLANNER",
  "CONTENT_CREATOR",
  "REEL_SCRIPT",
  "IMAGE_PROMPT",
  "ANALYTICS_CONSULTANT",
  "RECOMMENDATION_ENGINE",
  "BUSINESS_GROWTH_ADVISOR"
]);

export const vaultValueSchema = z.record(z.string(), z.unknown());

export const upsertVaultSectionSchema = z.object({
  entries: z
    .array(
      z.object({
        key: z.string().min(1).max(120),
        value: vaultValueSchema
      })
    )
    .min(1)
    .max(50)
});

export const vaultRagSearchSchema = z.object({
  query: z.string().min(1).max(2000),
  topK: z.number().int().min(1).max(10).default(10),
  section: vaultSectionSchema.optional()
});

export const vaultWebsiteIngestPreviewSchema = z.object({
  url: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://") || value.startsWith("http://"), {
      message: "Website URL must use HTTP or HTTPS"
    })
});

export const vaultWebsiteIngestCandidateSchema = z.object({
  section: vaultSectionSchema,
  key: z.string().min(1).max(120),
  value: vaultValueSchema,
  confidence: z.number().min(0).max(1),
  sourceUrl: z.string().url(),
  extractedAt: z.string().datetime(),
  sourceSnippet: z.string().max(500).optional()
});

export const vaultWebsiteIngestApproveSchema = z.object({
  candidates: z.array(vaultWebsiteIngestCandidateSchema).min(1).max(20).optional()
});

export const vaultWebsiteIngestRejectSchema = z.object({
  reason: z.string().max(500).optional()
});

export const vaultWebsiteIngestParamsSchema = z.object({
  draftId: z.string().uuid()
});

export const onboardingModuleSchema = z.enum([
  "company",
  "story",
  "products",
  "audience",
  "competitors",
  "brand",
  "objectives"
]);

const nonEmptyStringArraySchema = z.array(z.string().min(1).max(80)).min(1).max(30);
const optionalCatalogStringArraySchema = z.array(z.string().min(1).max(120)).max(30).default([]);
const currencySchema = z.string().trim().length(3).regex(/^[A-Z]{3}$/).default("BHD");
const catalogMoneySchema = z.number().int().nonnegative().max(10_000_000);

export const catalogProductListQuerySchema = z.object({
  category: z.string().min(1).max(120).optional(),
  q: z.string().min(1).max(120).optional(),
  status: productStatusSchema.optional()
});

export const catalogOfferListQuerySchema = z.object({
  productId: z.string().uuid().optional(),
  q: z.string().min(1).max(120).optional(),
  status: offerStatusSchema.optional()
});

export const createCatalogProductSchema = z.object({
  benefits: optionalCatalogStringArraySchema,
  category: z.string().min(1).max(120).optional(),
  currency: currencySchema,
  description: z.string().max(2000).optional(),
  mediaAssetIds: z.array(z.string().uuid()).max(20).default([]),
  name: z.string().min(1).max(160),
  priceMinor: catalogMoneySchema.optional(),
  salesChannels: optionalCatalogStringArraySchema,
  status: productStatusSchema.default("ACTIVE")
});

export const updateCatalogProductSchema = z
  .object({
    benefits: z.array(z.string().min(1).max(120)).max(30).optional(),
    category: z.string().min(1).max(120).nullable().optional(),
    currency: currencySchema.optional(),
    description: z.string().max(2000).nullable().optional(),
    mediaAssetIds: z.array(z.string().uuid()).max(20).optional(),
    name: z.string().min(1).max(160).optional(),
    priceMinor: catalogMoneySchema.nullable().optional(),
    salesChannels: z.array(z.string().min(1).max(120)).max(30).optional(),
    status: productStatusSchema.optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one product field is required"
  });

export const createCatalogOfferSchema = z
  .object({
    compareAtPriceMinor: catalogMoneySchema.optional(),
    currency: currencySchema,
    description: z.string().max(2000).optional(),
    endsAt: z.string().datetime().optional(),
    priceMinor: catalogMoneySchema.optional(),
    productId: z.string().uuid().optional(),
    startsAt: z.string().datetime().optional(),
    status: offerStatusSchema.default("ACTIVE"),
    terms: z.string().max(2000).optional(),
    title: z.string().min(1).max(160)
  })
  .refine((value) => value.priceMinor === undefined || value.compareAtPriceMinor === undefined || value.compareAtPriceMinor >= value.priceMinor, {
    message: "Compare-at price must be greater than or equal to offer price"
  })
  .refine((value) => value.startsAt === undefined || value.endsAt === undefined || Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: "Offer end date must be after start date"
  });

export const updateCatalogOfferSchema = z
  .object({
    compareAtPriceMinor: catalogMoneySchema.nullable().optional(),
    currency: currencySchema.optional(),
    description: z.string().max(2000).nullable().optional(),
    endsAt: z.string().datetime().nullable().optional(),
    priceMinor: catalogMoneySchema.nullable().optional(),
    productId: z.string().uuid().nullable().optional(),
    startsAt: z.string().datetime().nullable().optional(),
    status: offerStatusSchema.optional(),
    terms: z.string().max(2000).nullable().optional(),
    title: z.string().min(1).max(160).optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one offer field is required"
  })
  .refine((value) => value.priceMinor == null || value.compareAtPriceMinor == null || value.compareAtPriceMinor >= value.priceMinor, {
    message: "Compare-at price must be greater than or equal to offer price"
  })
  .refine((value) => value.startsAt == null || value.endsAt == null || Date.parse(value.endsAt) > Date.parse(value.startsAt), {
    message: "Offer end date must be after start date"
  });

export const catalogProductParamsSchema = z.object({
  productId: z.string().uuid()
});

export const catalogOfferParamsSchema = z.object({
  offerId: z.string().uuid()
});

export const companyOnboardingSchema = z.object({
  name: z.string().min(2).max(160),
  industry: z.string().min(2).max(120),
  size: z.string().min(1).max(80).optional(),
  location: z.string().min(2).max(120),
  socials: z.array(z.string().min(1).max(160)).max(20).default([]),
  website: z.string().url().optional(),
  languages: nonEmptyStringArraySchema
});

export const storyOnboardingSchema = z.object({
  mission: z.string().min(10).max(2000),
  origin: z.string().max(2000).optional(),
  problemSolved: z.string().max(1000).optional(),
  values: nonEmptyStringArraySchema,
  usp: z.string().min(5).max(1000),
  vision: z.string().max(1000).optional()
});

export const productsOnboardingSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        category: z.string().max(120).optional(),
        priceMinor: z.number().int().nonnegative().optional(),
        currency: z.string().length(3).default("BHD"),
        description: z.string().max(1000).optional()
      })
    )
    .min(1)
    .max(30),
  differentiators: z.array(z.string().min(1).max(160)).max(20).default([]),
  priceRange: z.string().max(120).optional(),
  salesChannels: z.array(z.string().min(1).max(80)).max(12).default([])
});

export const audienceOnboardingSchema = z.object({
  ageRange: z.string().max(80).optional(),
  demographics: z.string().min(2).max(1000),
  genderBreakdown: z.string().max(120).optional(),
  interests: nonEmptyStringArraySchema,
  locations: z.array(z.string().min(1).max(120)).max(20).default([]),
  motivations: z.array(z.string().min(1).max(120)).max(20).default([]),
  painPoints: nonEmptyStringArraySchema
});

export const competitorsOnboardingSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        instagramHandle: z.string().max(80).optional(),
        website: z.string().url().optional(),
        notes: z.string().max(1000).optional()
      })
    )
    .min(1)
    .max(20),
  competitiveAdvantage: z.string().max(1000).optional(),
  doDifferently: z.string().max(1000).optional()
});

export const brandOnboardingSchema = z.object({
  aestheticWords: z.array(z.string().min(1).max(80)).max(20).default([]),
  logoMediaId: z.string().uuid().optional(),
  colors: nonEmptyStringArraySchema,
  fonts: z.array(z.string().min(1).max(120)).max(12).default([]),
  guidelinesMediaId: z.string().uuid().optional(),
  toneWords: nonEmptyStringArraySchema,
  voiceNotes: z.string().max(1000).optional()
});

export const objectivesOnboardingSchema = z.object({
  goals: nonEmptyStringArraySchema,
  budgetRange: z.string().max(120).optional(),
  instagramExperience: z.string().max(120).optional(),
  kpiTargets: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
  success90Days: z.string().max(1000).optional()
});

const catalogGenerationSelectionSchema = {
  offerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional()
};

export const generateStrategySchema = z.object({
  objective: z.string().min(3).max(500).optional(),
  horizonDays: z.number().int().min(30).max(180).default(90),
  ...catalogGenerationSelectionSchema
});

export const generateContentSchema = z.object({
  topic: z.string().min(3).max(500),
  contentType: contentTypeSchema.default("POST"),
  count: z.number().int().min(1).max(5).default(3),
  strategyId: z.string().uuid().optional(),
  ...catalogGenerationSelectionSchema
});

export const generateContentForSlotSchema = z.object({
  topic: z.string().min(3).max(500),
  contentType: contentTypeSchema.default("POST"),
  scheduledAt: z.string().datetime(),
  strategyId: z.string().uuid().optional(),
  ...catalogGenerationSelectionSchema
});

export const campaignBriefSchema = z.object({
  audience: z.string().min(2).max(500).optional(),
  contentCount: z.number().int().min(1).max(8).default(4),
  contentTypes: z.array(contentTypeSchema).min(1).max(4).default(["POST", "CAROUSEL", "REEL", "STORY"]),
  durationDays: z.number().int().min(1).max(30).default(7),
  objective: z.string().min(3).max(700),
  offerId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  startDate: z.string().datetime().optional(),
  tone: z.string().min(2).max(200).optional()
});

export const campaignPackageItemSchema = z
  .object({
    angle: z.string().min(1).max(700),
    contentItemId: z.string().uuid(),
    contentType: contentTypeSchema,
    day: z.number().int().min(1).max(30),
    scheduledAt: z.string().datetime().optional(),
    status: contentStatusSchema
  })
  .strict();

export const campaignPackageSchema = z
  .object({
    angles: z.array(z.string().min(1).max(700)).min(1).max(6),
    items: z.array(campaignPackageItemSchema).min(1).max(8),
    objectives: z
      .array(
        z
          .object({
            label: z.string().min(1).max(120),
            value: z.string().min(1).max(120)
          })
          .strict()
      )
      .min(1)
      .max(4),
    rationale: z.string().min(1).max(2000),
    schedule: z
      .array(
        z
          .object({
            contentItemId: z.string().uuid(),
            day: z.number().int().min(1).max(30),
            scheduledAt: z.string().datetime()
          })
          .strict()
      )
      .min(1)
      .max(8)
  })
  .strict()
  .superRefine((value, context) => {
    const itemIds = new Set(value.items.map((item) => item.contentItemId));
    const scheduleIds = new Set(value.schedule.map((item) => item.contentItemId));

    if (itemIds.size !== value.items.length) {
      context.addIssue({
        code: z.ZodIssueCode.custom,
        message: "Campaign package items must reference unique content items",
        path: ["items"]
      });
    }

    for (const scheduled of scheduleIds) {
      if (!itemIds.has(scheduled)) {
        context.addIssue({
          code: z.ZodIssueCode.custom,
          message: "Campaign schedule can only reference package items",
          path: ["schedule"]
        });
      }
    }
  });

export const generateCampaignPackageSchema = z.object({
  brief: campaignBriefSchema,
  name: z.string().min(2).max(160).optional()
});

export const campaignPackageListQuerySchema = z.object({
  status: campaignStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20)
});

export const campaignParamsSchema = z.object({
  campaignId: z.string().uuid()
});

export const campaignItemParamsSchema = campaignParamsSchema.extend({
  contentItemId: z.string().uuid()
});

export const rejectCampaignItemSchema = z.object({
  reason: z.string().min(3).max(500)
});

export const scheduleCampaignPackageSchema = z.object({
  startDate: z.string().datetime().optional(),
  time: z
    .string()
    .regex(/^\d{2}:\d{2}$/)
    .default("19:30")
});

export const brandBookExportListQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(25).default(10)
});

export const brandBookExportParamsSchema = z.object({
  exportId: z.string().uuid()
});

export const runAgentSchema = z.object({
  agent: agentNameSchema,
  task: z.string().min(3).max(1000),
  locale: localeSchema.default("en"),
  inputs: z.record(z.string(), z.unknown()).optional()
});

export const analyticsDigestSchema = z.object({
  days: z.number().int().min(1).max(90).default(30),
  locale: localeSchema.default("en")
});

export const analyticsChatSchema = z.object({
  days: z.number().int().min(1).max(90).default(30),
  locale: localeSchema.default("en"),
  question: z.string().min(3).max(1000)
});

export const analyticsMonthlyPdfSchema = z.object({
  locale: localeSchema.default("en"),
  month: z
    .string()
    .regex(/^\d{4}-\d{2}$/)
    .refine((value) => {
      const month = Number(value.slice(5, 7));
      return month >= 1 && month <= 12;
    }, "Month must be between 01 and 12")
    .optional()
});

export const analyticsMonthlyEmailSchema = analyticsMonthlyPdfSchema;

export const analyticsLearningSchema = z.object({
  days: z.number().int().min(1).max(90).default(30)
});

export const billingCheckoutSchema = z.object({
  gateway: paymentGatewayCodeSchema.default("CREDIMAX"),
  planCode: planCodeSchema
});

export const billingUpgradeSchema = z.object({
  gateway: paymentGatewayCodeSchema.default("CREDIMAX"),
  targetPlanCode: planCodeSchema
});

export const billingPaymentCaptureParamsSchema = z.object({
  paymentId: z.string().uuid()
});

export const billingInvoiceParamsSchema = z.object({
  invoiceId: z.string().uuid()
});

export const adminUpdatePlanLimitsSchema = z.object({
  limits: z
    .record(z.string().min(1), z.number().int().nonnegative())
    .refine((value) => Object.keys(value).length > 0, {
      message: "At least one plan limit is required"
    })
});

export const adminModelSettingKeySchema = z.enum(["LLM_PRIMARY_MODEL", "IMAGE_MODEL_PRIMARY", "IMAGE_MODEL_FALLBACK"]);

export const adminUpdateModelSettingSchema = z.object({
  value: z.string().min(1).max(200)
});

export const updateContentSchema = z
  .object({
    captionEn: z.string().max(2200).nullable().optional(),
    captionAr: z.string().max(2200).nullable().optional(),
    hashtags: z.array(z.string().min(1).max(80)).max(30).optional(),
    callToAction: z.string().max(500).nullable().optional(),
    contentPillar: z.string().max(160).nullable().optional(),
    carousel: z.record(z.string(), z.unknown()).nullable().optional(),
    reelScript: z.record(z.string(), z.unknown()).nullable().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one content field is required"
  });

export const updateContentStatusSchema = z.object({
  status: z.enum(["DRAFT", "IN_REVIEW", "APPROVED"])
});

export const scheduleContentSchema = z.object({
  scheduledAt: z.string().datetime()
});

export const connectInstagramSchema = z.object({
  accountId: z.string().min(3).max(120),
  accessToken: z.string().min(8).max(4000),
  tokenExpiresAt: z.string().datetime()
});

export const eraseWorkspaceDataSchema = z.object({
  confirm: z.literal("ERASE_WORKSPACE_DATA")
});

export const registerPublicMediaSchema = z.object({
  type: mediaTypeSchema.default("IMAGE"),
  filename: z.string().min(1).max(240),
  publicUrl: z.string().url().refine((value) => value.startsWith("https://"), {
    message: "Public media URL must use HTTPS"
  }),
  mimeType: z.string().min(3).max(120),
  sizeBytes: z.number().int().positive().max(50_000_000).default(1),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
  durationSeconds: z.number().int().positive().max(3600).optional()
});

export const uploadMediaSchema = z.object({
  type: mediaTypeSchema.default("IMAGE"),
  filename: z.string().min(1).max(240),
  mimeType: z.string().min(3).max(120),
  base64Data: z.string().min(1).max(70_000_000),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
  durationSeconds: z.number().int().positive().max(3600).optional()
});

export const attachMediaToContentSchema = z.object({
  mediaAssetId: z.string().uuid()
});

export const generateImageForContentSchema = z.object({
  prompt: z.string().min(3).max(1000).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).default("4:5")
});

export const visualStudioGenerateSchema = z.object({
  prompt: z.string().min(3).max(2000).optional(),
  negativePrompt: z.string().min(3).max(1000).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).default("4:5"),
  visualMode: visualModeSchema.default("LIFESTYLE_STORY"),
  count: z.number().int().min(1).max(4).default(1),
  contentItemId: z.string().uuid().optional(),
  productId: z.string().uuid().optional(),
  offerId: z.string().uuid().optional(),
  sourceMediaAssetIds: z.array(z.string().uuid()).max(8).default([])
});

export const visualStudioVariantListQuerySchema = z.object({
  status: generatedMediaStatusSchema.optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50)
});

export const rejectGeneratedMediaVariantSchema = z.object({
  reason: z.string().min(3).max(500)
});

export const attachGeneratedMediaVariantSchema = z.object({
  contentItemId: z.string().uuid()
});

export const createPromptTemplateSchema = z.object({
  agent: promptAgentSchema,
  version: z.string().min(3).max(120),
  body: z.string().min(10).max(20_000),
  variantOf: z.string().uuid().optional(),
  trafficPct: z.number().int().min(0).max(100).default(100),
  active: z.boolean().default(false)
});

export const updatePromptTemplateSchema = z
  .object({
    body: z.string().min(10).max(20_000).optional(),
    variantOf: z.string().uuid().nullable().optional(),
    trafficPct: z.number().int().min(0).max(100).optional(),
    active: z.boolean().optional()
  })
  .refine((value) => Object.keys(value).length > 0, {
    message: "At least one prompt template field is required"
  });

export const selectPromptVariantSchema = z.object({
  agent: promptAgentSchema,
  seed: z.string().min(1).max(500)
});

export const healthResponseSchema = z.object({
  service: z.enum(["web", "api", "ai"]),
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string().datetime()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type GoogleLoginInput = z.infer<typeof googleLoginSchema>;
export type EnableMfaTotpInput = z.infer<typeof enableMfaTotpSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;
export type RequestEmailVerificationInput = z.infer<typeof requestEmailVerificationSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type VaultSectionInput = z.infer<typeof vaultSectionSchema>;
export type UpsertVaultSectionInput = z.infer<typeof upsertVaultSectionSchema>;
export type VaultRagSearchInput = z.infer<typeof vaultRagSearchSchema>;
export type VaultWebsiteIngestApproveInput = z.infer<typeof vaultWebsiteIngestApproveSchema>;
export type VaultWebsiteIngestCandidateInput = z.infer<typeof vaultWebsiteIngestCandidateSchema>;
export type VaultWebsiteIngestPreviewInput = z.infer<typeof vaultWebsiteIngestPreviewSchema>;
export type VaultWebsiteIngestRejectInput = z.infer<typeof vaultWebsiteIngestRejectSchema>;
export type OnboardingModuleInput = z.infer<typeof onboardingModuleSchema>;
export type GenerateStrategyInput = z.infer<typeof generateStrategySchema>;
export type GenerateContentInput = z.infer<typeof generateContentSchema>;
export type GenerateContentForSlotInput = z.infer<typeof generateContentForSlotSchema>;
export type CampaignBriefInput = z.infer<typeof campaignBriefSchema>;
export type CampaignPackageOutput = z.infer<typeof campaignPackageSchema>;
export type GenerateCampaignPackageInput = z.infer<typeof generateCampaignPackageSchema>;
export type CampaignPackageListQueryInput = z.infer<typeof campaignPackageListQuerySchema>;
export type RejectCampaignItemInput = z.infer<typeof rejectCampaignItemSchema>;
export type ScheduleCampaignPackageInput = z.infer<typeof scheduleCampaignPackageSchema>;
export type BrandBookExportListQueryInput = z.infer<typeof brandBookExportListQuerySchema>;
export type CatalogProductListQueryInput = z.infer<typeof catalogProductListQuerySchema>;
export type CatalogOfferListQueryInput = z.infer<typeof catalogOfferListQuerySchema>;
export type CreateCatalogProductInput = z.infer<typeof createCatalogProductSchema>;
export type UpdateCatalogProductInput = z.infer<typeof updateCatalogProductSchema>;
export type CreateCatalogOfferInput = z.infer<typeof createCatalogOfferSchema>;
export type UpdateCatalogOfferInput = z.infer<typeof updateCatalogOfferSchema>;
export type RunAgentInput = z.infer<typeof runAgentSchema>;
export type AnalyticsMonthlyPdfInput = z.infer<typeof analyticsMonthlyPdfSchema>;
export type AnalyticsMonthlyEmailInput = z.infer<typeof analyticsMonthlyEmailSchema>;
export type AnalyticsLearningInput = z.infer<typeof analyticsLearningSchema>;
export type BillingCheckoutInput = z.infer<typeof billingCheckoutSchema>;
export type BillingUpgradeInput = z.infer<typeof billingUpgradeSchema>;
export type BillingPaymentCaptureParamsInput = z.infer<typeof billingPaymentCaptureParamsSchema>;
export type AdminUpdatePlanLimitsInput = z.infer<typeof adminUpdatePlanLimitsSchema>;
export type AdminModelSettingKeyInput = z.infer<typeof adminModelSettingKeySchema>;
export type AdminUpdateModelSettingInput = z.infer<typeof adminUpdateModelSettingSchema>;
export type CreatePromptTemplateInput = z.infer<typeof createPromptTemplateSchema>;
export type UpdatePromptTemplateInput = z.infer<typeof updatePromptTemplateSchema>;
export type SelectPromptVariantInput = z.infer<typeof selectPromptVariantSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type UpdateContentStatusInput = z.infer<typeof updateContentStatusSchema>;
export type ScheduleContentInput = z.infer<typeof scheduleContentSchema>;
export type ConnectInstagramInput = z.infer<typeof connectInstagramSchema>;
export type EraseWorkspaceDataInput = z.infer<typeof eraseWorkspaceDataSchema>;
export type RegisterPublicMediaInput = z.infer<typeof registerPublicMediaSchema>;
export type UploadMediaInput = z.infer<typeof uploadMediaSchema>;
export type AttachMediaToContentInput = z.infer<typeof attachMediaToContentSchema>;
export type GenerateImageForContentInput = z.infer<typeof generateImageForContentSchema>;
export type VisualStudioGenerateInput = z.infer<typeof visualStudioGenerateSchema>;
export type VisualStudioVariantListQueryInput = z.infer<typeof visualStudioVariantListQuerySchema>;
export type RejectGeneratedMediaVariantInput = z.infer<typeof rejectGeneratedMediaVariantSchema>;
export type AttachGeneratedMediaVariantInput = z.infer<typeof attachGeneratedMediaVariantSchema>;
