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
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
});

export const refreshSessionSchema = z.object({});

export const googleLoginSchema = z.object({
  idToken: z.string().min(1),
  workspaceName: z.string().min(2).max(120).optional(),
  locale: localeSchema.default("ar"),
  totpCode: z
    .string()
    .regex(/^\d{6}$/)
    .optional()
});

export const enableMfaTotpSchema = z.object({
  code: z.string().regex(/^\d{6}$/)
});

export const requestEmailVerificationSchema = z.object({
  email: z.string().email(),
  locale: localeSchema.default("ar")
});

export const verifyEmailSchema = z.object({
  token: z.string().min(32).max(256)
});

export const workspaceIdSchema = z.string().uuid();
export const planCodeSchema = z.enum(["STARTER", "GROWTH", "PREMIUM", "ENTERPRISE"]);
export const paymentGatewayCodeSchema = z.enum(["CREDIMAX", "BENEFIT", "STRIPE"]);

export const vaultSectionSchema = z.enum(["COMPANY", "STORY", "PRODUCTS", "AUDIENCE", "COMPETITORS", "BRAND", "TONE", "OBJECTIVES"]);

export const contentTypeSchema = z.enum(["POST", "CAROUSEL", "STORY", "REEL"]);
export const contentPlatformSchema = z.enum(["INSTAGRAM"]);
export const contentStatusSchema = z.enum(["DRAFT", "IN_REVIEW", "APPROVED", "SCHEDULED", "PUBLISHED", "FAILED"]);
export const mediaTypeSchema = z.enum(["IMAGE", "VIDEO", "BRAND_ASSET", "AI_GENERATED"]);
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

export const onboardingModuleSchema = z.enum(["company", "story", "products", "audience", "competitors", "brand", "objectives"]);

export const onboardingObjectiveFieldLimits = {
  budgetRange: 120,
  instagramExperience: 120,
  success90Days: 1000
} as const;

const nonEmptyStringArraySchema = z.array(z.string().min(1).max(80)).min(1).max(30);

export const companyOnboardingSchema = z.object({
  name: z.string().min(2).max(160),
  industry: z.string().min(2).max(120).optional(),
  size: z.string().min(1).max(80).optional(),
  location: z.string().min(2).max(120).optional(),
  socials: z.array(z.string().min(1).max(160)).max(20).default([]),
  website: z.string().url().optional(),
  languages: z.array(z.string().min(1).max(80)).max(30).default([])
});

export const storyOnboardingSchema = z
  .object({
    mission: z.string().min(2).max(2000).optional(),
    origin: z.string().max(2000).optional(),
    problemSolved: z.string().max(1000).optional(),
    values: z.array(z.string().min(1).max(80)).max(30).default([]),
    usp: z.string().min(2).max(1000).optional(),
    vision: z.string().max(1000).optional()
  })
  .refine(
    (value) =>
      Boolean(value.mission?.trim() || value.origin?.trim() || value.problemSolved?.trim() || value.usp?.trim() || value.vision?.trim() || value.values.length),
    {
      message: "Add at least one story or differentiator detail"
    }
  );

export const productsOnboardingSchema = z
  .object({
    summary: z.string().min(2).max(4000).optional(),
    items: z
      .array(
        z.object({
          kind: z.enum(["PRODUCT", "SERVICE", "UNSPECIFIED"]).optional(),
          name: z.string().min(1).max(160),
          category: z.string().max(120).optional(),
          priceMinor: z.number().int().nonnegative().optional(),
          currency: z.string().length(3).default("BHD"),
          description: z.string().max(1000).optional()
        })
      )
      .max(30)
      .optional(),
    differentiators: z.array(z.string().min(1).max(160)).max(20).optional(),
    priceRange: z.string().max(120).optional(),
    salesChannels: z.array(z.string().min(1).max(80)).max(12).optional()
  })
  .refine((value) => Boolean(value.summary?.trim() || value.items?.length), {
    message: "Add a products and services summary or at least one item"
  })
  .superRefine((value, context) => {
    const names = new Set<string>();
    for (const [index, item] of (value.items ?? []).entries()) {
      const normalized = item.name.normalize("NFKC").trim().toLocaleLowerCase();
      if (names.has(normalized)) {
        context.addIssue({
          code: "custom",
          message: "Product and service names must be unique",
          path: ["items", index, "name"]
        });
      }
      names.add(normalized);
    }
  });

