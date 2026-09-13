import { env } from "../config/env";
import { sendMonthlyAnalyticsPdfEmailForAllWorkspaces, type AnalyticsEmailProvider } from "../analytics/analytics-email-service";
import { syncInstagramAnalyticsForAllWorkspaces, type AnalyticsSyncForAllWorkspacesResult } from "../analytics/analytics-service";
import { processDuePublishJobs, type PublishJobWorkerResult } from "../publishing/publish-job-service";
import type { AnalyticsEmailDeliveryForAllWorkspacesResult, OfferingDocumentCleanupResult } from "@markos/shared-types";
import type { InstagramAnalyticsProvider } from "../analytics/instagram-analytics-provider";
import type { InstagramPublisher } from "../publishing/instagram-publisher";
import { ensureCurrentUsagePeriods, type UsagePeriodResetResult } from "../usage/usage-service";
import { refreshDueInstagramTokens } from "../workspace/instagram-token-service";
import type { InstagramTokenRefreshResult } from "@markos/shared-types";
import { cleanupExpiredOfferingDocumentAnalyses } from "../offerings/offering-document-service";
import { cleanupExpiredOnboardingDocumentAnalyses } from "../onboarding/onboarding-document-service";
import { processDueVideoGenerationJobs, type VideoGenerationWorkerResult } from "../media/video-generation-service";
import { observeWorkerTask, settleWorkerBatch, workerErrorCode, workerLogger, type WorkerLogger } from "./worker-diagnostics";

export type MaintenanceWorkerLogger = WorkerLogger;

export interface MaintenanceWorkerTickResult {
  analyticsEmail?: AnalyticsEmailDeliveryForAllWorkspacesResult;
  analyticsSync?: AnalyticsSyncForAllWorkspacesResult;
  documentCleanup?: OfferingDocumentCleanupResult;
  publishing?: PublishJobWorkerResult;
  tokenRefresh?: InstagramTokenRefreshResult[];
  usageReset?: UsagePeriodResetResult;
  videoGeneration?: VideoGenerationWorkerResult;
}

export interface MaintenanceWorkerHandle {
  runNow(): Promise<MaintenanceWorkerTickResult>;
  stop(): void;
  drain(timeoutMs?: number): Promise<boolean>;
}

export async function runMaintenanceWorkerTick(
  input: {
    analyticsEmailProvider?: AnalyticsEmailProvider;
    analyticsEmailWorkspaceIds?: string[];
    analyticsProvider?: InstagramAnalyticsProvider;
    fetchImpl?: typeof fetch;
    now?: Date;
    logger?: WorkerLogger;
    shouldStop?: () => boolean;
    publisher?: InstagramPublisher;
    runAnalyticsEmail?: boolean;
    runAnalyticsSync?: boolean;
    runDocumentCleanup?: boolean;
    runPublishing?: boolean;
    runTokenRefresh?: boolean;
    runUsageReset?: boolean;
    runVideoGeneration?: boolean;
  } = {}
): Promise<MaintenanceWorkerTickResult> {
  const started = Date.now();
  const base = input.now ?? new Date();
  const clock = () => new Date(base.getTime() + Date.now() - started);
  const run = <T>(name: string, work: () => Promise<T>) => observeWorkerTask(input.logger ?? workerLogger, name, work);
  const tokenRefresh =
    input.runTokenRefresh === false || input.shouldStop?.()
      ? undefined
      : await run("tokenRefresh", () =>
          refreshDueInstagramTokens({
            now: clock(),
            ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl })
          })
        );
  // Due publications must not wait behind unrelated email, cleanup, or Insights
  // requests. Retain token refresh first and the existing single-tick guard.
  const publishing =
    input.runPublishing === false || input.shouldStop?.()
      ? undefined
      : await run("publishing", () =>
          processDuePublishJobs({
            now: clock(),
            shouldStop: input.shouldStop,
            logger: input.logger,
            ...(input.publisher === undefined ? {} : { publisher: input.publisher })
          })
        );
  const documentCleanup =
    input.runDocumentCleanup === false || input.shouldStop?.()
      ? undefined
      : await run("documentCleanup", () =>
          settleWorkerBatch([cleanupExpiredOfferingDocumentAnalyses({ now: clock() }), cleanupExpiredOnboardingDocumentAnalyses({ now: clock() })]).then(
            ([offerings, onboarding]) => ({
              expired: offerings!.expired + onboarding!.expired,
              failed: offerings!.failed + onboarding!.failed
            })
          )
        );
  const analyticsEmail =
    input.runAnalyticsEmail === false || input.shouldStop?.()
      ? undefined
      : await run("analyticsEmail", () =>
          sendMonthlyAnalyticsPdfEmailForAllWorkspaces({
            now: clock(),
            ...(input.analyticsEmailWorkspaceIds === undefined ? {} : { workspaceIds: input.analyticsEmailWorkspaceIds }),
            ...(input.analyticsEmailProvider === undefined ? {} : { provider: input.analyticsEmailProvider })
          })
        );
  const usageReset =
    input.runUsageReset === false || input.shouldStop?.() ? undefined : await run("usageReset", () => ensureCurrentUsagePeriods({ now: clock() }));
  const analyticsSync =
    input.runAnalyticsSync === false || input.shouldStop?.()
      ? undefined
      : await run("analyticsSync", () =>
          syncInstagramAnalyticsForAllWorkspaces({
            now: clock(),
            ...(input.analyticsProvider === undefined ? {} : { provider: input.analyticsProvider })
          })
        );
  const videoGeneration =
    input.runVideoGeneration === false || input.shouldStop?.()
      ? undefined
      : await run("videoGeneration", () => processDueVideoGenerationJobs({ now: clock(), shouldStop: input.shouldStop, logger: input.logger }));

  return {
    ...(analyticsEmail === undefined ? {} : { analyticsEmail }),
    ...(analyticsSync === undefined ? {} : { analyticsSync }),
    ...(documentCleanup === undefined ? {} : { documentCleanup }),
    ...(publishing === undefined ? {} : { publishing }),
    ...(tokenRefresh === undefined ? {} : { tokenRefresh }),
    ...(usageReset === undefined ? {} : { usageReset }),
    ...(videoGeneration === undefined ? {} : { videoGeneration })
  };
}

