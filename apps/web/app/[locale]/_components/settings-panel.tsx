"use client";

import { useCallback, useEffect, useState } from "react";
import {
  ArrowRight,
  Check,
  Copy as CopyIcon,
  CreditCard,
  Database,
  Download,
  ExternalLink,
  Instagram,
  KeyRound,
  Link2Off,
  LockKeyhole,
  LogOut,
  RefreshCcw,
  ShieldCheck,
  UserRound,
  type LucideIcon,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { MarkosApiClient } from "@markos/api-client";
import type {
  AuditLogRecord,
  AuthSession,
  BillingSummary,
  InstagramConnection,
  Locale,
  MfaStatus,
  MfaTotpSetup,
} from "@markos/shared-types";
import { SurfaceState } from "./surface-state";
import { NotificationToast } from "./notification-toast";
import {
  SectionNavigation,
  type SectionNavigationItem,
} from "./section-navigation";
import {
  logoutBrowserSession,
  setBrowserSession,
  useMarkosClient,
  useMarkosSession,
} from "./browser-session";
import {
  instagramStatusLabel,
  sanitizedCallbackUrl,
} from "./instagram-settings-state";

type AuditState = "loading" | "error" | "success" | "limit";
type NotificationTone = "error" | "info" | "success" | "warning";
type SettingsSectionId =
  | "profile"
  | "connections"
  | "security"
  | "billing"
  | "data";

const settingsSectionIds: readonly SettingsSectionId[] = [
  "profile",
  "connections",
  "security",
  "billing",
  "data",
];

export function SettingsPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [connection, setConnection] = useState<InstagramConnection | null>(
    null,
  );
  const [billing, setBilling] = useState<BillingSummary | null>(null);
  const [auditLogs, setAuditLogs] = useState<AuditLogRecord[]>([]);
  const [mfaStatus, setMfaStatus] = useState<MfaStatus | null>(null);
  const [mfaSetup, setMfaSetup] = useState<MfaTotpSetup | null>(null);
  const [mfaCode, setMfaCode] = useState("");
  const [mfaSecretCopied, setMfaSecretCopied] = useState(false);
  const [message, setMessage] = useState("");
  const [notificationTone, setNotificationTone] =
    useState<NotificationTone>("info");
  const [disconnectWarningUrl, setDisconnectWarningUrl] = useState<
    string | null
  >(null);
  const [isBusy, setIsBusy] = useState(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [auditState, setAuditState] = useState<AuditState | null>(null);
  const [selectedSection, setSelectedSection] =
    useState<SettingsSectionId>("profile");
  const [, setMfaWindowTick] = useState(0);

  const client = useMarkosClient(locale);
  const dismissNotification = useCallback(() => {
    setMessage("");
    setDisconnectWarningUrl(null);
  }, []);

  useEffect(() => {
    const hash = window.location.hash.slice(1);
    if (isSettingsSectionId(hash)) setSelectedSection(hash);
  }, []);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedState = params.get("state");
    const instagramResult = params.get("instagram");

    if (isAuditState(requestedState)) {
      setAuditState(requestedState);
    }
    if (instagramResult === "connected") {
      setNotificationTone("success");
      setMessage(copy(locale, "connected"));
    }
    if (instagramResult === "error") {
      setNotificationTone("error");
      setMessage(copy(locale, "authorizationFailed"));
    }
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
      setMfaStatus,
      setMessage,
    ).then((loaded) => {
      if (!loaded) setNotificationTone("error");
    });
  }, [client, session]);

  useEffect(() => {
    if (!session?.mfaVerifiedUntil) return;
    const delay = session.mfaVerifiedUntil * 1000 - Date.now() + 100;
    if (delay <= 0) return;
    const timer = window.setTimeout(
      () => setMfaWindowTick((current) => current + 1),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [session?.mfaVerifiedUntil]);

  async function refreshAllSettings() {
    if (!session) {
      setAuditState("success");
      setNotificationTone("info");
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
      setMfaStatus,
      setMessage,
    );
    if (!loaded) setNotificationTone("error");
    setAuditState(loaded ? "success" : "error");
    setIsBusy(false);
  }

  async function logOut() {
    if (isLoggingOut) return;

    setIsLoggingOut(true);
    try {
      await logoutBrowserSession(locale);
    } catch {
      setIsLoggingOut(false);
    }
  }

  function instagramSecurityReady(): boolean {
    if (!session?.user.isVerified) {
      setNotificationTone("warning");
      setMessage(copy(locale, "verifyEmailFirst"));
      return false;
    }

    if (mfaStatus === null) {
      setNotificationTone("info");
      setMessage(copy(locale, "securityLoading"));
      return false;
    }

    if (!mfaStatus.enabled) {
      setNotificationTone("warning");
      setMessage(copy(locale, "mfaInstagramRequired"));
      return false;
    }

    if (!hasActiveMfaStepUp(session)) {
      setNotificationTone("warning");
      setMessage(copy(locale, "mfaStepUpRequired"));
      return false;
    }

    return true;
  }

  async function startOAuth() {
    if (!session) {
      setNotificationTone("info");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    if (!instagramSecurityReady()) return;

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
      setNotificationTone("error");
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function disconnect() {
    if (!session) {
      setNotificationTone("info");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    if (!instagramSecurityReady()) return;

    if (!window.confirm(copy(locale, "disconnectConfirm"))) return;

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const result = await client.disconnectInstagram();
      setConnection(result.connection);
      if (
        result.providerRevocation.status === "ACTION_REQUIRED" ||
        result.providerRevocation.status === "UNCONFIRMED"
      ) {
        setNotificationTone("warning");
        setDisconnectWarningUrl(
          result.providerRevocation.manualRevocationUrl ?? null,
        );
        setMessage(copy(locale, "disconnectUnconfirmed"));
      } else {
        setNotificationTone("success");
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
      setNotificationTone("error");
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function refreshToken() {
    if (!session) {
      setNotificationTone("info");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    if (!instagramSecurityReady()) return;

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const result = await client.refreshInstagramToken();
      if (result.connection) {
        setConnection(result.connection);
      }
      setNotificationTone(result.refreshed ? "success" : "warning");
      setMessage(
        result.refreshed
          ? copy(locale, "tokenRefreshed")
          : (result.reason ?? copy(locale, "failed")),
      );
    } catch (error) {
      setNotificationTone("error");
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function setupMfa() {
    if (!session) {
      setNotificationTone("info");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      setMfaSetup(await client.setupMfaTotp());
      setMfaSecretCopied(false);
      setNotificationTone("info");
      setMessage(copy(locale, "mfaReady"));
    } catch (error) {
      setNotificationTone("error");
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function enableMfa() {
    if (!session) {
      setNotificationTone("info");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const status = await client.enableMfaTotp({ code: mfaCode.trim() });
      const verifiedSession = await client.verifyMfaTotp({
        code: mfaCode.trim(),
      });
      setBrowserSession(verifiedSession);
      setMfaStatus(status);
      setNotificationTone(status.enabled ? "success" : "error");
      setMessage(
        status.enabled ? copy(locale, "mfaEnabled") : copy(locale, "failed"),
      );
      setMfaSetup((current) =>
        current ? { ...current, enabled: status.enabled } : current,
      );
      setMfaCode("");
      setMfaSecretCopied(false);
    } catch (error) {
      setNotificationTone("error");
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function verifyMfaSession() {
    if (!session) {
      setNotificationTone("info");
      setMessage(copy(locale, "previewOnly"));
      return;
    }

    if (!/^\d{6}$/.test(mfaCode.trim())) {
      setNotificationTone("warning");
      setMessage(copy(locale, "mfaCodeRequired"));
      return;
    }

    setIsBusy(true);
    setMessage("");
    setDisconnectWarningUrl(null);

    try {
      const verifiedSession = await client.verifyMfaTotp({
        code: mfaCode.trim(),
      });
      setBrowserSession(verifiedSession);
      setNotificationTone("success");
      setMessage(copy(locale, "mfaSessionVerified"));
      setMfaCode("");
    } catch (error) {
      setNotificationTone("error");
      setMessage(
        error instanceof Error ? error.message : copy(locale, "failed"),
      );
    } finally {
      setIsBusy(false);
    }
  }

  async function copyMfaSecret() {
    if (!mfaSetup?.secret) return;

    try {
      await navigator.clipboard.writeText(mfaSetup.secret);
      setMfaSecretCopied(true);
    } catch {
      setNotificationTone("error");
      setMessage(copy(locale, "copyFailed"));
    }
  }

  async function exportData() {
    if (!session) {
      setNotificationTone("info");
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
      setNotificationTone("success");
      setMessage(copy(locale, "exportReady"));
    } catch (error) {
      setNotificationTone("error");
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
  const workspaceName =
    session?.workspace.name ?? copy(locale, "workspaceUnavailable");
  const userName = session?.user.fullName ?? copy(locale, "accountUnavailable");
  const userEmail = session?.user.email ?? "—";
  const subscription = billing?.subscription;
  const mfaStepUpActive = hasActiveMfaStepUp(session);
  const instagramReady = Boolean(
    session?.user.isVerified && mfaStatus?.enabled && mfaStepUpActive,
  );
  const latestMedia = activeConnection.connected
    ? activeConnection.recentMedia?.[0]
    : undefined;
  const navigationItems: SectionNavigationItem[] = [
    {
      id: "profile",
      icon: UserRound,
      label: copy(locale, "account"),
      status: session?.user.isVerified
        ? copy(locale, "verified")
        : copy(locale, "pending"),
      statusTone: session?.user.isVerified ? "success" : "warning",
    },
    {
      id: "connections",
      icon: Instagram,
      label: copy(locale, "channels"),
      locked: !instagramReady,
      status: activeConnection.connected
        ? copy(locale, "connectedStatus")
        : copy(locale, "disconnectedStatus"),
      statusTone: instagramReady
        ? activeConnection.connected
          ? "success"
          : "neutral"
        : "locked",
    },
    {
      id: "security",
      icon: ShieldCheck,
      label: copy(locale, "security"),
      status: mfaStatus?.enabled
        ? mfaStepUpActive
          ? copy(locale, "mfaSessionVerified")
          : copy(locale, "enabled")
        : copy(locale, "notEnabled"),
      statusTone: mfaStatus?.enabled && mfaStepUpActive ? "success" : "warning",
    },
    {
      id: "billing",
      icon: CreditCard,
      label: copy(locale, "billing"),
      status: subscription?.planCode ?? "STARTER",
    },
    {
      id: "data",
      icon: Database,
      label: copy(locale, "dataControls"),
    },
  ];

  function selectSettingsSection(id: string) {
    if (!isSettingsSectionId(id)) return;
    setSelectedSection(id);
    window.history.replaceState(null, "", `#${id}`);
    window.requestAnimationFrame(() =>
      document
        .getElementById(id)
        ?.scrollIntoView({ behavior: "smooth", block: "start" }),
    );
  }

  return (
    <section className="min-w-0" data-settings-page="sunlit">
      <NotificationToast
        action={
          disconnectWarningUrl ? (
            <a
              className="inline-flex h-10 items-center justify-center gap-2 rounded-full border border-[#F4A460]/30 bg-[#F4A460]/10 px-4 text-sm font-extrabold text-[#F4A460] transition hover:bg-[#F4A460]/15"
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
        dismissLabel={copy(locale, "dismissNotification")}
        onDismiss={dismissNotification}
        title={copy(
          locale,
          notificationTone === "error" || notificationTone === "warning"
            ? "attention"
            : "status",
        )}
        tone={notificationTone}
      />
      <header className="flex flex-col gap-5 border-b border-[var(--sunlit-line)] pb-7 sm:flex-row sm:items-end sm:justify-between">
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <div className="sunlit-eyebrow inline-flex items-center gap-2">
              <ShieldCheck size={13} />
              {copy(locale, "eyebrow")}
            </div>
            <h1 className="mt-3 text-4xl font-black leading-tight tracking-[-0.035em] text-[var(--sunlit-ink)] sm:text-5xl">
              {copy(locale, "title")}
            </h1>
            <p className="mt-3 max-w-3xl text-sm leading-6 text-[var(--sunlit-muted)] sm:text-base">
              {copy(locale, "subtitle")}
            </p>
          </div>
        </div>
        <button
          className="sunlit-secondary inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-5 py-3 text-sm font-extrabold disabled:opacity-50"
          disabled={isBusy || !session}
          onClick={refreshAllSettings}
          type="button"
        >
          <RefreshCcw size={16} />
          {copy(locale, "refresh")}
        </button>
      </header>

      {isBusy || auditState ? (
        <div className="mt-5">
          <SurfaceState
            action={
              auditState === "limit" ? (
                <a
                  className="sunlit-primary inline-flex h-10 items-center rounded-xl px-4 text-sm font-extrabold"
                  href={`/${locale}/admin`}
                >
                  {copy(locale, "openAdmin")}
                </a>
              ) : (
                <button
                  className="sunlit-secondary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
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

      <div className="mt-7 grid items-start gap-6 xl:grid-cols-[15rem_minmax(0,1fr)]">
        <SectionNavigation
          activeId={selectedSection}
          className="[--section-menu-top:6.5rem]"
          heading={copy(locale, "menuHeading")}
          items={navigationItems}
          mobileLabel={copy(locale, "mobileMenu")}
          onSelect={selectSettingsSection}
        />

        <div className="grid min-w-0 gap-5">
          <div className="grid gap-5">
            <Panel
              active={selectedSection === "profile"}
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
              <div className="mt-5 flex flex-col gap-3 border-t border-[var(--sunlit-line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
                <p className="text-sm leading-6 text-[var(--sunlit-muted)]">
                  {copy(locale, "logoutBody")}
                </p>
                <button
                  className="sunlit-secondary inline-flex shrink-0 items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold text-[var(--sunlit-coral-deep)] disabled:opacity-50"
                  disabled={isLoggingOut || !session}
                  onClick={() => void logOut()}
                  type="button"
                >
                  <LogOut size={15} />
                  {copy(locale, isLoggingOut ? "loggingOut" : "logout")}
                </button>
              </div>
            </Panel>

            <Panel
              active={selectedSection === "billing"}
              id="billing"
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
          </div>

          <div className="grid gap-5">
            <div className="grid gap-5">
              <Panel
                active={selectedSection === "connections"}
                id="connections"
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
                {!instagramReady ? (
                  <div className="mt-5 flex flex-col gap-4 rounded-[1.25rem] border border-[rgb(155_91_0_/_22%)] bg-[#fff8df] p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="flex items-start gap-3">
                      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-white text-[var(--sunlit-warning)]">
                        <LockKeyhole size={18} />
                      </span>
                      <div>
                        <p className="font-extrabold text-[var(--sunlit-ink)]">
                          {copy(locale, "securityRequired")}
                        </p>
                        <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">
                          {copy(locale, "securityRequiredBody")}
                        </p>
                      </div>
                    </div>
                    <button
                      className="sunlit-secondary inline-flex shrink-0 items-center justify-center rounded-xl px-4 py-2.5 text-sm font-extrabold"
                      onClick={() => selectSettingsSection("security")}
                      type="button"
                    >
                      {copy(locale, "goToSecurity")}
                    </button>
                  </div>
                ) : null}

                <div className="sunlit-panel-soft mt-4 overflow-hidden rounded-[1.25rem]">
                  <div
                    className={`grid ${latestMedia && (latestMedia.thumbnailUrl ?? latestMedia.mediaUrl) ? "md:grid-cols-[minmax(0,1fr)_11rem]" : ""}`}
                  >
                    <div className="min-w-0 p-5">
                      <div className="flex items-center gap-3">
                        {activeConnection.profilePictureUrl ? (
                          // eslint-disable-next-line @next/next/no-img-element -- Instagram profile image hosts are dynamic.
                          <img
                            alt=""
                            className="h-14 w-14 shrink-0 rounded-2xl object-cover"
                            src={activeConnection.profilePictureUrl}
                          />
                        ) : (
                          <span className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-[linear-gradient(135deg,#f6c453,#ff665a_48%,#d93f7a)] text-white">
                            <Instagram size={24} />
                          </span>
                        )}
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-lg font-black text-[var(--sunlit-ink)]">
                            {activeConnection.username
                              ? `@${activeConnection.username}`
                              : (activeConnection.accountId ??
                                copy(locale, "noAccountConnected"))}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-[var(--sunlit-muted)]">
                            {activeConnection.accountType ??
                              copy(locale, "instagramBusiness")}
                          </p>
                        </div>
                        <span
                          className={
                            activeConnection.connected
                              ? "rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-aqua-dark)]"
                              : "rounded-full bg-[var(--sunlit-paper-deep)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-muted)]"
                          }
                        >
                          {instagramStatusLabel(activeConnection)}
                        </span>
                      </div>

                      <div className="mt-5 grid gap-x-6 gap-y-3 border-t border-[var(--sunlit-line)] pt-4 sm:grid-cols-2">
                        <SettingRow
                          label={copy(locale, "lastSync")}
                          value={
                            activeConnection.lastSyncedAt
                              ? new Date(
                                  activeConnection.lastSyncedAt,
                                ).toLocaleString(locale)
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
                    </div>

                    {latestMedia &&
                    (latestMedia.thumbnailUrl ?? latestMedia.mediaUrl) ? (
                      <a
                        aria-label={copy(locale, "latestPostPreview")}
                        className="relative min-h-44 overflow-hidden border-t border-[var(--sunlit-line)] md:border-s md:border-t-0"
                        href={latestMedia.permalink ?? "#"}
                        rel="noreferrer"
                        target={latestMedia.permalink ? "_blank" : undefined}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element -- Instagram media hosts are dynamic and short-lived. */}
                        <img
                          alt={latestMedia.caption ?? latestMedia.mediaType}
                          className="h-full min-h-44 w-full object-cover transition duration-300 hover:scale-[1.03]"
                          src={latestMedia.thumbnailUrl ?? latestMedia.mediaUrl}
                        />
                        <span className="absolute bottom-2 start-2 rounded-lg bg-black/65 px-2 py-1 text-[11px] font-bold text-white">
                          {copy(locale, "latestPost")}
                        </span>
                      </a>
                    ) : null}
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <ActionButton
                    disabled={isBusy || !instagramReady}
                    icon={ExternalLink}
                    label={copy(
                      locale,
                      activeConnection.connected ? "reconnect" : "oauth",
                    )}
                    onClick={startOAuth}
                    tone="primary"
                  />
                  <ActionButton
                    disabled={
                      isBusy || !instagramReady || !activeConnection.connected
                    }
                    icon={RefreshCcw}
                    label={copy(locale, "refreshToken")}
                    onClick={refreshToken}
                  />
                  <ActionButton
                    disabled={
                      isBusy || !instagramReady || !activeConnection.connected
                    }
                    icon={Link2Off}
                    label={copy(locale, "disconnect")}
                    onClick={disconnect}
                  />
                </div>
              </Panel>

              <Panel
                active={selectedSection === "security"}
                id="security"
                icon={LockKeyhole}
                kicker={copy(locale, "security")}
                title={copy(locale, "securityTitle")}
                body={copy(locale, "securityBody")}
              >
                <div className="sunlit-panel-soft mt-4 rounded-[1.25rem] p-4">
                  <SettingRow
                    label={copy(locale, "mfa")}
                    value={
                      mfaStatus === null
                        ? copy(locale, "loading")
                        : !mfaStatus.enabled
                          ? copy(locale, "notEnabled")
                          : mfaStepUpActive
                            ? copy(locale, "mfaSessionVerified")
                            : copy(locale, "enabled")
                    }
                  />
                  {mfaStepUpActive && session?.mfaVerifiedUntil ? (
                    <SettingRow
                      label={copy(locale, "mfaWindowEnds")}
                      value={new Date(
                        session.mfaVerifiedUntil * 1000,
                      ).toLocaleTimeString(locale, {
                        hour: "numeric",
                        minute: "2-digit",
                      })}
                    />
                  ) : null}
                  <p className="mt-3 text-sm leading-6 text-[var(--sunlit-muted)]">
                    {copy(locale, "mfaInstagramBody")}
                  </p>
                </div>

                {mfaSetup && !mfaSetup.enabled ? (
                  <div className="mt-4 grid gap-4 rounded-[1.25rem] border border-[rgb(246_196_83_/_36%)] bg-[#fff8df] p-4 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center">
                    <div className="mx-auto rounded-2xl bg-white p-2 shadow-[var(--sunlit-shadow-sm)] sm:mx-0">
                      <QRCodeSVG
                        bgColor="#FFFFFF"
                        fgColor="#0F1419"
                        level="M"
                        marginSize={4}
                        size={168}
                        title={copy(locale, "mfaQrTitle")}
                        value={mfaSetup.otpauthUri}
                      />
                    </div>
                    <div className="min-w-0">
                      <p className="text-lg font-black text-[var(--sunlit-ink)]">
                        {copy(locale, "mfaScanTitle")}
                      </p>
                      <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">
                        {copy(locale, "mfaScanBody")}
                      </p>
                      <p className="mt-4 text-[11px] font-bold uppercase tracking-[0.14em] text-[var(--sunlit-muted)]">
                        {copy(locale, "manualKey")}
                      </p>
                      <div className="mt-2 flex min-w-0 items-center gap-2 rounded-xl border border-[var(--sunlit-line)] bg-white p-2">
                        <code
                          className="min-w-0 flex-1 break-all text-xs font-bold tracking-[0.12em] text-[var(--sunlit-aqua-dark)]"
                          dir="ltr"
                        >
                          {mfaSetup.secret}
                        </code>
                        <button
                          aria-label={copy(locale, "copyKey")}
                          className="grid h-9 w-9 shrink-0 place-items-center rounded-lg border border-[rgb(33_191_174_/_24%)] bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)] transition hover:brightness-95"
                          onClick={() => void copyMfaSecret()}
                          title={copy(locale, "copyKey")}
                          type="button"
                        >
                          {mfaSecretCopied ? (
                            <Check size={16} />
                          ) : (
                            <CopyIcon size={16} />
                          )}
                        </button>
                      </div>
                      {mfaSecretCopied ? (
                        <p className="mt-2 text-xs font-semibold text-[var(--sunlit-aqua-dark)]">
                          {copy(locale, "keyCopied")}
                        </p>
                      ) : null}
                    </div>
                  </div>
                ) : null}

                {mfaSetup && !mfaSetup.enabled ? (
                  <div className="mt-4 grid gap-3 md:grid-cols-[1fr_auto]">
                    <input
                      aria-label={copy(locale, "mfaCode")}
                      autoComplete="one-time-code"
                      className="sunlit-field rounded-xl px-4 py-3 text-sm font-semibold outline-none disabled:opacity-50"
                      disabled={!mfaSetup || isBusy}
                      inputMode="numeric"
                      onChange={(event) =>
                        setMfaCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      pattern="[0-9]*"
                      placeholder={copy(locale, "mfaCode")}
                      value={mfaCode}
                    />
                    <ActionButton
                      disabled={
                        isBusy || !mfaSetup || !/^\d{6}$/.test(mfaCode.trim())
                      }
                      icon={KeyRound}
                      label={copy(locale, "enableMfa")}
                      onClick={enableMfa}
                      tone="primary"
                    />
                  </div>
                ) : null}

                {mfaStatus?.enabled && !mfaStepUpActive ? (
                  <div className="mt-4 grid gap-3 rounded-[1.25rem] border border-[rgb(33_191_174_/_24%)] bg-[var(--sunlit-aqua-soft)] p-4 md:grid-cols-[1fr_auto]">
                    <input
                      aria-label={copy(locale, "mfaCode")}
                      autoComplete="one-time-code"
                      className="sunlit-field rounded-xl px-4 py-3 text-sm font-semibold outline-none"
                      disabled={isBusy}
                      inputMode="numeric"
                      onChange={(event) =>
                        setMfaCode(
                          event.target.value.replace(/\D/g, "").slice(0, 6),
                        )
                      }
                      pattern="[0-9]*"
                      placeholder={copy(locale, "mfaCode")}
                      value={mfaCode}
                    />
                    <ActionButton
                      disabled={isBusy || !/^\d{6}$/.test(mfaCode.trim())}
                      icon={KeyRound}
                      label={copy(locale, "verifyMfaSession")}
                      onClick={verifyMfaSession}
                      tone="primary"
                    />
                  </div>
                ) : null}
                <div className="mt-3 flex flex-wrap gap-2">
                  <ActionButton
                    disabled={isBusy || mfaStatus === null || mfaStatus.enabled}
                    icon={ShieldCheck}
                    label={copy(locale, "setupMfa")}
                    onClick={setupMfa}
                  />
                </div>
              </Panel>
            </div>

            <Panel
              active={selectedSection === "data"}
              id="data"
              icon={Database}
              kicker={copy(locale, "dataControls")}
              title={copy(locale, "dataActivityTitle")}
              body={copy(locale, "dataControlsBody")}
            >
              <div className="mt-5 flex flex-wrap gap-2">
                <ActionButton
                  disabled={isBusy}
                  icon={Download}
                  label={copy(locale, "exportData")}
                  onClick={exportData}
                />
                <a
                  className="sunlit-secondary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-extrabold"
                  href={`/${locale}/app/knowledge`}
                >
                  {copy(locale, "openVault")}
                  <ArrowRight size={16} />
                </a>
              </div>

              <div className="mt-7 border-t border-[var(--sunlit-line)] pt-6">
                <h3 className="text-base font-black text-[var(--sunlit-ink)]">
                  {copy(locale, "auditTitle")}
                </h3>
                <p className="mt-1 text-sm text-[var(--sunlit-muted)]">
                  {copy(locale, "auditBody")}
                </p>
                {auditLogs.length === 0 ? (
                  <div className="mt-4 rounded-[1.25rem] border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] p-6 text-sm text-[var(--sunlit-muted)]">
                    {copy(locale, "auditEmpty")}
                  </div>
                ) : (
                  <div className="mt-4 overflow-hidden rounded-[1.25rem] border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)]">
                    {auditLogs.slice(0, 8).map((log) => (
                      <div
                        className="grid gap-1 border-b border-[var(--sunlit-line)] px-4 py-3 text-sm last:border-b-0 md:grid-cols-[minmax(160px,1fr)_160px_180px]"
                        key={log.id}
                      >
                        <span className="font-extrabold text-[var(--sunlit-ink)]">
                          {formatAction(log.action)}
                        </span>
                        <span className="text-[var(--sunlit-muted)]">
                          {log.targetType}
                        </span>
                        <span className="text-[var(--sunlit-muted)]">
                          {new Date(log.createdAt).toLocaleString(locale)}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </Panel>
          </div>
        </div>
      </div>
    </section>
  );
}

function Panel({
  active,
  body,
  children,
  id,
  icon: Icon,
  kicker,
  title,
}: {
  active: boolean;
  body: string;
  children?: React.ReactNode;
  id?: string;
  icon: LucideIcon;
  kicker: string;
  title: string;
}) {
  return (
    <article
      className={`${active ? "" : "hidden"} sunlit-panel scroll-mt-28 rounded-[1.75rem] p-5 sm:p-6`}
      id={id}
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="sunlit-eyebrow">{kicker}</p>
          <h2 className="mt-2 break-words text-xl font-black text-[var(--sunlit-ink)]">
            {title}
          </h2>
          <p className="mt-1 break-words text-sm leading-6 text-[var(--sunlit-muted)]">
            {body}
          </p>
        </div>
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] border border-[rgb(33_191_174_/_20%)] bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
          <Icon size={21} strokeWidth={1.8} />
        </div>
      </div>
      {children}
    </article>
  );
}

function SettingRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-3 text-sm">
      <span className="text-[var(--sunlit-muted)]">{label}</span>
      <span className="min-w-0 break-words text-end font-extrabold text-[var(--sunlit-ink)]">
        {value}
      </span>
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
  icon: LucideIcon;
  label: string;
  onClick: () => void;
  tone?: "primary" | "secondary";
}) {
  return (
    <button
      className={
        tone === "primary"
          ? "sunlit-primary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:opacity-45"
          : "sunlit-secondary inline-flex items-center justify-center gap-2 rounded-xl px-4 py-2.5 text-sm font-extrabold disabled:opacity-40"
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
  setMfaStatus: (status: MfaStatus) => void,
  setMessage: (message: string) => void,
): Promise<boolean> {
  try {
    const [connection, billing, auditLogs, mfaStatus] = await Promise.all([
      client.instagramConnection(),
      client.billingSummary(),
      client.auditLogs({ limit: 10 }),
      client.mfaStatus(),
    ]);
    setConnection(connection);
    setBilling(billing);
    setAuditLogs(auditLogs);
    setMfaStatus(mfaStatus);
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

function hasActiveMfaStepUp(session: AuthSession | null): boolean {
  return Boolean(
    session?.mfaVerified &&
    session.mfaVerifiedUntil !== null &&
    session.mfaVerifiedUntil > Math.floor(Date.now() / 1000),
  );
}

function isSettingsSectionId(value: string): value is SettingsSectionId {
  return settingsSectionIds.includes(value as SettingsSectionId);
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
        body: "الإعدادات جاهزة. يمكنك إدارة القنوات، الأمان، الفوترة، والبيانات مع بقاء كل شيء مرتبطاً بمساحة العمل.",
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
        body: "Settings are ready. Manage channels, security, billing, and data controls while everything remains workspace-scoped.",
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
      accountUnavailable: "الحساب غير متاح",
      attention: "تنبيه",
      dismissNotification: "إغلاق الإشعار",
      authorizationFailed: "تعذر إكمال تفويض Instagram. حاول الاتصال مجدداً.",
      auditBody: "آخر أحداث مساحة العمل والإعدادات الحساسة.",
      auditEmpty: "لا توجد أحداث تدقيق بعد.",
      auditTitle: "سجل التدقيق",
      billing: "الفوترة",
      channels: "القنوات",
      connected: "تم حفظ اتصال إنستغرام.",
      connectedStatus: "متصل",
      copyFailed: "تعذر نسخ المفتاح. يمكنك تحديده ونسخه يدوياً.",
      copyKey: "نسخ المفتاح اليدوي",
      currency: "العملة",
      dataControls: "البيانات والذاكرة",
      dataActivityTitle: "البيانات والنشاط",
      dataControlsBody:
        "التصدير والتدقيق والذاكرة التجارية تبقى مرتبطة بمساحة العمل.",
      disconnect: "فصل",
      disconnected: "تم فصل إنستغرام.",
      disconnectedRevoked: "تم فصل إنستغرام وإلغاء وصول MARKOS لدى Meta.",
      disconnectConfirm:
        "هل تريد فصل Instagram من MARKOS وحذف بيانات الاعتماد المحفوظة؟ لإكمال إلغاء وصول MARKOS، افتح أذونات Instagram واختر «إزالة» بجانب MarkOS AI-IG. سيبقى محتوى مساحة العمل والتحليلات محفوظاً.",
      disconnectUnconfirmed:
        "تم فصل Instagram من MARKOS وحذف بيانات الاعتماد المحلية. لإكمال العملية على Instagram، افتح التطبيقات ومواقع الويب واختر «إزالة» بجانب MarkOS AI-IG.",
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
      instagramBusiness: "حساب أعمال Instagram",
      invoices: "الفواتير",
      menuHeading: "أقسام الإعدادات",
      mobileMenu: "انتقل إلى",
      lastSync: "آخر مزامنة",
      liveWorkspace: "مساحة عمل مباشرة",
      mfa: "MFA",
      mfaCode: "رمز التحقق",
      mfaCodeRequired: "أدخل رمز المصادقة المكون من ستة أرقام.",
      mfaEnabled: "تم تفعيل MFA.",
      mfaInstagramBody:
        "يفتح تحقق MFA إعدادات Instagram الحساسة لمدة 15 دقيقة، ويستمر خلال تحديث الجلسة والعودة من Instagram.",
      mfaInstagramRequired: "أكمل إعداد MFA أدناه قبل ربط Instagram.",
      mfaReady: "امسح الرمز في تطبيق المصادقة ثم أدخل الكود.",
      mfaQrTitle: "رمز QR لإعداد المصادقة متعددة العوامل في MARKOS",
      mfaScanBody:
        "امسح رمز QR باستخدام تطبيق المصادقة، أو أدخل المفتاح اليدوي. ثم أدخل الرمز المكون من ستة أرقام.",
      mfaScanTitle: "اربط تطبيق المصادقة",
      mfaSessionVerified: "تم التحقق لمدة 15 دقيقة",
      mfaWindowEnds: "نافذة التحقق حتى",
      mfaStepUpRequired:
        "أدخل رمز MFA مرة واحدة لفتح إعدادات Instagram الحساسة لمدة 15 دقيقة.",
      manualKey: "المفتاح اليدوي",
      keyCopied: "تم نسخ المفتاح.",
      notEnabled: "غير مفعّل",
      oauth: "اتصال OAuth",
      latestPost: "أحدث منشور",
      latestPostPreview: "معاينة أحدث منشور في Instagram",
      loggingOut: "جارٍ تسجيل الخروج...",
      logout: "تسجيل الخروج",
      logoutBody: "إنهاء جلسة MARKOS على هذا الجهاز.",
      noAccountConnected: "لا يوجد حساب متصل",
      openAdmin: "فتح الإدارة",
      openInstagramAccess: "إكمال الفصل على Instagram",
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
      securityLoading: "يتم تحميل حالة الأمان. حاول بعد لحظة.",
      securityRequired: "أكمل إعدادات الأمان أولاً",
      securityRequiredBody:
        "يجب تأكيد البريد الإلكتروني وتفعيل MFA وفتح نافذة التحقق لمدة 15 دقيقة قبل إدارة اتصال Instagram.",
      goToSecurity: "فتح قسم الأمان",
      status: "الحالة",
      subtitle: "إدارة الحسابات المتصلة، الأمان، الفوترة، وبيانات مساحة العمل.",
      title: "الإعدادات",
      token: "رمز الوصول",
      tokenRefreshed: "تم تحديث رمز إنستغرام.",
      trial: "تجربة",
      verified: "التحقق",
      verifyEmailFirst: "أكد بريدك الإلكتروني قبل إدارة اتصال Instagram.",
      verifyMfaSession: "تحقق من الجلسة",
      loading: "جار التحميل",
      workspace: "مساحة العمل",
      workspaceUnavailable: "مساحة العمل غير متاحة",
      yes: "نعم",
    },
    en: {
      account: "Account",
      accountUnavailable: "Account unavailable",
      attention: "Attention",
      dismissNotification: "Dismiss notification",
      authorizationFailed:
        "Instagram authorization could not be completed. Try connecting again.",
      auditBody: "Recent workspace and sensitive settings events.",
      auditEmpty: "No audit events yet.",
      auditTitle: "Audit trail",
      billing: "Billing",
      channels: "Channels",
      connected: "Instagram connection saved.",
      connectedStatus: "Connected",
      copyFailed: "The key could not be copied. Select and copy it manually.",
      copyKey: "Copy manual key",
      currency: "Currency",
      dataControls: "Data and memory",
      dataActivityTitle: "Data and activity",
      dataControlsBody:
        "Export, audit, and business memory stay workspace-scoped.",
      disconnect: "Disconnect",
      disconnected: "Instagram disconnected.",
      disconnectedRevoked:
        "Instagram disconnected and Meta confirmed that MARKOS access was revoked.",
      disconnectConfirm:
        "Disconnect Instagram from MARKOS and remove its stored credential? To finish revoking MARKOS access, open Instagram permissions and select Remove next to MarkOS AI-IG. Existing workspace content and analytics will remain.",
      disconnectUnconfirmed:
        "Instagram was disconnected from MARKOS and its local credential was removed. To finish on Instagram, open Apps and websites and select Remove next to MarkOS AI-IG.",
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
      instagramBusiness: "Instagram business account",
      invoices: "Invoices",
      menuHeading: "Settings sections",
      mobileMenu: "Jump to",
      lastSync: "Last synchronized",
      liveWorkspace: "Live workspace",
      mfa: "MFA",
      mfaCode: "Verification code",
      mfaCodeRequired: "Enter the six-digit authenticator code.",
      mfaEnabled: "MFA enabled.",
      mfaInstagramBody:
        "One MFA check opens sensitive Instagram settings for 15 minutes, including through session refresh and the return from Instagram.",
      mfaInstagramRequired: "Set up MFA below before connecting Instagram.",
      mfaReady: "Scan the QR code in your authenticator, then enter the code.",
      mfaQrTitle: "QR code for setting up MARKOS multi-factor authentication",
      mfaScanBody:
        "Scan this QR code with your authenticator app, or enter the manual key. Then enter the six-digit code.",
      mfaScanTitle: "Link your authenticator app",
      mfaSessionVerified: "Verified for 15 minutes",
      mfaWindowEnds: "Verification window ends",
      mfaStepUpRequired:
        "Enter your MFA code once to open sensitive Instagram settings for 15 minutes.",
      manualKey: "Manual setup key",
      keyCopied: "Key copied.",
      notEnabled: "Not enabled",
      oauth: "Connect OAuth",
      latestPost: "Latest post",
      latestPostPreview: "Preview the latest Instagram post",
      loggingOut: "Logging out...",
      logout: "Log out",
      logoutBody: "End your MARKOS session on this device.",
      noAccountConnected: "No account connected",
      openAdmin: "Open admin",
      openInstagramAccess: "Finish on Instagram",
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
      securityLoading:
        "Security status is still loading. Try again in a moment.",
      securityRequired: "Complete security first",
      securityRequiredBody:
        "Verify your email, enable MFA, and open a 15-minute verification window before managing Instagram.",
      goToSecurity: "Open security",
      status: "Status",
      subtitle:
        "Manage connected accounts, security, billing, and workspace data.",
      title: "Settings",
      token: "Access token",
      tokenRefreshed: "Instagram token refreshed.",
      trial: "Trial",
      verified: "Verified",
      verifyEmailFirst:
        "Verify your email before managing the Instagram connection.",
      verifyMfaSession: "Verify this session",
      loading: "Loading",
      workspace: "Workspace",
      workspaceUnavailable: "Workspace unavailable",
      yes: "Yes",
    },
  } as const;

  return dictionary[locale][key as keyof (typeof dictionary)["en"]] ?? key;
}