const offeringDocumentMimeTypeSchema = z.enum(["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document", "text/plain"]);
const onboardingDocumentMimeTypeSchema = z.enum([
  "application/pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "text/plain",
  "image/jpeg",
  "image/png",
  "image/webp"
]);

export const createOfferingDocumentAnalysisSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1).max(180),
        mimeType: offeringDocumentMimeTypeSchema,
        base64Data: z.string().min(4).max(11_200_000)
      })
    )
    .min(1)
    .max(2)
});

export const approveOfferingDocumentAnalysisSchema = z.object({
  catalog: productsOnboardingSchema
});

export const createOnboardingDocumentAnalysisSchema = z.object({
  files: z
    .array(
      z.object({
        filename: z.string().min(1).max(180),
        mimeType: onboardingDocumentMimeTypeSchema,
        base64Data: z.string().min(4).max(11_200_000)
      })
    )
    .min(1)
    .max(5)
});

export const audienceOnboardingSchema = z
  .object({
    ageRange: z.string().max(80).optional(),
    demographics: z.string().min(2).max(1000).optional(),
    genderBreakdown: z.string().max(120).optional(),
    interests: z.array(z.string().min(1).max(80)).max(30).default([]),
    locations: z.array(z.string().min(1).max(120)).max(20).default([]),
    motivations: z.array(z.string().min(1).max(120)).max(20).default([]),
    painPoints: z.array(z.string().min(1).max(80)).max(30).default([])
  })
  .refine(
    (value) =>
      Boolean(
        value.demographics?.trim() ||
        value.ageRange?.trim() ||
        value.genderBreakdown?.trim() ||
        value.interests.length ||
        value.locations.length ||
        value.motivations.length ||
        value.painPoints.length
      ),
    { message: "Add at least one audience detail" }
  );

export const competitorsOnboardingSchema = z
  .object({
    marketContext: z.string().max(2000).optional(),
    items: z
      .array(
        z.object({
          name: z.string().min(1).max(160),
          instagramHandle: z.string().max(80).optional(),
          website: z.string().url().optional(),
          notes: z.string().max(1000).optional()
        })
      )
      .max(20)
      .default([]),
    competitiveAdvantage: z.string().max(1000).optional(),
    doDifferently: z.string().max(1000).optional()
  })
  .refine((value) => Boolean(value.marketContext?.trim() || value.items.length || value.competitiveAdvantage?.trim() || value.doDifferently?.trim()), {
    message: "Add at least one market detail"
  });

export const brandOnboardingSchema = z
  .object({
    aestheticWords: z.array(z.string().min(1).max(80)).max(20).default([]),
    logoMediaId: z.string().uuid().optional(),
    colors: z.array(z.string().min(1).max(80)).max(30).default([]),
    fonts: z.array(z.string().min(1).max(120)).max(12).default([]),
    guidelinesMediaId: z.string().uuid().optional(),
    toneWords: z.array(z.string().min(1).max(80)).max(4).default([]),
    voiceNotes: z.string().max(1000).optional()
  })
  .refine(
    (value) =>
      Boolean(
        value.toneWords.length ||
        value.voiceNotes?.trim() ||
        value.aestheticWords.length ||
        value.colors.length ||
        value.fonts.length ||
        value.logoMediaId ||
        value.guidelinesMediaId
      ),
    {
      message: "Add at least one tone or brand detail"
    }
  );

export const objectivesOnboardingSchema = z
  .object({
    currentPriority: z.string().min(2).max(1000).optional(),
    goals: z.array(z.string().min(1).max(80)).max(30).default([]),
    budgetRange: z.string().max(onboardingObjectiveFieldLimits.budgetRange).optional(),
    instagramExperience: z.string().max(onboardingObjectiveFieldLimits.instagramExperience).optional(),
    kpiTargets: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({}),
    success90Days: z.string().max(onboardingObjectiveFieldLimits.success90Days).optional()
  })
  .refine(
    (value) =>
      Boolean(
        value.currentPriority?.trim() ||
        value.goals.length ||
        value.budgetRange?.trim() ||
        value.instagramExperience?.trim() ||
        value.success90Days?.trim() ||
        Object.keys(value.kpiTargets).length
      ),
    {
      message: "Add at least one current priority detail"
    }
  );

