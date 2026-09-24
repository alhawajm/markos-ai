import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/analytics/analytics-email-service", () => ({ sendMonthlyAnalyticsPdfEmailForAllWorkspaces: vi.fn().mockResolvedValue({}) }));
vi.mock("../src/analytics/analytics-service", () => ({
  syncInstagramAnalyticsForAllWorkspaces: vi.fn().mockResolvedValue({ attempted: 0, results: [], failures: [] })
}));
vi.mock("../src/publishing/publish-job-service", () => ({ processDuePublishJobs: vi.fn().mockResolvedValue({}) }));
vi.mock("../src/usage/usage-service", () => ({ ensureCurrentUsagePeriods: vi.fn().mockResolvedValue({}) }));
vi.mock("../src/workspace/instagram-token-service", () => ({ refreshDueInstagramTokens: vi.fn().mockResolvedValue([]) }));
vi.mock("../src/offerings/offering-document-service", () => ({ cleanupExpiredOfferingDocumentAnalyses: vi.fn().mockResolvedValue({ expired: 0, failed: 0 }) }));
vi.mock("../src/onboarding/onboarding-document-service", () => ({
  cleanupExpiredOnboardingDocumentAnalyses: vi.fn().mockResolvedValue({ expired: 0, failed: 0 })
}));
vi.mock("../src/media/video-generation-service", () => ({ processDueVideoGenerationJobs: vi.fn().mockResolvedValue({}) }));

