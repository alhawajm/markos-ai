import type {
  InstagramConnection,
  InstagramOAuthStart,
  Locale,
} from "@markos/shared-types";
import { env } from "../config/env";
import {
  consumeOAuthState,
  issueOAuthState,
  OAuthStateError,
  verifyOAuthState,
} from "../security/oauth-state";
import { createPrismaOAuthStateStore } from "../security/prisma-oauth-state-store";
import {
  InstagramBasicClient,
  InstagramProviderError,
} from "./instagram-basic-client";
import { persistInstagramConnection } from "./instagram-connection-service";
import {
  INSTAGRAM_AUTHORIZATION_URL,
  INSTAGRAM_REQUESTED_SCOPES,
  canonicalRedirectUri,
} from "./instagram-provider";
import {
  classifyDatabaseFailure,
  InstagramOAuthDiagnosticError,
  type InstagramOAuthFailureDiagnostic,
  type InstagramOAuthFailureStage,
} from "./instagram-oauth-telemetry";

export interface InstagramOAuthConfig {
  appId?: string | undefined;
  appSecret?: string | undefined;
  redirectUri?: string | undefined;
  stateSecret?: string | undefined;
  authorizeUrl?: string;
  tokenUrl?: string;
  longLivedTokenUrl?: string;
  scopes?: string;
  jwtSecret?: string;
}
export class InstagramOAuthConfigurationError extends Error {
  constructor(readonly reasons: string[]) {
    super("Instagram OAuth is not configured");
  }
}
export class InstagramOAuthStateError extends Error {
  constructor(
    readonly diagnostic: InstagramOAuthFailureDiagnostic = {
      stage: "state_verification",
      category: "state_malformed",
      retryable: false,
    },
  ) {
    super("Instagram OAuth state is invalid or expired");
  }
}
export class InstagramOAuthExchangeError extends Error {
  constructor(
    readonly diagnostic: InstagramOAuthFailureDiagnostic = {
      stage: "short_lived_token_exchange",
      category: "provider_exchange_failed",
      retryable: false,
    },
    cause?: unknown,
  ) {
    super("Instagram authorization could not be completed", { cause });
  }
}
export interface InstagramOAuthCallbackResult {
  connection: InstagramConnection;
  returnTo: string;
}

export function getInstagramOAuthConfig(): InstagramOAuthConfig {
  return {
    appId: env.INSTAGRAM_APP_ID,
    appSecret: env.INSTAGRAM_APP_SECRET,
    redirectUri: env.INSTAGRAM_OAUTH_REDIRECT_URI,
    stateSecret: env.INSTAGRAM_OAUTH_STATE_SECRET,
  };
}

export async function createInstagramOAuthStart(input: {
  workspaceId: string;
  userId: string;
  locale?: Locale;
  returnTo?: string;
  config?: InstagramOAuthConfig;
}): Promise<InstagramOAuthStart> {
  const config = validConfig(input.config ?? getInstagramOAuthConfig());
  const returnTo = input.returnTo ?? `/${input.locale ?? "en"}/app/settings`;
  let state: string;
  try {
    state = await issueOAuthState({
      userId: input.userId,
      workspaceId: input.workspaceId,
      returnTo,
      secret: config.stateSecret,
      store: createPrismaOAuthStateStore(input.userId, input.workspaceId),
    });
  } catch (error) {
    if (
      error instanceof OAuthStateError &&
      error.reason === "return_path_invalid"
    )
      throw new InstagramOAuthDiagnosticError(
        {
          stage: "start_request_validation",
          category: "request_invalid",
          retryable: false,
          validationCode: "RETURN_PATH_INVALID",
        },
        error,
      );
    throw new InstagramOAuthDiagnosticError(
      {
        stage: "oauth_transaction_persistence",
        ...classifyDatabaseFailure(error),
      },
      error,
    );
  }
  let url: URL;
  try {
    url = new URL(INSTAGRAM_AUTHORIZATION_URL);
    url.searchParams.set("client_id", config.appId);
    url.searchParams.set("redirect_uri", config.redirectUri);
    url.searchParams.set("response_type", "code");
    url.searchParams.set("scope", INSTAGRAM_REQUESTED_SCOPES.join(","));
    url.searchParams.set("state", state);
    url.searchParams.set("enable_fb_login", "0");
    url.searchParams.set("force_authentication", "1");
  } catch (error) {
    throw new InstagramOAuthDiagnosticError(
      {
        stage: "authorization_url_construction",
        category: "authorization_url_build_failed",
        retryable: false,
      },
      error,
    );
  }
  return {
    authorizationUrl: url.toString(),
    stateExpiresAt: new Date(Date.now() + 600_000).toISOString(),
  };
}

