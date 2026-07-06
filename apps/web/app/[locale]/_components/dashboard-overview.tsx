"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowRight,
  BarChart3,
  CalendarClock,
  Eye,
  Facebook,
  Flame,
  Heart,
  Instagram,
  MessageSquareText,
  RefreshCw,
  Share2,
  Sparkles,
  Target,
  TrendingDown,
  TrendingUp,
  Twitter,
  Users,
  Zap
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import { getBrowserApiBaseUrl } from "./api-base-url";
import type { AnalyticsMetricTotals, AnalyticsSummary, AuthSession, ContentRecord, Locale } from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = getBrowserApiBaseUrl();

const demoTotals: AnalyticsMetricTotals = {
  comments: 847,
  engagement: 12840,
  followers: 38492,
  impressions: 183000,
  likes: 12419,
  reach: 147300,
  saves: 312,
  shares: 262,
  views: 166000
};

const demoReachTrend = [
  { day: "Mon", organic: 12, paid: 4 },
  { day: "Tue", organic: 19, paid: 6 },
  { day: "Wed", organic: 16, paid: 5 },
  { day: "Thu", organic: 24, paid: 9 },
  { day: "Fri", organic: 32, paid: 10 },
  { day: "Sat", organic: 28, paid: 7 },
  { day: "Sun", organic: 21, paid: 5 }
];

const demoChannels = [
  { platform: "instagram", label: "Instagram", color: "#E1306C", followers: "24.1K", reach: "119K", engagement: "4.8%", width: "80%" },
  { platform: "facebook", label: "Facebook", color: "#1877F2", followers: "11.2K", reach: "24K", engagement: "2.3%", width: "38%" },
  { platform: "twitter", label: "X (Twitter)", color: "#374151", followers: "3.2K", reach: "4.3K", engagement: "1.7%", width: "28%" }
];

type UpcomingTone = "approved" | "draft" | "failed" | "published" | "review" | "scheduled";

const demoUpcoming = [
  { ai: true, engagement: "4.8%", platform: "instagram", reach: "18K-24K", statusKey: "scheduled", timeKey: "todaySix", titleKey: "ramadanDeal", typeKey: "reel" },
  { ai: false, engagement: "2.3%", platform: "facebook", reach: "8K-12K", statusKey: "approved", timeKey: "tomorrowNine", titleKey: "coverageMap", typeKey: "imagePost" },
  { ai: true, engagement: "5.1%", platform: "instagram", reach: "22K-30K", statusKey: "review", timeKey: "junTwelve", titleKey: "studentLaunch", typeKey: "carousel" },
  { ai: false, engagement: "1.7%", platform: "twitter", reach: "3K-5K", statusKey: "draft", timeKey: "junThirteen", titleKey: "summerPackage", typeKey: "textPost" }
] satisfies Array<{
  ai: boolean;
  engagement: string;
  platform: string;
  reach: string;
  statusKey: UpcomingTone;
  timeKey: string;
  titleKey: string;
  typeKey: string;
}>;

