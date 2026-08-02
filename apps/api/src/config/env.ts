import { z } from "zod";
import "./load-repository-env";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalEncryptionKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z.string().refine((item) => Buffer.from(item, "base64").length === 32, "must encode exactly 32 bytes").optional()
);

export const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
  PORT: z.coerce.number().int().positive().optional(),
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  API_BASE_URL: z.string().url().default("http://localhost:4000"),
  WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
  AI_BASE_URL: z.string().url().default("http://localhost:8000"),
  DATABASE_URL: z.string().min(1).default("postgresql://markos:markos@localhost:5432/markos"),
  REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
  OPENSEARCH_URL: z.string().url().default("http://localhost:9200"),
  JWT_ACCESS_SECRET: z.string().min(12).default("dev-access-secret-change-me"),
  JWT_REFRESH_SECRET: z.string().min(12).default("dev-refresh-secret-change-me"),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),
  EMAIL_VERIFICATION_TTL: z.coerce.number().int().positive().default(86400),
  MFA_ISSUER: z.string().min(1).default("MARKOS-AI"),
  GOOGLE_OAUTH_CLIENT_ID: optionalString,
  GOOGLE_OAUTH_ISSUER: z.string().url().default("https://accounts.google.com"),
  GOOGLE_OAUTH_JWKS_URL: z.string().url().default("https://www.googleapis.com/oauth2/v3/certs"),
  LLM_PRIMARY_MODEL: z.string().min(1).default("local-strategy-generator"),
  MEDIA_STORAGE_DIR: z.string().min(1).default("var/media"),
  MEDIA_PUBLIC_BASE_URL: optionalUrl,
  INSTAGRAM_APP_ID: optionalString,
  INSTAGRAM_APP_SECRET: optionalString,
  INSTAGRAM_OAUTH_REDIRECT_URI: optionalUrl,
  INSTAGRAM_TOKEN_ENCRYPTION_KEY: optionalEncryptionKey,
  INSTAGRAM_OAUTH_STATE_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32).optional()),
  META_APP_SECRET: optionalString,
  META_WEBHOOK_VERIFY_TOKEN: optionalString,
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  META_GRAPH_VERSION: z
    .preprocess((value) => (value === "" ? undefined : value), z.string().min(1).default("v24.0")),
  INSTAGRAM_OAUTH_AUTHORIZE_URL: z.string().url().default("https://www.instagram.com/oauth/authorize"),
  INSTAGRAM_OAUTH_TOKEN_URL: z.string().url().default("https://api.instagram.com/oauth/access_token"),
  INSTAGRAM_LONG_LIVED_TOKEN_URL: z.string().url().default("https://graph.instagram.com/access_token"),
  INSTAGRAM_REFRESH_TOKEN_URL: z.string().url().default("https://graph.instagram.com/refresh_access_token"),
  INSTAGRAM_GRAPH_VERSION: z.string().regex(/^v\d+\.\d+$/).default("v25.0"),
  INSTAGRAM_GRAPH_BASE_URL: z.string().url().default("https://graph.instagram.com/v25.0"),
  INSTAGRAM_OAUTH_SCOPES: z.literal("instagram_business_basic").default("instagram_business_basic"),
  IMAGE_MODEL_PRIMARY: z.string().min(1).default("local-image-generator"),
  IMAGE_MODEL_FALLBACK: optionalString,
  INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
  INSTAGRAM_ANALYTICS_SYNC_MODE: z.enum(["dry_run", "live"]).default("dry_run"),
  INSTAGRAM_PUBLISH_MODE: z.enum(["dry_run", "live"]).default("dry_run"),
  INSTAGRAM_CONTAINER_POLL_ATTEMPTS: z.coerce.number().int().positive().default(5),
  INSTAGRAM_CONTAINER_POLL_DELAY_MS: z.coerce.number().int().nonnegative().default(1000),
  WORKER_PUBLISHING_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
  WORKER_ANALYTICS_EMAIL_INTERVAL_MS: z.coerce.number().int().positive().default(24 * 60 * 60_000),
  WORKER_ANALYTICS_SYNC_INTERVAL_MS: z.coerce.number().int().positive().default(6 * 60 * 60_000),
  WORKER_TOKEN_REFRESH_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 60_000),
  WORKER_USAGE_RESET_INTERVAL_MS: z.coerce.number().int().positive().default(60 * 60_000),
  SENTRY_DSN: optionalUrl,
  SENTRY_ENVIRONMENT: optionalString,
  SENTRY_RELEASE: optionalString,
  SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
  HEALTH_DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().positive().default(1_000),
  HEALTH_DATABASE_TIMEOUT_MS: z.coerce.number().int().positive().default(1_000),
  HEALTH_REDIS_TIMEOUT_MS: z.coerce.number().int().positive().default(1_000),
  HEALTH_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(200)
});

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  return envSchema.parse(input);
}

export const env = parseEnvironment(process.env);

process.env.DATABASE_URL ??= env.DATABASE_URL;
process.env.REDIS_URL ??= env.REDIS_URL;
process.env.OPENSEARCH_URL ??= env.OPENSEARCH_URL;
process.env.AI_BASE_URL ??= env.AI_BASE_URL;
process.env.LLM_PRIMARY_MODEL ??= env.LLM_PRIMARY_MODEL;
process.env.IMAGE_MODEL_PRIMARY ??= env.IMAGE_MODEL_PRIMARY;