export async function completeInstagramOAuth(input: {
  code: string;
  state: string;
  config?: InstagramOAuthConfig;
  client?: InstagramBasicClient;
  fetchImpl?: typeof fetch;
  now?: Date;
}): Promise<InstagramOAuthCallbackResult> {
  const config = validConfig(input.config ?? getInstagramOAuthConfig());
  let binding;
  try {
    binding = verifyOAuthState(input.state, config.stateSecret, input.now);
  } catch (error) {
    if (error instanceof OAuthStateError) throw stateError(error);
    throw error;
  }
  try {
    await consumeOAuthState({
      state: input.state,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      secret: config.stateSecret,
      store: createPrismaOAuthStateStore(binding.userId, binding.workspaceId),
      ...(input.now ? { now: input.now } : {}),
    });
  } catch (error) {
    if (error instanceof OAuthStateError) throw stateError(error);
    throw new InstagramOAuthExchangeError(
      {
        stage: "oauth_transaction_consumption",
        ...classifyDatabaseFailure(error),
      },
      error,
    );
  }

  const client = input.client ?? new InstagramBasicClient(input.fetchImpl);
  let short;
  try {
    short = await client.exchangeCode({
      appId: config.appId,
      appSecret: config.appSecret,
      code: input.code,
      redirectUri: config.redirectUri,
    });
  } catch (error) {
    throw classifyInstagramOAuthProviderFailure(
      "short_lived_token_exchange",
      "short_lived_token_response_validation",
      error,
    );
  }
  let long;
  try {
    long = await client.exchangeLongLived(short.accessToken, config.appSecret);
  } catch (error) {
    throw classifyInstagramOAuthProviderFailure(
      "long_lived_token_exchange",
      "long_lived_token_response_validation",
      error,
    );
  }
  let profile;
  try {
    profile = await client.profile(long.accessToken);
  } catch (error) {
    throw classifyInstagramOAuthProviderFailure(
      "profile_fetch",
      "profile_response_validation",
      error,
    );
  }
  // The profile comes from Meta through the long-lived token derived from this
  // validated callback. Meta documents `/me.user_id` as the professional
  // account ID, but does not guarantee that it equals the exchange `user_id`.
  const issuedAt = input.now ?? new Date();
  try {
    const connection = await persistInstagramConnection({
      workspaceId: binding.workspaceId,
      actorId: binding.userId,
      profile,
      accessToken: long.accessToken,
      issuedAt,
      expiresAt: new Date(issuedAt.getTime() + long.expiresIn * 1000),
    });
    return { connection, returnTo: binding.returnTo };
  } catch (error) {
    if (error instanceof InstagramOAuthDiagnosticError)
      throw new InstagramOAuthExchangeError(error.diagnostic, error);
    throw new InstagramOAuthExchangeError(
      {
        stage: "database_transaction_commit",
        category: "database_unknown_failure",
        retryable: false,
      },
      error,
    );
  }
}

