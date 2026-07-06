"use client";

export function getBrowserApiBaseUrl(): string {
  const configured = process.env.NEXT_PUBLIC_API_BASE_URL?.trim();

  if (configured) {
    return configured.replace(/\/$/, "");
  }

  if (typeof window !== "undefined" && window.location.hostname.length > 0) {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}
