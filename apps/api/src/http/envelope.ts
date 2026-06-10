import type { ApiEnvelope, ApiErrorEnvelope } from "@markos/shared-types";

export function ok<TData>(data: TData, meta?: Record<string, unknown>): ApiEnvelope<TData> {
  return meta === undefined ? { data } : { data, meta };
}

export function errorEnvelope(code: string, message: string, details: unknown[] = []): ApiErrorEnvelope {
  return {
    error: {
      code,
      message,
      details
    }
  };
}