export function DashboardOverview({ locale }: { locale: Locale }) {
  const [session, setSession] = useState<AuthSession | null>(null);
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [queue, setQueue] = useState<ContentRecord[] | null>(null);
  const [message, setMessage] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [dismissedInsight, setDismissedInsight] = useState(false);

  const client = useMemo(() => {
    const options = { baseUrl: apiBaseUrl } satisfies { baseUrl: string; accessToken?: string; workspaceId?: string };
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

    let alive = true;
    setIsLoading(true);
    setMessage("");

    void Promise.all([client.analytics({ days: 7 }), client.publishingQueue()])
      .then(([nextSummary, nextQueue]) => {
        if (!alive) return;
        setSummary(nextSummary);
        setQueue(nextQueue);
      })
      .catch((error) => {
        if (!alive) return;
        setMessage(error instanceof Error ? error.message : text(locale, "failed"));
      })
      .finally(() => {
        if (alive) setIsLoading(false);
      });

    return () => {
      alive = false;
    };
  }, [client, locale, session]);

  const dashboard = buildDashboardData(locale, summary, queue);
  const greeting = text(locale, "greeting");
  const workspaceName = session?.workspace.name ?? "Zain Arabia";
  const userName = session?.user.fullName?.split(" ")[0] ?? (locale === "ar" ? "أحمد" : "Ahmed");
  const emptyCalendar = Boolean(session && !isLoading && !message && (queue?.length ?? 0) === 0);

  return (
    <section className="grid gap-5">
      {isLoading ? <StateBanner tone="blue" title={text(locale, "loadingTitle")} body={text(locale, "loadingBody")} /> : null}
      {message ? <StateBanner tone="rose" title={text(locale, "errorTitle")} body={message} /> : null}
      {emptyCalendar ? (
        <StateBanner
          actionHref={`/${locale}/content`}
          actionLabel={text(locale, "emptyAction")}
          tone="amber"
          title={text(locale, "emptyTitle")}
          body={text(locale, "emptyBody")}
        />
      ) : null}

      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E_0%,#0F3460_60%,#162447_100%)] p-6 text-white shadow-[0_8px_32px_rgba(15,52,96,.25)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.06)_1px,transparent_1px)] [background-size:28px_28px]" />
        <div className="absolute -right-12 -top-16 h-64 w-64 rounded-full bg-accent/20 blur-3xl" />
        <div className="relative flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-[26px] font-bold leading-tight tracking-normal">{greeting}, {userName}</h2>
              <span aria-hidden="true" className="text-[22px] leading-none">{"\u{1F44B}"}</span>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-amber-400/30 bg-amber-400/15 px-3 py-1 text-sm font-bold text-amber-400">
                <Flame size={14} />
                {text(locale, "streak")}
              </span>
            </div>
            <p className="mt-2 text-sm font-normal text-white/55">{formatDashboardDate(locale)} - {workspaceName} {text(locale, "workspace")}</p>
            <div className="mt-5 flex flex-wrap gap-4">
              {[
                [text(locale, "postsToday"), String(dashboard.postsToday), "#22C55E"],
                [text(locale, "pendingReview"), String(dashboard.pendingReview), "#F59E0B"],
                [text(locale, "aiSuggestions"), "5", "#E94560"],
                [text(locale, "avgEngRate"), dashboard.engagementRate, "#6366F1"]
              ].map(([label, value, color]) => (
                <div className="flex items-center gap-2" key={label}>
                  <span className="h-2 w-2 rounded-full shadow-[0_0_7px_currentColor]" style={{ backgroundColor: color, color }} />
                  <span className="text-[13px] text-white/50">{label}:</span>
                  <span className="text-[13px] font-bold text-white">{value}</span>
                </div>
              ))}
            </div>
          </div>
          <div className="flex shrink-0 flex-col items-center">
            <ScoreRing score={dashboard.brandScore} />
            <p className="mt-2 text-xs text-white/55">{text(locale, "brandHealth")}</p>
            <p className="text-xs font-extrabold text-emerald-400">{text(locale, "excellent")}</p>
          </div>
        </div>
      </section>

      <section className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        {dashboard.kpis.map((kpi) => {
          const Icon = kpi.icon;
          const TrendIcon = kpi.up ? TrendingUp : TrendingDown;

          return (
            <article className="overflow-hidden rounded-2xl border border-[#E8ECF2] bg-card shadow-[0_2px_8px_rgba(0,0,0,.05)] transition hover:-translate-y-0.5" key={kpi.label}>
              <div className="h-1" style={{ background: `linear-gradient(90deg,${kpi.color},${kpi.color}88)` }} />
              <div className="p-5">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold tracking-[.02em] text-[#6B7280]">{kpi.label}</p>
                    <p className="mt-8 font-display text-[30px] font-extrabold leading-none tracking-normal text-navy">{kpi.value}</p>
                    <p className="mt-1 text-[11px] text-[#9CA3AF]">{kpi.sub}</p>
                  </div>
                  <div className="flex h-[34px] w-[34px] items-center justify-center rounded-xl" style={{ backgroundColor: `${kpi.color}14`, color: kpi.color }}>
                    <Icon size={16} strokeWidth={1.5} />
                  </div>
                </div>
                <div className="mt-5 flex items-center justify-between gap-3">
                  <span className={kpi.up ? "inline-flex items-center gap-1 rounded-full bg-emerald-500/10 px-2.5 py-1 text-[11px] font-bold text-emerald-600" : "inline-flex items-center gap-1 rounded-full bg-rose-500/10 px-2.5 py-1 text-[11px] font-bold text-rose-600"}>
                    <TrendIcon size={11} />
                    {kpi.change}
                  </span>
                  <Sparkline color={kpi.color} data={kpi.spark} />
                </div>
              </div>
            </article>
          );
        })}
      </section>

      <section className="grid gap-4 xl:grid-cols-[1fr_340px]">
        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{text(locale, "weeklyReach")}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "organicPaid")}</p>
            </div>
            <div className="flex items-center gap-5 text-sm text-muted">
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-midnavy" />{text(locale, "organic")}</span>
              <span className="inline-flex items-center gap-2"><span className="h-2.5 w-2.5 rounded-full bg-accent" />{text(locale, "paid")}</span>
            </div>
          </div>
          <ReachChart trend={dashboard.trend} />
        </article>

        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-6 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <h3 className="text-[15px] font-bold text-navy">{text(locale, "channelPerformance")}</h3>
          <p className="mt-1 text-xs text-[#9CA3AF]">{text(locale, "engagementByPlatform")}</p>
          <div className="mt-7 grid gap-5">
            {dashboard.channels.map((channel) => (
              <div className="flex items-center gap-4" key={channel.label}>
                <MiniRing color={channel.color} platform={channel.platform} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-3">
                    <p className="font-bold text-navy">{channel.label}</p>
                    <p className="font-extrabold" style={{ color: channel.color }}>{channel.engagement}</p>
                  </div>
                  <p className="mt-1 text-sm text-muted">{channel.followers} {text(locale, "followers")} - {channel.reach} {text(locale, "reach")}</p>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-100">
                    <div className="h-full rounded-full" style={{ width: channel.width, backgroundColor: channel.color }} />
                  </div>
                </div>
              </div>
            ))}
          </div>
          <div className="mt-7 flex items-center justify-between rounded-2xl bg-slate-50 px-4 py-3">
            <span className="text-sm text-muted">{text(locale, "overallEng")}</span>
            <span className="font-display text-xl font-extrabold tracking-normal text-navy">4.8%</span>
          </div>
        </article>
      </section>

      <section className="grid gap-4 xl:grid-cols-[320px_1fr]">
        <article className="rounded-2xl border-2 border-midnavy bg-card p-5 shadow-[0_4px_24px_rgba(233,69,96,.18)]">
          <div className="flex items-center justify-between gap-3">
            <div className="flex items-center gap-3">
              <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-[linear-gradient(135deg,#E94560,#6366F1)] text-white">
                <Sparkles size={22} />
              </div>
              <div>
                <h3 className="font-extrabold text-navy">{text(locale, "aiInsight")}</h3>
                <p className="text-sm text-muted">{text(locale, "updatedNow")}</p>
              </div>
            </div>
            <button className="rounded-xl p-2 text-muted hover:bg-canvas" type="button" aria-label="Refresh insight">
              <RefreshCw size={17} />
            </button>
          </div>
          {dismissedInsight ? (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-canvas p-5 text-sm text-muted">{text(locale, "insightDismissed")}</div>
          ) : (
            <>
              <div className="mt-5 min-h-[220px] rounded-xl border border-accent/15 bg-[linear-gradient(135deg,rgba(233,69,96,.04),rgba(99,102,241,.04))] p-5">
                <p className="text-[13px] leading-7 text-slate-700">{dashboard.insight}</p>
              </div>
              <div className="mt-5 grid grid-cols-2 gap-3">
                <a className="inline-flex items-center justify-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-4 py-3 text-sm font-extrabold text-white shadow-[0_4px_14px_rgba(233,69,96,.28)]" href={`/${locale}/content`}>
                  <Zap size={15} />
                  {text(locale, "applyNow")}
                </a>
                <button className="rounded-xl border border-border bg-canvas px-4 py-3 text-sm font-bold text-muted" onClick={() => setDismissedInsight(true)} type="button">{text(locale, "dismiss")}</button>
              </div>
            </>
          )}
        </article>

        <article className="rounded-2xl border border-[#E8ECF2] bg-card p-5 shadow-[0_2px_8px_rgba(0,0,0,.05)]">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-[15px] font-bold text-navy">{text(locale, "upcomingContent")}</h3>
              <p className="mt-1 text-xs text-[#9CA3AF]">{dashboard.upcoming.length} {text(locale, "queuedNext")}</p>
            </div>
            <a className="inline-flex items-center gap-2 rounded-xl border border-accent/20 bg-accent/5 px-4 py-2 text-sm font-extrabold text-accent" href={`/${locale}/schedule`}>
              {text(locale, "viewQueue")}
              <ArrowRight size={15} />
            </a>
          </div>
          {dashboard.upcoming.length === 0 ? (
            <div className="mt-5 rounded-xl border border-dashed border-border bg-canvas p-6 text-sm leading-6 text-muted">
              <p className="font-bold text-navy">{text(locale, "emptyQueueTitle")}</p>
              <p className="mt-1">{text(locale, "emptyQueueBody")}</p>
            </div>
          ) : (
            <div className="mt-5 grid gap-3">
              {dashboard.upcoming.map((item) => (
                <UpcomingItem item={item} key={item.title} locale={locale} />
              ))}
            </div>
          )}
        </article>
      </section>

      <section className="relative overflow-hidden rounded-2xl bg-[linear-gradient(135deg,#1A1A2E,#0F3460)] p-5 text-white shadow-[0_4px_20px_rgba(15,52,96,.2)]">
        <div className="absolute inset-0 opacity-60 [background-image:radial-gradient(rgba(255,255,255,.045)_1px,transparent_1px)] [background-size:20px_20px]" />
        <div className="relative flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
          <div>
            <p className="inline-flex items-center gap-2 text-xs font-extrabold uppercase tracking-[.16em] text-accent">
              <Sparkles size={15} />
              {text(locale, "quickActions")}
            </p>
            <p className="mt-2 text-lg font-semibold text-white/55">{text(locale, "quickActionsBody")}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            {[
              { href: `/${locale}/content`, icon: BarChart3, label: text(locale, "generateReel") },
              { href: `/${locale}/content`, icon: MessageSquareText, label: text(locale, "writeCaption") },
              { href: `/${locale}/schedule`, icon: Target, label: text(locale, "bestTime") }
            ].map((action) => {
              const Icon = action.icon;
              return (
                <a className="inline-flex items-center gap-2 rounded-xl border border-white/10 bg-white/10 px-4 py-3 text-sm font-bold text-white hover:bg-white/15" href={action.href} key={action.label}>
                  <Icon size={16} className="text-accent" />
                  {action.label}
                </a>
              );
            })}
          </div>
        </div>
      </section>
    </section>
  );
}

function ScoreRing({ score }: { score: number }) {
  const circumference = 2 * Math.PI * 38;
  const dash = (score / 100) * circumference;

  return (
    <div className="relative flex h-24 w-24 items-center justify-center">
      <svg className="-rotate-90" height="96" width="96">
        <circle cx="48" cy="48" r="38" fill="none" stroke="rgba(255,255,255,.12)" strokeWidth="8" />
        <circle cx="48" cy="48" r="38" fill="none" stroke="#22C55E" strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" strokeWidth="8" />
      </svg>
      <div className="absolute text-center">
        <p className="font-display text-[22px] font-extrabold leading-none tracking-normal">{score}</p>
        <p className="mt-1 text-[10px] font-bold uppercase tracking-[.12em] text-white/45">Score</p>
      </div>
    </div>
  );
}

function Sparkline({ color, data }: { color: string; data: number[] }) {
  const values = normalizeSeries(data, 18, 72);
  const points = values.map((value, index) => `${index * 13},${80 - value}`).join(" ");
  return (
    <svg height="42" viewBox="0 0 82 42" width="82" aria-hidden="true">
      <polyline fill="none" points={points} stroke={color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="3" />
    </svg>
  );
}

function ReachChart({ trend }: { trend: Array<{ day: string; organic: number; paid: number }> }) {
  const organicValues = normalizeSeries(trend.map((point) => point.organic), 32, 172);
  const paidValues = normalizeSeries(trend.map((point) => point.paid), 120, 186);
  const organicPoints = organicValues.map((value, index) => `${index * 118 + 8},${210 - value}`).join(" ");
  const paidPoints = paidValues.map((value, index) => `${index * 118 + 8},${210 - value}`).join(" ");

  return (
    <div className="mt-6 overflow-hidden">
      <svg className="h-[200px] w-full" viewBox="0 0 740 220" preserveAspectRatio="none" aria-label="Weekly reach trend">
        {[0, 1, 2, 3].map((line) => (
          <line key={line} x1="0" x2="740" y1={40 + line * 55} y2={40 + line * 55} stroke="#EEF2F7" strokeDasharray="5 7" />
        ))}
        <polyline fill="none" points={organicPoints} stroke="#0F3460" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
        <polyline fill="none" points={paidPoints} stroke="#E94560" strokeLinecap="round" strokeLinejoin="round" strokeWidth="4" />
      </svg>
      <div className="grid grid-cols-7 px-1 text-center text-[11px] font-semibold text-[#9CA3AF]">
        {trend.map((point) => <span key={point.day}>{point.day}</span>)}
      </div>
    </div>
  );
}

function PlatformIcon({ color, platform, size = 16 }: { color: string; platform: string; size?: number }) {
  if (platform === "facebook") {
    return <Facebook className="absolute" color={color} size={size} />;
  }

  if (platform === "twitter") {
    return <Twitter className="absolute" color={color} size={size} />;
  }

  return <Instagram className="absolute" color={color} size={size} />;
}

function MiniRing({ color, platform }: { color: string; platform: string }) {
  return (
    <div className="relative flex h-14 w-14 shrink-0 items-center justify-center">
      <svg className="-rotate-90" height="56" width="56">
        <circle cx="28" cy="28" r="21" fill="none" stroke="#F1F5F9" strokeWidth="6" />
        <circle cx="28" cy="28" r="21" fill="none" stroke={color} strokeDasharray="96 132" strokeLinecap="round" strokeWidth="6" />
      </svg>
      <PlatformIcon color={color} platform={platform} />
    </div>
  );
}

function UpcomingItem({
  item,
  locale
}: {
  item: {
    ai: boolean;
    engagement: string;
    platform: string;
    reach: string;
    status: string;
    tone: UpcomingTone;
    time: string;
    title: string;
    type: string;
  };
  locale: Locale;
}) {
  const color = item.platform === "facebook" ? "#1877F2" : item.platform === "twitter" ? "#374151" : "#E1306C";
  const statusStyle = {
    approved: "bg-emerald-50 text-emerald-700",
    draft: "bg-slate-100 text-slate-600",
    failed: "bg-rose-50 text-rose-700",
    published: "bg-emerald-50 text-emerald-700",
    review: "bg-amber-50 text-amber-700",
    scheduled: "bg-blue-50 text-blue-700"
  }[item.tone];

  return (
    <div className="flex items-center gap-4 overflow-hidden rounded-xl border border-slate-100 transition hover:shadow-md">
      <div className="self-stretch w-1 shrink-0" style={{ backgroundColor: color }} />
      <div className="relative flex h-12 w-12 shrink-0 items-center justify-center rounded-2xl" style={{ backgroundColor: `${color}12`, color }}>
        <PlatformIcon color={color} platform={item.platform} size={20} />
      </div>
      <div className="min-w-0 flex-1 py-3">
        <div className="flex items-center gap-2">
          <p className="truncate text-[13px] font-bold text-navy">{item.title}</p>
          {item.ai ? <span className="rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[10px] font-extrabold text-accent">AI</span> : null}
        </div>
        <p className="mt-1 text-[11px] text-[#9CA3AF]">{item.time} - {item.type} - {item.reach}</p>
      </div>
      <div className="hidden text-right sm:block">
        <p className="font-extrabold text-emerald-600">{item.engagement}</p>
        <p className="text-xs text-muted">{text(locale, "engShort")}</p>
      </div>
      <span className={`me-4 shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${statusStyle}`}>{item.status}</span>
    </div>
  );
}

function StateBanner({
  actionHref,
  actionLabel,
  body,
  title,
  tone
}: {
  actionHref?: string;
  actionLabel?: string;
  body: string;
  title: string;
  tone: "amber" | "blue" | "rose";
}) {
  const toneClass =
    tone === "rose"
      ? "border-rose-200 bg-rose-50 text-rose-700"
      : tone === "amber"
        ? "border-amber-200 bg-amber-50 text-amber-700"
        : "border-blue-200 bg-blue-50 text-blue-700";

  return (
    <div className={`flex flex-col gap-3 rounded-2xl border px-5 py-4 text-sm md:flex-row md:items-center md:justify-between ${toneClass}`}>
      <div>
        <p className="font-extrabold">{title}</p>
        <p className="mt-1 leading-6 opacity-80">{body}</p>
      </div>
      {actionHref && actionLabel ? (
        <a className="inline-flex shrink-0 items-center justify-center gap-2 rounded-xl bg-white px-4 py-2 font-extrabold text-navy shadow-sm" href={actionHref}>
          {actionLabel}
          <ArrowRight size={15} />
        </a>
      ) : null}
    </div>
  );
}

function buildDashboardData(locale: Locale, summary: AnalyticsSummary | null, queue: ContentRecord[] | null) {
  const totals = summary?.totals ?? demoTotals;
  const liveQueue = queue ?? [];
  const hasLiveQueue = queue !== null;
  const upcomingContent = hasLiveQueue
    ? liveQueue.filter((item) => item.scheduledAt && item.status !== "PUBLISHED").slice(0, 4).map((item) => contentToUpcoming(item, locale))
    : localizeDemoUpcoming(locale);
  const postsToday = hasLiveQueue
    ? liveQueue.filter((item) => item.publishedAt && isSameLocalDay(new Date(item.publishedAt), new Date())).length
    : 2;
  const pendingReview = hasLiveQueue ? liveQueue.filter((item) => item.status === "IN_REVIEW").length : 1;
  const postsPublished = hasLiveQueue
    ? liveQueue.filter((item) => item.status === "PUBLISHED" && item.publishedAt && daysBetween(new Date(item.publishedAt), new Date()) <= 7).length
    : 14;
  const engagementRate = totals.reach > 0 ? `${((totals.engagement / totals.reach) * 100).toFixed(1)}%` : "0.0%";
  const brandScore = Math.max(62, Math.min(96, Math.round(72 + Number.parseFloat(engagementRate) * 3)));

  const trend = summary?.daily.length
    ? summary.daily.slice(-7).map((day) => ({
        day: new Intl.DateTimeFormat(locale, { weekday: "short" }).format(new Date(day.dataDate)),
        organic: Math.max(4, Math.round(day.totals.reach / 1000)),
        paid: Math.max(2, Math.round(Math.max(day.totals.impressions - day.totals.reach, day.totals.reach * 0.28) / 1000))
      }))
    : demoReachTrend.map((point) => ({ ...point, day: localizeDemoDay(locale, point.day) }));

  return {
    brandScore,
    channels: buildChannels(locale, summary, totals),
    engagementRate,
    insight: buildInsight(locale, summary),
    kpis: [
      {
        change: "+18.4%",
        color: "#6366F1",
        icon: Eye,
        label: text(locale, "totalReach"),
        spark: trend.map((point) => point.organic * 2),
        sub: text(locale, "vsLast7"),
        up: true,
        value: formatCompact(locale, totals.reach)
      },
      {
        change: "+7.2%",
        color: "#E94560",
        icon: Heart,
        label: text(locale, "engagements"),
        spark: trend.map((point) => point.paid * 7),
        sub: text(locale, "likesCommentsShares"),
        up: true,
        value: formatCompact(locale, totals.engagement)
      },
      {
        change: "+542",
        color: "#22C55E",
        icon: Users,
        label: text(locale, "followersKpi"),
        spark: [52, 53, 54, 55, 56, 57, 58],
        sub: text(locale, "acrossChannels"),
        up: true,
        value: formatNumber(locale, totals.followers || demoTotals.followers)
      },
      {
        change: postsPublished >= 14 ? "+2" : "-2",
        color: "#F59E0B",
        icon: Share2,
        label: text(locale, "postsPublished"),
        spark: [56, 48, 62, 44, 52, 47, 50],
        sub: text(locale, "thisWeek"),
        up: postsPublished >= 14,
        value: String(postsPublished)
      }
    ],
    pendingReview,
    postsToday,
    trend,
    upcoming: upcomingContent
  };
}

function buildChannels(locale: Locale, summary: AnalyticsSummary | null, totals: AnalyticsMetricTotals) {
  if (!summary?.byMetricType.length) {
    return demoChannels.map((channel) => ({ ...channel, label: localizeChannel(locale, channel.label) }));
  }

  return summary.byMetricType.slice(0, 3).map((bucket, index) => {
    const color = index === 0 ? "#E1306C" : index === 1 ? "#1877F2" : "#374151";
    const engagement = bucket.totals.reach > 0 ? `${((bucket.totals.engagement / bucket.totals.reach) * 100).toFixed(1)}%` : "0.0%";
    return {
      color,
      engagement,
      followers: formatCompact(locale, bucket.totals.followers || Math.round((totals.followers || demoTotals.followers) / (index + 2))),
      label: metricTypeLabel(locale, bucket.metricType),
      platform: index === 1 ? "facebook" : index === 2 ? "twitter" : "instagram",
      reach: formatCompact(locale, bucket.totals.reach),
      width: `${Math.max(18, Math.min(92, Number.parseFloat(engagement) * 14))}%`
    };
  });
}

function buildInsight(locale: Locale, summary: AnalyticsSummary | null): string {
  if (!summary || summary.records.length === 0) {
    return text(locale, "previewInsight");
  }

  const top = summary.topContent[0];
  if (top) {
    return locale === "ar"
      ? `أفضل محتوى هذا الأسبوع حقق ${formatCompact(locale, top.engagement)} تفاعلا. حوّل فكرته إلى ريل قصير وجدوله في أقرب نافذة أداء.`
      : `Your best post this week drove ${formatCompact(locale, top.engagement)} engagements. Turn that angle into a short Reel and schedule it in the next strong window.`;
  }

  return summary.totals.reach > 0
    ? locale === "ar"
      ? `وصلت منشوراتك إلى ${formatCompact(locale, summary.totals.reach)} خلال آخر ${summary.days} أيام. حافظ على الإيقاع وجدول دفعة الأسبوع القادمة.`
      : `Your posts reached ${formatCompact(locale, summary.totals.reach)} people in the last ${summary.days} days. Keep momentum by scheduling next week’s batch.`
    : text(locale, "previewInsight");
}

function contentToUpcoming(item: ContentRecord, locale: Locale) {
  const platform = item.instagramPostId ? "instagram" : "instagram";
  return {
    ai: Boolean(item.aiPromptUsed),
    engagement: "0.0%",
    platform,
    reach: text(locale, "pendingReach"),
    status: statusLabel(locale, item.status),
    tone: statusTone(item.status),
    time: item.scheduledAt ? new Intl.DateTimeFormat(locale, { day: "numeric", hour: "numeric", minute: "2-digit", month: "short" }).format(new Date(item.scheduledAt)) : text(locale, "unscheduled"),
    title: item.captionEn?.split(/[.!?]/)[0]?.slice(0, 44) || item.captionAr?.slice(0, 44) || contentTypeLabel(locale, item.contentType),
    type: contentTypeLabel(locale, item.contentType)
  };
}

function localizeDemoUpcoming(locale: Locale) {
  return demoUpcoming.map((item) => ({
    ai: item.ai,
    engagement: item.engagement,
    platform: item.platform,
    reach: item.reach,
    status: demoStatusLabel(locale, item.statusKey),
    time: text(locale, item.timeKey),
    title: text(locale, item.titleKey),
    tone: item.statusKey,
    type: text(locale, item.typeKey)
  }));
}

function demoStatusLabel(locale: Locale, status: UpcomingTone): string {
  const labels: Record<UpcomingTone, Record<Locale, string>> = {
    approved: { ar: "معتمد", en: "Approved" },
    draft: { ar: "مسودة", en: "Draft" },
    failed: { ar: "فشل", en: "Failed" },
    published: { ar: "منشور", en: "Published" },
    review: { ar: "قيد المراجعة", en: "In Review" },
    scheduled: { ar: "مجدول", en: "Scheduled" }
  };
  return labels[status][locale];
}

function normalizeSeries(values: number[], min: number, max: number): number[] {
  const low = Math.min(...values);
  const high = Math.max(...values);
  if (low === high) {
    return values.map(() => (min + max) / 2);
  }

  return values.map((value) => min + ((value - low) / (high - low)) * (max - min));
}

function formatCompact(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale, { compactDisplay: "short", maximumFractionDigits: 1, notation: "compact" }).format(value);
}

function formatNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale).format(value);
}

