import { beforeEach, afterEach, describe, expect, it, vi } from "vitest";
const dependencies = vi.hoisted(() => ({
  receipt: vi.fn(),
  database: vi.fn(),
  construct: vi.fn(),
  get: vi.fn(),
  connect: vi.fn(),
  ping: vi.fn(),
  disconnect: vi.fn()
}));
vi.mock("../src/config/env", () => ({
  env: {
    BACKUP_HEALTH_REQUIRED: true,
    BACKUP_MAX_AGE_HOURS: 36,
    HEALTH_DATABASE_TIMEOUT_MS: 1000,
    HEALTH_REDIS_TIMEOUT_MS: 1000,
    HEALTH_HTTP_TIMEOUT_MS: 1000,
    OPENSEARCH_HEALTH_REQUIRED: false,
    REDIS_URL: "redis://unused",
    AI_BASE_URL: "http://unused",
    INTERNAL_SERVICE_TOKEN: "fixture"
  }
}));
vi.mock("../src/db/prisma", () => ({ prisma: { auditLog: { findFirst: dependencies.receipt }, $queryRaw: dependencies.database } }));
vi.mock("ioredis", () => ({
  default: class {
    constructor() {
      dependencies.construct();
    }
    on() {}
    connect = dependencies.connect;
    get = dependencies.get;
    ping = dependencies.ping;
    disconnect = dependencies.disconnect;
  }
}));
import { getBackupHealth, getDeepHealth } from "../src/health/deep-health";
beforeEach(() => {
  vi.clearAllMocks();
  dependencies.connect.mockResolvedValue(undefined);
  dependencies.ping.mockResolvedValue("PONG");
  dependencies.database.mockResolvedValue([]);
});
afterEach(() => vi.unstubAllGlobals());
describe("backup operations health", () => {
  it("keeps verified status after a Redis restart using a durable audit receipt", async () => {
    dependencies.receipt.mockResolvedValue({ metadata: { completedAt: new Date().toISOString() } });
    expect((await getBackupHealth()).status).toBe("ok");
    expect(dependencies.construct).not.toHaveBeenCalled();
  });
  it("does not hide an overdue durable receipt behind a newer cache value", async () => {
    dependencies.receipt.mockResolvedValue({ metadata: { completedAt: "2000-01-01T00:00:00Z" } });
    dependencies.get.mockResolvedValue(JSON.stringify({ completedAt: new Date().toISOString() }));
    expect((await getBackupHealth()).status).toBe("down");
    expect(dependencies.construct).not.toHaveBeenCalled();
  });
  it("supports the first snapshot's cached receipt during migration", async () => {
    dependencies.receipt.mockResolvedValue(null);
    dependencies.get.mockResolvedValue(JSON.stringify({ completedAt: new Date().toISOString() }));
    expect((await getBackupHealth()).status).toBe("ok");
    expect(dependencies.disconnect).toHaveBeenCalledOnce();
  });
  it("keeps application availability independent of an operations-only backup failure", async () => {
    dependencies.receipt.mockRejectedValue(new Error("private connection details"));
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response(null, { status: 200 })));
    expect((await getDeepHealth()).status).toBe("ok");
    expect(dependencies.receipt).not.toHaveBeenCalled();
    expect(await getBackupHealth()).toMatchObject({ status: "down", detail: "Backup status unavailable" });
  });
});
