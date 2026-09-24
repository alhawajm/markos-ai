import { createHmac } from "node:crypto";
import type { FastifyInstance } from "fastify";
import { env } from "../config/env";
import { createRedisClient } from "../cache/redis";
import { errorEnvelope } from "../http/envelope";
const script = `local n=redis.call('INCR',KEYS[1]); if n==1 then redis.call('EXPIRE',KEYS[1],ARGV[1]) end; return {n,redis.call('TTL',KEYS[1])}`;
export async function takeAuthLimit(key: string, limit: number, seconds: number): Promise<number> {
  const redis = createRedisClient();
  try {
    await redis.connect();
    const digest = createHmac("sha256", env.JWT_REFRESH_SECRET).update(key).digest("hex");
    const [count, ttl] = (await redis.eval(script, 1, `auth-rate:${digest}`, seconds)) as [number, number];
    return count > limit ? Math.max(1, ttl) : 0;
  } finally {
    redis.disconnect();
  }
}
export async function registerAuthRateLimits(app: FastifyInstance): Promise<void> {
  app.addHook("preHandler", async (request, reply) => {
    const path = request.routeOptions.url;
    if (request.method !== "POST" || !path?.startsWith("/v1/auth/")) return;
    reply.header("Cache-Control", "no-store");
    const category =
      path.includes("password/forgot") || path.includes("verification/request")
        ? "email"
        : path.endsWith("/register")
          ? "register"
          : path.endsWith("/login")
            ? "login"
            : path.includes("password/reset")
              ? "reset"
              : path.includes("/mfa/")
                ? "mfa"
                : null;
    if (!category) return;
    // Socket peer is the safe default. Forwarded headers cannot bypass this limit.
    let retry = await takeAuthLimit(`${category}:peer:${request.ip}`, 120, 60);
    if (category === "mfa" && request.auth) retry = Math.max(retry, await takeAuthLimit(`mfa:user:${request.auth.userId}`, 5, 300));
    const body = request.body as { email?: unknown; challengeId?: unknown } | undefined;
    if (typeof body?.email === "string")
      retry = Math.max(
        retry,
        await takeAuthLimit(
          `${category}:email:${body.email.trim().toLowerCase()}`,
          category === "email" || category === "register" ? 5 : 15,
          category === "login" ? 900 : 3600
        )
      );
    if (category === "reset" && typeof body?.challengeId === "string")
      retry = Math.max(retry, await takeAuthLimit(`reset:challenge:${body.challengeId}`, 10, 900));
    if (retry) return reply.header("Retry-After", retry).status(429).send(errorEnvelope("AUTH_RATE_LIMITED", "Too many attempts. Try again later."));
  });
}
