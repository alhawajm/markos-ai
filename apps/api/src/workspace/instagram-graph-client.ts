import { env } from "../config/env";
import { INSTAGRAM_GRAPH_BASE_URL } from "./instagram-provider";

type FetchLike = (input: string | URL, init?: RequestInit) => Promise<Response>;

export type InstagramGraphFailureCode =
  | "INSTAGRAM_PROVIDER_HTTP_ERROR"
  | "INSTAGRAM_PROVIDER_NETWORK_ERROR"
  | "INSTAGRAM_PROVIDER_RESPONSE_INVALID"
  | "INSTAGRAM_PROVIDER_RESPONSE_TOO_LARGE"
  | "INSTAGRAM_PROVIDER_TIMEOUT";

export interface InstagramGraphFailureDiagnostic {
  errorCode?: string | number;
  errorSubcode?: string | number;
  errorType?: string;
  httpStatus?: number;
  retryable: boolean;
}

export class InstagramGraphRequestError extends Error {
  constructor(
    readonly code: InstagramGraphFailureCode,
    readonly diagnostic: InstagramGraphFailureDiagnostic = { retryable: false },
    cause?: unknown
  ) {
    super(code, { cause });
  }
}

export class InstagramGraphClient {
  private readonly fetchImpl: FetchLike;
  private readonly maxResponseBytes: number;
  private readonly timeoutMs: number;

  constructor(
    options: {
      /** Test-only transport boundary. Production callers must omit it. */
      fetchImpl?: FetchLike;
      /** Test-only timeout boundary. Production callers must omit it. */
      timeoutMs?: number;
      /** Test-only response-size boundary. Production callers must omit it. */
      maxResponseBytes?: number;
    } = {}
  ) {
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.timeoutMs = options.timeoutMs ?? env.INSTAGRAM_GRAPH_REQUEST_TIMEOUT_MS;
    this.maxResponseBytes = options.maxResponseBytes ?? env.INSTAGRAM_GRAPH_MAX_RESPONSE_BYTES;
  }

  async get(
    objectId: string,
    edge: "content_publishing_limit" | "insights" | undefined,
    accessToken: string,
    query: Record<string, string>
  ): Promise<Record<string, unknown>> {
    const url = this.graphUrl(objectId, edge);

    for (const [key, value] of Object.entries(query)) {
      url.searchParams.set(key, value);
    }

    return this.request(url, accessToken, { method: "GET" });
  }

  async post(objectId: string, edge: "media" | "media_publish", accessToken: string, body: Record<string, string>): Promise<Record<string, unknown>> {
    return this.request(this.graphUrl(objectId, edge), accessToken, {
      body: new URLSearchParams(body),
      method: "POST"
    });
  }

  private graphUrl(objectId: string, edge: string | undefined): URL {
    const encodedObjectId = encodeURIComponent(objectId);
    const encodedEdge = edge === undefined ? "" : `/${encodeURIComponent(edge)}`;
    return new URL(`${INSTAGRAM_GRAPH_BASE_URL}/${encodedObjectId}${encodedEdge}`);
  }

  private async request(url: URL, accessToken: string, init: RequestInit): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), this.timeoutMs);

    try {
      const response = await this.fetchImpl(url, {
        ...init,
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${accessToken}`
        },
        signal: controller.signal
      });
      const body = await readJsonObject(response, this.maxResponseBytes);

      if (!response.ok) {
        const providerError = isRecord(body.error) ? body.error : undefined;
        throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_HTTP_ERROR", {
          httpStatus: response.status,
          retryable: response.status === 429 || response.status >= 500,
          ...safeString(providerError, "type", "errorType"),
          ...safeIdentifier(providerError, "code", "errorCode"),
          ...safeIdentifier(providerError, "error_subcode", "errorSubcode")
        });
      }

      return body;
    } catch (error) {
      if (error instanceof InstagramGraphRequestError) throw error;
      throw new InstagramGraphRequestError(
        controller.signal.aborted ? "INSTAGRAM_PROVIDER_TIMEOUT" : "INSTAGRAM_PROVIDER_NETWORK_ERROR",
        { retryable: true },
        error
      );
    } finally {
      clearTimeout(timeout);
    }
  }
}

async function readJsonObject(response: Response, maxResponseBytes: number): Promise<Record<string, unknown>> {
  const declaredLength = Number(response.headers.get("content-length"));

  if (Number.isFinite(declaredLength) && declaredLength > maxResponseBytes) {
    throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_TOO_LARGE");
  }

  if (!response.body) {
    throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_INVALID");
  }

  const reader = response.body.getReader();
  const chunks: Uint8Array[] = [];
  let bytesRead = 0;

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    bytesRead += value.byteLength;

    if (bytesRead > maxResponseBytes) {
      await reader.cancel();
      throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_TOO_LARGE");
    }

    chunks.push(value);
  }

  try {
    const value: unknown = JSON.parse(Buffer.concat(chunks, bytesRead).toString("utf8"));
    if (!isRecord(value)) throw new Error("not an object");
    return value;
  } catch (error) {
    throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_INVALID", { retryable: false }, error);
  }
}

function safeString(value: Record<string, unknown> | undefined, source: string, target: string): Record<string, string> {
  const item = value?.[source];
  return typeof item === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(item) ? { [target]: item } : {};
}

function safeIdentifier(value: Record<string, unknown> | undefined, source: string, target: string): Record<string, string | number> {
  const item = value?.[source];
  return (typeof item === "number" && Number.isFinite(item)) || (typeof item === "string" && /^\d{1,20}$/.test(item)) ? { [target]: item } : {};
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
