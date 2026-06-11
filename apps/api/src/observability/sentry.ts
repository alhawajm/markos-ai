import * as Sentry from "@sentry/node";
import { env } from "../config/env";

let initialized = false;

export function initObservability(): void {
  if (initialized || !env.SENTRY_DSN) {
    return;
  }

  Sentry.init({
    dsn: env.SENTRY_DSN,
    environment: env.SENTRY_ENVIRONMENT ?? env.NODE_ENV,
    release: env.SENTRY_RELEASE,
    tracesSampleRate: env.SENTRY_TRACES_SAMPLE_RATE
  });
  initialized = true;
}

export function isObservabilityEnabled(): boolean {
  return initialized;
}

export function captureException(
  error: unknown,
  context: { method?: string; url?: string; workspaceId?: string } = {}
): void {
  if (!initialized) {
    return;
  }

  Sentry.withScope((scope) => {
    scope.setTag("service", "api");

    if (context.method) {
      scope.setTag("http.method", context.method);
    }

    if (context.url) {
      scope.setTag("http.url", context.url);
    }

    if (context.workspaceId) {
      scope.setTag("workspace_id", context.workspaceId);
    }

    Sentry.captureException(error);
  });
}

export async function flushObservability(timeoutMs = 2000): Promise<boolean> {
  return initialized ? Sentry.flush(timeoutMs) : true;
}
