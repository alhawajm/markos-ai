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

export async function switchBrowserWorkspace(workspaceId: string, locale: Locale, totpCode?: string): Promise<void> {
  await renewalPromise;
  const current = useSessionStore.getState().session;
  if (!current) throw new MarkosApiError("Sign in again", 401, "INVALID_TOKEN");
  const switchSession = async () => {
    const client = new MarkosApiClient({ baseUrl: getBrowserApiBaseUrl(), accessToken: current.tokens.accessToken, workspaceId: current.workspace.id });
    let next: AuthSession;
    try {
      next = await client.switchWorkspace(workspaceId, totpCode);
    } catch (error) {
      if (!(error instanceof MarkosApiError) || error.code !== "INVALID_TOKEN") throw error;
      // This operation already owns the refresh lock. Rotate directly once.
      const refreshed = await new MarkosApiClient({ baseUrl: getBrowserApiBaseUrl() }).refreshSession();
      if (refreshed.user.id !== current.user.id || refreshed.workspace.id !== current.workspace.id) {
        window.location.reload();
        return;
      }
      setBrowserSession(refreshed);
      next = await new MarkosApiClient({
        baseUrl: getBrowserApiBaseUrl(),
        accessToken: refreshed.tokens.accessToken,
        workspaceId: refreshed.workspace.id
      }).switchWorkspace(workspaceId, totpCode);
    }
    if (useSessionStore.getState().session?.user.id !== current.user.id) return;
    setBrowserSession(next);
    // A full navigation discards every old workspace cache and in-flight view.
    window.location.replace(`/${locale}/app`);
  };
  await (navigator.locks ? navigator.locks.request(REFRESH_LOCK_NAME, switchSession) : switchSession());
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
    if (event.key !== SESSION_KEY) return;
    if (!useSessionStore.getState().session) return;

    if (event.newValue !== null) {
      const identity = readStoredIdentity();
      const current = useSessionStore.getState().session;
      if (identity && (identity.workspace.id !== current?.workspace.id || identity.user.id !== current?.user.id)) window.location.reload();
      return;
    }

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
