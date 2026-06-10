import Redis from "ioredis";
import { env } from "../config/env";

export function createRedisClient(): Redis {
  return new Redis(env.REDIS_URL, {
    lazyConnect: true,
    maxRetriesPerRequest: 1,
    enableOfflineQueue: false
  });
}
