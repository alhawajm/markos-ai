"use client";

import { useEffect, useState } from "react";
import { AlertTriangle, CheckCircle2, ExternalLink, Facebook, Instagram, Link2Off, RefreshCcw, ShieldCheck, Twitter, Zap } from "lucide-react";
import type { InstagramConnection, Locale } from "@markos/shared-types";
import { SurfaceState } from "./surface-state";
import { useMarkosClient, useMarkosSession } from "./browser-session";


type ChannelState = "connected" | "disconnected" | "expired" | "review";
type AuditState = "loading" | "error" | "success" | "limit";

export function ChannelsPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [connection, setConnection] = useState<InstagramConnection | null>(null);
  const [message, setMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const [auditState, setAuditState] = useState<AuditState | null>(null);

  const client = useMarkosClient(locale);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const requestedState = params.get("state");

    if (isAuditState(requestedState)) {
      setAuditState(requestedState);
    }

  }, []);

  useEffect(() => {
    if (!session) {
      return;
    }

    void refreshConnection();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  async function refreshConnection() {
    if (!session) {
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      setConnection(await client.instagramConnection());
      setAuditState("success");
    } catch (error) {
      setAuditState("error");
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function startOAuth() {
    if (!session) {
      setMessage(text(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const start = await client.instagramOAuthStart({ locale });
      window.location.href = start.authorizationUrl;
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
      setIsBusy(false);
    }
  }

  async function disconnect() {
    if (!session) {
      setMessage(text(locale, "previewOnly"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      setConnection(await client.disconnectInstagram());
      setMessage(text(locale, "disconnected"));
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  const instagramState = connectionState(connection, Boolean(session));
  const connectedCount = [instagramState, "connected", "disconnected"].filter((state) => state === "connected").length;

  return (
    <section className="grid gap-5">
      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E_0%,#0F3460_58%,#162447_100%)] p-6 text-white shadow-[0_8px_32px_rgba(15,52,96,.24)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="relative flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[26px] font-bold leading-tight tracking-normal">{text(locale, "title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/25 bg-emerald-400/15 px-3 py-1 text-sm font-bold text-emerald-300">
                <CheckCircle2 size={14} />
                {connectedCount} {text(locale, "connected")}
              </span>
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-white/55">{text(locale, "subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 text-sm font-bold text-white hover:bg-white/15 disabled:opacity-50" disabled={isBusy} onClick={refreshConnection} type="button">
              <RefreshCcw size={15} />
              {text(locale, "refresh")}
            </button>
            <button className="inline-flex h-10 items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-4 text-sm font-extrabold text-white shadow-[0_3px_12px_rgba(233,69,96,.3)] disabled:opacity-50" disabled={isBusy} onClick={startOAuth} type="button">
              <ExternalLink size={15} />
              {text(locale, "connectInstagram")}
            </button>
          </div>
        </div>
      </section>

      {isBusy || auditState ? (
        <SurfaceState
          action={
            auditState === "limit" ? (
              <a className="inline-flex h-10 items-center rounded-button bg-accent px-4 text-sm font-bold text-white" href={`/${locale}/settings`}>
                {text(locale, "openSettings")}
              </a>
            ) : (
              <button className="inline-flex h-10 items-center gap-2 rounded-button border border-border bg-card px-4 text-sm font-bold text-navy disabled:opacity-60" disabled={isBusy || !session} onClick={refreshConnection} type="button">
                <RefreshCcw size={15} />
                {text(locale, "refresh")}
              </button>
            )
          }
          body={auditStateText(locale, isBusy ? "loading" : auditState).body}
          title={auditStateText(locale, isBusy ? "loading" : auditState).title}
          tone={auditState === "error" ? "error" : auditState === "success" ? "success" : auditState === "limit" ? "limit" : "loading"}
        />
      ) : null}

      {message ? (
        <SurfaceState body={message} title={text(locale, auditState === "error" ? "attention" : "status")} tone={auditState === "error" ? "error" : "info"} />
      ) : null}

      <section className="grid gap-4 xl:grid-cols-3">
        <ChannelCard
          {...(connection?.tokenExpiresAt ? { tokenExpiresAt: connection.tokenExpiresAt } : {})}
          account={connection?.accountId ?? "@zain_bh"}
          color="#E1306C"
          icon={Instagram}
          locale={locale}
          name="Instagram"
          onDisconnect={disconnect}
          primary
          state={instagramState}
        />
        <ChannelCard account="Zain Bahrain" color="#1877F2" icon={Facebook} name="Facebook" state="connected" locale={locale} />
        <ChannelCard account="@zain_bh" color="#374151" icon={Twitter} name="X (Twitter)" state="disconnected" locale={locale} />
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{text(locale, "readiness")}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "readinessSub")}</p>
            </div>
            <span className="rounded-full bg-emerald-500/10 px-3 py-1 text-xs font-extrabold text-emerald-600">{text(locale, "guarded")}</span>
          </div>
          <div className="mt-6 grid gap-3 md:grid-cols-2">
            <ReadinessItem complete={instagramState === "connected"} label={text(locale, "businessAccount")} />
            <ReadinessItem complete={instagramState === "connected"} label={text(locale, "longLivedToken")} />
            <ReadinessItem complete label={text(locale, "dailyCapVisible")} />
            <ReadinessItem complete label={text(locale, "reviewDocs")} />
          </div>
        </article>

        <article className="rounded-2xl border-2 border-midnavy bg-card p-5 shadow-[0_4px_24px_rgba(233,69,96,.18)]">
          <div className="flex items-center gap-3">
            <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#E94560,#6366F1)] text-white">
              <Zap size={22} />
            </div>
            <div>
              <h3 className="font-extrabold text-navy">{text(locale, "publishPath")}</h3>
              <p className="text-sm text-muted">{text(locale, "publishPathSub")}</p>
            </div>
          </div>
          <div className="mt-5 grid gap-2 text-sm">
            {["container", "poll", "publish", "audit"].map((key, index) => (
              <div className="flex items-center gap-3 rounded-xl bg-canvas px-3 py-2" key={key}>
                <span className="flex h-7 w-7 items-center justify-center rounded-full bg-midnavy text-xs font-extrabold text-white">{index + 1}</span>
                <span className="font-bold text-navy">{text(locale, key)}</span>
              </div>
            ))}
          </div>
        </article>
      </section>
    </section>
  );
}

function ChannelCard({
  account,
  color,
  icon: Icon,
  locale,
  name,
  onDisconnect,
  primary = false,
  state,
  tokenExpiresAt
}: {
  account: string;
  color: string;
  icon: typeof Instagram;
  locale: Locale;
  name: string;
  onDisconnect?: () => void;
  primary?: boolean;
  state: ChannelState;
  tokenExpiresAt?: string;
}) {
  const stateStyle = stateMeta(locale, state);

  return (
    <article className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
      <div className="flex items-start justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}14`, color }}>
            <Icon size={22} />
          </div>
          <div>
            <h3 className="font-extrabold text-navy">{name}</h3>
            <p className="text-sm text-muted">{account}</p>
          </div>
        </div>
        <span className={`rounded-full px-3 py-1 text-xs font-extrabold ${stateStyle.className}`}>{stateStyle.label}</span>
      </div>
      <div className="mt-5 grid gap-2 text-sm text-muted">
        <p>{primary ? text(locale, "instagramNote") : text(locale, "secondaryNote")}</p>
        {tokenExpiresAt ? <p>{text(locale, "expires")} {new Date(tokenExpiresAt).toLocaleDateString(locale)}</p> : null}
      </div>
      {onDisconnect ? (
        <button className="mt-5 inline-flex h-10 items-center gap-2 rounded-xl border border-[#E8ECF2] bg-canvas px-3 text-sm font-bold text-muted hover:text-navy" onClick={onDisconnect} type="button">
          <Link2Off size={15} />
          {text(locale, "disconnect")}
        </button>
      ) : null}
    </article>
  );
}

function ReadinessItem({ complete, label }: { complete: boolean; label: string }) {
  return (
    <div className="flex items-center gap-3 rounded-xl border border-[#E8ECF2] bg-canvas p-4">
      {complete ? <ShieldCheck className="text-emerald-600" size={18} /> : <AlertTriangle className="text-amber-500" size={18} />}
      <span className="text-sm font-bold text-navy">{label}</span>
    </div>
  );
}

function connectionState(connection: InstagramConnection | null, hasSession: boolean): ChannelState {
  if (!hasSession) {
    return "connected";
  }

  if (!connection?.connected) {
    return "disconnected";
  }

  if (connection.tokenExpiresAt && new Date(connection.tokenExpiresAt).getTime() < Date.now()) {
    return "expired";
  }

  return "connected";
}

function isAuditState(value: string | null): value is AuditState {
  return value === "loading" || value === "error" || value === "success" || value === "limit";
}

function auditStateText(locale: Locale, state: AuditState | null): { body: string; title: string } {
  const resolved = state ?? "success";
  const dictionary: Record<Locale, Record<AuditState, { body: string; title: string }>> = {
    ar: {
      error: {
        body: "تعذر فحص اتصال Instagram. لا يسمح MARKOS بالنشر حتى تعود الجاهزية واضحة.",
        title: "فشل فحص القنوات"
      },
      limit: {
        body: "القنوات ظاهرة، لكن عمليات ربط أو نشر إضافية متوقفة حتى يتم تحديث الخطة أو إزالة القيود.",
        title: "تم الوصول إلى حد الخطة"
      },
      loading: {
        body: "يتم فحص الحساب التجاري، الرمز طويل المدة، حد النشر اليومي، ومسار App Review.",
        title: "جار فحص جاهزية النشر"
      },
      success: {
        body: "مسار النشر واضح: إنشاء الحاوية، انتظار المعالجة، النشر، ثم تسجيل محاولة التدقيق.",
        title: "القنوات جاهزة"
      }
    },
    en: {
      error: {
        body: "Instagram connection could not be checked. MARKOS will not publish until readiness is explicit again.",
        title: "Channel check failed"
      },
      limit: {
        body: "Channels are visible, but additional connection or publish operations are paused until plan limits are cleared.",
        title: "Plan limit reached"
      },
      loading: {
        body: "Checking business account status, long-lived token, daily publish cap, and App Review path.",
        title: "Checking publish readiness"
      },
      success: {
        body: "Publish path is explicit: create container, poll processing, publish, then audit the attempt.",
        title: "Channels ready"
      }
    }
  };

  return dictionary[locale][resolved];
}

function stateMeta(locale: Locale, state: ChannelState): { className: string; label: string } {
  if (state === "connected") {
    return { className: "bg-emerald-500/10 text-emerald-700", label: text(locale, "connected") };
  }

  if (state === "expired") {
    return { className: "bg-amber-500/10 text-amber-700", label: text(locale, "expired") };
  }

  if (state === "review") {
    return { className: "bg-blue-500/10 text-blue-700", label: text(locale, "review") };
  }

  return { className: "bg-slate-100 text-slate-600", label: text(locale, "notConnected") };
}

function text(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      attention: "تنبيه",
      audit: "تدقيق ومحاولة نشر",
      businessAccount: "حساب أعمال مرتبط",
      connected: "متصل",
      connectInstagram: "ربط إنستغرام",
      container: "إنشاء حاوية",
      dailyCapVisible: "حد النشر اليومي ظاهر",
      disconnect: "فصل",
      disconnected: "تم فصل إنستغرام",
      expires: "ينتهي في",
      expired: "منتهي",
      failed: "فشل الطلب",
      guarded: "محمي",
      instagramNote: "القناة الأساسية للنشر والتحليلات في MARKOS.",
      longLivedToken: "رمز طويل المدة",
      notConnected: "غير متصل",
      openSettings: "فتح الإعدادات",
      poll: "انتظار معالجة الوسائط",
      previewOnly: "هذا إجراء معاينة حتى يتم تسجيل الدخول.",
      publish: "نشر إلى إنستغرام",
      publishPath: "مسار النشر",
      publishPathSub: "مصمم حول قيود Instagram",
      readiness: "جاهزية النشر",
      readinessSub: "لا يتم النشر بصمت عند وجود نقص",
      refresh: "تحديث",
      review: "مراجعة",
      reviewDocs: "وثائق App Review جاهزة",
      secondaryNote: "قناة مساعدة للمعاينة والجدولة متعددة القنوات.",
      status: "الحالة",
      subtitle: "إدارة اتصالات القنوات، حالة الرموز، وجاهزية النشر من شاشة واحدة.",
      title: "القنوات"
    },
    en: {
      attention: "Attention",
      audit: "Audit publish attempt",
      businessAccount: "Business account connected",
      connected: "Connected",
      connectInstagram: "Connect Instagram",
      container: "Create media container",
      dailyCapVisible: "Daily cap visible",
      disconnect: "Disconnect",
      disconnected: "Instagram disconnected",
      expires: "Expires",
      expired: "Expired",
      failed: "Request failed",
      guarded: "Guarded",
      instagramNote: "Primary publishing and analytics channel for MARKOS.",
      longLivedToken: "Long-lived token",
      notConnected: "Not connected",
      openSettings: "Open settings",
      poll: "Poll media processing",
      previewOnly: "This action is preview-only until you sign in.",
      publish: "Publish to Instagram",
      publishPath: "Publish Path",
      publishPathSub: "Built around Instagram realities",
      readiness: "Publishing Readiness",
      readinessSub: "MARKOS does not publish silently when a requirement is missing",
      refresh: "Refresh",
      review: "Review",
      reviewDocs: "App Review docs ready",
      secondaryNote: "Supporting channel for preview and multi-channel planning.",
      status: "Status",
      subtitle: "Manage channel connections, token state, and publishing readiness from one operational screen.",
      title: "Channels"
    }
  };

  return dictionary[locale][key] ?? key;
}
