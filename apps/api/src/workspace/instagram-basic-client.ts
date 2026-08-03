import {
  INSTAGRAM_GRAPH_BASE_URL,
  INSTAGRAM_LONG_LIVED_TOKEN_URL,
  INSTAGRAM_SHORT_LIVED_TOKEN_URL,
} from "./instagram-provider";

const TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 256_000;
export const RECENT_MEDIA_LIMIT = 6;

export interface InstagramBasicProfile {
  /** Instagram professional account identity returned as `/me.user_id`. */
  professionalAccountId: string;
  username: string;
  accountType?: string;
  profilePictureUrl?: string;
  media: InstagramBasicMedia[];
}
export interface InstagramBasicMedia {
  id: string;
  mediaType: string;
  caption?: string;
  mediaUrl?: string;
  thumbnailUrl?: string;
  permalink?: string;
  timestamp?: string;
}

export class InstagramProviderError extends Error {
  constructor(
    readonly authorizationInvalid = false,
    readonly diagnostic: {
      httpStatus?: number;
      errorType?: string;
      errorCode?: string | number;
      errorSubcode?: string | number;
      retryable: boolean;
    } = { retryable: false },
  ) {
    super("Instagram could not complete the request");
  }
}

export class InstagramBasicClient {
  constructor(
    private readonly fetcher: typeof fetch = fetch,
    private readonly limits: {
      timeoutMs?: number;
      maxResponseBytes?: number;
    } = {},
  ) {}

  async exchangeCode(input: {
    appId: string;
    appSecret: string;
    code: string;
    redirectUri: string;
  }) {
    const body = new URLSearchParams({
      client_id: input.appId,
      client_secret: input.appSecret,
      code: input.code,
      grant_type: "authorization_code",
      redirect_uri: input.redirectUri,
    });
    const value = await this.json(INSTAGRAM_SHORT_LIVED_TOKEN_URL, {
      method: "POST",
      body,
    });
    if (
      typeof value.access_token !== "string" ||
      !["string", "number"].includes(typeof value.user_id)
    )
      throw new InstagramProviderError();
    return {
      accessToken: value.access_token,
      exchangeUserId: String(value.user_id),
    };
  }

  async exchangeLongLived(shortToken: string, appSecret: string) {
    const url = new URL(INSTAGRAM_LONG_LIVED_TOKEN_URL);
    url.searchParams.set("grant_type", "ig_exchange_token");
    url.searchParams.set("client_secret", appSecret);
    url.searchParams.set("access_token", shortToken);
    const value = await this.json(url, { method: "GET" });
    if (typeof value.access_token !== "string")
      throw new InstagramProviderError();
    return {
      accessToken: value.access_token,
      expiresIn: numberOr(value.expires_in, 5_184_000),
    };
  }

  async profile(accessToken: string): Promise<InstagramBasicProfile> {
    const url = new URL(`${INSTAGRAM_GRAPH_BASE_URL}/me`);
    url.searchParams.set(
      "fields",
      "user_id,username,account_type,profile_picture_url,media.limit(6){id,media_type,caption,media_url,thumbnail_url,permalink,timestamp}",
    );
    url.searchParams.set("access_token", accessToken);
    const response = await this.json(url, { method: "GET" });
    const value =
      Array.isArray(response.data) && isRecord(response.data[0])
        ? response.data[0]
        : response;
    if (
      !["string", "number"].includes(typeof value.user_id) ||
      typeof value.username !== "string"
    )
      throw new InstagramProviderError();
    const data =
      isRecord(value.media) && Array.isArray(value.media.data)
        ? value.media.data.slice(0, RECENT_MEDIA_LIMIT)
        : [];
    return {
      professionalAccountId: String(value.user_id),
      username: value.username,
      ...(typeof value.account_type === "string"
        ? { accountType: value.account_type }
        : {}),
      ...(typeof value.profile_picture_url === "string"
        ? { profilePictureUrl: value.profile_picture_url }
        : {}),
      media: data.flatMap(mapMedia),
    };
  }

