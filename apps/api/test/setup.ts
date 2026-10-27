import { randomUUID } from "node:crypto";

if (process.env.NODE_ENV !== "test") throw new Error("API test setup requires NODE_ENV=test");

// Each file has an isolated module graph but shares the disposable Redis server.
// Auth limits derive their keys from this secret: keep real limit behavior within
// a file without letting unrelated fixtures exhaust the same loopback peer bucket.
process.env.JWT_REFRESH_SECRET = `test-only-refresh-${randomUUID()}`;
