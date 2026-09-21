import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { createLocalEnvironment, findBusyApplicationPorts, parseDotEnv, validateLocalConfiguration } from "./local-development.mjs";

const rootEnv = {
  AI_BASE_URL: "http://localhost:8000",
  API_BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://markos:markos@localhost:5432/markos",
  EMAIL_PROVIDER: "local",
  INSTAGRAM_ANALYTICS_SYNC_MODE: "dry_run",
  INSTAGRAM_PUBLISH_MODE: "dry_run",
  INTERNAL_SERVICE_TOKEN: "local-service-token",
  MEDIA_STORAGE_DRIVER: "local",
  OPENSEARCH_URL: "http://localhost:9200",
  REDIS_URL: "redis://localhost:6379",
  WEB_BASE_URL: "http://localhost:3000"
};
const aiEnv = {
  INTERNAL_SERVICE_TOKEN: "local-service-token"
};

test("parses dotenv values without exposing comments as data", () => {
  assert.deepEqual(
    parseDotEnv(`
# comment
PLAIN=value
QUOTED="value with spaces"
INLINE=value # explanation
export EXPORTED='kept intact'
`),
    {
      EXPORTED: "kept intact",
      INLINE: "value",
      PLAIN: "value",
      QUOTED: "value with spaces"
    }
  );
});

test("offline development is ready without provider credentials or model slots", () => {
  const result = validateLocalConfiguration({ aiEnv, rootEnv });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.textProvider, "local");
  assert.equal(result.summary.imageProvider, "disabled");
  assert.equal(result.summary.videoProvider, "disabled");
});

test("forces offline providers and disables telemetry despite inherited provider configuration", () => {
  const configured = {
    AI_TEXT_PROVIDER: "openai",
    AI_IMAGE_PROVIDER: "openai",
    AI_VIDEO_PROVIDER: "openai",
    OPENAI_API_KEY: "test-only-key",
    OPENAI_STORE_RESPONSES: "true",
    SENTRY_DSN: "https://example.test/telemetry",
    NEXT_PUBLIC_SENTRY_DSN: "https://example.test/telemetry"
  };
  const environment = createLocalEnvironment({ rootEnv: { ...rootEnv, ...configured }, parentEnv: configured });
  assert.equal(environment.AI_TEXT_PROVIDER, "local");
  assert.equal(environment.AI_IMAGE_PROVIDER, "disabled");
  assert.equal(environment.AI_VIDEO_PROVIDER, "disabled");
  assert.equal(environment.OPENAI_API_KEY, "");
  assert.equal(environment.OPENAI_STORE_RESPONSES, "false");
  assert.equal(environment.SENTRY_DSN, "");
  assert.equal(environment.NEXT_PUBLIC_SENTRY_DSN, "");
  assert.equal(environment.NEXT_TELEMETRY_DISABLED, "1");
  assert.equal(environment.TURBO_TELEMETRY_DISABLED, "1");
});

test("validates inherited service overrides rather than only the dotenv values", () => {
  const environment = createLocalEnvironment({ rootEnv, parentEnv: { DATABASE_URL: "postgresql://user:secret@hosted.example/markos" } });
  const result = validateLocalConfiguration({ aiEnv, rootEnv: environment });
  assert.ok(result.errors.includes("DATABASE_URL must point to this PC, not a hosted service."));
});

test("rejects a hosted browser API endpoint", () => {
  const result = validateLocalConfiguration({ aiEnv, rootEnv: { ...rootEnv, NEXT_PUBLIC_API_BASE_URL: "https://api.example.test" } });
  assert.ok(result.errors.includes("NEXT_PUBLIC_API_BASE_URL must point to this PC, not a hosted service."));
});

test("rejects hosted databases and mismatched internal tokens", () => {
  const result = validateLocalConfiguration({
    aiEnv: { ...aiEnv, INTERNAL_SERVICE_TOKEN: "different-token" },
    rootEnv: { ...rootEnv, DATABASE_URL: "postgresql://user:secret@hosted.example/markos" }
  });

  assert.ok(result.errors.includes("DATABASE_URL must point to this PC, not a hosted service."));
  assert.ok(result.errors.includes("INTERNAL_SERVICE_TOKEN must be non-placeholder and identical in .env and services/ai/.env."));
});

test("rejects external email, storage and Instagram behavior in offline development", () => {
  const result = validateLocalConfiguration({
    aiEnv,
    rootEnv: {
      ...rootEnv,
      EMAIL_PROVIDER: "sendgrid",
      MEDIA_STORAGE_DRIVER: "s3",
      INSTAGRAM_PUBLISH_MODE: "live"
    }
  });

  assert.ok(result.errors.includes("EMAIL_PROVIDER must remain local for offline development."));
  assert.ok(result.errors.includes("MEDIA_STORAGE_DRIVER must remain local for offline development."));
  assert.ok(result.errors.includes("Instagram publishing and analytics must remain in dry-run mode locally."));
});

test("detects an application port already owned by another process", async (context) => {
  const server = createServer();
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  context.after(() => server.close());

  const address = server.address();
  assert.notEqual(address, null);
  assert.equal(typeof address, "object");
  if (address === null || typeof address === "string") return;

  assert.deepEqual(await findBusyApplicationPorts([{ name: "test", port: address.port }]), [{ name: "test", port: address.port }]);
});
