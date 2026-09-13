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

import { startMaintenanceWorker } from "../src/worker/maintenance-worker";
import { processDuePublishJobs } from "../src/publishing/publish-job-service";
import { env } from "../src/config/env";

afterEach(() => {
  vi.useRealTimers();
  vi.clearAllMocks();
});
describe("maintenance scheduling", () => {
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