function formatDashboardDate(locale: Locale): string {
  return new Intl.DateTimeFormat(locale, { dateStyle: "full" }).format(new Date());
}

function isSameLocalDay(first: Date, second: Date): boolean {
  return first.getFullYear() === second.getFullYear() && first.getMonth() === second.getMonth() && first.getDate() === second.getDate();
}

function daysBetween(first: Date, second: Date): number {
  return Math.abs(second.getTime() - first.getTime()) / (1000 * 60 * 60 * 24);
}

function localizeDemoDay(locale: Locale, day: string): string {
  const days: Record<string, string> = {
    Fri: "الجمعة",
    Mon: "الاثنين",
    Sat: "السبت",
    Sun: "الأحد",
    Thu: "الخميس",
    Tue: "الثلاثاء",
    Wed: "الأربعاء"
  };
  return locale === "ar" ? days[day] ?? day : day;
}

function localizeChannel(locale: Locale, label: string): string {
  if (locale !== "ar") return label;
  if (label === "Instagram") return "إنستغرام";
  if (label === "Facebook") return "فيسبوك";
  return "X (تويتر)";
}

function metricTypeLabel(locale: Locale, metricType: string): string {
  const normalized = metricType.toLowerCase();
  if (normalized.includes("story")) return locale === "ar" ? "القصص" : "Stories";
  if (normalized.includes("reel")) return locale === "ar" ? "الريلز" : "Reels";
  if (normalized.includes("account")) return locale === "ar" ? "الحساب" : "Account";
  return locale === "ar" ? "إنستغرام" : "Instagram";
}

