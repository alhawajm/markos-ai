import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/analytics/analytics-email-service", () => ({ sendMonthlyAnalyticsPdfEmailForAllWorkspaces: vi.fn().mockResolvedValue({}) }));
vi.mock("../src/analytics/analytics-service", () => ({ syncInstagramAnalyticsForAllWorkspaces: vi.fn().mockResolvedValue({}) }));
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

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("maintenance scheduling", () => {
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
    await expect(runMaintenanceWorkerTick()).rejects.toThrow("Unrelated service unavailable");
    expect(processDuePublishJobs).toHaveBeenCalledOnce();
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
