import { PassThrough } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import { InstagramProviderError } from "../src/workspace/instagram-basic-client";
import { classifyInstagramOAuthProviderFailure } from "../src/workspace/instagram-oauth-service";
import {
  classifyDatabaseFailure,
  INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT,
  INSTAGRAM_OAUTH_FAILURE_STAGES,
  reportInstagramOAuthCallbackFailure,
} from "../src/workspace/instagram-oauth-telemetry";

describe("Instagram OAuth safe diagnostics", () => {
  it.each([
    ["timeout", "short_lived_token_exchange", "provider_timeout", true],
    ["network", "short_lived_token_exchange", "provider_network_error", true],
    ["http", "short_lived_token_exchange", "provider_http_error", true],
    [
      "response_not_json",
      "short_lived_token_response_validation",
      "provider_response_not_json",
      false,
    ],
    [
      "response_too_large",
      "short_lived_token_response_validation",
      "provider_response_too_large",
      false,
    ],
    [
      "schema",
      "short_lived_token_response_validation",
      "provider_response_schema_invalid",
      false,
    ],
  ] as const)(
    "classifies %s provider failures",
    (kind, stage, category, retryable) => {
      const failure = classifyInstagramOAuthProviderFailure(
        "short_lived_token_exchange",
        "short_lived_token_response_validation",
        new InstagramProviderError(kind, false, { retryable }),
      );
      expect(failure.diagnostic).toMatchObject({ stage, category, retryable });
    },
  );

  it.each([
    [
      { code: "P2002", message: "CANARY" },
      "database_unique_constraint",
      false,
      "P2002",
    ],
    [
      { code: "P2003", meta: { CANARY: true } },
      "database_foreign_key_constraint",
      false,
      "P2003",
    ],
    [{ code: "P2034" }, "database_transaction_conflict", true, "P2034"],
    [
      { code: "EVIL", message: "CANARY" },
      "database_unknown_failure",
      false,
      undefined,
    ],
  ] as const)(
    "safely classifies database failures",
    (error, category, retryable, databaseCode) => {
      expect(classifyDatabaseFailure(error)).toEqual({
        category,
        retryable,
        ...(databaseCode ? { databaseCode } : {}),
      });
    },
  );

  it("declares a unique low-cardinality stage taxonomy", () => {
    expect(new Set(INSTAGRAM_OAUTH_FAILURE_STAGES).size).toBe(
      INSTAGRAM_OAUTH_FAILURE_STAGES.length,
    );
    expect(INSTAGRAM_OAUTH_FAILURE_STAGES).toContain("connection_upsert");
    expect(INSTAGRAM_OAUTH_FAILURE_STAGES).not.toContain(
      "credential_persistence" as never,
    );
  });

  it("serializes only allowlisted fields under adversarial input", async () => {
    const stream = new PassThrough();
    let serialized = "";
    stream.on("data", (chunk) => {
      serialized += chunk.toString();
    });
    const logger = pino({ level: "warn" }, stream);
    const canaries = [
      "CANARY_CODE",
      "CANARY_STATE",
      "CANARY_TOKEN",
      "CANARY_PROVIDER_BODY",
      "CANARY_PRISMA_MESSAGE",
      "CANARY_META",
      "CANARY_SQL",
      "CANARY_STACK",
      "CANARY_CAUSE",
      "CANARY_USER",
      "CANARY_WORKSPACE",
      "CANARY_ACCOUNT",
      "CANARY_USERNAME",
    ];
    reportInstagramOAuthCallbackFailure({
      logger,
      requestId: "safe-request-id",
      diagnostic: {
        stage: "connection_upsert",
        category: "database_unique_constraint",
        retryable: false,
        databaseCode: "P2002",
        providerErrorType: canaries.join(""),
      },
      ...Object.fromEntries(
        canaries.map((value, index) => [`unsafe${index}`, value]),
      ),
    });
    await new Promise<void>((resolve) => stream.end(resolve));
    expect(serialized).toContain(INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT);
    expect(serialized).toContain('"databaseCode":"P2002"');
    for (const canary of canaries) expect(serialized).not.toContain(canary);
  });

  it("never lets logger failure change request behavior", () => {
    expect(() =>
      reportInstagramOAuthCallbackFailure({
        logger: {
          warn: vi.fn(() => {
            throw new Error("down");
          }),
        },
        requestId: "safe",
        diagnostic: {
          stage: "audit_insert",
          category: "database_unknown_failure",
          retryable: false,
        },
      }),
    ).not.toThrow();
  });
});
