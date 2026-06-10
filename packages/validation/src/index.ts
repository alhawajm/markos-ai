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
