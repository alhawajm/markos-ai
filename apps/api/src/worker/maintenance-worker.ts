import { env } from "../config/env";
import { sendMonthlyAnalyticsPdfEmailForAllWorkspaces, type AnalyticsEmailProvider } from "../analytics/analytics-email-service";
import { syncInstagramAnalyticsForAllWorkspaces, type AnalyticsSyncForAllWorkspacesResult } from "../analytics/analytics-service";
import { publishDueContentForAllWorkspaces, type PublishDueContentForAllWorkspacesResult } from "../publishing/publishing-service";
import type { AnalyticsEmailDeliveryForAllWorkspacesResult, OfferingDocumentCleanupResult } from "@markos/shared-types";
import type { InstagramAnalyticsProvider } from "../analytics/instagram-analytics-provider";
import type { InstagramPublisher } from "../publishing/instagram-publisher";
import { ensureCurrentUsagePeriods, type UsagePeriodResetResult } from "../usage/usage-service";
import { refreshDueInstagramTokens } from "../workspace/instagram-token-service";
import type { InstagramTokenRefreshResult } from "@markos/shared-types";
import { cleanupExpiredOfferingDocumentAnalyses } from "../offerings/offering-document-service";
import { cleanupExpiredOnboardingDocumentAnalyses } from "../onboarding/onboarding-document-service";

export interface MaintenanceWorkerLogger {
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface MaintenanceWorkerTickResult {
  analyticsEmail?: AnalyticsEmailDeliveryForAllWorkspacesResult;
  analyticsSync?: AnalyticsSyncForAllWorkspacesResult;
  documentCleanup?: OfferingDocumentCleanupResult;
  publishing?: PublishDueContentForAllWorkspacesResult;
  tokenRefresh?: InstagramTokenRefreshResult[];
  usageReset?: UsagePeriodResetResult;
}

export interface MaintenanceWorkerHandle {
  runNow(): Promise<MaintenanceWorkerTickResult>;
  stop(): void;
}

const consoleLogger: MaintenanceWorkerLogger = {
  error(message, meta) {
    console.error(message, meta ?? {});
  },
  info(message, meta) {
    console.info(message, meta ?? {});
  },
  warn(message, meta) {
    console.warn(message, meta ?? {});
  }
};

export async function runMaintenanceWorkerTick(
  input: {
    analyticsEmailProvider?: AnalyticsEmailProvider;
    analyticsEmailWorkspaceIds?: string[];
    analyticsProvider?: InstagramAnalyticsProvider;
    fetchImpl?: typeof fetch;
    now?: Date;
    publisher?: InstagramPublisher;
    runAnalyticsEmail?: boolean;
    runAnalyticsSync?: boolean;
    runDocumentCleanup?: boolean;
    runPublishing?: boolean;
    runTokenRefresh?: boolean;
    runUsageReset?: boolean;
  } = {}
): Promise<MaintenanceWorkerTickResult> {
  const now = input.now ?? new Date();
  const documentCleanup =
    input.runDocumentCleanup === false
      ? undefined
      : await Promise.all([cleanupExpiredOfferingDocumentAnalyses({ now }), cleanupExpiredOnboardingDocumentAnalyses({ now })]).then(
          ([offerings, onboarding]) => ({
            expired: offerings.expired + onboarding.expired,
            failed: offerings.failed + onboarding.failed
          })
        );
  const analyticsEmail =
    input.runAnalyticsEmail === false
      ? undefined
      : await sendMonthlyAnalyticsPdfEmailForAllWorkspaces({
          now,
          ...(input.analyticsEmailWorkspaceIds === undefined ? {} : { workspaceIds: input.analyticsEmailWorkspaceIds }),
          ...(input.analyticsEmailProvider === undefined ? {} : { provider: input.analyticsEmailProvider })
        });
  const usageReset = input.runUsageReset === false ? undefined : await ensureCurrentUsagePeriods({ now });
  const tokenRefresh =
    input.runTokenRefresh === false
      ? undefined
      : await refreshDueInstagramTokens({
          now,
          ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl })
        });
  const analyticsSync =
    input.runAnalyticsSync === false
      ? undefined
      : await syncInstagramAnalyticsForAllWorkspaces({
          now,
          ...(input.analyticsProvider === undefined ? {} : { provider: input.analyticsProvider })
        });
  const publishing =
    input.runPublishing === false
      ? undefined
      : await publishDueContentForAllWorkspaces({
          now,
          ...(input.publisher === undefined ? {} : { publisher: input.publisher })
        });

  return {
    ...(analyticsEmail === undefined ? {} : { analyticsEmail }),
    ...(analyticsSync === undefined ? {} : { analyticsSync }),
    ...(documentCleanup === undefined ? {} : { documentCleanup }),
    ...(publishing === undefined ? {} : { publishing }),
    ...(tokenRefresh === undefined ? {} : { tokenRefresh }),
    ...(usageReset === undefined ? {} : { usageReset })
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
  const logger = input.logger ?? consoleLogger;
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

  async function runNow(): Promise<MaintenanceWorkerTickResult> {
    if (running) {
      logger.warn("Maintenance worker tick skipped because a previous tick is still running");
      return {};
    }

    running = true;
    const now = new Date();
    const shouldEmailAnalytics = now.getTime() - lastAnalyticsEmailAt >= analyticsEmailIntervalMs;
    const shouldRefreshTokens = now.getTime() - lastTokenRefreshAt >= tokenRefreshIntervalMs;
    const shouldSyncAnalytics = now.getTime() - lastAnalyticsSyncAt >= analyticsSyncIntervalMs;
    const shouldResetUsage = now.getTime() - lastUsageResetAt >= usageResetIntervalMs;

    try {
      const result = await runMaintenanceWorkerTick({
        runAnalyticsEmail: shouldEmailAnalytics,
        now,
        runAnalyticsSync: shouldSyncAnalytics,
        runPublishing: true,
        runTokenRefresh: shouldRefreshTokens,
        runUsageReset: shouldResetUsage,
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

      logger.info("Maintenance worker tick completed", summarizeTick(result));
      return result;
    } catch (error) {
      logger.error("Maintenance worker tick failed", {
        error: error instanceof Error ? error.message : String(error)
      });
      return {};
    } finally {
      running = false;
    }
  }

  const timer = setInterval(() => {
    void runNow();
  }, publishingIntervalMs);

  if (input.runImmediately === true) {
    void runNow();
  }

  return {
    runNow,
    stop() {
      clearInterval(timer);
    }
  };
}

function summarizeTick(result: MaintenanceWorkerTickResult): Record<string, unknown> {
  return {
    attemptedPublishes: result.publishing?.attempted ?? 0,
    analyticsEmailsDelivered: result.analyticsEmail?.delivered ?? 0,
    analyticsEmailsSkipped: result.analyticsEmail?.skipped ?? 0,
    analyticsWorkspacesSynced: result.analyticsSync?.attempted ?? 0,
    expiredOfferingDocumentAnalyses: result.documentCleanup?.expired ?? 0,
    offeringDocumentCleanupFailures: result.documentCleanup?.failed ?? 0,
    refreshedTokens: result.tokenRefresh?.filter((item) => item.refreshed).length ?? 0,
    tokenRefreshFailures: result.tokenRefresh?.filter((item) => !item.refreshed).length ?? 0,
    usageCountersEnsured: result.usageReset?.countersEnsured ?? 0,
    usageWorkspacesChecked: result.usageReset?.workspacesChecked ?? 0
  };
}
