import assert from "node:assert/strict";
import { createServer } from "node:net";
import test from "node:test";
import { findBusyApplicationPorts, parseDotEnv, resolveDevelopmentMode, validateLocalConfiguration } from "./local-development.mjs";

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
const railwayEnv = {
  ...rootEnv,
  MARKOS_RUN_MODE: "railway",
  DATABASE_URL: "postgresql://shared-user:secret-pass@127.0.0.1:15432/railway?sslmode=disable",
  AI_BASE_URL: "https://ai.example.test",
  EMAIL_PROVIDER: "sendgrid",
  MEDIA_STORAGE_DRIVER: "s3",
  MEDIA_PUBLIC_BASE_URL: "https://api.example.test",
  AWS_ENDPOINT_URL: "https://storage.example.test",
  AWS_ACCESS_KEY_ID: "test-access-key",
  AWS_SECRET_ACCESS_KEY: "test-secret-key",
  AWS_S3_BUCKET_NAME: "shared-media",
  AWS_DEFAULT_REGION: "test-region",
  AWS_S3_URL_STYLE: "virtual",
  INSTAGRAM_PUBLISH_MODE: "live",
  INSTAGRAM_ANALYTICS_SYNC_MODE: "live",
  MARKOS_RAILWAY_SSH_TARGET: "test-service-instance@ssh.railway.com",
  MARKOS_RAILWAY_SSH_KEY_PATH: "C:\\Local config\\railway-key",
  MARKOS_RAILWAY_SSH_KNOWN_HOSTS_PATH: "C:\\Local config\\known_hosts"
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

test("profile selection keeps safe as the default and allows an explicit override", () => {
  assert.equal(resolveDevelopmentMode(undefined), "safe");
  assert.equal(resolveDevelopmentMode(undefined, { MARKOS_RUN_MODE: "railway" }), "railway");
  assert.equal(resolveDevelopmentMode("safe", { MARKOS_RUN_MODE: "railway" }), "safe");
});

test("Railway uses shared media and hosted AI without local provider credentials", () => {
  const result = validateLocalConfiguration({ rootEnv: railwayEnv });
  assert.deepEqual(result.errors, []);
  assert.equal(result.summary.mode, "railway");
  assert.equal(result.summary.sharedData, true);
  assert.equal(result.summary.worker, "hosted");
  assert.equal(result.summary.textProvider, "hosted AI configuration");
  assert.equal(result.summary.databaseIdentity, "127.0.0.1:15432/railway");
  for (const secret of ["shared-user", "secret-pass", "test-secret-key", "sslmode", railwayEnv.INTERNAL_SERVICE_TOKEN, railwayEnv.MARKOS_RAILWAY_SSH_TARGET]) {
    assert.ok(!JSON.stringify(result).includes(secret));
  }
});

test("Railway does not compare its hosted service token or models to local AI settings", () => {
  const result = validateLocalConfiguration({
    rootEnv: railwayEnv,
    aiEnv: { INTERNAL_SERVICE_TOKEN: "different-local-token", LLM_PRIMARY_MODEL: "local-model" }
  });
  assert.deepEqual(result.errors, []);
});

test("Railway rejects the proof-free local email verifier for shared accounts", () => {
  const result = validateLocalConfiguration({ rootEnv: { ...railwayEnv, EMAIL_PROVIDER: "local" } });
  assert.equal(result.errors.length, 1);
  assert.match(result.errors[0], /Railway mode cannot use EMAIL_PROVIDER=local/u);
  const unconfigured = { ...railwayEnv };
  delete unconfigured.EMAIL_PROVIDER;
  assert.ok(validateLocalConfiguration({ rootEnv: unconfigured }).errors.some((error) => error.includes("EMAIL_PROVIDER=local")));
});

test("Railway requires the dedicated SSH database endpoint and configured SSH files", () => {
  const result = validateLocalConfiguration({
    rootEnv: { ...railwayEnv, DATABASE_URL: rootEnv.DATABASE_URL, MARKOS_RAILWAY_SSH_TARGET: "", MARKOS_RAILWAY_SSH_KEY_PATH: "relative-key" }
  });
  assert.ok(result.errors.some((error) => error.includes("127.0.0.1:15432/railway")));
  assert.ok(result.errors.some((error) => error.startsWith("MARKOS_RAILWAY_SSH_TARGET")));
  assert.ok(result.errors.some((error) => error.startsWith("MARKOS_RAILWAY_SSH_KEY_PATH")));
});

test("Railway requires explicit database configuration rather than the local default", () => {
  const withoutDatabase = { ...railwayEnv };
  delete withoutDatabase.DATABASE_URL;
  const result = validateLocalConfiguration({ rootEnv: withoutDatabase });
  assert.ok(result.errors.some((error) => error.startsWith("DATABASE_URL")));
});

test("Railway validates hosted AI and shared media without echoing credentials", () => {
  const result = validateLocalConfiguration({
    rootEnv: {
      ...railwayEnv,
      AI_BASE_URL: "https://user:private-password@ai.example.test?token=private-token",
      MEDIA_STORAGE_DRIVER: "local",
      AWS_SECRET_ACCESS_KEY: "",
      INTERNAL_SERVICE_TOKEN: ""
    }
  });
  assert.ok(result.errors.some((error) => error.startsWith("AI_BASE_URL")));
  assert.ok(result.errors.some((error) => error.includes("MEDIA_STORAGE_DRIVER=s3")));
  assert.ok(result.errors.some((error) => error.startsWith("AWS_SECRET_ACCESS_KEY")));
  assert.ok(result.errors.some((error) => error.startsWith("INTERNAL_SERVICE_TOKEN")));
  assert.ok(!JSON.stringify(result).includes("private-password"));
  assert.ok(!JSON.stringify(result).includes("private-token"));
});

test("safe and live-ai do not inherit Railway access from configured profile", () => {
  for (const mode of ["safe", "live-ai"]) {
    const result = validateLocalConfiguration({ rootEnv: railwayEnv, aiEnv, mode });
    assert.ok(result.errors.some((error) => error.includes("persistent local markos")));
    assert.ok(result.errors.some((error) => error.includes("MEDIA_STORAGE_DRIVER must remain local")));
  }
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
