import type { InstagramConnection } from "@markos/shared-types";

export function sanitizedCallbackUrl(value: string): string {
  const url = new URL(value);
  for (const key of ["instagram", "code", "state", "error", "error_reason", "error_description"]) url.searchParams.delete(key);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function instagramStatusLabel(connection: InstagramConnection): "connected" | "connecting" | "disconnected" | "reauthorize" | "failed" {
  if (connection.status === "REAUTHORIZE_REQUIRED") return "reauthorize";
  if (connection.status === "AUTHORIZATION_FAILED" || connection.status === "REFRESH_FAILED") return "failed";
  if (connection.status === "CONNECTING") return "connecting";
  return connection.connected ? "connected" : "disconnected";
}

export function containsCredentialFields(value: unknown): boolean {
  return Boolean(value && typeof value === "object" && Object.keys(value).some((key) => /token|secret|code|state/i.test(key)));
}
