import { env } from "../config/env";

const safeAiMessages: Record<string, string> = {
  AI_CONTEXT_MISSING: "Knowledge Vault context is required for AI generation",
  AI_OUTPUT_INCOMPLETE: "The AI provider returned an incomplete result",
  AI_OUTPUT_INVALID: "The AI provider returned an invalid result",
  AI_OUTPUT_REFUSED: "The AI provider could not generate this result",
  AI_PROVIDER_NOT_CONFIGURED: "The AI provider is not configured",
  AI_PROVIDER_RATE_LIMITED: "The AI provider is temporarily rate limited",
  AI_PROVIDER_TIMEOUT: "The AI provider timed out",
  AI_PROVIDER_UNAVAILABLE: "The AI provider is temporarily unavailable",
  AI_PROVIDER_USAGE_MISSING: "The AI provider did not return usage data",
  AI_SERVICE_UNAUTHORIZED: "The AI service is not configured correctly",
};

export class AiServiceRequestError extends Error {
  readonly code: string;
  readonly retryable: boolean;
  readonly statusCode: number;

  constructor(input: {
    code: string;
    message: string;
    retryable: boolean;
    statusCode: number;
  }) {
    super(input.message);
    this.name = "AiServiceRequestError";
    this.code = input.code;
    this.retryable = input.retryable;
    this.statusCode = input.statusCode;
  }
}

export async function requestAi<T>(
  path: string,
  options: {
    body: unknown;
    parse?: (value: unknown) => T;
  },
): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), env.AI_HTTP_TIMEOUT_MS);

  try {
    const response = await fetch(new URL(path, env.AI_BASE_URL), {
      body: JSON.stringify(options.body),
      headers: {
        authorization: `Bearer ${env.INTERNAL_SERVICE_TOKEN}`,
        "content-type": "application/json",
      },
      method: "POST",
      signal: controller.signal,
    });
    const value: unknown = await response.json().catch(() => undefined);

    if (!response.ok) {
      throw toAiServiceError(response.status, value);
    }

    if (options.parse === undefined) {
      return value as T;
    }

    try {
      return options.parse(value);
    } catch {
      throw new AiServiceRequestError({
        code: "AI_SERVICE_RESPONSE_INVALID",
        message: "The AI service returned an invalid response",
        retryable: true,
        statusCode: 502,
      });
    }
  } catch (error) {
    if (error instanceof AiServiceRequestError) {
      throw error;
    }

    if (error instanceof Error && error.name === "AbortError") {
      throw new AiServiceRequestError({
        code: "AI_SERVICE_TIMEOUT",
        message: "The AI service timed out",
        retryable: true,
        statusCode: 504,
      });
    }

    throw new AiServiceRequestError({
      code: "AI_SERVICE_UNAVAILABLE",
      message: "The AI service is temporarily unavailable",
      retryable: true,
      statusCode: 503,
    });
  } finally {
    clearTimeout(timeout);
  }
}

function toAiServiceError(
  status: number,
  value: unknown,
): AiServiceRequestError {
  const error = readRecord(value)?.error;
  const errorRecord = readRecord(error);
  const rawCode =
    typeof errorRecord?.code === "string"
      ? errorRecord.code
      : "AI_SERVICE_ERROR";
  const code = /^AI_[A-Z0-9_]+$/.test(rawCode) ? rawCode : "AI_SERVICE_ERROR";
  const retryable = readRetryable(errorRecord?.details) ?? status >= 500;
  const statusCode =
    status === 422 ? 422 : status === 502 ? 502 : status === 504 ? 504 : 503;

  return new AiServiceRequestError({
    code: status === 401 ? "AI_SERVICE_AUTHENTICATION_FAILED" : code,
    message:
      status === 401
        ? "The AI service is not configured correctly"
        : (safeAiMessages[code] ??
          "The AI service could not complete the request"),
    retryable: status === 401 ? false : retryable,
    statusCode,
  });
}

function readRetryable(value: unknown): boolean | undefined {
  if (!Array.isArray(value)) {
    return undefined;
  }

  const first = readRecord(value[0]);
  return typeof first?.retryable === "boolean" ? first.retryable : undefined;
}

function readRecord(value: unknown): Record<string, unknown> | undefined {
  return typeof value === "object" && value !== null
    ? (value as Record<string, unknown>)
    : undefined;
}
