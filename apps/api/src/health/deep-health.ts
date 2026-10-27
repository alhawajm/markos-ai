import Redis from "ioredis";
import { performance } from "node:perf_hooks";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { backupFreshness } from "./backup-freshness";

export interface DependencyHealth {
  status: "ok" | "down" | "skipped";
  durationMs: number;
  detail?: string;
}

export interface DeepHealthResponse {
  service: "api";
  status: "ok" | "degraded";
  timestamp: string;
  dependencies: {
    database: DependencyHealth;
    redis: DependencyHealth;
    opensearch: DependencyHealth;
    ai: DependencyHealth;
  };
}

export async function getDeepHealth(): Promise<DeepHealthResponse> {
  const [database, redis, opensearch, ai] = await Promise.all([
    checkDatabase(),
    checkRedis(),
    env.OPENSEARCH_HEALTH_REQUIRED
      ? checkHttp(`${env.OPENSEARCH_URL}/_cluster/health`)
      : Promise.resolve<DependencyHealth>({ status: "skipped", durationMs: 0, detail: "Not required by current product features" }),
    checkHttp(`${env.AI_BASE_URL}/ai/ready`, true)
  ]);

  const checks = [database, redis, opensearch, ai];

  return {
    service: "api",
    status: checks.every((check) => check.status !== "down") ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    dependencies: {
      database,
      redis,
      opensearch,
      ai
    }
  };
}

export async function getBackupHealth(): Promise<DependencyHealth> {
  if (!env.BACKUP_HEALTH_REQUIRED) return { status: "skipped", durationMs: 0 };
  const startedAt = performance.now();
  try {
    const checkpoint = await withTimeout(
      prisma.auditLog.findFirst({ where: { workspaceId: null, action: "BACKUP_COMPLETED" }, orderBy: { createdAt: "desc" }, select: { metadata: true } }),
      env.HEALTH_DATABASE_TIMEOUT_MS
    );
    if (checkpoint) return { ...backupFreshness(JSON.stringify(checkpoint.metadata), env.BACKUP_MAX_AGE_HOURS), durationMs: elapsedMs(startedAt) };
  } catch {
    return { status: "down", durationMs: elapsedMs(startedAt), detail: "Backup status unavailable" };
  }
  // Compatibility with the first verified snapshot, before durable audit receipts.
  const client = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    connectTimeout: env.HEALTH_REDIS_TIMEOUT_MS,
    commandTimeout: env.HEALTH_REDIS_TIMEOUT_MS,
    retryStrategy: null
  });
  client.on("error", () => {});
  try {
    await withTimeout(client.connect(), env.HEALTH_REDIS_TIMEOUT_MS);
    const result = backupFreshness(await withTimeout(client.get("markos:ops:last-backup"), env.HEALTH_REDIS_TIMEOUT_MS), env.BACKUP_MAX_AGE_HOURS);
    return { ...result, durationMs: elapsedMs(startedAt) };
  } catch {
    return { status: "down", durationMs: elapsedMs(startedAt), detail: "Backup status unavailable" };
  } finally {
    client.disconnect();
  }
}

async function checkDatabase(): Promise<DependencyHealth> {
  const startedAt = performance.now();

  try {
    await withTimeout(prisma.$queryRaw`SELECT 1`, env.HEALTH_DATABASE_TIMEOUT_MS);
    return { status: "ok", durationMs: elapsedMs(startedAt) };
  } catch (error) {
    return { status: "down", durationMs: elapsedMs(startedAt), detail: errorToMessage(error) };
  }
}

async function checkRedis(): Promise<DependencyHealth> {
  const startedAt = performance.now();
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false,
    connectTimeout: env.HEALTH_REDIS_TIMEOUT_MS,
    commandTimeout: env.HEALTH_REDIS_TIMEOUT_MS,
    retryStrategy: null
  });
  redis.on("error", () => undefined);

  try {
    await withTimeout(redis.connect(), env.HEALTH_REDIS_TIMEOUT_MS);
    const pong = await withTimeout(redis.ping(), env.HEALTH_REDIS_TIMEOUT_MS);
    return pong === "PONG"
      ? { status: "ok", durationMs: elapsedMs(startedAt) }
      : { status: "down", durationMs: elapsedMs(startedAt), detail: `Unexpected ping: ${pong}` };
  } catch (error) {
    return { status: "down", durationMs: elapsedMs(startedAt), detail: errorToMessage(error) };
  } finally {
    redis.disconnect();
  }
}

async function checkHttp(url: string, internalAi = false): Promise<DependencyHealth> {
  const startedAt = performance.now();
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.HEALTH_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(url, {
      cache: "no-store",
      ...(internalAi ? { headers: { authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}` } } : {}),
      signal: controller.signal
    });

    if (!response.ok) {
      return { status: "down", durationMs: elapsedMs(startedAt), detail: `HTTP ${response.status}` };
    }

    return { status: "ok", durationMs: elapsedMs(startedAt) };
  } catch (error) {
    return { status: "down", durationMs: elapsedMs(startedAt), detail: errorToMessage(error, env.HEALTH_HTTP_TIMEOUT_MS) };
  } finally {
    clearTimeout(timeout);
  }
}

function errorToMessage(error: unknown, timeoutMs = env.HEALTH_DEPENDENCY_TIMEOUT_MS): string {
  if (error instanceof Error && error.name === "AbortError") {
    return `Timed out after ${timeoutMs}ms`;
  }

  // Public readiness must never echo a database URL, provider body or credential.
  return "Dependency check failed";
}

async function withTimeout<T>(promise: Promise<T>, timeoutMs: number): Promise<T> {
  let timeout: ReturnType<typeof setTimeout> | undefined;

  try {
    return await Promise.race([
      promise,
      new Promise<T>((_, reject) => {
        timeout = setTimeout(() => reject(new Error(`Timed out after ${timeoutMs}ms`)), timeoutMs);
      })
    ]);
  } finally {
    if (timeout !== undefined) {
      clearTimeout(timeout);
    }
  }
}

function elapsedMs(startedAt: number): number {
  return Math.round(performance.now() - startedAt);
}
