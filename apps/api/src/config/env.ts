import { z } from "zod";
import "./load-repository-env";
import { INSTAGRAM_GRAPH_VERSION, INSTAGRAM_RELEASE_SCOPES, parseInstagramOAuthScopes } from "./instagram-contract";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());
const optionalEncryptionKey = z.preprocess(
  (value) => (value === "" ? undefined : value),
  z
    .string()
    .refine((item) => Buffer.from(item, "base64").length === 32, "must encode exactly 32 bytes")
    .optional()
);
const instagramOAuthScopes = z
  .string()
  .default(INSTAGRAM_RELEASE_SCOPES.join(","))
  .transform((value, context) => {
    try {
      return parseInstagramOAuthScopes(value);
    } catch (error) {
      context.addIssue({
        code: "custom",
        message: error instanceof Error ? error.message : "Instagram OAuth scopes are invalid"
      });
      return z.NEVER;
    }
  });

export const envSchema = z
  .object({
    API_PORT: z.coerce.number().int().positive().default(4000),
    PORT: z.coerce.number().int().positive().optional(),
    NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
    API_BASE_URL: z.string().url().default("http://localhost:4000"),
    WEB_BASE_URL: z.string().url().default("http://localhost:3000"),
    AI_BASE_URL: z.string().url().default("http://localhost:8000"),
    INTERNAL_SERVICE_TOKEN: z.string().min(1).default("change-me"),
    AI_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().max(180_000).default(130_000),
    AI_VIDEO_MAX_BYTES: z.coerce.number().int().positive().max(250_000_000).default(100_000_000),
    DATABASE_URL: z.string().min(1).default("postgresql://markos:markos@localhost:5432/markos"),
    REDIS_URL: z.string().min(1).default("redis://localhost:6379"),
    OPENSEARCH_URL: z.string().url().default("http://localhost:9200"),
    JWT_ACCESS_SECRET: z.string().min(12).default("dev-access-secret-change-me"),
    JWT_REFRESH_SECRET: z.string().min(12).default("dev-refresh-secret-change-me"),
    JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
    JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),
    MFA_STEP_UP_TTL: z.coerce.number().int().positive().default(900),
    EMAIL_VERIFICATION_TTL: z.coerce.number().int().positive().default(86400),
    EMAIL_PROVIDER: z.enum(["local", "sendgrid"]).default("local"),
    SENDGRID_API_KEY: optionalString,
    FROM_EMAIL: z.preprocess((value) => (value === "" ? undefined : value), z.string().email().optional()),
    MFA_ISSUER: z.string().min(1).default("MARKOS-AI"),
    GOOGLE_OAUTH_CLIENT_ID: optionalString,
    GOOGLE_OAUTH_ISSUER: z.string().url().default("https://accounts.google.com"),
    GOOGLE_OAUTH_JWKS_URL: z.string().url().default("https://www.googleapis.com/oauth2/v3/certs"),
    LLM_PRIMARY_MODEL: z.string().min(1).default("local-markos-generator"),
    LLM_LONGFORM_MODEL: optionalString,
    MEDIA_STORAGE_DRIVER: z.enum(["local", "s3"]).default("local"),
    MEDIA_STORAGE_DIR: z.string().min(1).default("var/media"),
    MEDIA_PUBLIC_BASE_URL: optionalUrl,
    AWS_ENDPOINT_URL: optionalUrl,
    AWS_ACCESS_KEY_ID: optionalString,
    AWS_SECRET_ACCESS_KEY: optionalString,
    AWS_S3_BUCKET_NAME: optionalString,
    AWS_DEFAULT_REGION: optionalString,
    AWS_S3_URL_STYLE: z.preprocess((value) => (value === "" ? undefined : value), z.enum(["virtual", "path"]).optional()),
    SIGNED_URL_TTL: z.coerce.number().int().min(300).max(86_400).default(3_600),
    INSTAGRAM_APP_ID: optionalString,
    INSTAGRAM_APP_SECRET: optionalString,
    INSTAGRAM_OAUTH_REDIRECT_URI: optionalUrl,
    INSTAGRAM_TOKEN_ENCRYPTION_KEY: optionalEncryptionKey,
    INSTAGRAM_OAUTH_STATE_SECRET: z.preprocess((value) => (value === "" ? undefined : value), z.string().min(32).optional()),
    META_WEBHOOK_VERIFY_TOKEN: optionalString,
    INSTAGRAM_OAUTH_AUTHORIZE_URL: z.string().url().default("https://www.instagram.com/oauth/authorize"),
    INSTAGRAM_OAUTH_TOKEN_URL: z.string().url().default("https://api.instagram.com/oauth/access_token"),
    INSTAGRAM_LONG_LIVED_TOKEN_URL: z.string().url().default("https://graph.instagram.com/access_token"),
    INSTAGRAM_REFRESH_TOKEN_URL: z.string().url().default("https://graph.instagram.com/refresh_access_token"),
    INSTAGRAM_GRAPH_VERSION: z.literal(INSTAGRAM_GRAPH_VERSION).default(INSTAGRAM_GRAPH_VERSION),
    INSTAGRAM_OAUTH_SCOPES: instagramOAuthScopes,
    INSTAGRAM_GRAPH_REQUEST_TIMEOUT_MS: z.coerce.number().int().positive().max(60_000).default(15_000),
    INSTAGRAM_GRAPH_MAX_RESPONSE_BYTES: z.coerce.number().int().positive().max(5_000_000).default(262_144),
    IMAGE_MODEL_PRIMARY: z.string().min(1).default("local-image-generator"),
    IMAGE_MODEL_FALLBACK: optionalString,
    INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS: z.coerce.number().int().positive().default(14),
    INSTAGRAM_ANALYTICS_SYNC_MODE: z.enum(["dry_run", "live"]).default("dry_run"),
    INSTAGRAM_PUBLISH_MODE: z.enum(["dry_run", "live"]).default("dry_run"),
    INSTAGRAM_CONTAINER_POLL_ATTEMPTS: z.coerce.number().int().positive().default(6),
    INSTAGRAM_CONTAINER_POLL_DELAY_MS: z.coerce.number().int().nonnegative().default(60_000),
    WORKER_PUBLISHING_INTERVAL_MS: z.coerce.number().int().positive().default(60_000),
    WORKER_ANALYTICS_EMAIL_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(24 * 60 * 60_000),
    WORKER_ANALYTICS_SYNC_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(6 * 60 * 60_000),
    WORKER_TOKEN_REFRESH_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60_000),
    WORKER_USAGE_RESET_INTERVAL_MS: z.coerce
      .number()
      .int()
      .positive()
      .default(60 * 60_000),
    SENTRY_DSN: optionalUrl,
    SENTRY_ENVIRONMENT: optionalString,
    SENTRY_RELEASE: optionalString,
    SENTRY_TRACES_SAMPLE_RATE: z.coerce.number().min(0).max(1).default(0),
    HEALTH_DEPENDENCY_TIMEOUT_MS: z.coerce.number().int().positive().default(1_000),
    HEALTH_DATABASE_TIMEOUT_MS: z.coerce.number().int().positive().default(1_000),
    HEALTH_REDIS_TIMEOUT_MS: z.coerce.number().int().positive().default(1_000),
    HEALTH_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(200)
  })
  .superRefine((value, context) => {
    if (value.MEDIA_STORAGE_DRIVER !== "s3") return;

    for (const key of [
      "AWS_ENDPOINT_URL",
      "AWS_ACCESS_KEY_ID",
      "AWS_SECRET_ACCESS_KEY",
      "AWS_S3_BUCKET_NAME",
      "AWS_DEFAULT_REGION",
      "AWS_S3_URL_STYLE"
    ] as const) {
      if (value[key] === undefined) {
        context.addIssue({
          code: "custom",
          message: `${key} is required when MEDIA_STORAGE_DRIVER=s3`,
          path: [key]
        });
      }
    }

    if (value.AWS_ENDPOINT_URL !== undefined && new URL(value.AWS_ENDPOINT_URL).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "AWS_ENDPOINT_URL must use HTTPS when MEDIA_STORAGE_DRIVER=s3",
        path: ["AWS_ENDPOINT_URL"]
      });
    }

    const publicBaseUrl = value.MEDIA_PUBLIC_BASE_URL ?? value.API_BASE_URL;
    if (new URL(publicBaseUrl).protocol !== "https:") {
      context.addIssue({
        code: "custom",
        message: "MEDIA_PUBLIC_BASE_URL or API_BASE_URL must use HTTPS when MEDIA_STORAGE_DRIVER=s3",
        path: [value.MEDIA_PUBLIC_BASE_URL === undefined ? "API_BASE_URL" : "MEDIA_PUBLIC_BASE_URL"]
      });
    }
  });

export function parseEnvironment(input: NodeJS.ProcessEnv) {
  return envSchema.parse(input);
}

export const env = parseEnvironment(process.env);

process.env.DATABASE_URL ??= env.DATABASE_URL;
process.env.REDIS_URL ??= env.REDIS_URL;
process.env.OPENSEARCH_URL ??= env.OPENSEARCH_URL;
process.env.AI_BASE_URL ??= env.AI_BASE_URL;
process.env.INTERNAL_SERVICE_TOKEN ??= env.INTERNAL_SERVICE_TOKEN;
process.env.LLM_PRIMARY_MODEL ??= env.LLM_PRIMARY_MODEL;
if (env.LLM_LONGFORM_MODEL !== undefined) {
  process.env.LLM_LONGFORM_MODEL ??= env.LLM_LONGFORM_MODEL;
}
process.env.IMAGE_MODEL_PRIMARY ??= env.IMAGE_MODEL_PRIMARY;
