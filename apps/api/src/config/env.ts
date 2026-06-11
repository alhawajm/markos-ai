import { z } from "zod";

const optionalString = z.preprocess((value) => (value === "" ? undefined : value), z.string().min(1).optional());
const optionalUrl = z.preprocess((value) => (value === "" ? undefined : value), z.string().url().optional());

const envSchema = z.object({
  API_PORT: z.coerce.number().int().positive().default(4000),
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
  LLM_PRIMARY_MODEL: z.string().min(1).default("local-strategy-generator"),
  MEDIA_STORAGE_DIR: z.string().min(1).default("var/media"),
  MEDIA_PUBLIC_BASE_URL: z.string().url().optional(),
  META_APP_ID: optionalString,
  META_APP_SECRET: optionalString,
  META_REDIRECT_URI: optionalUrl,
  META_WEBHOOK_VERIFY_TOKEN: optionalString,
  META_GRAPH_BASE_URL: z.string().url().default("https://graph.facebook.com"),
  META_GRAPH_VERSION: z
    .preprocess((value) => (value === "" ? undefined : value), z.string().min(1).default("v24.0")),
  INSTAGRAM_OAUTH_AUTHORIZE_URL: z.string().url().default("https://www.instagram.com/oauth/authorize"),
  INSTAGRAM_OAUTH_TOKEN_URL: z.string().url().default("https://api.instagram.com/oauth/access_token"),
  INSTAGRAM_LONG_LIVED_TOKEN_URL: z.string().url().default("https://graph.instagram.com/access_token"),
  INSTAGRAM_OAUTH_SCOPES: z.string().min(1).default("instagram_business_basic,instagram_business_content_publish"),
  INSTAGRAM_PUBLISH_MODE: z.enum(["dry_run", "live"]).default("dry_run"),
  INSTAGRAM_CONTAINER_POLL_ATTEMPTS: z.coerce.number().int().positive().default(5),
  INSTAGRAM_CONTAINER_POLL_DELAY_MS: z.coerce.number().int().nonnegative().default(1000)
});

export const env = envSchema.parse(process.env);

process.env.DATABASE_URL ??= env.DATABASE_URL;
process.env.REDIS_URL ??= env.REDIS_URL;
process.env.OPENSEARCH_URL ??= env.OPENSEARCH_URL;
process.env.AI_BASE_URL ??= env.AI_BASE_URL;
process.env.LLM_PRIMARY_MODEL ??= env.LLM_PRIMARY_MODEL;
