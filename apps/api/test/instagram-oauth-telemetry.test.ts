import { PassThrough } from "node:stream";
import pino from "pino";
import { describe, expect, it, vi } from "vitest";
import {
  InstagramBasicClient,
  InstagramProviderError,
} from "../src/workspace/instagram-basic-client";
import {
  classifyInstagramOAuthProviderFailure,
  InstagramOAuthExchangeError,
  InstagramOAuthStateError,
} from "../src/workspace/instagram-oauth-service";
import {
  INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT,
  reportInstagramOAuthCallbackFailure,
  type InstagramOAuthFailureStage,
} from "../src/workspace/instagram-oauth-telemetry";

describe("Instagram OAuth callback diagnostics", () => {
  it.each([
    "short_lived_token_exchange",
    "long_lived_token_exchange",
    "profile_retrieval",
  ] as const)("assigns provider failures to %s", (stage) => {
    const failure = classifyInstagramOAuthProviderFailure(
      stage,
      new InstagramProviderError(false, {
        httpStatus: 503,
        errorType: "OAuthException",
        errorCode: 190,
        errorSubcode: 463,
        retryable: true,
      }),
    );
    expect(failure.diagnostic).toEqual({
      stage,
      category: "provider_request_failed",
      providerHttpStatus: 503,
      providerErrorType: "OAuthException",
      providerErrorCode: 190,
      providerErrorSubcode: 463,
      retryable: true,
    });
  });

  it("defines safe state, account validation, and persistence categories", () => {
    expect(new InstagramOAuthStateError().diagnostic.stage).toBe(
      "state_validation",
    );
    expect(
      new InstagramOAuthStateError({
        stage: "state_consumption",
        category: "oauth_state_invalid_or_consumed",
        retryable: false,
      }).diagnostic.stage,
    ).toBe("state_consumption");
    for (const stage of [
      "provider_account_validation",
      "credential_persistence",
    ] satisfies InstagramOAuthFailureStage[]) {
      expect(
        new InstagramOAuthExchangeError({
          stage,
          category: "safe_category",
          retryable: false,
        }).diagnostic.stage,
      ).toBe(stage);
    }
  });

  it("retains allowlisted provider identifiers without retaining its raw response", async () => {
    const raw = "SENTINEL_RAW_PROVIDER_RESPONSE";
    const client = new InstagramBasicClient(
      async () =>
        new Response(
          JSON.stringify({
            error: {
              type: "OAuthException",
              code: 190,
              error_subcode: 463,
              message: raw,
            },
          }),
          { status: 401 },
        ),
    );
    const error = await client
      .profile("SENTINEL_ACCESS_TOKEN")
      .catch((value: unknown) => value);
    expect(error).toBeInstanceOf(InstagramProviderError);
    expect((error as InstagramProviderError).diagnostic).toEqual({
      httpStatus: 401,
      errorType: "OAuthException",
      errorCode: 190,
      errorSubcode: 463,
      retryable: false,
    });
    expect(JSON.stringify(error)).not.toContain(raw);
  });

  it("serializes only allowlisted fields and survives logger failure", async () => {
    const stream = new PassThrough();
    let serialized = "";
    stream.on("data", (chunk) => {
      serialized += chunk.toString();
    });
    const logger = pino({ level: "warn" }, stream);
    const unsafe = {
      authorizationCode: "SENTINEL_AUTHORIZATION_CODE",
      shortToken: "SENTINEL_SHORT_TOKEN",
      longToken: "SENTINEL_LONG_TOKEN",
      appSecret: "SENTINEL_APP_SECRET",
      oauthState: "SENTINEL_OAUTH_STATE",
      encryptionKey: "SENTINEL_ENCRYPTION_KEY",
      rawProviderResponse: "SENTINEL_RAW_PROVIDER_RESPONSE",
      callbackQuery: "?code=SENTINEL_CALLBACK_QUERY",
    };
    reportInstagramOAuthCallbackFailure({
      logger,
      requestId: "safe-request-id",
      diagnostic: {
        stage: "profile_retrieval",
        category: "provider_request_failed",
        retryable: false,
        providerHttpStatus: 400,
        providerErrorCode: 190,
      },
      ...unsafe,
    });
    await new Promise<void>((resolve) => stream.end(resolve));

    expect(serialized).toContain(INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT);
    expect(serialized).toContain("safe-request-id");
    expect(serialized).toContain("profile_retrieval");
    for (const sentinel of Object.values(unsafe))
      expect(serialized).not.toContain(sentinel);

    expect(() =>
      reportInstagramOAuthCallbackFailure({
        logger: {
          warn: vi.fn(() => {
            throw new Error("logger down");
          }),
        },
        requestId: "safe-request-id",
        diagnostic: {
          stage: "credential_persistence",
          category: "unexpected_internal_failure",
          retryable: false,
        },
      }),
    ).not.toThrow();
  });
});
