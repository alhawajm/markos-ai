import { randomUUID } from "node:crypto";
import { SignJWT, jwtVerify } from "jose";
import type { InstagramConnection, InstagramOAuthStart, Locale } from "@markos/shared-types";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { connectInstagram } from "./workspace-service";

const oauthStateTtlSeconds = 10 * 60;
const defaultLongLivedExpiresInSeconds = 60 * 24 * 60 * 60;

export interface InstagramOAuthConfig {
  appId: string | undefined;
  appSecret: string | undefined;
  redirectUri: string | undefined;
  authorizeUrl: string;
  tokenUrl: string;
  longLivedTokenUrl: string;
  scopes: string;
  jwtSecret: string;
}

export interface InstagramOAuthCallbackInput {
  code: string;
  state: string;
  config?: InstagramOAuthConfig;
  fetchImpl?: typeof fetch;
}

export interface InstagramOAuthCallbackResult {
  connection: InstagramConnection;
  locale?: Locale;
}

interface InstagramOAuthStateClaims {
  workspaceId: string;
  userId: string;
  nonce: string;
  locale?: Locale;
}

interface ShortLivedTokenResponse {
  access_token?: string;
  user_id?: number | string;
}

interface LongLivedTokenResponse {
  access_token?: string;
  expires_in?: number;
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
  constructor(message = "Instagram OAuth token exchange failed") {
    super(message);
  }
}

export function getInstagramOAuthConfig(): InstagramOAuthConfig {
  return {
    appId: env.META_APP_ID,
    appSecret: env.META_APP_SECRET,
    redirectUri: env.META_REDIRECT_URI,
    authorizeUrl: env.INSTAGRAM_OAUTH_AUTHORIZE_URL,
    tokenUrl: env.INSTAGRAM_OAUTH_TOKEN_URL,
    longLivedTokenUrl: env.INSTAGRAM_LONG_LIVED_TOKEN_URL,
    scopes: env.INSTAGRAM_OAUTH_SCOPES,
    jwtSecret: env.JWT_ACCESS_SECRET
  };
}

export async function createInstagramOAuthStart(input: {
  workspaceId: string;
  userId: string;
  locale?: Locale;
  config?: InstagramOAuthConfig;
}): Promise<InstagramOAuthStart> {
  const config = input.config ?? getInstagramOAuthConfig();
  const reasons = getConfigurationReasons(config);

  if (reasons.length > 0) {
    throw new InstagramOAuthConfigurationError(reasons);
  }

  const stateExpiresAt = new Date(Date.now() + oauthStateTtlSeconds * 1000);
  const state = await new SignJWT({
    ...(input.locale === undefined ? {} : { locale: input.locale }),
    nonce: randomUUID(),
    userId: input.userId,
    workspaceId: input.workspaceId
  })
    .setProtectedHeader({
      alg: "HS256"
    })
    .setIssuedAt()
    .setExpirationTime(`${oauthStateTtlSeconds}s`)
    .setAudience("instagram-oauth")
    .setIssuer("markos-api")
    .sign(secretKey(config.jwtSecret));

  const authorizationUrl = new URL(config.authorizeUrl);
  authorizationUrl.searchParams.set("client_id", config.appId!);
  authorizationUrl.searchParams.set("redirect_uri", config.redirectUri!);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("scope", config.scopes);
  authorizationUrl.searchParams.set("state", state);

  return {
    authorizationUrl: authorizationUrl.toString(),
    stateExpiresAt: stateExpiresAt.toISOString()
  };
}

