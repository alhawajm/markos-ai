"use client";

import { useMemo } from "react";
import { MarkosApiClient, MarkosApiError } from "@markos/api-client";
import type { AuthSession, Locale } from "@markos/shared-types";
import { create } from "zustand";
import { getBrowserApiBaseUrl } from "./api-base-url";

const SESSION_KEY = "markos.session";
const REFRESH_LOCK_NAME = "markos.session.refresh";

interface SessionState {
  session: AuthSession | null;
  setSession: (session: AuthSession | null) => void;
}

interface StoredIdentity {
  roles: AuthSession["roles"];
  user: AuthSession["user"];
  workspace: AuthSession["workspace"];
}

const useSessionStore = create<SessionState>((set) => ({
  session: null,
  setSession: (session) => set({ session })
}));

let renewalPromise: Promise<AuthSession> | null = null;
let redirecting = false;

export function useMarkosSession(): AuthSession | null {
  return useSessionStore((state) => state.session);
}

export function useMarkosClient(locale: Locale): MarkosApiClient {
  const session = useMarkosSession();

  return useMemo(() => createMarkosClient(session, locale), [locale, session]);
}

export function createMarkosClient(session: AuthSession | null, locale: Locale): MarkosApiClient {
  const baseUrl = getBrowserApiBaseUrl();

  if (!session) return new MarkosApiClient({ baseUrl });

  return new MarkosApiClient({
    accessToken: session.tokens.accessToken,
    baseUrl,
    onSessionExpired: () => expireBrowserSession(locale),
    renewAccessToken: async () => (await renewBrowserSession()).tokens.accessToken,
    workspaceId: session.workspace.id
  });
}

export async function initializeBrowserSession(locale: Locale): Promise<AuthSession> {
  const existing = useSessionStore.getState().session;
  if (existing) return existing;

  const hadStoredIdentity = readStoredIdentity() !== null;

  try {
    return await renewBrowserSession();
  } catch (error) {
    if (isTerminalSessionError(error)) {
      clearBrowserSession();
      redirectToLogin(locale, hadStoredIdentity);
    }
    throw error;
  }
}

export function refreshBrowserSession(): Promise<AuthSession> {
  return renewBrowserSession();
}

export function setBrowserSession(session: AuthSession): void {
  const identity: StoredIdentity = {
    roles: session.roles,
    user: session.user,
    workspace: session.workspace
  };

  window.localStorage.setItem(SESSION_KEY, JSON.stringify(identity));
  useSessionStore.getState().setSession(session);
}

export async function logoutBrowserSession(locale: Locale): Promise<void> {
  clearBrowserSession();

  try {
    await new MarkosApiClient({ baseUrl: getBrowserApiBaseUrl() }).logout();
  } finally {
    redirectToLogin(locale, false);
  }
}

export function watchBrowserSession(locale: Locale): () => void {
  const onStorage = (event: StorageEvent) => {
    if (event.key !== SESSION_KEY || event.newValue !== null) return;
    if (!useSessionStore.getState().session) return;

    useSessionStore.getState().setSession(null);
    redirectToLogin(locale, false);
  };

  window.addEventListener("storage", onStorage);
  return () => window.removeEventListener("storage", onStorage);
}

function renewBrowserSession(): Promise<AuthSession> {
  if (renewalPromise) return renewalPromise;

  const renew = async () => {
    const session = await new MarkosApiClient({
      baseUrl: getBrowserApiBaseUrl()
    }).refreshSession();
    setBrowserSession(session);
    return session;
  };

  renewalPromise = (navigator.locks ? navigator.locks.request(REFRESH_LOCK_NAME, renew) : renew()).finally(() => {
    renewalPromise = null;
  });

  return renewalPromise;
}

function expireBrowserSession(locale: Locale): void {
  clearBrowserSession();
  redirectToLogin(locale, true);
}

function clearBrowserSession(): void {
  window.localStorage.removeItem(SESSION_KEY);
  useSessionStore.getState().setSession(null);
}

function redirectToLogin(locale: Locale, expired: boolean): void {
  if (redirecting) return;
  redirecting = true;
  const reason = expired ? "?reason=session-expired" : "";
  window.location.assign(`/${locale}/login${reason}`);
}

function readStoredIdentity(): StoredIdentity | null {
  const stored = window.localStorage.getItem(SESSION_KEY);
  if (!stored) return null;

  try {
    const value = JSON.parse(stored) as Partial<StoredIdentity> & {
      tokens?: unknown;
    };

    if (!Array.isArray(value.roles) || typeof value.user?.id !== "string" || typeof value.user.email !== "string" || typeof value.workspace?.id !== "string") {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }

    const identity: StoredIdentity = {
      roles: value.roles as AuthSession["roles"],
      user: value.user,
      workspace: value.workspace
    };

    if (value.tokens !== undefined) {
      window.localStorage.setItem(SESSION_KEY, JSON.stringify(identity));
    }

    return identity;
  } catch {
    window.localStorage.removeItem(SESSION_KEY);
    return null;
  }
}

function isTerminalSessionError(error: unknown): boolean {
  return (
    error instanceof MarkosApiError &&
    ["INVALID_REFRESH_TOKEN", "REFRESH_TOKEN_REUSE_DETECTED", "MFA_REQUIRED", "MFA_SETUP_REQUIRED"].includes(error.code ?? "")
  );
}
