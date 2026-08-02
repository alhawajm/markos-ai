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
  constructor() {
    super("Instagram OAuth state is invalid or expired");
  }
}
export class InstagramOAuthExchangeError extends Error {
  constructor() {
    super("Instagram authorization could not be completed");
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
  const state = await issueOAuthState({
    userId: input.userId,
    workspaceId: input.workspaceId,
    returnTo,
    secret: config.stateSecret,
    store: createPrismaOAuthStateStore(input.userId, input.workspaceId),
  });
  const url = new URL(INSTAGRAM_AUTHORIZATION_URL);
  url.searchParams.set("client_id", config.appId);
  url.searchParams.set("redirect_uri", config.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", INSTAGRAM_REQUESTED_SCOPES.join(","));
  url.searchParams.set("state", state);
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
    await consumeOAuthState({
      state: input.state,
      userId: binding.userId,
      workspaceId: binding.workspaceId,
      secret: config.stateSecret,
      store: createPrismaOAuthStateStore(binding.userId, binding.workspaceId),
      ...(input.now ? { now: input.now } : {}),
    });
  } catch (error) {
    if (error instanceof OAuthStateError) throw new InstagramOAuthStateError();
    throw error;
  }

  const client = input.client ?? new InstagramBasicClient(input.fetchImpl);
  try {
    const short = await client.exchangeCode({
      appId: config.appId,
      appSecret: config.appSecret,
      code: input.code,
      redirectUri: config.redirectUri,
    });
    const long = await client.exchangeLongLived(
      short.accessToken,
      config.appSecret,
    );
    const profile = await client.profile(long.accessToken);
    if (profile.userId !== short.accountId)
      throw new InstagramOAuthExchangeError();
    const issuedAt = input.now ?? new Date();
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
    if (error instanceof InstagramOAuthExchangeError) throw error;
    if (error instanceof InstagramProviderError)
      throw new InstagramOAuthExchangeError();
    throw error;
  }
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
  } catch {
    throw new InstagramOAuthStateError();
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