export function classifyInstagramOAuthProviderFailure(
  requestStage: InstagramOAuthFailureStage,
  responseStage: InstagramOAuthFailureStage,
  error: unknown,
): InstagramOAuthExchangeError {
  if (error instanceof InstagramProviderError) {
    return new InstagramOAuthExchangeError(
      {
        stage:
          error.kind === "schema" ||
          error.kind === "response_not_json" ||
          error.kind === "response_too_large"
            ? responseStage
            : requestStage,
        category:
          error.kind === "http"
            ? "provider_http_error"
            : error.kind === "network"
              ? "provider_network_error"
              : error.kind === "timeout"
                ? "provider_timeout"
                : error.kind === "response_not_json"
                  ? "provider_response_not_json"
                  : error.kind === "response_too_large"
                    ? "provider_response_too_large"
                    : "provider_response_schema_invalid",
        retryable: error.diagnostic.retryable,
        ...(error.diagnostic.httpStatus === undefined
          ? {}
          : { providerHttpStatus: error.diagnostic.httpStatus }),
        ...(error.diagnostic.errorType === undefined
          ? {}
          : { providerErrorType: error.diagnostic.errorType }),
        ...(error.diagnostic.errorCode === undefined
          ? {}
          : { providerErrorCode: error.diagnostic.errorCode }),
        ...(error.diagnostic.errorSubcode === undefined
          ? {}
          : { providerErrorSubcode: error.diagnostic.errorSubcode }),
      },
      error,
    );
  }
  return new InstagramOAuthExchangeError(
    {
      stage: requestStage,
      category: "provider_client_failure",
      retryable: false,
    },
    error,
  );
}

function stateError(error: OAuthStateError): InstagramOAuthStateError {
  const binding = error.reason === "binding_invalid";
  const consumption =
    error.reason === "already_consumed" ||
    error.reason === "not_found_or_expired";
  return new InstagramOAuthStateError({
    stage: binding
      ? "oauth_transaction_binding"
      : consumption
        ? "oauth_transaction_consumption"
        : "state_verification",
    category:
      error.reason === "signature_invalid"
        ? "state_signature_invalid"
        : error.reason === "expired"
          ? "state_expired"
          : error.reason === "binding_invalid"
            ? "transaction_binding_invalid"
            : error.reason === "already_consumed"
              ? "transaction_already_consumed"
              : error.reason === "not_found_or_expired"
                ? "transaction_not_found_or_expired"
                : "state_malformed",
    retryable: false,
  });
}

export async function cancelInstagramOAuth(
  state: string,
  configInput?: InstagramOAuthConfig,
): Promise<string> {
  const config = validConfig(configInput ?? getInstagramOAuthConfig());
  try {
    const binding = verifyOAuthState(state, config.stateSecret);
    await consumeOAuthState({
      state,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      secret: config.stateSecret,
      store: createPrismaOAuthStateStore(binding.userId, binding.workspaceId),
    });
    return binding.returnTo;
  } catch (error) {
    if (error instanceof OAuthStateError) throw stateError(error);
    throw new InstagramOAuthExchangeError(
      {
        stage: "oauth_transaction_consumption",
        ...classifyDatabaseFailure(error),
      },
      error,
    );
  }
}

function validConfig(config: InstagramOAuthConfig): {
  appId: string;
  appSecret: string;
  redirectUri: string;
  stateSecret: string;
} {
  const reasons: string[] = [];
  if (!config.appId) reasons.push("INSTAGRAM_APP_ID_MISSING");
  if (!config.appSecret) reasons.push("INSTAGRAM_APP_SECRET_MISSING");
  if (!config.redirectUri) reasons.push("INSTAGRAM_OAUTH_REDIRECT_URI_MISSING");
  if (
    !(config.stateSecret ?? config.jwtSecret) ||
    (config.stateSecret ?? config.jwtSecret)!.length < 32
  )
    reasons.push("INSTAGRAM_OAUTH_STATE_SECRET_INVALID");
  if (reasons.length) throw new InstagramOAuthConfigurationError(reasons);
  return {
    appId: config.appId!,
    appSecret: config.appSecret!,
    redirectUri: canonicalRedirectUri(config.redirectUri!),
    stateSecret: config.stateSecret ?? config.jwtSecret!,
  };
}
