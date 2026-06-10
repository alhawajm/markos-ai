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

export const healthResponseSchema = z.object({
  service: z.enum(["web", "api", "ai"]),
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string().datetime()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type VaultSectionInput = z.infer<typeof vaultSectionSchema>;
export type UpsertVaultSectionInput = z.infer<typeof upsertVaultSectionSchema>;
export type VaultRagSearchInput = z.infer<typeof vaultRagSearchSchema>;
export type OnboardingModuleInput = z.infer<typeof onboardingModuleSchema>;