function statusLabel(locale: Locale, status: ContentRecord["status"]): string {
  const labels: Record<ContentRecord["status"], Record<Locale, string>> = {
    APPROVED: { ar: "معتمد", en: "Approved" },
    DRAFT: { ar: "مسودة", en: "Draft" },
    FAILED: { ar: "فشل", en: "Failed" },
    IN_REVIEW: { ar: "قيد المراجعة", en: "In Review" },
    PUBLISHED: { ar: "منشور", en: "Published" },
    SCHEDULED: { ar: "مجدول", en: "Scheduled" }
  };
  return labels[status][locale];
}

function statusTone(status: ContentRecord["status"]): UpcomingTone {
  const tones: Record<ContentRecord["status"], UpcomingTone> = {
    APPROVED: "approved",
    DRAFT: "draft",
    FAILED: "failed",
    IN_REVIEW: "review",
    PUBLISHED: "published",
    SCHEDULED: "scheduled"
  };
  return tones[status];
}

function contentTypeLabel(locale: Locale, contentType: ContentRecord["contentType"]): string {
  const labels: Record<ContentRecord["contentType"], Record<Locale, string>> = {
    CAROUSEL: { ar: "كاروسيل", en: "Carousel" },
    POST: { ar: "منشور", en: "Post" },
    REEL: { ar: "ريل", en: "Reel" },
    STORY: { ar: "ستوري", en: "Story" }
  };
  return labels[contentType][locale];
}

