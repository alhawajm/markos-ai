import { env } from "../config/env";
import { publishDueContentForAllWorkspaces, type PublishDueContentForAllWorkspacesResult } from "../publishing/publishing-service";
import type { InstagramPublisher } from "../publishing/instagram-publisher";
import { ensureCurrentUsagePeriods, type UsagePeriodResetResult } from "../usage/usage-service";
import { refreshDueInstagramTokens } from "../workspace/instagram-token-service";
import type { InstagramTokenRefreshResult } from "@markos/shared-types";

export interface MaintenanceWorkerLogger {
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export interface MaintenanceWorkerTickResult {
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

export async function runMaintenanceWorkerTick(input: {
  fetchImpl?: typeof fetch;
  now?: Date;
  publisher?: InstagramPublisher;
  runPublishing?: boolean;
  runTokenRefresh?: boolean;
  runUsageReset?: boolean;
} = {}): Promise<MaintenanceWorkerTickResult> {
  const now = input.now ?? new Date();
  const usageReset = input.runUsageReset === false ? undefined : await ensureCurrentUsagePeriods({ now });
  const tokenRefresh =
    input.runTokenRefresh === false
      ? undefined
      : await refreshDueInstagramTokens({
          now,
          ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl })
        });
  const publishing =
    input.runPublishing === false
      ? undefined
      : await publishDueContentForAllWorkspaces({
          now,
          ...(input.publisher === undefined ? {} : { publisher: input.publisher })
        });

  return {
    ...(publishing === undefined ? {} : { publishing }),
    ...(tokenRefresh === undefined ? {} : { tokenRefresh }),
    ...(usageReset === undefined ? {} : { usageReset })
  };
}

export function startMaintenanceWorker(input: {
  fetchImpl?: typeof fetch;
  logger?: MaintenanceWorkerLogger;
  publisher?: InstagramPublisher;
  publishingIntervalMs?: number;
  runImmediately?: boolean;
  tokenRefreshIntervalMs?: number;
  usageResetIntervalMs?: number;
} = {}): MaintenanceWorkerHandle {
  const logger = input.logger ?? consoleLogger;
  const publishingIntervalMs = input.publishingIntervalMs ?? env.WORKER_PUBLISHING_INTERVAL_MS;
  const tokenRefreshIntervalMs = input.tokenRefreshIntervalMs ?? env.WORKER_TOKEN_REFRESH_INTERVAL_MS;
  const usageResetIntervalMs = input.usageResetIntervalMs ?? env.WORKER_USAGE_RESET_INTERVAL_MS;
  let lastTokenRefreshAt = 0;
  let lastUsageResetAt = 0;
  let running = false;

  async function runNow(): Promise<MaintenanceWorkerTickResult> {
    if (running) {
      logger.warn("Maintenance worker tick skipped because a previous tick is still running");
      return {};
    }

    running = true;
    const now = new Date();
    const shouldRefreshTokens = now.getTime() - lastTokenRefreshAt >= tokenRefreshIntervalMs;
    const shouldResetUsage = now.getTime() - lastUsageResetAt >= usageResetIntervalMs;

    try {
      const result = await runMaintenanceWorkerTick({
        now,
        runPublishing: true,
        runTokenRefresh: shouldRefreshTokens,
        runUsageReset: shouldResetUsage,
        ...(input.fetchImpl === undefined ? {} : { fetchImpl: input.fetchImpl }),
        ...(input.publisher === undefined ? {} : { publisher: input.publisher })
      });

      if (shouldRefreshTokens) {
        lastTokenRefreshAt = now.getTime();
      }
      if (shouldResetUsage) {
        lastUsageResetAt = now.getTime();
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
    refreshedTokens: result.tokenRefresh?.filter((item) => item.refreshed).length ?? 0,
    tokenRefreshFailures: result.tokenRefresh?.filter((item) => !item.refreshed).length ?? 0,
    usageCountersEnsured: result.usageReset?.countersEnsured ?? 0,
    usageWorkspacesChecked: result.usageReset?.workspacesChecked ?? 0
  };
}
