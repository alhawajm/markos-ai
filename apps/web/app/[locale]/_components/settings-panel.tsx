"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import {
  ArrowRight,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Globe2,
  Instagram,
  KeyRound,
  Link2Off,
  LockKeyhole,
  RefreshCcw,
  ScrollText,
  Save,
  ShieldCheck,
  UserRound,
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type {
  AuditLogRecord,
  BillingSummary,
  InstagramConnection,
  Locale,
  MfaTotpSetup,
} from "@markos/shared-types";
import { SurfaceState } from "./surface-state";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import {
  instagramStatusLabel,
  sanitizedCallbackUrl,
} from "./instagram-settings-state";

type AuditState = "loading" | "error" | "success" | "limit";

export function SettingsPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [connection, setConnection] = useState<InstagramConnection | null>(
    null,
  );
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [mfaSetup, setMfaSetup] = useState<MfaTotpSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [message, setMessage] = useState("");
  const [disconnectWarningUrl, setDisconnectWarningUrl] = useState<
    string | null
  >(null);
  const [isBusy, setIsBusy] = useState(false);
  const [auditState, setAuditState] = useState<AuditState | null>(null);

  const client = useMarkosClient(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedState = params.get("state");
    const instagramResult = params.get("instagram");

    if (isAuditState(requestedState)) {
      setAuditState(requestedState);
    }
    if (instagramResult === "connected") setMessage(copy(locale, "connected"));
    if (instagramResult === "error")
      setMessage(copy(locale, "authorizationFailed"));
    if (
      instagramResult === "connected" ||
      instagramResult === "error" ||
      params.has("code") ||
      params.has("state") ||
      params.has("error")
    ) {
      window.history.replaceState(
        {},
        "",
        sanitizedCallbackUrl(window.location.href),
      );
    }
  }, [locale]);

  useEffect(() => {
    if (!session) return;
    void refreshSettings(
      client,
      setConnection,
      setBilling,
      setAuditLogs,
      setMessage,
    );
  }, [client, session]);

  async function refreshAllSettings() {
    if (!session) {
      setAuditState("success");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setAuditState("loading");
    setMessage("");
    setDisconnectWarningUrl(null);

    const loaded = await refreshSettings(
      client,
      setConnection,
      setBilling,
      setAuditLogs,
      setMessage,
    );
    setAuditState(loaded ? "success" : "error");
    setIsBusy(false);
  }

  async function startOAuth() {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const start = await client.instagramOAuthStart({
        locale,
        returnTo: `/${locale}/app/settings`,
      });
      window.location.href = start.authorizationUrl;
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function disconnect() {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    if (!window.confirm(copy(locale, "disconnectConfirm"))) return;

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const result = await client.disconnectInstagram();
      setConnection(result.connection);
      if (result.providerRevocation.status === "UNCONFIRMED") {
        setDisconnectWarningUrl(
          result.providerRevocation.manualRevocationUrl ?? null,
        );
        setMessage(copy(locale, "disconnectUnconfirmed"));
      } else {
        setMessage(
          copy(
            locale,
            result.providerRevocation.status === "CONFIRMED"
              ? "disconnectedRevoked"
              : "disconnected",
          ),
        );
      }
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshToken() {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const result = await client.refreshInstagramToken();
      if (result.connection) {
        setConnection(result.connection);
      }
      setMessage(
        result.refreshed
          ? copy(locale, "tokenRefreshed")
          : (result.reason ?? copy(locale, "failed")),
      );
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function setupMfa() {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      setMfaSetup(await client.setupMfaTotp());
      setMessage(copy(locale, "mfaReady"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function enableMfa() {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const status = await client.enableMfaTotp({ code: mfaCode.trim() });
      setMessage(
        status.enabled ? copy(locale, "mfaEnabled") : copy(locale, "failed"),
      );
      setMfaCode("");
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function exportData() {
    if (!session) {
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const data = await client.exportWorkspaceData();
      const blob = new Blob([JSON.stringify(data, null, 2)], {
        type: "application/json",
      });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `markos-workspace-${session.workspace.id}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage(copy(locale, "exportReady"));
    } catch (error) {
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  const activeConnection = connection ?? {
    connected: false,
    status: "DISCONNECTED" as const,
    recentMedia: [],
  };
  const workspaceName = session?.workspace.name ?? "Zain Arabia";
  const userName = session?.user.fullName ?? "Ahmed Khalil";
  const userEmail = session?.user.email ?? "ahmed@zain.example";
  const subscription = billing?.subscription;

  return (
    <section className="grid gap-4 xl:grid-cols-[320px_minmax(0,1fr)]">
      <div className="rounded-[20px] bg-[linear-gradient(135deg,#14182b_0%,#102f54_55%,#24203f_100%)] p-5 text-white shadow-card xl:col-span-2">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-3 py-1 text-[11px] font-bold uppercase tracking-[0.18em] text-[#ff4b6e]">
              <ShieldCheck size={13} />
              {copy(locale, "eyebrow")}
            </div>
            <h1 className="mt-4 font-display text-[28px] font-bold leading-tight">
              {copy(locale, "title")}
            </h1>
            <p className="mt-2 max-w-2xl text-sm leading-6 text-white/65">
              {copy(locale, "subtitle")}
            </p>
          </div>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-button border border-white/15 bg-white/10 px-4 py-3 text-sm font-bold text-white disabled:opacity-60"
            disabled={isBusy || !session}
            onClick={refreshAllSettings}
            type="button"
          >
            <RefreshCcw size={16} />
            {copy(locale, "refresh")}
          </button>
        </div>
      </div>

      {isBusy || auditState ? (
        <div className="xl:col-span-2">
          <SurfaceState
            action={
              auditState === "limit" ? (
                <a
                  className="inline-flex h-10 items-center rounded-button bg-accent px-4 text-sm font-bold text-white"
                  href={`/${locale}/admin`}
                >
                  {copy(locale, "openAdmin")}
                </a>
              ) : (
                <button
                  className="inline-flex h-10 items-center gap-2 rounded-button border border-border bg-card px-4 text-sm font-bold text-navy disabled:opacity-60"
                  disabled={isBusy || !session}
                  onClick={refreshAllSettings}
                  type="button"
                >
                  <RefreshCcw size={15} />
                  {copy(locale, "refresh")}
                </button>
              )
            }
            body={auditStateText(locale, isBusy ? "loading" : auditState).body}
            title={
              auditStateText(locale, isBusy ? "loading" : auditState).title
            }
            tone={
              auditState === "error"
                ? "error"
                : auditState === "success"
                  ? "success"
                  : auditState === "limit"
                    ? "limit"
                    : "loading"
            }
          />
        </div>
      ) : null}

      <aside className="grid gap-4">
        <Panel
          id="profile"
          icon={UserRound}
          kicker={copy(locale, "account")}
          title={userName}
          body={userEmail}
        >
          <div className="mt-4 grid gap-2">
            <SettingRow
              label={copy(locale, "workspace")}
              value={workspaceName}
            />
            <SettingRow
              label={copy(locale, "role")}
              value={(session?.roles ?? ["OWNER"]).join(", ")}
            />
            <SettingRow
              label={copy(locale, "verified")}
              value={
                session?.user.isVerified
                  ? copy(locale, "yes")
                  : copy(locale, "pending")
              }
            />
          </div>
        </Panel>

        <Panel
          icon={Globe2}
          kicker={copy(locale, "language")}
          title={copy(locale, "languageTitle")}
          body={copy(locale, "languageBody")}
        >
          <div className="mt-4 grid grid-cols-2 gap-2">
            <Link
              className={languageClass(locale === "ar")}
              href="/ar/app/settings"
            >
              العربية
            </Link>
            <Link
              className={languageClass(locale === "en")}
              href="/en/app/settings"
            >
              English
            </Link>
          </div>
        </Panel>

        <Panel
          icon={CreditCard}
          kicker={copy(locale, "billing")}
          title={subscription?.planCode ?? "STARTER"}
          body={subscription?.status ?? copy(locale, "trial")}
        >
          <div className="mt-4 grid gap-2">
            <SettingRow label={copy(locale, "currency")} value="BHD" />
            <SettingRow
              label={copy(locale, "invoices")}
              value={String(billing?.invoices.length ?? 0)}
            />
            <SettingRow
              label={copy(locale, "payments")}
              value={String(billing?.payments.length ?? 0)}
            />
          </div>
        </Panel>
      </aside>

      <div className="grid gap-4">
        <div className="grid gap-4 lg:grid-cols-2">
          <Panel
            icon={Instagram}
            kicker={copy(locale, "channels")}
            title={copy(locale, "instagram")}
            body={copy(
              locale,
              activeConnection.connected
                ? "connectedStatus"
                : "disconnectedStatus",
            )}
          >
            <div className="mt-4 grid gap-3 rounded-[18px] border border-border bg-canvas p-4">
              <SettingRow
                label={copy(locale, "accountId")}
                value={
                  activeConnection.username
                    ? `@${activeConnection.username}`
                    : (activeConnection.accountId ?? "Not set")
                }
              />
              <SettingRow
                label={copy(locale, "status")}
                value={instagramStatusLabel(activeConnection)}
              />
              <SettingRow
                label={copy(locale, "lastSync")}
                value={
                  activeConnection.lastSyncedAt
                    ? new Date(activeConnection.lastSyncedAt).toLocaleString(
                        locale,
                      )
                    : copy(locale, "pending")
                }
              />
              <SettingRow
                label={copy(locale, "publishMode")}
                value={copy(locale, "dryRun")}
              />
              <SettingRow
                label={copy(locale, "expires")}
                value={
                  activeConnection.tokenExpiresAt
                    ? new Date(
                        activeConnection.tokenExpiresAt,
                      ).toLocaleDateString(locale)
                    : copy(locale, "pending")
                }
              />
            </div>

            <div
              className="mt-4 grid gap-3 sm:grid-cols-2"
              aria-label={copy(locale, "recentMedia")}
            >
              {(activeConnection.recentMedia ?? []).map((media) => (
                <a
                  className="rounded-[18px] border border-border bg-canvas p-3"
                  href={media.permalink ?? "#"}
                  key={media.id}
                  rel="noreferrer"
                  target={media.permalink ? "_blank" : undefined}
                >
                  {(media.thumbnailUrl ?? media.mediaUrl) ? (
                    // eslint-disable-next-line @next/next/no-img-element -- Instagram media hosts are dynamic and short-lived.
                    <img
                      alt={media.caption ?? media.mediaType}
                      className="aspect-square w-full rounded-xl object-cover"
                      src={media.thumbnailUrl ?? media.mediaUrl}
                    />
                  ) : null}
                  <p className="mt-2 truncate text-sm font-bold">
                    {media.caption ?? media.mediaType}
                  </p>
                </a>
              ))}
              {activeConnection.connected &&
              (activeConnection.recentMedia?.length ?? 0) === 0 ? (
                <p className="text-sm text-muted">
                  {copy(locale, "emptyMedia")}
                </p>
              ) : null}
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <ActionButton
                disabled={isBusy}
                icon={ExternalLink}
                label={copy(
                  locale,
                  activeConnection.connected ? "reconnect" : "oauth",
                )}
                onClick={startOAuth}
                tone="primary"
              />
              <ActionButton
                disabled={isBusy || !activeConnection.connected}
                icon={RefreshCcw}
                label={copy(locale, "refreshToken")}
                onClick={refreshToken}
              />
              <ActionButton
                disabled={isBusy || !activeConnection.connected}
                icon={Link2Off}
                label={copy(locale, "disconnect")}
                onClick={disconnect}
              />
            </div>
          </Panel>

          <Panel
            icon={LockKeyhole}
            kicker={copy(locale, "security")}
            title={copy(locale, "securityTitle")}
            body={copy(locale, "securityBody")}
          >
            <div className="mt-4 rounded-[18px] border border-border bg-canvas p-4">
              <SettingRow
                label={copy(locale, "mfa")}
                value={
                  mfaSetup?.enabled
                    ? copy(locale, "enabled")
                    : copy(locale, "notEnabled")
                }
              />
              {mfaSetup?.secret ? (
                <SettingRow
                  label={copy(locale, "secret")}
                  value={mfaSetup.secret}
                />
              ) : null}
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
              <input
                className="rounded-button border border-border bg-canvas px-3 py-2 text-sm outline-none focus:border-accent"
                onChange={(event) => setMfaCode(event.target.value)}
                placeholder={copy(locale, "mfaCode")}
                value={mfaCode}
              />
              <ActionButton
                disabled={isBusy || mfaCode.trim().length === 0}
                icon={KeyRound}
                label={copy(locale, "enableMfa")}
                onClick={enableMfa}
                tone="primary"
              />
            </div>
            <div className="mt-3 flex flex-wrap gap-2">
              <ActionButton
                disabled={isBusy}
                icon={ShieldCheck}
                label={copy(locale, "setupMfa")}
                onClick={setupMfa}
              />
              <ActionButton
                disabled={isBusy}
                icon={Download}
                label={copy(locale, "exportData")}
                onClick={exportData}
              />
            </div>
          </Panel>
        </div>

        <Panel
          icon={ScrollText}
          kicker={copy(locale, "audit")}
          title={copy(locale, "auditTitle")}
          body={copy(locale, "auditBody")}
        >
          {auditLogs.length === 0 ? (
            <div className="mt-4 rounded-[18px] border border-dashed border-border bg-canvas p-6 text-sm text-muted">
              {copy(locale, "auditEmpty")}
            </div>
          ) : (
            <div className="mt-4 overflow-hidden rounded-[18px] border border-border">
              {auditLogs.slice(0, 8).map((log) => (
                <div
                  className="grid gap-1 border-b border-border px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(160px,1fr)_160px_180px]"
                  key={log.id}
                >
                  <span className="font-bold text-navy">
                    {formatAction(log.action)}
                  </span>
                  <span className="text-muted">{log.targetType}</span>
                  <span className="text-muted">
                    {new Date(log.createdAt).toLocaleString(locale)}
                  </span>
                </div>
              ))}
            </div>
          )}
        </Panel>

        <div className="rounded-[20px] border border-border bg-card p-4 shadow-card">
          <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-[16px] bg-accent/10 text-accent">
                <Database size={20} />
              </div>
              <div>
                <h2 className="text-base font-bold text-navy">
                  {copy(locale, "dataControls")}
                </h2>
                <p className="text-xs text-muted">
                  {copy(locale, "dataControlsBody")}
                </p>
              </div>
            </div>
            <a
              className="inline-flex items-center justify-center gap-2 rounded-button border border-border bg-canvas px-4 py-3 text-sm font-bold text-navy hover:border-accent hover:text-accent"
              href={`/${locale}/vault`}
            >
              {copy(locale, "openVault")}
              <ArrowRight size={16} />
            </a>
          </div>
        </div>

        {message ? (
          <div aria-live="polite" role="status">
            <SurfaceState
              action={
                disconnectWarningUrl ? (
                  <a
                    className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-accent/20 bg-white px-4 text-sm font-extrabold text-accent"
                    href={disconnectWarningUrl}
                    rel="noreferrer"
                    target="_blank"
                  >
                    {copy(locale, "openInstagramAccess")}
                    <ExternalLink size={15} />
                  </a>
                ) : undefined
              }
              body={message}
              title={copy(
                locale,
                auditState === "error" || disconnectWarningUrl
                  ? "attention"
                  : "status",
              )}
              tone={
                auditState === "error"
                  ? "error"
                  : disconnectWarningUrl
                    ? "warning"
                    : "info"
              }
            />
          </div>
        ) : (
          <p className="min-h-5" />
        )}
      </div>
    </section>
  );
}

function Panel({
  body,
  children,
  id,
  icon: Icon,
  kicker,
  title,
}: {
  body: string;
  children?: React.ReactNode;
  id?: string;
  icon: typeof ShieldCheck;
  kicker: string;
  title: string;
}) {
  return (
    <article className="scroll-mt-6 rounded-[20px] border border-border bg-card p-5 shadow-card" id={id}>
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-muted">
            {kicker}
          </p>
          <h2 className="mt-2 text-lg font-bold text-navy">{title}</h2>
          <p className="mt-1 text-sm leading-6 text-muted">{body}</p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-[#FEEAF0] text-accent">
          <Icon size={21} />
        </div>
      </div>
      {children}
    </article>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-muted">{label}</span>
      <span className="truncate font-bold text-navy">{value}</span>
    </div>
  );
}

function ActionButton({
  disabled,
  icon: Icon,
  label,
  onClick,
  tone = "secondary",
}: {
  disabled: boolean;
  icon: typeof Save;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      className={
        tone === "primary"
          ? "inline-flex items-center justify-center gap-2 rounded-button bg-accent px-4 py-2 text-sm font-bold text-white shadow-[0_10px_20px_rgba(239,62,91,.18)] disabled:opacity-60"
          : "inline-flex items-center justify-center gap-2 rounded-button border border-border bg-canvas px-4 py-2 text-sm font-bold text-navy disabled:opacity-60"
      }
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      <Icon size={15} />
      {label}
    </button>
  );
}

async function refreshSettings(
  client: MarkosApiClient,
  setConnection: (connection: InstagramConnection) => void,
  setBilling: (billing: BillingSummary) => void,
  setAuditLogs: (auditLogs: AuditLogRecord[]) => void,
  setMessage: (message: string) => void,
): Promise<boolean> {
  try {
    const [connection, billing, auditLogs] = await Promise.all([
      client.instagramConnection(),
      client.billingSummary(),
      client.auditLogs({ limit: 10 }),
    ]);
    setConnection(connection);
    setBilling(billing);
    setAuditLogs(auditLogs);
    return true;
  } catch (error) {
    setMessage(
      error instanceof Error ? error.message : "Settings could not be loaded.",
    );
    return false;
  }
}

function formatAction(action: string): string {
  return action
    .toLowerCase()
    .split("_")
    .map((part) => `${part.slice(0, 1).toUpperCase()}${part.slice(1)}`)
    .join(" ");
}

function languageClass(active: boolean): string {
  return active
    ? "rounded-button bg-navy px-3 py-2 text-center text-sm font-bold text-white"
    : "rounded-button border border-border bg-canvas px-3 py-2 text-center text-sm font-bold text-navy";
}

function isAuditState(value: string | null): value is AuditState {
  return (
    value === "loading" ||
    value === "error" ||
    value === "success" ||
    value === "limit"
  );
}

function auditStateText(
  locale: Locale,
  state: AuditState | null,
): { body: string; title: string } {
  const resolved = state ?? "success";
  const dictionary: Record<
    Locale,
    Record<AuditState, { body: string; title: string }>
  > = {
    ar: {
      error: {
        body: "تعذر تحميل إعدادات مساحة العمل. لن يتم تنفيذ التغييرات الحساسة حتى تعود بيانات الحساب والفوترة والقنوات.",
        title: "تعذر تحميل الإعدادات",
      },
      limit: {
        body: "بعض تغييرات الخطة أو القنوات تحتاج ترقية أو مراجعة حدود الاشتراك قبل المتابعة.",
        title: "تحتاج مراجعة الخطة",
      },
      loading: {
        body: "يتم تحميل الحساب، الفوترة، اتصال Instagram، وسجل التدقيق لمساحة العمل الحالية.",
        title: "جار تحديث الإعدادات",
      },
      success: {
        body: "الإعدادات جاهزة. يمكنك إدارة اللغة، القنوات، الأمان، والبيانات مع بقاء كل شيء مرتبطا بمساحة العمل.",
        title: "الإعدادات جاهزة",
      },
    },
    en: {
      error: {
        body: "Workspace settings could not be loaded. Sensitive changes stay blocked until account, billing, and channel data return.",
        title: "Settings load failed",
      },
      limit: {
        body: "Some plan or channel changes need a subscription upgrade or quota review before they can continue.",
        title: "Plan review needed",
      },
      loading: {
        body: "Loading account, billing, Instagram connection, and audit history for the current workspace.",
        title: "Refreshing settings",
      },
      success: {
        body: "Settings are ready. Manage language, channels, security, and data controls while everything remains workspace-scoped.",
        title: "Settings ready",
      },
    },
  };

  return dictionary[locale][resolved];
}

function copy(locale: Locale, key: string): string {
  const dictionary = {
    ar: {
      account: "الحساب",
      accountId: "حساب إنستغرام",
      attention: "تنبيه",
      authorizationFailed: "تعذر إكمال تفويض Instagram. حاول الاتصال مجدداً.",
      audit: "السجل",
      auditBody: "آخر أحداث مساحة العمل والإعدادات الحساسة.",
      auditEmpty: "لا توجد أحداث تدقيق بعد.",
      auditTitle: "سجل التدقيق",
      billing: "الفوترة",
      channels: "القنوات",
      connected: "تم حفظ اتصال إنستغرام.",
      connectedStatus: "متصل",
      currency: "العملة",
      dataControls: "البيانات والذاكرة",
      dataControlsBody:
        "التصدير والتدقيق والذاكرة التجارية تبقى مرتبطة بمساحة العمل.",
      disconnect: "فصل",
      disconnected: "تم فصل إنستغرام.",
      disconnectedRevoked: "تم فصل إنستغرام وإلغاء وصول MARKOS لدى Meta.",
      disconnectConfirm:
        "هل تريد فصل Instagram ومحاولة إلغاء وصول MARKOS وحذف بيانات الاعتماد المحفوظة؟ سيبقى محتوى مساحة العمل والتحليلات محفوظاً.",
      disconnectUnconfirmed:
        "تم فصل Instagram من MARKOS وحذف بيانات الاعتماد المحلية، لكن Meta لم تؤكد إلغاء الوصول. افتح أذونات Instagram وأزل MARKOS يدوياً.",
      recentMedia: "وسائط Instagram الحديثة",
      emptyMedia: "لا توجد وسائط حديثة لهذا الحساب.",
      disconnectedStatus: "غير متصل",
      dryRun: "تشغيل تجريبي",
      enableMfa: "تفعيل",
      enabled: "مفعّل",
      error: "خطأ",
      expires: "ينتهي",
      exportData: "تصدير البيانات",
      exportReady: "تم تجهيز ملف التصدير.",
      eyebrow: "إعدادات مساحة العمل",
      failed: "تعذر تنفيذ العملية.",
      instagram: "Instagram",
      invoices: "الفواتير",
      language: "اللغة",
      languageBody: "التبديل يحافظ على نفس مسار الإعدادات.",
      languageTitle: "العربية والإنجليزية",
      lastSync: "آخر مزامنة",
      liveWorkspace: "مساحة عمل مباشرة",
      mfa: "MFA",
      mfaCode: "رمز التحقق",
      mfaEnabled: "تم تفعيل MFA.",
      mfaReady: "امسح الرمز في تطبيق المصادقة ثم أدخل الكود.",
      notEnabled: "غير مفعّل",
      oauth: "اتصال OAuth",
      openAdmin: "فتح الإدارة",
      openInstagramAccess: "فتح أذونات Instagram",
      openVault: "افتح الخزنة",
      payments: "المدفوعات",
      pending: "قيد الانتظار",
      previewOnly: "هذه معاينة. سجّل الدخول لتنفيذ العملية.",
      previewWorkspace: "معاينة محلية",
      publishMode: "وضع النشر",
      refresh: "تحديث",
      refreshToken: "تحديث الرمز",
      reconnect: "إعادة الاتصال",
      role: "الدور",
      save: "حفظ",
      secret: "السر",
      security: "الأمان",
      securityBody: "MFA، صلاحيات الوصول، وتصدير البيانات الحساسة.",
      securityTitle: "ضوابط الوصول",
      setupMfa: "إعداد MFA",
      status: "الحالة",
      subtitle:
        "إدارة الحساب، مساحة العمل، اللغة، الفوترة، القنوات، والأمان من شاشة واحدة.",
      title: "الإعدادات",
      token: "رمز الوصول",
      tokenRefreshed: "تم تحديث رمز إنستغرام.",
      trial: "تجربة",
      verified: "التحقق",
      workspace: "مساحة العمل",
      yes: "نعم",
    },
    en: {
      account: "Account",
      accountId: "Instagram account",
      attention: "Attention",
      authorizationFailed:
        "Instagram authorization could not be completed. Try connecting again.",
      audit: "Audit",
      auditBody: "Recent workspace and sensitive settings events.",
      auditEmpty: "No audit events yet.",
      auditTitle: "Audit trail",
      billing: "Billing",
      channels: "Channels",
      connected: "Instagram connection saved.",
      connectedStatus: "Connected",
      currency: "Currency",
      dataControls: "Data and memory",
      dataControlsBody:
        "Export, audit, and business memory stay workspace-scoped.",
      disconnect: "Disconnect",
      disconnected: "Instagram disconnected.",
      disconnectedRevoked:
        "Instagram disconnected and Meta confirmed that MARKOS access was revoked.",
      disconnectConfirm:
        "Disconnect Instagram, attempt to revoke MARKOS access, and remove its stored credential? Existing workspace content and analytics will remain.",
      disconnectUnconfirmed:
        "Instagram was disconnected from MARKOS and the local credential was removed, but Meta did not confirm revocation. Open Instagram permissions and remove MARKOS manually.",
      recentMedia: "Recent Instagram media",
      emptyMedia: "No recent media was returned for this account.",
      disconnectedStatus: "Disconnected",
      dryRun: "Dry run",
      enableMfa: "Enable",
      enabled: "Enabled",
      error: "Error",
      expires: "Expires",
      exportData: "Export data",
      exportReady: "Workspace export is ready.",
      eyebrow: "Workspace settings",
      failed: "Action failed.",
      instagram: "Instagram",
      invoices: "Invoices",
      language: "Language",
      languageBody: "Switching keeps you on the same settings route.",
      languageTitle: "Arabic and English",
      lastSync: "Last synchronized",
      liveWorkspace: "Live workspace",
      mfa: "MFA",
      mfaCode: "Verification code",
      mfaEnabled: "MFA enabled.",
      mfaReady: "Scan the secret in your authenticator, then enter the code.",
      notEnabled: "Not enabled",
      oauth: "Connect OAuth",
      openAdmin: "Open admin",
      openInstagramAccess: "Open Instagram permissions",
      openVault: "Open Vault",
      payments: "Payments",
      pending: "Pending",
      previewOnly: "This is preview mode. Sign in to run the action.",
      previewWorkspace: "Local preview",
      publishMode: "Publish mode",
      refresh: "Refresh",
      refreshToken: "Refresh token",
      reconnect: "Reconnect",
      role: "Role",
      save: "Save",
      secret: "Secret",
      security: "Security",
      securityBody:
        "MFA, access permissions, and sensitive data export controls.",
      securityTitle: "Access controls",
      setupMfa: "Set up MFA",
      status: "Status",
      subtitle:
        "Manage account, workspace, language, billing, channels, and security from one screen.",
      title: "Settings",
      token: "Access token",
      tokenRefreshed: "Instagram token refreshed.",
      trial: "Trial",
      verified: "Verified",
      workspace: "Workspace",
      yes: "Yes",
    },
  } as const;

  return dictionary[locale][key as keyof (typeof dictionary)["en"]] ?? key;
}