import { runMaintenanceWorkerTick, startMaintenanceWorker } from "../src/worker/maintenance-worker";
import { processDuePublishJobs } from "../src/publishing/publish-job-service";
import { syncInstagramAnalyticsForAllWorkspaces } from "../src/analytics/analytics-service";
import { sendMonthlyAnalyticsPdfEmailForAllWorkspaces } from "../src/analytics/analytics-email-service";
import { env } from "../src/config/env";
import { processDueVideoGenerationJobs } from "../src/media/video-generation-service";
import { refreshDueInstagramTokens } from "../src/workspace/instagram-token-service";
import { ensureCurrentUsagePeriods } from "../src/usage/usage-service";
import { cleanupExpiredOfferingDocumentAnalyses } from "../src/offerings/offering-document-service";
import { cleanupExpiredOnboardingDocumentAnalyses } from "../src/onboarding/onboarding-document-service";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("maintenance scheduling", () => {
  it("continues delivery and video after a sibling maintenance task fails, and retries that task next tick", async () => {
    vi.mocked(sendMonthlyAnalyticsPdfEmailForAllWorkspaces).mockRejectedValueOnce(Object.assign(new Error("private provider body"), { code: "REPORT_FAILED" }));
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const worker = startMaintenanceWorker({ role: "all", logger });
    try {
      const first = await worker.runNow();
      expect(first.failures).toEqual([{ task: "analyticsEmail", code: "REPORT_FAILED" }]);
      expect(processDueVideoGenerationJobs).toHaveBeenCalledOnce();
      expect(syncInstagramAnalyticsForAllWorkspaces).toHaveBeenCalledOnce();
      await worker.runNow();
      expect(sendMonthlyAnalyticsPdfEmailForAllWorkspaces).toHaveBeenCalledTimes(2);
      expect(processDuePublishJobs).toHaveBeenCalledTimes(2);
      expect(processDueVideoGenerationJobs).toHaveBeenCalledTimes(2);
      expect(JSON.stringify(logger.error.mock.calls)).not.toContain("private provider body");
    } finally {
      worker.stop();
    }
  });
  it.each(["all", "delivery", "maintenance"] as const)("runs only the tasks owned by the %s role", async (role) => {
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const worker = startMaintenanceWorker({ role, logger });
    try {
      await worker.runNow();
      for (const task of [processDuePublishJobs, processDueVideoGenerationJobs]) {
        expect(task).toHaveBeenCalledTimes(role === "maintenance" ? 0 : 1);
      }
      for (const task of [
        refreshDueInstagramTokens,
        ensureCurrentUsagePeriods,
        cleanupExpiredOfferingDocumentAnalyses,
        cleanupExpiredOnboardingDocumentAnalyses,
        sendMonthlyAnalyticsPdfEmailForAllWorkspaces,
        syncInstagramAnalyticsForAllWorkspaces
      ]) {
        expect(task).toHaveBeenCalledTimes(role === "delivery" ? 0 : 1);
      }
      expect(logger.error).not.toHaveBeenCalled();
      expect(logger.info).toHaveBeenCalledWith("Maintenance worker started", { role, publishingIntervalMs: 60_000 });
    } finally {
      worker.stop();
    }
  });

  it("keeps delivery running while a maintenance Insights request is blocked", async () => {
    let finish!: () => void;
    let entered!: () => void;
    const started = new Promise<void>((resolve) => {
      entered = resolve;
    });
    vi.mocked(syncInstagramAnalyticsForAllWorkspaces).mockImplementationOnce(async () => {
      entered();
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { attempted: 0, results: [], failures: [] };
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const maintenance = startMaintenanceWorker({ role: "maintenance", logger });
    const delivery = startMaintenanceWorker({ role: "delivery", logger });
    const pending = maintenance.runNow();
    try {
      await started;
      await delivery.runNow();
      await delivery.runNow();
      expect(processDuePublishJobs).toHaveBeenCalledTimes(2);
      expect(processDueVideoGenerationJobs).toHaveBeenCalledTimes(2);
      expect(syncInstagramAnalyticsForAllWorkspaces).toHaveBeenCalledOnce();
      expect(logger.error).not.toHaveBeenCalled();
    } finally {
      finish();
      await pending;
      maintenance.stop();
      delivery.stop();
    }
  });

  it("drains an active publish and skips subsequent tasks and future claims on shutdown", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    vi.mocked(processDuePublishJobs).mockImplementationOnce(async (input) => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      expect(input?.shouldStop?.()).toBe(true);
      return { attempted: 1, completed: 1, failed: 0, processed: 1, retrying: 0 };
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const worker = startMaintenanceWorker({ logger });
    const running = worker.runNow();
    await vi.advanceTimersByTimeAsync(0);
    const drained = vi.fn();
    const shutdown = worker.drain(30_000).then(drained);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(drained).not.toHaveBeenCalled();
    finish();
    await running;
    await shutdown;
    expect(drained).toHaveBeenCalledWith(true);
    expect(sendMonthlyAnalyticsPdfEmailForAllWorkspaces).not.toHaveBeenCalled();
    expect(syncInstagramAnalyticsForAllWorkspaces).not.toHaveBeenCalled();
    await worker.runNow();
    await vi.advanceTimersByTimeAsync(120_000);
    expect(processDuePublishJobs).toHaveBeenCalledOnce();
    expect(logger.info).toHaveBeenCalledWith("Worker task completed", expect.objectContaining({ task: "publishing", durationMs: 10_000 }));
  });

  it("bounds shutdown without releasing ownership of unfinished work", async () => {
    vi.useFakeTimers();
    let finish!: () => void;
    vi.mocked(processDuePublishJobs).mockImplementationOnce(async () => {
      await new Promise<void>((resolve) => {
        finish = resolve;
      });
      return { attempted: 1, completed: 1, failed: 0, processed: 1, retrying: 0 };
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const worker = startMaintenanceWorker({ logger });
    const running = worker.runNow();
    await vi.advanceTimersByTimeAsync(0);
    const shutdown = worker.drain(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(await shutdown).toBe(false);
    await worker.runNow();
    expect(processDuePublishJobs).toHaveBeenCalledOnce();
    expect(logger.warn).toHaveBeenCalledWith(expect.stringContaining("active leases retained"), { timeoutMs: 1000 });
    finish();
    await running;
  });
  it.each(["email", "insights"])("processes due publishes before a failing %s task", async (task) => {
    const failing = task === "email" ? sendMonthlyAnalyticsPdfEmailForAllWorkspaces : syncInstagramAnalyticsForAllWorkspaces;
    vi.mocked(failing).mockRejectedValueOnce(new Error("Unrelated service unavailable"));
    const result = await runMaintenanceWorkerTick();
    expect(result.failures).toEqual([{ task: task === "email" ? "analyticsEmail" : "analyticsSync", code: "WORKER_UNEXPECTED_ERROR" }]);
    expect(processDuePublishJobs).toHaveBeenCalledOnce();
    expect(processDueVideoGenerationJobs).toHaveBeenCalledOnce();
  });
  it("checks publishing every minute, skips overlapping ticks and stops its existing timer", async () => {
    expect(env.WORKER_PUBLISHING_INTERVAL_MS).toBe(60_000);
    vi.useFakeTimers();
    let finish!: () => void;
    const pending = new Promise<void>((resolve) => {
      finish = resolve;
    });
    vi.mocked(processDuePublishJobs).mockImplementationOnce(async () => {
      await pending;
      return { attempted: 1, completed: 1, failed: 0, processed: 1, retrying: 0 };
    });
    const logger = { info: vi.fn(), warn: vi.fn(), error: vi.fn() };
    const worker = startMaintenanceWorker({ logger });
    try {
      await vi.advanceTimersByTimeAsync(59_999);
      expect(processDuePublishJobs).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(processDuePublishJobs).toHaveBeenCalledTimes(1);
      await vi.advanceTimersByTimeAsync(60_000);
      expect(processDuePublishJobs).toHaveBeenCalledTimes(1);
      expect(logger.warn).toHaveBeenCalledOnce();
      finish();
      await vi.advanceTimersByTimeAsync(60_000);
      expect(processDuePublishJobs).toHaveBeenCalledTimes(2);
      worker.stop();
      await vi.advanceTimersByTimeAsync(120_000);
      expect(processDuePublishJobs).toHaveBeenCalledTimes(2);
    } finally {
      finish();
      worker.stop();
    }
  });
});
