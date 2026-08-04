import { env } from "../config/env";

export const REFRESH_COOKIE_NAME = "markos_refresh";

export function refreshCookieHeader(refreshToken: string): string {
  return serializeRefreshCookie(encodeURIComponent(refreshToken), env.JWT_REFRESH_TTL);
}

export function clearRefreshCookieHeader(): string {
  return serializeRefreshCookie("", 0);
}

export function readRefreshCookie(cookieHeader: string | undefined): string | undefined {
  if (!cookieHeader) return undefined;

  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) continue;

    const name = part.slice(0, separator).trim();
    if (name !== REFRESH_COOKIE_NAME) continue;

    const value = part.slice(separator + 1).trim();
    if (!value) return undefined;

    try {
      return decodeURIComponent(value);
    } catch {
      return undefined;
    }
  }

  return undefined;
}

function serializeRefreshCookie(value: string, maxAge: number): string {
  const production = env.NODE_ENV === "production";
  const attributes = [`${REFRESH_COOKIE_NAME}=${value}`, "Path=/v1/auth", "HttpOnly", `Max-Age=${maxAge}`, production ? "SameSite=None" : "SameSite=Lax"];

  if (production) attributes.push("Secure");
  return attributes.join("; ");
}