export function startMaintenanceWorker(
  input: {
    analyticsEmailIntervalMs?: number;
    analyticsEmailProvider?: AnalyticsEmailProvider;
    analyticsProvider?: InstagramAnalyticsProvider;
    fetchImpl?: typeof fetch;
    logger?: MaintenanceWorkerLogger;
    publisher?: InstagramPublisher;
    publishingIntervalMs?: number;
    runImmediately?: boolean;
    tokenRefreshIntervalMs?: number;
    usageResetIntervalMs?: number;
  } = {}
): MaintenanceWorkerHandle {
  const logger = input.logger ?? workerLogger;
  const publishingIntervalMs = input.publishingIntervalMs ?? env.WORKER_PUBLISHING_INTERVAL_MS;
  const analyticsEmailIntervalMs = input.analyticsEmailIntervalMs ?? env.WORKER_ANALYTICS_EMAIL_INTERVAL_MS;
  const analyticsSyncIntervalMs = env.WORKER_ANALYTICS_SYNC_INTERVAL_MS;
  const tokenRefreshIntervalMs = input.tokenRefreshIntervalMs ?? env.WORKER_TOKEN_REFRESH_INTERVAL_MS;
  const usageResetIntervalMs = input.usageResetIntervalMs ?? env.WORKER_USAGE_RESET_INTERVAL_MS;
  let lastAnalyticsEmailAt = 0;
  let lastTokenRefreshAt = 0;
  let lastAnalyticsSyncAt = 0;
  let lastUsageResetAt = 0;
  let running = false;
  let stopping = false;
  let settled: Promise<void> = Promise.resolve();

  async function runNow(): Promise<MaintenanceWorkerTickResult> {
    if (stopping) return {};
    if (running) {
      logger.warn("Maintenance worker tick skipped because a previous tick is still running");
      return {};
    }

    running = true;
    let finish!: () => void;
    settled = new Promise<void>((resolve) => {
      finish = resolve;
    });
    const now = new Date();
    const tickStarted = performance.now();
    const shouldEmailAnalytics = now.getTime() - lastAnalyticsEmailAt >= analyticsEmailIntervalMs;
    const shouldRefreshTokens = now.getTime() - lastTokenRefreshAt >= tokenRefreshIntervalMs;
    const shouldSyncAnalytics = now.getTime() - lastAnalyticsSyncAt >= analyticsSyncIntervalMs;
    const shouldResetUsage = now.getTime() - lastUsageResetAt >= usageResetIntervalMs;

    try {
      const result = await runMaintenanceWorkerTick({
        runAnalyticsEmail: shouldEmailAnalytics,
        now,
        logger,
        shouldStop: () => stopping,
        runAnalyticsSync: shouldSyncAnalytics,
        runPublishing: true,
        runTokenRefresh: shouldRefreshTokens,
        runUsageReset: shouldResetUsage,
        runVideoGeneration: true,
        ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
        ...(input.analyticsEmailProvider === undefined ? {} : { analyticsEmailProvider: input.analyticsEmailProvider }),
        ...(input.analyticsProvider === undefined ? {} : { analyticsProvider: input.analyticsProvider }),
        ...(input.publisher === undefined ? {} : { publisher: input.publisher })
      });

      if (shouldEmailAnalytics) {
        lastAnalyticsEmailAt = now.getTime();
      }
      if (shouldRefreshTokens) {
        lastTokenRefreshAt = now.getTime();
      }
      if (shouldResetUsage) {
        lastUsageResetAt = now.getTime();
      }
      if (shouldSyncAnalytics) {
        lastAnalyticsSyncAt = now.getTime();
      }

      logger.info("Maintenance worker tick completed", { ...summarizeTick(result), durationMs: Math.round(performance.now() - tickStarted) });
      return result;
    } catch (error) {
      logger.error("Maintenance worker tick failed", {
        errorCode: workerErrorCode(error),
        durationMs: Math.round(performance.now() - tickStarted)
      });
      return {};
    } finally {
      running = false;
      finish();
    }
  }

  const timer = setInterval(() => {
    void runNow();
  }, publishingIntervalMs);
  logger.info("Maintenance worker started", { publishingIntervalMs });

  if (input.runImmediately === true) {
    void runNow();
  }

  return {
    runNow,
    stop() {
      stopping = true;
      clearInterval(timer);
    },
    async drain(timeoutMs = 30_000) {
      stopping = true;
      clearInterval(timer);
      if (!running) return true;
      let deadlineTimer: ReturnType<typeof setTimeout> | undefined;
      try {
        const completed = await Promise.race([
          settled.then(() => true),
          new Promise<boolean>((resolve) => {
            deadlineTimer = setTimeout(() => resolve(false), timeoutMs);
          })
        ]);
        if (!completed) logger.warn("Worker shutdown grace period expired; active leases retained for recovery", { timeoutMs });
        return completed;
      } finally {
        clearTimeout(deadlineTimer);
      }
    }
  };
}

