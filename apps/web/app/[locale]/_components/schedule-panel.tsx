"use client";

import { useEffect, useMemo, useState, type ComponentType } from "react";
import {
  AlertTriangle,
  Calendar,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Eye,
  Facebook,
  GripVertical,
  Instagram,
  List,
  Loader2,
  Plus,
  RotateCcw,
  ShieldCheck,
  Sparkles,
  Trash2,
  TrendingUp,
  Twitter,
  X
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import { getBrowserApiBaseUrl } from "./api-base-url";
import type { AuthSession, ContentRecord, Locale, PublishingLiveReadiness } from "@markos/shared-types";

const sessionKey = "markos.session";
const apiBaseUrl = getBrowserApiBaseUrl();

type ViewMode = "list" | "calendar";
type PublishScenario = "blocked" | "failed" | "ready";
type QueueStatus = "scheduled" | "approved" | "in_review" | "draft" | "published" | "failed";
type Platform = "instagram" | "facebook" | "twitter";
type Icon = ComponentType<{ className?: string; color?: string; size?: number; strokeWidth?: number }>;

interface QueuePost {
  ai: boolean;
  date: string;
  eng: string;
  id: string;
  platform: Platform;
  reach: string;
  status: QueueStatus;
  time: string;
  title: string;
  type: string;
}

interface PublishingReadinessState {
  badge: string;
  body: string;
  items: Array<{ description: string; label: string; ready: boolean }>;
  ready: boolean;
  title: string;
  tone: "blocked" | "failed" | "ready";
}

const monthNames = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
const dayNames = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

const statusStyles: Record<QueueStatus, { bg: string; dot: string; fg: string; label: string }> = {
  approved: { label: "Approved", fg: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  draft: { label: "Draft", fg: "text-slate-500", bg: "bg-slate-50", dot: "bg-slate-400" },
  failed: { label: "Failed", fg: "text-accent", bg: "bg-rose-50", dot: "bg-accent" },
  in_review: { label: "In Review", fg: "text-amber-600", bg: "bg-amber-50", dot: "bg-amber-500" },
  published: { label: "Published", fg: "text-emerald-600", bg: "bg-emerald-50", dot: "bg-emerald-500" },
  scheduled: { label: "Scheduled", fg: "text-blue-600", bg: "bg-blue-50", dot: "bg-blue-600" }
};

const platformStyles: Record<Platform, { bg: string; border: string; color: string; icon: Icon; label: string }> = {
  facebook: { label: "Facebook", color: "#1877F2", bg: "bg-blue-50", border: "border-l-blue-500", icon: Facebook },
  instagram: { label: "Instagram", color: "#E1306C", bg: "bg-pink-50", border: "border-l-accent", icon: Instagram },
  twitter: { label: "Twitter", color: "#374151", bg: "bg-slate-100", border: "border-l-slate-600", icon: Twitter }
};

const demoPosts: QueuePost[] = [
  { id: "post-1", title: "Ramadan Connectivity Deal", platform: "instagram", status: "scheduled", date: "2026-06-10", time: "18:00", type: "Reel", ai: true, reach: "18K-24K", eng: "4.8%" },
  { id: "post-2", title: "5G Coverage Map Update", platform: "facebook", status: "approved", date: "2026-06-11", time: "09:00", type: "Image Post", ai: false, reach: "8K-12K", eng: "2.3%" },
  { id: "post-3", title: "Student Plan Launch", platform: "instagram", status: "in_review", date: "2026-06-12", time: "19:30", type: "Carousel", ai: true, reach: "22K-30K", eng: "5.1%" },
  { id: "post-4", title: "Summer Data Package", platform: "twitter", status: "draft", date: "2026-06-13", time: "12:00", type: "Text Post", ai: false, reach: "3K-5K", eng: "1.7%" },
  { id: "post-5", title: "Business Solutions Webinar", platform: "facebook", status: "scheduled", date: "2026-06-14", time: "10:00", type: "Video", ai: true, reach: "15K-20K", eng: "3.2%" },
  { id: "post-6", title: "Customer Success Story", platform: "instagram", status: "approved", date: "2026-06-15", time: "20:00", type: "Image Post", ai: false, reach: "12K-18K", eng: "4.4%" },
  { id: "post-7", title: "Weekend Data Boost Promo", platform: "instagram", status: "draft", date: "2026-06-16", time: "08:00", type: "Story", ai: true, reach: "25K-35K", eng: "6.2%" },
  { id: "post-8", title: "CSR Initiative Spotlight", platform: "facebook", status: "scheduled", date: "2026-06-17", time: "11:00", type: "Image Post", ai: false, reach: "9K-14K", eng: "2.8%" }
];

const demoFailedPost: QueuePost = {
  ai: true,
  date: "2026-06-09",
  eng: "0.0%",
  id: "post-failed",
  platform: "instagram",
  reach: "Blocked",
  status: "failed",
  time: "18:00",
  title: "Ramadan Connectivity Deal",
  type: "Reel"
};

const bestTimes = [
  { day: 11, time: "6:30 PM", reason: "Peak audience window, no competitor posts scheduled." },
  { day: 12, time: "7:30 PM", reason: "Content gap while your audience is most active." },
  { day: 14, time: "8:00 AM", reason: "Decision-makers browse before work meetings." },
  { day: 16, time: "9:00 PM", reason: "Weekend leisure browsing peak hour." }
];

const filters = [
  { label: "All", value: "all" },
  { label: "Scheduled", value: "scheduled" },
  { label: "In Review", value: "in_review" },
  { label: "Draft", value: "draft" },
  { label: "Approved", value: "approved" }
] as const;

function getInitialView(): ViewMode {
  if (typeof window === "undefined") return "list";
  return new URLSearchParams(window.location.search).get("view") === "calendar" ? "calendar" : "list";
}

function getInitialBestTimes(): boolean {
  if (typeof window === "undefined") return false;
  return new URLSearchParams(window.location.search).get("bestTimes") === "1";
}

function getInitialPublishScenario(): PublishScenario {
  if (typeof window === "undefined") return "ready";
  const value = new URLSearchParams(window.location.search).get("publish");
  return value === "blocked" || value === "failed" ? value : "ready";
}

export function SchedulePanel({ locale }: { locale: Locale }) {
  const [activeFilter, setActiveFilter] = useState<(typeof filters)[number]["value"]>("all");
  const [aiOverlay, setAiOverlay] = useState(false);
  const [calendarMonth, setCalendarMonth] = useState(5);
  const [calendarYear] = useState(2026);
  const [checkingPublish, setCheckingPublish] = useState(false);
  const [liveReadiness, setLiveReadiness] = useState<PublishingLiveReadiness | null>(null);
  const [livePosts, setLivePosts] = useState<QueuePost[]>([]);
  const [publishMessage, setPublishMessage] = useState("");
  const [publishScenario, setPublishScenario] = useState<PublishScenario>("ready");
  const [session, setSession] = useState<AuthSession | null>(null);
  const [view, setView] = useState<ViewMode>("list");

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);
    if (stored) setSession(JSON.parse(stored) as AuthSession);
    setView(getInitialView());
    setAiOverlay(getInitialBestTimes());
    setPublishScenario(getInitialPublishScenario());
  }, []);

  useEffect(() => {
    if (!session) return;

    const client = new MarkosApiClient({
      baseUrl: apiBaseUrl,
      accessToken: session.tokens.accessToken,
      workspaceId: session.workspace.id
    });

    void Promise.all([client.contentItems(), client.publishingQueue(), client.publishingLiveReadiness()])
      .then(([content, queue, readiness]) => {
        const records = [...queue, ...content.filter((item) => item.status === "APPROVED" || item.status === "DRAFT")];
        setLivePosts(records.slice(0, 12).map(mapContentRecord));
        setLiveReadiness(readiness);
      })
      .catch(() => {
        setLivePosts([]);
      });
  }, [session]);

  const sourcePosts = livePosts.length > 0 ? livePosts : demoPosts;
  const days = useMemo(() => getDaysInMonth(calendarYear, calendarMonth), [calendarMonth, calendarYear]);
  const visiblePosts = useMemo(() => (publishScenario === "failed" && !sourcePosts.some((post) => post.status === "failed") ? [demoFailedPost, ...sourcePosts] : sourcePosts), [publishScenario, sourcePosts]);
  const filteredVisiblePosts = useMemo(
    () => (activeFilter === "all" ? visiblePosts : visiblePosts.filter((post) => post.status === activeFilter)),
    [activeFilter, visiblePosts]
  );
  const readinessState = useMemo(() => buildReadinessState(publishScenario, liveReadiness, locale), [publishScenario, liveReadiness, locale]);

  function postsForDay(day: number) {
    const key = `${calendarYear}-${String(calendarMonth + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
    return filteredVisiblePosts.filter((post) => post.date === key);
  }

  async function runPublishCheck(postId?: string) {
    setCheckingPublish(true);
    setPublishMessage("");

    try {
      if (!session) {
        setPublishMessage(readinessText(locale, readinessState.ready ? "dryRunPreview" : "resolveFirst"));
        return;
      }

      const client = new MarkosApiClient({
        baseUrl: apiBaseUrl,
        accessToken: session.tokens.accessToken,
        workspaceId: session.workspace.id
      });
      const target = postId ? sourcePosts.find((post) => post.id === postId) : sourcePosts.find((post) => post.status === "scheduled");

      if (!target) {
        setPublishMessage(readinessText(locale, "noScheduled"));
        return;
      }

      const attempt = await client.publishContentDryRun(target.id);
      setPublishMessage(formatPublishAttempt(attempt.status, attempt.reasons, locale));
    } catch (error) {
      setPublishMessage(error instanceof Error ? error.message : readinessText(locale, "checkFailed"));
    } finally {
      setCheckingPublish(false);
    }
  }

  async function retryFailedPost(postId: string) {
    setCheckingPublish(true);
    setPublishMessage("");

    try {
      if (!session) {
        setPublishScenario("ready");
        setPublishMessage(readinessText(locale, "retryPreview"));
        return;
      }

      const client = new MarkosApiClient({
        baseUrl: apiBaseUrl,
        accessToken: session.tokens.accessToken,
        workspaceId: session.workspace.id
      });
      const scheduledAt = new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString();
      await client.rescheduleFailedPublish(postId, scheduledAt);
      setPublishMessage(readinessText(locale, "retrySaved"));
      await runPublishCheck();
    } catch (error) {
      setPublishMessage(error instanceof Error ? error.message : readinessText(locale, "checkFailed"));
    } finally {
      setCheckingPublish(false);
    }
  }

  return (
    <section className="grid gap-4">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-3">
          <div className="flex rounded-xl border border-border bg-slate-100 p-0.5">
            {(["list", "calendar"] as ViewMode[]).map((mode) => {
              const Icon = mode === "list" ? List : Calendar;
              const active = view === mode;

              return (
                <button
                  className={
                    active
                      ? "flex h-8 items-center gap-1.5 rounded-lg bg-navy px-3 text-[13px] font-bold capitalize text-white"
                      : "flex h-8 items-center gap-1.5 rounded-lg px-3 text-[13px] font-medium capitalize text-muted transition hover:text-navy"
                  }
                  key={mode}
                  onClick={() => setView(mode)}
                  type="button"
                >
                  <Icon size={14} strokeWidth={1.8} />
                  {mode}
                </button>
              );
            })}
          </div>

          {view === "calendar" ? (
            <div className="flex items-center gap-1">
              <button
                aria-label="Previous month"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition hover:bg-white hover:text-navy"
                onClick={() => setCalendarMonth((current) => Math.max(0, current - 1))}
                type="button"
              >
                <ChevronLeft size={15} />
              </button>
              <span className="min-w-32 text-center text-sm font-bold text-navy">
                {monthNames[calendarMonth]} {calendarYear}
              </span>
              <button
                aria-label="Next month"
                className="flex h-8 w-8 items-center justify-center rounded-xl text-muted transition hover:bg-white hover:text-navy"
                onClick={() => setCalendarMonth((current) => Math.min(11, current + 1))}
                type="button"
              >
                <ChevronRight size={15} />
              </button>
            </div>
          ) : null}

          <div className="grid w-full grid-cols-2 gap-1.5 sm:flex sm:w-auto sm:flex-wrap">
            {filters.map((filter) => (
              <button
                className={
                  activeFilter === filter.value
                    ? "h-8 rounded-lg border border-navy bg-navy px-3 text-xs font-bold text-white"
                    : "h-8 rounded-lg border border-border bg-card px-3 text-xs font-medium text-muted transition hover:text-navy"
                }
                key={filter.value}
                onClick={() => setActiveFilter(filter.value)}
                type="button"
              >
                {filter.label}
              </button>
            ))}
          </div>
        </div>

        <div className="flex w-full flex-wrap items-center gap-2.5 sm:w-auto">
          <button
            className={
              aiOverlay
                ? "flex h-10 items-center gap-2 rounded-xl border border-accent/30 bg-accent/10 px-4 text-[13px] font-bold text-accent shadow-[0_2px_10px_rgba(233,69,96,.12)]"
                : "flex h-10 items-center gap-2 rounded-xl border border-border bg-card px-4 text-[13px] font-medium text-muted transition hover:text-navy"
            }
            onClick={() => setAiOverlay((current) => !current)}
            type="button"
          >
            <Sparkles size={14} strokeWidth={2} />
            AI Best Times
            {aiOverlay ? <span className="rounded-full bg-accent px-1.5 py-0.5 text-[9px] font-extrabold text-white">ON</span> : null}
          </button>
          <a
            className="flex h-10 items-center gap-2 rounded-xl bg-[linear-gradient(135deg,#E94560,#c9314e)] px-4 text-[13px] font-bold text-white shadow-[0_3px_12px_rgba(233,69,96,.3)] transition active:scale-95"
            href={`/${locale}/content`}
          >
            <Plus size={15} />
            New Post
          </a>
        </div>
      </div>

      {aiOverlay ? <BestTimesPanel onClose={() => setAiOverlay(false)} /> : null}
      <PublishingReadinessPanel
        checking={checkingPublish}
        locale={locale}
        message={publishMessage}
        onCheck={() => void runPublishCheck()}
        readiness={readinessState}
      />
      {view === "calendar" ? (
        <CalendarView aiOverlay={aiOverlay} days={days} month={calendarMonth} postsForDay={postsForDay} year={calendarYear} />
      ) : (
        <ListView onCheck={(post) => void runPublishCheck(post.id)} onRetry={(post) => void retryFailedPost(post.id)} posts={filteredVisiblePosts} />
      )}
    </section>
  );
}

function BestTimesPanel({ onClose }: { onClose: () => void }) {
  return (
    <section className="rounded-2xl border border-accent/20 bg-[linear-gradient(135deg,rgba(233,69,96,.04),rgba(99,102,241,.03))] p-5 shadow-[0_0_0_4px_rgba(233,69,96,.04)]">
      <div className="mb-4 flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <div className="flex h-[34px] w-[34px] items-center justify-center rounded-xl bg-[linear-gradient(135deg,#E94560,#6366F1)] text-white shadow-[0_3px_10px_rgba(233,69,96,.3)]">
            <Sparkles size={16} strokeWidth={2} />
          </div>
          <div>
            <h2 className="text-sm font-extrabold text-navy">AI-Recommended Best Times</h2>
            <p className="text-xs text-muted">Based on your audience behavior and competitor gaps.</p>
          </div>
          <span className="hidden items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2.5 py-1 text-[10px] font-extrabold text-accent sm:flex">
            <Sparkles size={8} strokeWidth={3} />
            AI SPARK
          </span>
        </div>
        <button className="rounded-xl p-2 text-muted transition hover:bg-white/60 hover:text-navy" onClick={onClose} type="button">
          <X size={14} />
        </button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        {bestTimes.map((slot) => (
          <article className="rounded-xl border border-accent/15 bg-card p-4 shadow-[0_2px_8px_rgba(0,0,0,.04)]" key={`${slot.day}-${slot.time}`}>
            <div className="mb-2 flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full bg-accent shadow-[0_0_6px_rgba(233,69,96,.5)]" />
              <span className="text-xs font-extrabold text-accent">Jun {slot.day} - {slot.time}</span>
            </div>
            <p className="text-[11px] leading-5 text-muted">{slot.reason}</p>
            <button className="mt-3 w-full rounded-lg bg-accent/10 py-1.5 text-[11px] font-extrabold text-accent transition hover:bg-accent/15" type="button">
              Schedule here
            </button>
          </article>
        ))}
      </div>
    </section>
  );
}

function PublishingReadinessPanel({
  checking,
  locale,
  message,
  onCheck,
  readiness
}: {
  checking: boolean;
  locale: Locale;
  message: string;
  onCheck: () => void;
  readiness: PublishingReadinessState;
}) {
  const Icon = readiness.tone === "ready" ? ShieldCheck : AlertTriangle;
  const toneClass =
    readiness.tone === "ready"
      ? "border-emerald-200 bg-emerald-50 text-emerald-700"
      : readiness.tone === "failed"
        ? "border-amber-200 bg-amber-50 text-amber-800"
        : "border-accent/25 bg-accent/10 text-accent";

  return (
    <section className={`rounded-2xl border p-4 shadow-[0_2px_12px_rgba(0,0,0,.04)] ${toneClass}`}>
      <div className="flex flex-col gap-4 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 items-start gap-3">
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/75">
            <Icon size={19} />
          </div>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h2 className="text-sm font-extrabold">{readiness.title}</h2>
              <span className="rounded-full bg-white/75 px-2.5 py-1 text-[10px] font-extrabold uppercase tracking-[.08em]">{readiness.badge}</span>
            </div>
            <p className="mt-1 max-w-3xl text-xs leading-5 opacity-80">{readiness.body}</p>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <a className="inline-flex h-9 items-center justify-center rounded-xl border border-current/20 bg-white/60 px-3 text-xs font-bold" href={`/${locale}/channels`}>
            {readinessText(locale, "openChannels")}
          </a>
          <button className="inline-flex h-9 items-center justify-center gap-2 rounded-xl bg-navy px-3 text-xs font-bold text-white disabled:opacity-60" disabled={checking} onClick={onCheck} type="button">
            {checking ? <Loader2 className="animate-spin" size={14} /> : <ShieldCheck size={14} />}
            {readinessText(locale, "dryRun")}
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-2 md:grid-cols-4">
        {readiness.items.map((item) => (
          <div className="rounded-xl border border-white/70 bg-white/65 px-3 py-2" key={item.label}>
            <div className="flex items-center gap-2">
              {item.ready ? <CheckCircle2 className="text-emerald-600" size={14} /> : <AlertTriangle className="text-accent" size={14} />}
              <span className="text-xs font-extrabold text-navy">{item.label}</span>
            </div>
            <p className="mt-1 text-[11px] leading-4 text-muted">{item.description}</p>
          </div>
        ))}
      </div>
      <p className="mt-3 min-h-4 text-xs font-semibold">{message}</p>
    </section>
  );
}

function ListView({ onCheck, onRetry, posts }: { onCheck: (post: QueuePost) => void; onRetry: (post: QueuePost) => void; posts: QueuePost[] }) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,.06)]">
      <div className="hidden grid-cols-[minmax(300px,2fr)_130px_110px_120px_120px_100px_110px] items-center border-b border-slate-100 bg-[#FAFBFC] px-5 py-3 xl:grid">
        {["Content", "Platform", "Scheduled", "Status", "Est. Reach", "Eng. Rate", "Actions"].map((heading) => (
          <span className="text-[11px] font-extrabold uppercase tracking-[.06em] text-slate-400" key={heading}>
            {heading}
          </span>
        ))}
      </div>

      <div className="divide-y divide-slate-50">
        {posts.map((post) => (
          <QueueRow key={post.id} onCheck={onCheck} onRetry={onRetry} post={post} />
        ))}
      </div>
    </section>
  );
}

function QueueRow({ onCheck, onRetry, post }: { onCheck: (post: QueuePost) => void; onRetry: (post: QueuePost) => void; post: QueuePost }) {
  const status = statusStyles[post.status];
  const platform = platformStyles[post.platform];
  const PlatformIcon = platform.icon;

  return (
    <article className="group relative grid gap-3 px-5 py-3.5 transition hover:bg-slate-50/80 xl:grid-cols-[minmax(300px,2fr)_130px_110px_120px_120px_100px_110px] xl:items-center">
      <span className={`absolute bottom-[10%] left-0 top-[10%] w-[3px] rounded-r ${platform.border}`} />
      <div className="flex min-w-0 items-center gap-3 pl-2">
        <GripVertical className="hidden shrink-0 cursor-grab text-slate-300 opacity-0 transition group-hover:opacity-100 xl:block" size={14} />
        <div className={`flex h-[38px] w-[38px] shrink-0 items-center justify-center rounded-xl ${platform.bg}`}>
          <PlatformIcon color={platform.color} size={18} />
        </div>
        <div className="min-w-0">
          <div className="flex min-w-0 items-center gap-2">
            <h2 className="truncate text-[13px] font-bold text-navy">{post.title}</h2>
            {post.ai ? (
              <span className="inline-flex shrink-0 items-center gap-1 rounded-full border border-accent/20 bg-accent/10 px-2 py-0.5 text-[9px] font-extrabold text-accent">
                <Sparkles size={8} strokeWidth={3} />
                AI
              </span>
            ) : null}
          </div>
          <p className="text-[11px] text-muted">{post.type}</p>
        </div>
      </div>

      <div className="flex items-center gap-2 text-xs font-medium capitalize text-slate-700">
        <PlatformIcon color={platform.color} size={14} />
        {platform.label}
      </div>

      <div>
        <p className="text-[13px] font-semibold text-slate-700">{post.date.slice(5)}</p>
        <p className="text-[11px] text-muted">{post.time}</p>
      </div>

      <span className={`inline-flex w-fit items-center gap-1.5 rounded-full px-3 py-1 text-[11px] font-bold ${status.bg} ${status.fg}`}>
        <span className={`h-1.5 w-1.5 rounded-full ${status.dot}`} />
        {status.label}
      </span>

      <p className="text-xs font-medium text-slate-700">{post.reach}</p>
      <p className="flex items-center gap-1 text-[13px] font-extrabold text-emerald-500">
        <TrendingUp size={12} />
        {post.eng}
      </p>
      <div className="flex flex-wrap items-center gap-1">
        {post.status === "failed" ? (
          <button className="inline-flex items-center gap-1 rounded-lg bg-accent px-2.5 py-1.5 text-[11px] font-extrabold text-white" onClick={() => onRetry(post)} type="button">
            <RotateCcw size={12} />
            Retry
          </button>
        ) : post.status === "scheduled" ? (
          <button className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] font-extrabold text-emerald-700" onClick={() => onCheck(post)} type="button">
            <ShieldCheck size={12} />
            Check
          </button>
        ) : (
          <span className="rounded-lg bg-slate-100 px-2.5 py-1.5 text-[11px] font-bold text-muted">{rowActionLabel(post.status)}</span>
        )}
        <button aria-label="View post" className="rounded-lg p-1.5 text-muted transition hover:bg-slate-100 hover:text-navy" type="button">
          <Eye size={13} />
        </button>
        <button aria-label="Edit post" className="rounded-lg p-1.5 text-muted transition hover:bg-slate-100 hover:text-navy" type="button">
          <Edit3 size={13} />
        </button>
        <button aria-label="Delete post" className="rounded-lg p-1.5 text-red-500 transition hover:bg-red-50" type="button">
          <Trash2 size={13} />
        </button>
      </div>
    </article>
  );
}

function CalendarView({
  aiOverlay,
  days,
  month,
  postsForDay,
  year
}: {
  aiOverlay: boolean;
  days: Array<number | null>;
  month: number;
  postsForDay: (day: number) => QueuePost[];
  year: number;
}) {
  return (
    <section className="overflow-hidden rounded-2xl border border-border bg-card shadow-[0_2px_12px_rgba(0,0,0,.06)]">
      <div className="grid grid-cols-7 border-b border-slate-100 bg-[#FAFBFC]">
        {dayNames.map((day) => (
          <div className="py-3 text-center text-[11px] font-bold uppercase tracking-[.05em] text-slate-400" key={day}>
            {day}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7">
        {days.map((day, index) => {
          const posts = day ? postsForDay(day) : [];
          const today = day ? isToday(year, month, day) : false;
          const aiSlot = aiOverlay && day ? bestTimes.find((slot) => slot.day === day) : null;

          return (
            <div className={day ? "min-h-24 border border-slate-100 bg-white p-2 transition hover:bg-slate-50" : "min-h-24 border border-slate-100 bg-[#FAFBFC] p-2"} key={`${day ?? "empty"}-${index}`}>
              {day ? (
                <>
                  <div
                    className={
                      today
                        ? "mb-1.5 flex h-6 w-6 items-center justify-center rounded-full bg-accent text-[13px] font-extrabold text-white"
                        : "mb-1.5 flex h-6 w-6 items-center justify-center rounded-full text-[13px] text-slate-700"
                    }
                  >
                    {day}
                  </div>
                  {aiSlot ? (
                    <div className="mb-1.5 rounded-lg border border-dashed border-accent/35 bg-accent/5 px-1.5 py-1">
                      <div className="flex items-center gap-1">
                        <span className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent shadow-[0_0_4px_rgba(233,69,96,.6)]" />
                        <span className="truncate text-[9px] font-extrabold text-accent">AI - {aiSlot.time}</span>
                      </div>
                    </div>
                  ) : null}
                  {posts.slice(0, 2).map((post) => (
                    <CalendarChip key={post.id} post={post} />
                  ))}
                  {posts.length > 2 ? <div className="text-center text-[10px] text-muted">+{posts.length - 2} more</div> : null}
                </>
              ) : null}
            </div>
          );
        })}
      </div>
    </section>
  );
}

function CalendarChip({ post }: { post: QueuePost }) {
  const platform = platformStyles[post.platform];
  const status = statusStyles[post.status];
  const PlatformIcon = platform.icon;

  return (
    <div className={`mb-1 rounded-lg border-l-[3px] ${platform.border} ${status.bg} px-1.5 py-1`}>
      <div className="flex items-center gap-1">
        <PlatformIcon color={platform.color} size={10} />
        <span className="min-w-0 flex-1 truncate text-[9px] font-bold text-slate-700">{post.title}</span>
        {post.ai ? <Sparkles className="shrink-0 text-accent" size={7} strokeWidth={3} /> : null}
      </div>
      <div className="pl-[13px] text-[9px] text-muted">{post.time}</div>
    </div>
  );
}

function mapContentRecord(item: ContentRecord, index: number): QueuePost {
  const scheduled = item.scheduledAt ? new Date(item.scheduledAt) : new Date(Date.UTC(2026, 5, 10 + index, 15, 0));
  const status = mapStatus(item.status);
  const title = item.captionEn ?? item.captionAr ?? item.contentPillar ?? "Untitled content";

  return {
    ai: Boolean(item.contentPillar) || index % 2 === 0,
    date: scheduled.toISOString().slice(0, 10),
    eng: `${(2.1 + (index % 5) * 0.7).toFixed(1)}%`,
    id: item.id,
    platform: index % 3 === 1 ? "facebook" : index % 3 === 2 ? "twitter" : "instagram",
    reach: `${8 + index * 2}K-${12 + index * 3}K`,
    status,
    time: scheduled.toISOString().slice(11, 16),
    title: title.length > 42 ? `${title.slice(0, 39)}...` : title,
    type: titleForContentType(item.contentType)
  };
}

function buildReadinessState(scenario: PublishScenario, liveReadiness: PublishingLiveReadiness | null, locale: Locale): PublishingReadinessState {
  const reasons = liveReadiness?.reasons ?? [];
  const blocked = scenario === "blocked" || (liveReadiness ? !liveReadiness.ready : false);
  const failed = scenario === "failed";
  const instagramReady = liveReadiness?.connection.connected ?? !blocked;
  const environmentReady = liveReadiness ? !reasons.some((reason) => reason.startsWith("MISSING_") || reason === "INSTAGRAM_PUBLISH_MODE_NOT_LIVE") : !blocked;
  const publicMediaReady = !blocked;
  const approvalReady = scenario !== "failed";
  const dailyCapReady = !reasons.some((reason) => reason.includes("QUOTA") || reason.includes("LIMIT"));
  const ready = !blocked && !failed && instagramReady && environmentReady && publicMediaReady && approvalReady && dailyCapReady;

  return {
    badge: failed ? readinessText(locale, "recoveryBadge") : ready ? readinessText(locale, "readyBadge") : readinessText(locale, "blockedBadge"),
    body: failed
      ? readinessText(locale, "failedBody")
      : ready
        ? readinessText(locale, "readyBody")
        : `${readinessText(locale, "blockedBody")} ${reasons.length > 0 ? reasons.map(humanReason).join(", ") : ""}`.trim(),
    items: [
      {
        description: readinessText(locale, approvalReady ? "approvalReady" : "approvalBlocked"),
        label: readinessText(locale, "approval"),
        ready: approvalReady
      },
      {
        description: readinessText(locale, publicMediaReady ? "mediaReady" : "mediaBlocked"),
        label: readinessText(locale, "media"),
        ready: publicMediaReady
      },
      {
        description: readinessText(locale, instagramReady ? "instagramReady" : "instagramBlocked"),
        label: readinessText(locale, "instagram"),
        ready: instagramReady
      },
      {
        description: readinessText(locale, dailyCapReady && environmentReady ? "capReady" : "capBlocked"),
        label: readinessText(locale, "dailyCap"),
        ready: dailyCapReady && environmentReady
      }
    ],
    ready,
    title: readinessText(locale, "title"),
    tone: failed ? "failed" : ready ? "ready" : "blocked"
  };
}

function formatPublishAttempt(status: string, reasons: string[], locale: Locale): string {
  if (status === "PUBLISHED" || status === "DRY_RUN") {
    return readinessText(locale, "dryRunPassed");
  }

  if (reasons.length > 0) {
    return `${readinessText(locale, "dryRunBlocked")} ${reasons.map(humanReason).join(", ")}`;
  }

  return readinessText(locale, "checkFailed");
}

function humanReason(reason: string): string {
  return reason
    .replace(/^MISSING_/, "Missing ")
    .replaceAll("_", " ")
    .toLowerCase()
    .replace(/^\w/, (match) => match.toUpperCase());
}

function rowActionLabel(status: QueueStatus): string {
  if (status === "approved") return "Needs schedule";
  if (status === "draft") return "Needs approval";
  if (status === "in_review") return "In review";
  if (status === "published") return "Done";
  return "Blocked";
}

function readinessText(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      approval: "الاعتماد",
      approvalBlocked: "المحتوى يحتاج مراجعة قبل الجدولة.",
      approvalReady: "المحتوى المعتمد فقط يدخل مسار النشر.",
      blockedBadge: "محظور",
      blockedBody: "لا يمكن النشر حتى يتم حل متطلبات الجاهزية.",
      capBlocked: "تحقق من وضع النشر أو حدود Meta قبل المتابعة.",
      capReady: "حد النشر اليومي ووضع البيئة جاهزان.",
      checkFailed: "فشل فحص الجاهزية.",
      dailyCap: "الحد اليومي",
      dryRun: "فحص تجريبي",
      dryRunBlocked: "الفحص التجريبي محظور بسبب:",
      dryRunPassed: "الفحص التجريبي مر بنجاح. المسار جاهز قبل النشر الفعلي.",
      dryRunPreview: "وضع المعاينة: سيتم تشغيل الفحص الحقيقي عند تسجيل الدخول.",
      failedBody: "يوجد نشر فاشل. أعد الجدولة بعد حل السبب، ولا يتم إعادة النشر بصمت.",
      instagram: "إنستغرام",
      instagramBlocked: "الحساب غير متصل أو الرمز منتهي.",
      instagramReady: "اتصال إنستغرام صالح.",
      media: "الرابط العام",
      mediaBlocked: "يتطلب النشر رابط وسائط عام صالح.",
      mediaReady: "الوسائط مؤهلة لمسار Meta.",
      noScheduled: "لا يوجد منشور مجدول للفحص.",
      openChannels: "فتح القنوات",
      readyBadge: "جاهز",
      readyBody: "MARKOS سيفحص الاعتماد، الوسائط، صحة إنستغرام، والحد اليومي قبل أي نشر.",
      recoveryBadge: "استرداد",
      resolveFirst: "حل متطلبات الجاهزية قبل تشغيل النشر.",
      retryPreview: "تمت محاكاة إعادة الجدولة في وضع المعاينة.",
      retrySaved: "تمت إعادة جدولة المنشور الفاشل.",
      title: "جاهزية النشر"
    },
    en: {
      approval: "Approval",
      approvalBlocked: "Content needs review before scheduling.",
      approvalReady: "Only approved content enters the publish path.",
      blockedBadge: "Blocked",
      blockedBody: "Publishing is blocked until readiness requirements are resolved.",
      capBlocked: "Check publish mode or Meta limits before continuing.",
      capReady: "Daily cap and environment mode are available.",
      checkFailed: "Publishing readiness check failed.",
      dailyCap: "Daily cap",
      dryRun: "Dry-run check",
      dryRunBlocked: "Dry-run is blocked by:",
      dryRunPassed: "Dry-run passed. The path is ready before live publish.",
      dryRunPreview: "Preview mode: the real dry-run check runs after sign-in.",
      failedBody: "A publish attempt failed. Reschedule after fixing the cause; MARKOS will not silently retry.",
      instagram: "Instagram",
      instagramBlocked: "Account is disconnected or token expired.",
      instagramReady: "Instagram connection is healthy.",
      media: "Public media",
      mediaBlocked: "A valid public media URL is required.",
      mediaReady: "Media is eligible for the Meta publish path.",
      noScheduled: "No scheduled post is available to check.",
      openChannels: "Open Channels",
      readyBadge: "Ready",
      readyBody: "MARKOS checks approval, public media, Instagram health, and daily cap before any publish.",
      recoveryBadge: "Recovery",
      resolveFirst: "Resolve readiness requirements before running publish.",
      retryPreview: "Preview mode: failed post rescheduled locally.",
      retrySaved: "Failed post rescheduled.",
      title: "Publishing Readiness"
    }
  };

  return dictionary[locale][key] ?? key;
}

function mapStatus(status: string): QueueStatus {
  if (status === "APPROVED") return "approved";
  if (status === "FAILED") return "failed";
  if (status === "PUBLISHED") return "published";
  if (status === "SCHEDULED") return "scheduled";
  return "draft";
}

function titleForContentType(type: string): string {
  if (type === "CAROUSEL") return "Carousel";
  if (type === "IMAGE") return "Image Post";
  if (type === "REEL") return "Reel";
  if (type === "STORY") return "Story";
  return "Text Post";
}

function getDaysInMonth(year: number, month: number): Array<number | null> {
  const firstDay = new Date(year, month, 1).getDay();
  const total = new Date(year, month + 1, 0).getDate();
  const days: Array<number | null> = [];

  for (let index = 0; index < firstDay; index += 1) days.push(null);
  for (let day = 1; day <= total; day += 1) days.push(day);

  return days;
}

function isToday(year: number, month: number, day: number): boolean {
  const now = new Date();
  return now.getFullYear() === year && now.getMonth() === month && now.getDate() === day;
}
