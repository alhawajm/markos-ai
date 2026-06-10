import { z } from "zod";

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  AI_BASE_URL: z.string().url().default("http://localhost:8000"),
  DATABASE_URL: z.string().min(1).default("postgresql://markos:markos@localhost:5432/markos"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  OPENSEARCH_URL: z.string().url().default("http://localhost:9200"),
  JWT_ACCESS_SECRET: z.string().min(12).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(12).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),
  LLM_PRIMARY_MODEL: z.string().min(1).default("local-strategy-generator")
});

export const env = envSchema.parse(process.env);

process.env.DATABASE_URL ??= env.DATABASE_URL;
process.env.REDIS_URL ??= env.REDIS_URL;
process.env.OPENSEARCH_URL ??= env.OPENSEARCH_URL;
process.env.AI_BASE_URL ??= env.AI_BASE_URL;
process.env.LLM_PRIMARY_MODEL ??= env.LLM_PRIMARY_MODEL;