export const approveOnboardingDocumentAnalysisSchema = z.object({
  profile: z.object({
    company: companyOnboardingSchema,
    offerings: productsOnboardingSchema,
    story: storyOnboardingSchema.optional(),
    audience: audienceOnboardingSchema.optional(),
    competitors: competitorsOnboardingSchema.optional(),
    brand: brandOnboardingSchema.optional(),
    objectives: objectivesOnboardingSchema.optional()
  })
});

const campaignGenerationDurationSchema = z.union([z.literal(3), z.literal(7), z.literal(14)]);

export const generateCampaignSchema = z.object({
  objective: z.string().min(3).max(500).optional(),
  durationDays: campaignGenerationDurationSchema.default(14),
  publishesPerDay: z.number().int().min(1).max(3).default(1),
  startsAt: z.string().datetime(),
  locale: localeSchema.default("en")
});

const localizedBusinessProfileTextSchema = z
  .object({
    en: z.string().trim().min(1).max(2000),
    ar: z.string().trim().min(1).max(2000)
  })
  .strict();

export const businessProfileSchema = z
  .object({
    businessName: z.string().trim().min(1).max(200),
    tagline: localizedBusinessProfileTextSchema,
    overview: localizedBusinessProfileTextSchema,
    uniqueValue: localizedBusinessProfileTextSchema,
    offerSummary: localizedBusinessProfileTextSchema,
    idealCustomer: localizedBusinessProfileTextSchema,
    marketPosition: localizedBusinessProfileTextSchema,
    brandVoice: localizedBusinessProfileTextSchema,
    marketingFocus: localizedBusinessProfileTextSchema
  })
  .strict();

export const approveBusinessProfileSchema = z
  .object({
    interactionId: z.string().uuid(),
    profile: businessProfileSchema
  })
  .strict();

export const createContentSchema = z
  .object({
    platform: contentPlatformSchema.default("INSTAGRAM"),
    contentType: contentTypeSchema.default("POST"),
    brief: z.string().max(1000).nullable().optional(),
    captionEn: z.string().max(2200).nullable().optional(),
    captionAr: z.string().max(2200).nullable().optional(),
    hashtags: z.array(z.string().min(1).max(80)).max(30).optional(),
    callToAction: z.string().max(500).nullable().optional(),
    contentPillar: z.string().max(160).nullable().optional(),
    campaignGoal: z.string().max(500).nullable().optional(),
    tone: z.string().max(200).nullable().optional(),
    carousel: z.record(z.string(), z.unknown()).nullable().optional(),
    reelScript: z.record(z.string(), z.unknown()).nullable().optional(),
    plannedAt: z.string().datetime().nullable().optional()
  })
  .strict();

export const approveCampaignSuggestionSchema = z
  .object({
    week: z.number().int().min(1),
    actionIndex: z.number().int().min(0)
  })
  .strict();

export const generateContentSchema = z.object({
  topic: z.string().min(3).max(500),
  contentType: contentTypeSchema.default("POST"),
  count: z.number().int().min(1).max(5).default(3),
  campaignId: z.string().uuid().optional()
});

export const ideateContentSchema = z
  .object({
    topic: z.string().trim().min(8).max(1000),
    contentType: contentTypeSchema.default("POST"),
    campaignId: z.string().uuid().optional()
  })
  .strict();

export const generateContentForSlotSchema = z.object({
  topic: z.string().min(3).max(500),
  contentType: contentTypeSchema.default("POST"),
  scheduledAt: z.string().datetime(),
  campaignId: z.string().uuid().optional()
});

export const generateContentForItemSchema = z
  .object({
    topic: z.string().trim().min(3).max(1000),
    contentType: contentTypeSchema
  })
  .strict();

export const reviseContentItemSchema = z
  .object({
    instruction: z.string().trim().min(3).max(1000)
  })
  .strict();

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
  limits: z.record(z.string().min(1), z.number().int().nonnegative()).refine((value) => Object.keys(value).length > 0, {
    message: "At least one plan limit is required"
  })
});