function text(locale: Locale, key: string): string {
  const dictionary = {
    ar: {
      acrossChannels: "عبر كل القنوات",
      aiInsight: "رؤية ذكية",
      aiSuggestions: "اقتراحات AI",
      applyNow: "طبّق الآن",
      avgEngRate: "متوسط التفاعل",
      bestTime: "اعثر على أفضل وقت",
      brandHealth: "صحة العلامة",
      channelPerformance: "أداء القنوات",
      carousel: "كاروسيل",
      coverageMap: "تحديث خريطة تغطية 5G",
      dismiss: "إخفاء",
      emptyAction: "أنشئ محتوى",
      emptyBody: "لا توجد منشورات مجدولة للأسبوع القادم. ابدأ بتوليد دفعة محتوى حتى لا تبقى القناة فارغة.",
      emptyQueueBody: "أنشئ دفعة محتوى من الخطة ثم راجعها وجدولها.",
      emptyQueueTitle: "لا توجد منشورات قادمة",
      emptyTitle: "تقويم الأسبوع القادم فارغ",
      engShort: "تفاعل",
      engagementByPlatform: "معدل التفاعل حسب المنصة",
      engagements: "التفاعلات",
      errorTitle: "تعذر تحديث اللوحة",
      excellent: "ممتاز للأعلى",
      failed: "تعذر تحميل بيانات لوحة التحكم.",
      followers: "متابع",
      followersKpi: "المتابعون",
      generateReel: "ولّد سكربت ريل",
      greeting: "مساء الخير",
      imagePost: "منشور صورة",
      insightDismissed: "تم إخفاء الرؤية. يمكنك فتح التحليلات لمراجعة توصيات أعمق.",
      junThirteen: "13 يونيو - 12:00 م",
      junTwelve: "12 يونيو - 7:30 م",
      likesCommentsShares: "إعجابات - تعليقات - مشاركات",
      loadingBody: "نراجع التحليلات والمحتوى القادم ونحدّث الحلقة الأسبوعية.",
      loadingTitle: "MARKOS يحدّث اللوحة",
      organic: "طبيعي",
      organicPaid: "طبيعي مقابل مدفوع - آخر 7 أيام",
      overallEng: "متوسط التفاعل العام",
      paid: "مدفوع",
      pendingReach: "قيد التقدير",
      pendingReview: "قيد المراجعة",
      postsPublished: "المنشورات",
      postsToday: "منشورات اليوم",
      previewInsight: "الريلز التي تركز على عرض واضح ووقت نشر مسائي تميل إلى أداء أفضل. جرّب ريل قصير هذا الأسبوع واربطه بدعوة تواصل مباشرة.",
      quickActions: "إجراءات AI سريعة",
      quickActionsBody: "ولّد، راجع، وجدول دفعة الأسبوع بدون أن تبدأ من صفحة فارغة.",
      queuedNext: "منشورات قادمة - 7 أيام",
      ramadanDeal: "عرض اتصال رمضان",
      reach: "وصول",
      reel: "ريل",
      streak: "سلسلة 14 يوما",
      studentLaunch: "إطلاق باقة الطلاب",
      summerPackage: "باقة بيانات الصيف",
      textPost: "منشور نصي",
      thisWeek: "هذا الأسبوع",
      todaySix: "اليوم - 6:00 م",
      totalReach: "إجمالي الوصول",
      tomorrowNine: "غدا - 9:00 ص",
      unscheduled: "غير مجدول",
      upcomingContent: "المحتوى القادم",
      updatedNow: "تم التحديث الآن",
      viewQueue: "عرض الجدول",
      vsLast7: "مقارنة بآخر 7 أيام",
      weeklyReach: "اتجاه الوصول الأسبوعي",
      workspace: "مساحة العمل",
      writeCaption: "اكتب كابشن"
    },
    en: {
      acrossChannels: "across all channels",
      aiInsight: "AI Insight",
      aiSuggestions: "AI suggestions",
      applyNow: "Apply Now",
      avgEngRate: "Avg. eng. rate",
      bestTime: "Find Best Post Time",
      brandHealth: "Brand Health",
      channelPerformance: "Channel Performance",
      carousel: "Carousel",
      coverageMap: "5G Coverage Map Update",
      dismiss: "Dismiss",
      emptyAction: "Create content",
      emptyBody: "There are no scheduled posts for next week. Generate a batch now so the channel never goes quiet.",
      emptyQueueBody: "Generate a content batch from the plan, review it, then schedule it.",
      emptyQueueTitle: "No upcoming posts",
      emptyTitle: "Next week’s calendar is empty",
      engShort: "eng.",
      engagementByPlatform: "Engagement rate by platform",
      engagements: "Engagements",
      errorTitle: "Dashboard could not refresh",
      excellent: "Excellent up",
      failed: "Dashboard data could not be loaded.",
      followers: "followers",
      followersKpi: "Followers",
      generateReel: "Generate Reel Script",
      greeting: "Good afternoon",
      imagePost: "Image Post",
      insightDismissed: "Insight dismissed. Open Analytics for deeper recommendations.",
      junThirteen: "Jun 13 - 12:00 PM",
      junTwelve: "Jun 12 - 7:30 PM",
      likesCommentsShares: "likes - comments - shares",
      loadingBody: "Checking analytics and upcoming content to update the weekly loop.",
      loadingTitle: "MARKOS is updating the dashboard",
      organic: "Organic",
      organicPaid: "Organic vs Paid - last 7 days",
      overallEng: "Overall avg. eng. rate",
      paid: "Paid",
      pendingReach: "pending reach",
      pendingReview: "Pending review",
      postsPublished: "Posts Published",
      postsToday: "Posts today",
      previewInsight: "Reels with a clear offer and evening publish window tend to outperform static posts. Try a short Reel this week with a direct inquiry CTA.",
      quickActions: "AI Quick Actions",
      quickActionsBody: "Generate, review, and schedule next week’s batch without starting from a blank page.",
      queuedNext: "posts queued - next 7 days",
      ramadanDeal: "Ramadan Connectivity Deal",
      reach: "reach",
      reel: "Reel",
      streak: "14-day streak",
      studentLaunch: "Student Plan Launch",
      summerPackage: "Summer Data Package",
      textPost: "Text Post",
      thisWeek: "this week",
      todaySix: "Today - 6:00 PM",
      totalReach: "Total Reach",
      tomorrowNine: "Tomorrow - 9:00 AM",
      unscheduled: "Unscheduled",
      upcomingContent: "Upcoming Content",
      updatedNow: "Updated just now",
      viewQueue: "View Queue",
      vsLast7: "vs last 7 days",
      weeklyReach: "Weekly Reach Trend",
      workspace: "workspace",
      writeCaption: "Write Caption"
    }
  } as const;

  return dictionary[locale][key as keyof (typeof dictionary)["en"]] ?? key;
}
