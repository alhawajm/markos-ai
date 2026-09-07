import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { findBusyApplicationPorts, parseDotEnv, validateLocalConfiguration } from "./local-development.mjs";

const rootEnv = {
  AI_BASE_URL: "http://localhost:8000",
  API_BASE_URL: "http://localhost:4000",
  DATABASE_URL: "postgresql://markos:markos@localhost:5432/markos",
  EMAIL_PROVIDER: "local",
  INSTAGRAM_ANALYTICS_SYNC_MODE: "dry_run",
  INSTAGRAM_PUBLISH_MODE: "dry_run",
  INTERNAL_SERVICE_TOKEN: "local-service-token",
  LLM_LONGFORM_MODEL: "gpt-5.6-sol",
  LLM_PRIMARY_MODEL: "gpt-5.6-terra",
  MEDIA_STORAGE_DRIVER: "local",
  OPENSEARCH_URL: "http://localhost:9200",
  REDIS_URL: "redis://localhost:6379",
  WEB_BASE_URL: "http://localhost:3000"
};
const aiEnv = {
  INTERNAL_SERVICE_TOKEN: "local-service-token",
  LLM_LONGFORM_MODEL: "gpt-5.6-sol",
  LLM_PRIMARY_MODEL: "gpt-5.6-terra",
  OPENAI_API_KEY: "test-only-key",
  OPENAI_STORE_RESPONSES: "false"
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

test("safe mode is ready without an OpenAI key", () => {
  const result = validateLocalConfiguration({ aiEnv: { ...aiEnv, OPENAI_API_KEY: "" }, mode: "safe", rootEnv });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.textProvider, "local");
  assert.equal(result.summary.imageProvider, "disabled");
});

test("live AI requires a server-only OpenAI key", () => {
  const result = validateLocalConfiguration({ aiEnv: { ...aiEnv, OPENAI_API_KEY: "" }, mode: "live-ai", rootEnv });
  assert.deepEqual(result.errors, ["OPENAI_API_KEY is missing from services/ai/.env."]);
});

test("live AI accepts matching provider model slots", () => {
  const result = validateLocalConfiguration({ aiEnv, mode: "live-ai", rootEnv });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.textProvider, "openai");
});

test("rejects hosted databases and mismatched internal tokens", () => {
  const result = validateLocalConfiguration({
    aiEnv: { ...aiEnv, INTERNAL_SERVICE_TOKEN: "different-token" },
    mode: "safe",
    rootEnv: { ...rootEnv, DATABASE_URL: "postgresql://user:secret@hosted.example/markos" }
  });

  assert.ok(result.errors.includes("DATABASE_URL must point to this PC, not a hosted service."));
  assert.ok(result.errors.includes("INTERNAL_SERVICE_TOKEN must be non-placeholder and identical in .env and services/ai/.env."));
});

test("rejects live email and live Instagram behavior in standard local modes", () => {
  const result = validateLocalConfiguration({
    aiEnv,
    mode: "safe",
    rootEnv: {
      ...rootEnv,
      EMAIL_PROVIDER: "sendgrid",
      INSTAGRAM_PUBLISH_MODE: "live"
    }
  });

  assert.ok(result.errors.includes("EMAIL_PROVIDER must remain local in the two standard development modes."));
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
