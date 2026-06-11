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
  password: z.string().min(1)
});

export const refreshSessionSchema = z.object({
  refreshToken: z.string().min(1)
});

export const requestEmailVerificationSchema = z.object({
  email: z.string().email()
});

export const verifyEmailSchema = z.object({
  token: z.string().min(32).max(256)
});

export const workspaceIdSchema = z.string().uuid();

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
export const mediaTypeSchema = z.enum(["IMAGE", "VIDEO", "BRAND_ASSET", "AI_GENERATED"]);

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

export const companyOnboardingSchema = z.object({
  name: z.string().min(2).max(160),
  industry: z.string().min(2).max(120),
  size: z.string().min(1).max(80).optional(),
  location: z.string().min(2).max(120),
  languages: nonEmptyStringArraySchema
});

export const storyOnboardingSchema = z.object({
  mission: z.string().min(10).max(2000),
  origin: z.string().max(2000).optional(),
  values: nonEmptyStringArraySchema,
  usp: z.string().min(5).max(1000)
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
    .max(30)
});

export const audienceOnboardingSchema = z.object({
  demographics: z.string().min(2).max(1000),
  interests: nonEmptyStringArraySchema,
  painPoints: nonEmptyStringArraySchema
});

export const competitorsOnboardingSchema = z.object({
  items: z
    .array(
      z.object({
        name: z.string().min(1).max(160),
        instagramHandle: z.string().max(80).optional(),
        notes: z.string().max(1000).optional()
      })
    )
    .min(1)
    .max(20)
});

export const brandOnboardingSchema = z.object({
  logoMediaId: z.string().uuid().optional(),
  colors: nonEmptyStringArraySchema,
  fonts: z.array(z.string().min(1).max(120)).max(12).default([]),
  guidelinesMediaId: z.string().uuid().optional(),
  toneWords: nonEmptyStringArraySchema,
  voiceNotes: z.string().max(1000).optional()
});

export const objectivesOnboardingSchema = z.object({
  goals: nonEmptyStringArraySchema,
  kpiTargets: z.record(z.string(), z.union([z.string(), z.number(), z.boolean()])).default({})
});

export const generateStrategySchema = z.object({
  objective: z.string().min(3).max(500).optional(),
  horizonDays: z.number().int().min(30).max(180).default(90)
});

export const generateContentSchema = z.object({
  topic: z.string().min(3).max(500),
  contentType: contentTypeSchema.default("POST"),
  count: z.number().int().min(1).max(5).default(3),
  strategyId: z.string().uuid().optional()
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

export const healthResponseSchema = z.object({
  service: z.enum(["web", "api", "ai"]),
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string().datetime()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type RefreshSessionInput = z.infer<typeof refreshSessionSchema>;
export type RequestEmailVerificationInput = z.infer<typeof requestEmailVerificationSchema>;
export type VerifyEmailInput = z.infer<typeof verifyEmailSchema>;
export type VaultSectionInput = z.infer<typeof vaultSectionSchema>;
export type UpsertVaultSectionInput = z.infer<typeof upsertVaultSectionSchema>;
export type VaultRagSearchInput = z.infer<typeof vaultRagSearchSchema>;
export type OnboardingModuleInput = z.infer<typeof onboardingModuleSchema>;
export type GenerateStrategyInput = z.infer<typeof generateStrategySchema>;
export type GenerateContentInput = z.infer<typeof generateContentSchema>;
export type UpdateContentInput = z.infer<typeof updateContentSchema>;
export type UpdateContentStatusInput = z.infer<typeof updateContentStatusSchema>;
export type ScheduleContentInput = z.infer<typeof scheduleContentSchema>;
export type ConnectInstagramInput = z.infer<typeof connectInstagramSchema>;
export type RegisterPublicMediaInput = z.infer<typeof registerPublicMediaSchema>;
export type UploadMediaInput = z.infer<typeof uploadMediaSchema>;
export type AttachMediaToContentInput = z.infer<typeof attachMediaToContentSchema>;
