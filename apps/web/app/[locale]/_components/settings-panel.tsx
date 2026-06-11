"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Instagram, Link2Off, RefreshCcw, Save } from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type { AuthSession, InstagramConnection, Locale } from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:4000";

export function SettingsPanel({ locale }: { locale: Locale }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [connection, setConnection] = useState<InstagramConnection | null>(null);
  const [accountId, setAccountId] = useState("");
  const [accessToken, setAccessToken] = useState("");
  const [tokenExpiresAt, setTokenExpiresAt] = useState(defaultTokenExpiry());
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);

  const client = useMemo(() => {
    const options = {
      baseUrl: apiBaseUrl
    } satisfies { baseUrl: string; accessToken?: string; workspaceId?: string };

    return new MarkosApiClient(
      session
        ? {
            ...options,
            accessToken: session.tokens.accessToken,
            workspaceId: session.workspace.id
          }
        : options
    );
  }, [session]);

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);
    if (stored) {
      setSession(JSON.parse(stored) as AuthSession);
    }
  }, []);

  useEffect(() => {
    if (!session) return;
    void refreshConnection(client, setConnection, setMessage);
  }, [client, session]);

  async function connect() {
    setIsBusy(true);
    setMessage("");

    try {
      const updated = await client.connectInstagram({
        accountId: accountId.trim(),
        accessToken: accessToken.trim(),
        tokenExpiresAt: new Date(tokenExpiresAt).toISOString()
      });
      setConnection(updated);
      setAccessToken("");
      setMessage(copy(locale, "connected"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function startOAuth() {
    setIsBusy(true);
    setMessage("");

    try {
      const start = await client.instagramOAuthStart({ locale });
      window.location.href = start.authorizationUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function disconnect() {
    setIsBusy(true);
    setMessage("");

    try {
      setConnection(await client.disconnectInstagram());
      setMessage(copy(locale, "disconnected"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : copy(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  if (!session) {
    return (
      <section className="mt-8 rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-accent">
          <Instagram size={20} />
          <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
        </div>
        <p className="mt-2 text-sm leading-6 text-muted">{copy(locale, "signInFirst")}</p>
      </section>
    );
  }

  return (
    <section className="mt-8 grid gap-4 xl:grid-cols-[320px_1fr]">
      <aside className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-navy">{copy(locale, "title")}</h2>
            <p className="mt-1 text-sm text-muted">{session.workspace.name}</p>
          </div>
          <button
            aria-label={copy(locale, "refresh")}
            className="rounded-button border border-border p-2 text-muted hover:text-navy"
            disabled={isBusy}
            onClick={() => refreshConnection(client, setConnection, setMessage)}
            type="button"
          >
            <RefreshCcw size={16} />
          </button>
        </div>

        <div className="mt-5 rounded-card border border-border p-4">
          <p className="text-xs font-medium uppercase tracking-normal text-muted">{copy(locale, "status")}</p>
          <p className="mt-1 text-lg font-semibold text-navy">
            {connection?.connected ? copy(locale, "connectedStatus") : copy(locale, "disconnectedStatus")}
          </p>
          {connection?.accountId ? <p className="mt-1 text-sm text-muted">{connection.accountId}</p> : null}
          {connection?.tokenExpiresAt ? (
            <p className="mt-1 text-xs text-muted">
              {copy(locale, "expires")} {new Date(connection.tokenExpiresAt).toLocaleString(locale)}
            </p>
          ) : null}
        </div>

        <p className="mt-4 text-sm leading-6 text-muted">{copy(locale, "note")}</p>
        <button
          className="mt-4 inline-flex w-full items-center justify-center gap-2 rounded-button bg-navy px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
          disabled={isBusy}
          onClick={startOAuth}
          type="button"
        >
          <ExternalLink size={16} />
          {copy(locale, "oauth")}
        </button>
        <p className="mt-3 min-h-5 text-sm text-muted">{message}</p>
      </aside>

      <div className="rounded-card border border-border bg-card p-5 shadow-card">
        <div className="flex items-center gap-2 text-accent">
          <Instagram size={20} />
          <h2 className="text-base font-semibold text-navy">{copy(locale, "manual")}</h2>
        </div>

        <div className="mt-5 grid gap-4 md:grid-cols-2">
          <label className="block">
            <span className="text-xs font-medium text-muted">{copy(locale, "accountId")}</span>
            <input
              className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              onChange={(event) => setAccountId(event.target.value)}
              value={accountId}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-muted">{copy(locale, "expiresAt")}</span>
            <input
              className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
              onChange={(event) => setTokenExpiresAt(event.target.value)}
              type="datetime-local"
              value={tokenExpiresAt}
            />
          </label>
        </div>

        <label className="mt-4 block">
          <span className="text-xs font-medium text-muted">{copy(locale, "token")}</span>
          <input
            className="mt-1 w-full rounded-input border border-border px-3 py-2 text-sm outline-none focus:border-accent"
            onChange={(event) => setAccessToken(event.target.value)}
            type="password"
            value={accessToken}
          />
        </label>

        <div className="mt-5 flex flex-wrap gap-2">
          <button
            className="inline-flex items-center gap-2 rounded-button bg-accent px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
            disabled={isBusy}
            onClick={connect}
            type="button"
          >
            <Save size={16} />
            {copy(locale, "save")}
          </button>
          <button
            className="inline-flex items-center gap-2 rounded-button border border-border px-3 py-2 text-sm text-muted disabled:opacity-50"
            disabled={isBusy}
            onClick={disconnect}
            type="button"
          >
            <Link2Off size={16} />
            {copy(locale, "disconnect")}
          </button>
        </div>
      </div>
    </section>
  );
}

async function refreshConnection(
  client: MarkosApiClient,
  setConnection: (connection: InstagramConnection) => void,
  setMessage: (message: string) => void
) {
  try {
    setConnection(await client.instagramConnection());
  } catch (error) {
    setMessage(error instanceof Error ? error.message : "Request failed");
  }
}

function defaultTokenExpiry(): string {
  const date = new Date(Date.now() + 60 * 24 * 60 * 60 * 1000);
  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}

function copy(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      accountId: "Instagram account ID",
      connected: "Instagram connection saved",
      connectedStatus: "Connected",
      disconnect: "Disconnect",
      disconnected: "Instagram disconnected",
      disconnectedStatus: "Not connected",
      expires: "Expires",
      expiresAt: "Token expiry",
      failed: "Request failed",
      manual: "Manual connection",
      note: "Connect through Instagram OAuth for App Review testing. Manual tokens remain available for local development.",
      oauth: "Connect Instagram",
      refresh: "Refresh",
      save: "Save connection",
      signInFirst: "Sign in from the dashboard first to manage workspace settings.",
      status: "Status",
      title: "Settings",
      token: "Access token"
    },
    en: {
      accountId: "Instagram account ID",
      connected: "Instagram connection saved",
      connectedStatus: "Connected",
      disconnect: "Disconnect",
      disconnected: "Instagram disconnected",
      disconnectedStatus: "Not connected",
      expires: "Expires",
      expiresAt: "Token expiry",
      failed: "Request failed",
      manual: "Manual connection",
      note: "Connect through Instagram OAuth for App Review testing. Manual tokens remain available for local development.",
      oauth: "Connect Instagram",
      refresh: "Refresh",
      save: "Save connection",
      signInFirst: "Sign in from the dashboard first to manage workspace settings.",
      status: "Status",
      title: "Settings",
      token: "Access token"
    }
  };

  return dictionary[locale][key] ?? key;
}
