import {
  INSTAGRAM_GRAPH_BASE_URL,
  INSTAGRAM_LONG_LIVED_TOKEN_URL,
  INSTAGRAM_SHORT_LIVED_TOKEN_URL,
} from "./instagram-provider";

const TIMEOUT_MS = 8_000;
const MAX_RESPONSE_BYTES = 256_000;
export const RECENT_MEDIA_LIMIT = 6;

export interface InstagramBasicProfile {
  userId: string;
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
  constructor(readonly authorizationInvalid = false) {
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
      accountId: String(value.user_id),
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
    const value = await this.json(url, { method: "GET" });
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
      userId: String(value.user_id),
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
      const body = await response.text();
      if (body.length > (this.limits.maxResponseBytes ?? MAX_RESPONSE_BYTES))
        throw new InstagramProviderError();
      const value: unknown = JSON.parse(body);
      if (!response.ok || !isRecord(value))
        throw new InstagramProviderError(
          response.status === 400 || response.status === 401,
        );
      return value;
    } catch (error) {
      if (error instanceof InstagramProviderError) throw error;
      throw new InstagramProviderError();
    } finally {
      clearTimeout(timeout);
    }
  }
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
