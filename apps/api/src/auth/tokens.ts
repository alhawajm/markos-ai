import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@markos/shared-types";
import { z } from "zod";
import { createRedisClient } from "../cache/redis";
import { env } from "../config/env";

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
const accessClaimsSchema = z.object({
  mfaVerified: z.boolean().default(false),
  sub: z.string().uuid(),
  workspaceId: z.string().uuid(),
  roles: z.array(z.string()).min(1)
});
const refreshClaimsSchema = accessClaimsSchema.extend({
  jti: z.string().uuid()
});

export interface TokenInput {
  userId: string;
  workspaceId: string;
  roles: Role[];
  mfaVerified?: boolean;
}

export async function issueAuthTokens(input: TokenInput): Promise<{
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
}> {
  const refreshJti = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const accessToken = await new SignJWT({
    mfaVerified: input.mfaVerified ?? false,
    workspaceId: input.workspaceId,
    roles: input.roles
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + env.JWT_ACCESS_TTL)
    .sign(accessSecret);

  const refreshToken = await new SignJWT({
    mfaVerified: input.mfaVerified ?? false,
    workspaceId: input.workspaceId,
    roles: input.roles,
    jti: refreshJti
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + env.JWT_REFRESH_TTL)
    .sign(refreshSecret);

  await storeRefreshToken(input.userId, refreshJti);

  return {
    accessToken,
    refreshToken,
    refreshJti
  };
}

export async function verifyAccessToken(token: string): Promise<TokenInput> {
  const result = await jwtVerify(token, accessSecret);
  const claims = accessClaimsSchema.parse(result.payload);

  return {
    userId: claims.sub,
    workspaceId: claims.workspaceId,
    mfaVerified: claims.mfaVerified,
    roles: claims.roles as Role[]
  };
}

export class RefreshTokenInvalidError extends Error {
  constructor(message = "Refresh token is invalid or expired") {
    super(message);
  }
}

export class RefreshTokenReuseDetectedError extends Error {
  constructor() {
    super("Refresh token reuse detected");
  }
}

export async function consumeRefreshToken(token: string): Promise<TokenInput> {
  let claims: z.infer<typeof refreshClaimsSchema>;

  try {
    const result = await jwtVerify(token, refreshSecret);
    claims = refreshClaimsSchema.parse(result.payload);
  } catch {
    throw new RefreshTokenInvalidError();
  }

  const redis = createRedisClient();

  try {
    await redis.connect();
    const key = refreshTokenKey(claims.sub, claims.jti);
    const consumed = await redis.del(key);

    if (consumed !== 1) {
      await revokeRefreshTokenFamily(redis, claims.sub);
      throw new RefreshTokenReuseDetectedError();
    }
  } finally {
    redis.disconnect();
  }

  return {
    userId: claims.sub,
    workspaceId: claims.workspaceId,
    mfaVerified: claims.mfaVerified,
    roles: claims.roles as Role[]
  };
}

export async function revokeRefreshToken(token: string): Promise<void> {
  let claims: z.infer<typeof refreshClaimsSchema>;

  try {
    const result = await jwtVerify(token, refreshSecret);
    claims = refreshClaimsSchema.parse(result.payload);
  } catch {
    return;
  }

  const redis = createRedisClient();

  try {
    await redis.connect();
    await redis.del(refreshTokenKey(claims.sub, claims.jti));
  } finally {
    redis.disconnect();
  }
}

async function storeRefreshToken(userId: string, refreshJti: string): Promise<void> {
  const redis = createRedisClient();

  try {
    await redis.connect();
    await redis.set(refreshTokenKey(userId, refreshJti), "active", "EX", env.JWT_REFRESH_TTL);
  } finally {
    redis.disconnect();
  }
}

function refreshTokenKey(userId: string, refreshJti: string): string {
  return `refresh:${userId}:${refreshJti}`;
}

async function revokeRefreshTokenFamily(redis: ReturnType<typeof createRedisClient>, userId: string): Promise<void> {
  const stream = redis.scanStream({
    match: `refresh:${userId}:*`,
    count: 100
  });
  const pipeline = redis.pipeline();
  let pendingDeletes = 0;

  for await (const keys of stream) {
    for (const key of keys as string[]) {
      pipeline.del(key);
      pendingDeletes += 1;
    }
  }

  if (pendingDeletes > 0) {
    await pipeline.exec();
  }
}
