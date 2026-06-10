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

export const healthResponseSchema = z.object({
  service: z.enum(["web", "api", "ai"]),
  status: z.enum(["ok", "degraded"]),
  timestamp: z.string().datetime()
});

export type RegisterInput = z.infer<typeof registerSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