export const adminModelSettingKeySchema = z.enum(["LLM_PRIMARY_MODEL", "LLM_LONGFORM_MODEL", "IMAGE_MODEL_PRIMARY", "IMAGE_MODEL_FALLBACK"]);

export const adminUpdateModelSettingSchema = z.object({
  value: z.string().min(1).max(200)
});

export const updateContentSchema = z
  .object({
    platform: contentPlatformSchema.optional(),
    contentType: contentTypeSchema.optional(),
    brief: z.string().max(1000).nullable().optional(),
    captionEn: z.string().max(2200).nullable().optional(),
    captionAr: z.string().max(2200).nullable().optional(),
    hashtags: z.array(z.string().min(1).max(80)).max(30).optional(),
    callToAction: z.string().max(500).nullable().optional(),
    contentPillar: z.string().max(160).nullable().optional(),
    campaignGoal: z.string().max(500).nullable().optional(),
    tone: z.string().max(200).nullable().optional(),
    carousel: z.record(z.string(), z.unknown()).nullable().optional(),
    reelScript: z.record(z.string(), z.unknown()).nullable().optional(),
    plannedAt: z.string().datetime().nullable().optional()
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

const calendarDateKeySchema = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((value) => {
    const parsed = new Date(`${value}T00:00:00Z`);
    return !Number.isNaN(parsed.getTime()) && parsed.toISOString().slice(0, 10) === value;
  }, "Calendar date must be a real YYYY-MM-DD date");

const calendarStatusesSchema = z
  .string()
  .min(1)
  .max(160)
  .transform((value) => value.split(","))
  .pipe(z.array(contentStatusSchema).min(1).max(6));

const calendarContentTypesSchema = z
  .string()
  .min(1)
  .max(80)
  .transform((value) => value.split(","))
  .pipe(z.array(contentTypeSchema).min(1).max(4));

export const calendarReadQuerySchema = z
  .object({
    from: calendarDateKeySchema,
    to: calendarDateKeySchema,
    statuses: calendarStatusesSchema.optional(),
    contentTypes: calendarContentTypesSchema.optional(),
    unscheduledOffset: z.coerce.number().int().min(0).max(10_000).default(0),
    unscheduledLimit: z.coerce.number().int().min(1).max(50).default(12)
  })
  .strict()
  .superRefine((value, context) => {
    const from = Date.parse(`${value.from}T00:00:00Z`);
    const to = Date.parse(`${value.to}T00:00:00Z`);
    const days = Math.round((to - from) / 86_400_000);

    if (days < 0) {
      context.addIssue({ code: "custom", message: "Calendar range end must not precede its start", path: ["to"] });
    } else if (days > 62) {
      context.addIssue({ code: "custom", message: "Calendar range cannot exceed 63 days", path: ["to"] });
    }
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
  publicUrl: z
    .string()
    .url()
    .refine((value) => value.startsWith("https://"), {
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
  base64Data: z.string().min(1).max(12_000_000),
  width: z.number().int().positive().max(10000).optional(),
  height: z.number().int().positive().max(10000).optional(),
  durationSeconds: z.number().int().positive().max(3600).optional()
});

export const instagramImageConstraints = {
  maxAspectRatio: 1.91,
  maxSizeBytes: 8_000_000,
  maxWidth: 1440,
  minAspectRatio: 4 / 5,
  minWidth: 320
} as const;

export type InstagramImageValidationCode =
  | "INSTAGRAM_PUBLISH_ASPECT_RATIO_UNSUPPORTED"
  | "INSTAGRAM_PUBLISH_IMAGE_DIMENSIONS_REQUIRED"
  | "INSTAGRAM_PUBLISH_IMAGE_SIZE_REQUIRED"
  | "INSTAGRAM_PUBLISH_IMAGE_TOO_LARGE"
  | "INSTAGRAM_PUBLISH_IMAGE_WIDTH_UNSUPPORTED"
  | "INSTAGRAM_PUBLISH_JPEG_REQUIRED";

export function validateInstagramImageMetadata(input: {
  filename: string;
  height?: number | null;
  mimeType: string;
  sizeBytes: number;
  width?: number | null;
}): InstagramImageValidationCode[] {
  const reasons: InstagramImageValidationCode[] = [];
  const extension = input.filename.toLowerCase().match(/\.[a-z0-9]+$/)?.[0];

  if (input.mimeType.toLowerCase() !== "image/jpeg" || (extension !== ".jpg" && extension !== ".jpeg")) {
    reasons.push("INSTAGRAM_PUBLISH_JPEG_REQUIRED");
  }

  if (!Number.isInteger(input.width) || (input.width ?? 0) <= 0 || !Number.isInteger(input.height) || (input.height ?? 0) <= 0) {
    reasons.push("INSTAGRAM_PUBLISH_IMAGE_DIMENSIONS_REQUIRED");
  } else {
    const width = input.width as number;
    const height = input.height as number;
    const aspectRatio = width / height;

    if (width < instagramImageConstraints.minWidth || width > instagramImageConstraints.maxWidth) {
      reasons.push("INSTAGRAM_PUBLISH_IMAGE_WIDTH_UNSUPPORTED");
    }

    if (aspectRatio < instagramImageConstraints.minAspectRatio || aspectRatio > instagramImageConstraints.maxAspectRatio) {
      reasons.push("INSTAGRAM_PUBLISH_ASPECT_RATIO_UNSUPPORTED");
    }
  }

  if (!Number.isInteger(input.sizeBytes) || input.sizeBytes <= 0) {
    reasons.push("INSTAGRAM_PUBLISH_IMAGE_SIZE_REQUIRED");
  } else if (input.sizeBytes > instagramImageConstraints.maxSizeBytes) {
    reasons.push("INSTAGRAM_PUBLISH_IMAGE_TOO_LARGE");
  }

  return reasons;
}

export const attachMediaToContentSchema = z.object({
  mediaAssetId: z.string().uuid()
});

export const generateImageForContentSchema = z.object({
  prompt: z.string().min(3).max(1000).optional(),
  aspectRatio: z.enum(["1:1", "4:5", "9:16"]).default("4:5")
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
export type OnboardingModuleInput = z.infer<typeof onboardingModuleSchema>;
export type BusinessProfileInput = z.infer<typeof businessProfileSchema>;
export type ApproveBusinessProfileInput = z.infer<typeof approveBusinessProfileSchema>;
export type CreateOfferingDocumentAnalysisInput = z.infer<typeof createOfferingDocumentAnalysisSchema>;
export type ApproveOfferingDocumentAnalysisInput = z.infer<typeof approveOfferingDocumentAnalysisSchema>;
export type CreateOnboardingDocumentAnalysisInput = z.infer<typeof createOnboardingDocumentAnalysisSchema>;
export type ApproveOnboardingDocumentAnalysisInput = z.infer<typeof approveOnboardingDocumentAnalysisSchema>;
export type GenerateCampaignInput = z.infer<typeof generateCampaignSchema>;
export type ApproveCampaignSuggestionInput = z.infer<typeof approveCampaignSuggestionSchema>;
export type CreateContentInput = z.infer<typeof createContentSchema>;
export type GenerateContentInput = z.infer<typeof generateContentSchema>;
export type IdeateContentInput = z.infer<typeof ideateContentSchema>;
export type GenerateContentForSlotInput = z.infer<typeof generateContentForSlotSchema>;
export type GenerateContentForItemInput = z.infer<typeof generateContentForItemSchema>;
export type ReviseContentItemInput = z.infer<typeof reviseContentItemSchema>;
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
export type CalendarReadQueryInput = z.infer<typeof calendarReadQuerySchema>;
export type ConnectInstagramInput = z.infer<typeof connectInstagramSchema>;
export type EraseWorkspaceDataInput = z.infer<typeof eraseWorkspaceDataSchema>;
export type RegisterPublicMediaInput = z.infer<typeof registerPublicMediaSchema>;
export type UploadMediaInput = z.infer<typeof uploadMediaSchema>;
export type AttachMediaToContentInput = z.infer<typeof attachMediaToContentSchema>;
export type GenerateImageForContentInput = z.infer<typeof generateImageForContentSchema>;
