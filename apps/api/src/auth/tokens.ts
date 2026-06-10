import { randomUUID } from "node:crypto";
import { jwtVerify, SignJWT } from "jose";
import type { Role } from "@markos/shared-types";
import { z } from "zod";
import { createRedisClient } from "../cache/redis";
import { env } from "../config/env";

const accessSecret = new TextEncoder().encode(env.JWT_ACCESS_SECRET);
const refreshSecret = new TextEncoder().encode(env.JWT_REFRESH_SECRET);
const accessClaimsSchema = z.object({
  sub: z.string().uuid(),
  workspaceId: z.string().uuid(),
  roles: z.array(z.string()).min(1)
});

export interface TokenInput {
  userId: string;
  workspaceId: string;
  roles: Role[];
}

export async function issueAuthTokens(input: TokenInput): Promise<{
  accessToken: string;
  refreshToken: string;
  refreshJti: string;
}> {
  const refreshJti = randomUUID();
  const now = Math.floor(Date.now() / 1000);

  const accessToken = await new SignJWT({
    workspaceId: input.workspaceId,
    roles: input.roles
  })
    .setProtectedHeader({ alg: "HS256", typ: "JWT" })
    .setSubject(input.userId)
    .setIssuedAt(now)
    .setExpirationTime(now + env.JWT_ACCESS_TTL)
    .sign(accessSecret);

  const refreshToken = await new SignJWT({
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
    roles: claims.roles as Role[]
  };
}

async function storeRefreshToken(userId: string, refreshJti: string): Promise<void> {
  const redis = createRedisClient();

  try {
    await redis.connect();
    await redis.set(`refresh:${userId}:${refreshJti}`, "active", "EX", env.JWT_REFRESH_TTL);
  } finally {
    redis.disconnect();
  }
}