function summarizeTick(result: MaintenanceWorkerTickResult): Record<string, unknown> {
  return {
    attemptedPublishes: result.publishing?.attempted ?? 0,
    analyticsEmailsDelivered: result.analyticsEmail?.delivered ?? 0,
    analyticsEmailsSkipped: result.analyticsEmail?.skipped ?? 0,
    analyticsWorkspacesSynced: result.analyticsSync?.results.filter((sync) => !sync.diagnostics || sync.diagnostics.status === "COMPLETE").length ?? 0,
    analyticsPartialSyncs: result.analyticsSync?.results.filter((sync) => sync.diagnostics?.status === "PARTIAL").length ?? 0,
    analyticsSyncFailures:
      (result.analyticsSync?.failures?.length ?? 0) + (result.analyticsSync?.results.filter((sync) => sync.diagnostics?.status === "FAILED").length ?? 0),
    analyticsErrors:
      result.analyticsSync?.results
        .flatMap((sync) => sync.diagnostics?.warnings.filter((warning) => warning.code !== "METRIC_UNAVAILABLE") ?? [])
        .slice(0, 10) ?? [],
    expiredOfferingDocumentAnalyses: result.documentCleanup?.expired ?? 0,
    offeringDocumentCleanupFailures: result.documentCleanup?.failed ?? 0,
    refreshedTokens: result.tokenRefresh?.filter((item) => item.refreshed).length ?? 0,
    tokenRefreshFailures: result.tokenRefresh?.filter((item) => !item.refreshed).length ?? 0,
    usageCountersEnsured: result.usageReset?.countersEnsured ?? 0,
    usageWorkspacesChecked: result.usageReset?.workspacesChecked ?? 0,
    videoJobsCompleted: result.videoGeneration?.completed ?? 0,
    videoJobsFailed: result.videoGeneration?.failed ?? 0,
    videoJobsProcessed: result.videoGeneration?.processed ?? 0
  };
}
