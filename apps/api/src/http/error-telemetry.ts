import { captureException } from "../observability/sentry";

type ErrorLogger = {
  error(bindings: Record<string, unknown>, message: string): void;
};

export function safeRequestPath(url: string): string {
  try {
    return new URL(url, "http://markos.invalid").pathname;
  } catch {
    return url.split(/[?#]/, 1)[0] || "/";
  }
}

export function reportUnexpectedRequestError(input: {
  error: unknown;
  logger: ErrorLogger;
  method: string;
  url: string;
  workspaceId?: string;
  capture?: typeof captureException;
}): void {
  const path = safeRequestPath(input.url);
  const context = {
    method: input.method,
    url: path,
    ...(input.workspaceId ? { workspaceId: input.workspaceId } : {})
  };
  input.logger.error({ err: input.error, ...context }, "Request failed");
  (input.capture ?? captureException)(input.error, context);
}