  async refresh(accessToken: string) {
    const url = new URL("https://graph.instagram.com/refresh_access_token");
    url.searchParams.set("grant_type", "ig_refresh_token");
    url.searchParams.set("access_token", accessToken);
    const value = await this.json(url, { method: "GET" });
    if (typeof value.access_token !== "string")
      throw new InstagramProviderError();
    return {
      accessToken: value.access_token,
      expiresIn: numberOr(value.expires_in, 5_184_000),
    };
  }

  private async json(
    input: string | URL,
    init: RequestInit,
  ): Promise<Record<string, unknown>> {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      this.limits.timeoutMs ?? TIMEOUT_MS,
    );
    try {
      const response = await this.fetcher(input, {
        ...init,
        signal: controller.signal,
      });
      const maxBytes = this.limits.maxResponseBytes ?? MAX_RESPONSE_BYTES;
      const declaredLength = Number(response.headers.get("content-length"));
      if (Number.isFinite(declaredLength) && declaredLength > maxBytes)
        throw new InstagramProviderError();
      if (!response.body) throw new InstagramProviderError();

      const reader = response.body.getReader();
      const chunks: Uint8Array[] = [];
      let bytesRead = 0;
      while (true) {
        const { done, value: chunk } = await reader.read();
        if (done) break;
        bytesRead += chunk.byteLength;
        if (bytesRead > maxBytes) {
          await reader.cancel();
          throw new InstagramProviderError();
        }
        chunks.push(chunk);
      }
      const body = Buffer.concat(chunks, bytesRead).toString("utf8");
      const value: unknown = JSON.parse(body);
      if (!response.ok || !isRecord(value)) {
        const providerError =
          isRecord(value) && isRecord(value.error) ? value.error : undefined;
        throw new InstagramProviderError(
          response.status === 400 || response.status === 401,
          {
            httpStatus: response.status,
            retryable: response.status === 429 || response.status >= 500,
            ...safeString(providerError, "type", "errorType"),
            ...safeIdentifier(providerError, "code", "errorCode"),
            ...safeIdentifier(providerError, "error_subcode", "errorSubcode"),
          },
        );
      }
      return value;
    } catch (error) {
      if (error instanceof InstagramProviderError) throw error;
      throw new InstagramProviderError();
    } finally {
      clearTimeout(timeout);
    }
  }
}

function safeString(
  value: Record<string, unknown> | undefined,
  source: string,
  target: string,
): Record<string, string> {
  const item = value?.[source];
  return typeof item === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(item)
    ? { [target]: item }
    : {};
}

function safeIdentifier(
  value: Record<string, unknown> | undefined,
  source: string,
  target: string,
): Record<string, string | number> {
  const item = value?.[source];
  return (typeof item === "number" && Number.isFinite(item)) ||
    (typeof item === "string" && /^\d{1,20}$/.test(item))
    ? { [target]: item }
    : {};
}

function mapMedia(value: unknown): InstagramBasicMedia[] {
  if (
    !isRecord(value) ||
    typeof value.id !== "string" ||
    typeof value.media_type !== "string"
  )
    return [];
  return [
    {
      id: value.id,
      mediaType: value.media_type,
      ...optional(value, "caption", "caption"),
      ...optional(value, "media_url", "mediaUrl"),
      ...optional(value, "thumbnail_url", "thumbnailUrl"),
      ...optional(value, "permalink", "permalink"),
      ...optional(value, "timestamp", "timestamp"),
    },
  ];
}
function optional(
  value: Record<string, unknown>,
  source: string,
  target: string,
): Record<string, string> {
  return typeof value[source] === "string" ? { [target]: value[source] } : {};
}
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
function numberOr(value: unknown, fallback: number) {
  return typeof value === "number" && value > 0 ? value : fallback;
}
