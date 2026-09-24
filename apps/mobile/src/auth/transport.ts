import * as SecureStore from "expo-secure-store";
import { MarkosApiError } from "@markos/api-client";
import type { NativeAuthSession } from "@markos/shared-types";
import { config, serviceKey } from "../config";
import { SessionController, type SessionTransport } from "./session-controller";
import { scopedFetchFor } from "./scoped-fetch";

const key = `markos.refresh.${serviceKey}`;

async function request<T>(path: string, body: object, native = true, accessToken?: string): Promise<T> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);
  try {
    const response = await fetch(`${config.apiUrl}/v1/auth/${native ? "native/" : ""}${path}`, {
      method: "POST",
      credentials: "omit",
      signal: controller.signal,
      headers: { "Content-Type": "application/json", "X-Markos-Session": "native", ...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}) },
      body: JSON.stringify(body)
    });
    const envelope = await response.json().catch(() => null);
    if (!response.ok) throw new MarkosApiError("Authentication request failed", response.status, envelope?.error?.code);
    if (!envelope?.data) throw new MarkosApiError("Invalid authentication response", 502, "INVALID_RESPONSE");
    return envelope.data as T;
  } finally {
    clearTimeout(timeout);
  }
}

function grant(value: NativeAuthSession): NativeAuthSession {
  if (!value?.tokens?.accessToken || !value.tokens.refreshToken || !value.user?.id || !value.workspace?.id) {
    throw new MarkosApiError("Invalid authentication response", 502, "INVALID_RESPONSE");
  }
  return value;
}

const transport: SessionTransport = {
  verifyMfa: async (code, accessToken) => grant(await request<NativeAuthSession>("mfa/totp/verify", { code }, true, accessToken)),
  register: async (input) => grant(await request<NativeAuthSession>("register", input)),
  login: async (input) => grant(await request<NativeAuthSession>("login", input)),
  refresh: async (refreshToken) => grant(await request<NativeAuthSession>("refresh", { refreshToken })),
  logout: async (refreshToken) => {
    await request("logout", { refreshToken });
  }
};
export const passwordRecovery = {
  request: (input: { email: string; locale: "en" | "ar" }) => request<import("@markos/shared-types").PasswordResetChallenge>("password/forgot", input, false),
  reset: (input: { challengeId: string; code: string; password: string; confirmPassword: string }) => request<{ reset: true }>("password/reset", input, false)
};

export const sessionController = new SessionController(
  {
    read: () => SecureStore.getItemAsync(key),
    write: (refreshToken) => SecureStore.setItemAsync(key, refreshToken, { keychainAccessible: SecureStore.WHEN_UNLOCKED_THIS_DEVICE_ONLY }),
    clear: () => SecureStore.deleteItemAsync(key)
  },
  transport
);

export const createScopedFetch = (epoch: number): typeof fetch => scopedFetchFor(sessionController, epoch);
