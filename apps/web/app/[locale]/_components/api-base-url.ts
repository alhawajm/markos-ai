"use client";

export function getBrowserApiBaseUrl(): string {
  // Keep local requests on the page origin. Next forwards /v1 to the IPv4 API,
  // avoiding cross-port CORS and localhost IPv6 resolution in the browser.
  if (process.env.NODE_ENV === "development" && typeof window !== "undefined" && ["localhost", "127.0.0.1", "[::1]"].includes(window.location.hostname)) {
    return window.location.origin;
  }

  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location.hostname.length > 0) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}