export async function completeInstagramOAuth(input: InstagramOAuthCallbackInput): Promise<InstagramOAuthCallbackResult> {
  const config = input.config ?? getInstagramOAuthConfig();
  const reasons = getConfigurationReasons(config);

  if (reasons.length > 0) {
    throw new InstagramOAuthConfigurationError(reasons);
  }

  const claims = await verifyState(input.state, config.jwtSecret);
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: claims.workspaceId,
      deletedAt: null
    },
    select: {
      id: true
    }
  });
  const membership = await prisma.workspaceMember.findFirst({
    where: {
      deletedAt: null,
      userId: claims.userId,
      workspaceId: claims.workspaceId
    },
    select: {
      id: true
    }
  });

  if (!workspace || !membership) {
    throw new InstagramOAuthStateError();
  }

  const fetcher = input.fetchImpl ?? fetch;
  const shortLived = await exchangeShortLivedToken(input.code, config, fetcher);
  const longLived = await exchangeLongLivedToken(shortLived.access_token!, config, fetcher);
  const expiresIn = longLived.expires_in ?? defaultLongLivedExpiresInSeconds;
  const tokenExpiresAt = new Date(Date.now() + expiresIn * 1000);

  const connection = await connectInstagram(claims.workspaceId, {
    accountId: String(shortLived.user_id),
    accessToken: longLived.access_token!,
    tokenExpiresAt: tokenExpiresAt.toISOString()
  });

  return {
    connection,
    ...(claims.locale === undefined ? {} : { locale: claims.locale })
  };
}

function getConfigurationReasons(config: InstagramOAuthConfig): string[] {
  const reasons: string[] = [];

  if (!config.appId) reasons.push("META_APP_ID_MISSING");
  if (!config.appSecret) reasons.push("META_APP_SECRET_MISSING");
  if (!config.redirectUri) reasons.push("META_REDIRECT_URI_MISSING");

  return reasons;
}

async function verifyState(state: string, jwtSecret: string): Promise<InstagramOAuthStateClaims> {
  try {
    const { payload } = await jwtVerify(state, secretKey(jwtSecret), {
      audience: "instagram-oauth",
      issuer: "markos-api"
    });
    const workspaceId = typeof payload.workspaceId === "string" ? payload.workspaceId : undefined;
    const userId = typeof payload.userId === "string" ? payload.userId : undefined;
    const nonce = typeof payload.nonce === "string" ? payload.nonce : undefined;
    const locale = payload.locale === "ar" || payload.locale === "en" ? payload.locale : undefined;

    if (!workspaceId || !userId || !nonce) {
      throw new InstagramOAuthStateError();
    }

    return {
      ...(locale === undefined ? {} : { locale }),
      nonce,
      userId,
      workspaceId
    };
  } catch (error) {
    if (error instanceof InstagramOAuthStateError) {
      throw error;
    }

    throw new InstagramOAuthStateError();
  }
}

async function exchangeShortLivedToken(
  code: string,
  config: InstagramOAuthConfig,
  fetcher: typeof fetch
): Promise<Required<ShortLivedTokenResponse>> {
  const body = new URLSearchParams({
    client_id: config.appId!,
    client_secret: config.appSecret!,
    code,
    grant_type: "authorization_code",
    redirect_uri: config.redirectUri!
  });

  const response = await fetcher(config.tokenUrl, {
    body,
    method: "POST"
  });
  const payload = (await response.json().catch(() => ({}))) as ShortLivedTokenResponse;

  if (!response.ok || !payload.access_token || payload.user_id === undefined) {
    throw new InstagramOAuthExchangeError();
  }

  return {
    access_token: payload.access_token,
    user_id: payload.user_id
  };
}

async function exchangeLongLivedToken(
  shortLivedAccessToken: string,
  config: InstagramOAuthConfig,
  fetcher: typeof fetch
): Promise<Required<Pick<LongLivedTokenResponse, "access_token">> & LongLivedTokenResponse> {
  const url = new URL(config.longLivedTokenUrl);
  url.searchParams.set("grant_type", "ig_exchange_token");
  url.searchParams.set("client_secret", config.appSecret!);
  url.searchParams.set("access_token", shortLivedAccessToken);

  const response = await fetcher(url.toString());
  const payload = (await response.json().catch(() => ({}))) as LongLivedTokenResponse;

  if (!response.ok || !payload.access_token) {
    throw new InstagramOAuthExchangeError("Instagram long-lived token exchange failed");
  }

  return {
    access_token: payload.access_token,
    ...(payload.expires_in === undefined ? {} : { expires_in: payload.expires_in })
  };
}

function secretKey(secret: string): Uint8Array {
  return new TextEncoder().encode(secret);
}
