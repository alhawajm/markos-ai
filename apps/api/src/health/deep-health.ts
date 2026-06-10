import { PrismaClient } from "@prisma/client";
import Redis from "ioredis";
import { env } from "../config/env";

const prisma = new PrismaClient();

export interface DependencyHealth {
  status: "ok" | "down";
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
    checkHttp(`${env.OPENSEARCH_URL}/_cluster/health`),
    checkHttp(`${env.AI_BASE_URL}/ai/health`)
  ]);

  const checks = [database, redis, opensearch, ai];

  return {
    service: "api",
    status: checks.every((check) => check.status === "ok") ? "ok" : "degraded",
    timestamp: new Date().toISOString(),
    dependencies: {
      database,
      redis,
      opensearch,
      ai
    }
  };
}

async function checkDatabase(): Promise<DependencyHealth> {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return { status: "ok" };
  } catch (error) {
    return { status: "down", detail: errorToMessage(error) };
  }
}

async function checkRedis(): Promise<DependencyHealth> {
  const redis = new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 0,
    enableOfflineQueue: false
  });

  try {
    await redis.connect();
    const pong = await redis.ping();
    return pong === "PONG" ? { status: "ok" } : { status: "down", detail: `Unexpected ping: ${pong}` };
  } catch (error) {
    return { status: "down", detail: errorToMessage(error) };
  } finally {
    redis.disconnect();
  }
}

async function checkHttp(url: string): Promise<DependencyHealth> {
  try {
    const response = await fetch(url);

    if (!response.ok) {
      return { status: "down", detail: `HTTP ${response.status}` };
    }

    return { status: "ok" };
  } catch (error) {
    return { status: "down", detail: errorToMessage(error) };
  }
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}
