import { safeRequestPath } from "./error-telemetry";
import type { LoggerOptions } from "pino";

// Pino otherwise copies Error.message into the top-level msg before serialization.
export const safeLogHooks: NonNullable<LoggerOptions["hooks"]> = {
  logMethod(args, method) {
    const first = args[0];
    if (first instanceof Error) args = [{ err: first }, "Application error"];
    else if (first && typeof first === "object" && "err" in first) args = [first, "Application error"];
    method.apply(this, args);
  }
};

export function safeErrorLog(error: unknown): { type: string; code: string; message: string; stack: string } {
  const value = error && typeof error === "object" ? (error as { name?: unknown; code?: unknown }) : {};
  return {
    type: typeof value.name === "string" && /^[A-Za-z][A-Za-z0-9_.]{0,79}$/.test(value.name) ? value.name : "Error",
    code: typeof value.code === "string" && /^[A-Z][A-Z0-9_]{1,99}$/.test(value.code) ? value.code : "UNEXPECTED_ERROR",
    message: "Application error",
    stack: "Raw stack omitted; use sanitized error monitoring."
  };
}

export const safeLogSerializers = {
  req: (request: { method: string; url: string }) => ({ method: request.method, path: safeRequestPath(request.url) }),
  err: safeErrorLog,
  res: (response: { statusCode: number }) => ({ statusCode: response.statusCode })
};
