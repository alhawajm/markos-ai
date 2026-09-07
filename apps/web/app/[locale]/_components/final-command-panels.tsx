"use client";

import { MarkosApiClient } from "@markos/api-client";

import type {
  AnalyticsMetricTotals,
  AnalyticsSummary,
  ContentRecord,
  ContentStatus,
  ContentType,
  KnowledgeVaultEntry,
  Locale,
  VaultCompletenessScore,
  VaultSection
} from "@markos/shared-types";
import {
  Activity,
  ArrowDownRight,
  ArrowRight,
  ArrowUpRight,
  BarChart3,
  Bell,
  Brain,
  Building2,
  Calendar,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  CircleHelp,
  Clock,
  CreditCard,
  Eye,
  FileBarChart2,
  Heart,
  Lightbulb,
  Link2,
  LogOut,
  MessageCircle,
  MousePointerClick,
  Palette,
  Play,
  Settings,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  Zap
} from "lucide-react";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { logoutBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";
import { MarkosAiIcon } from "./markos-ai-icon";

type Accent = "amber" | "gold" | "teal";
type IconType = typeof Sparkles;

interface ContentReadyCardModel {
  accent: Accent;
  cta: string;
  href?: string;
  label: string;
  status: string;
  subtitle: string;
  title: string;
}

interface DashboardLiveState {
  analytics: AnalyticsSummary | null;
  contentItems: ContentRecord[];
  error: string;
  loading: boolean;
  publishingQueue: ContentRecord[];
  vaultScore: VaultCompletenessScore | null;
}

const accent = {
  amber: {
    bg: "rgba(244, 164, 96, .12)",
    border: "rgba(244, 164, 96, .28)",
    className: "text-[#F4A460]",
    hex: "#F4A460"
  },
  gold: {
    bg: "rgba(212, 175, 55, .12)",
    border: "rgba(212, 175, 55, .28)",
    className: "text-[#D4AF37]",
    hex: "#D4AF37"
  },
  teal: {
    bg: "rgba(129, 216, 208, .12)",
    border: "rgba(129, 216, 208, .28)",
    className: "text-[#81D8D0]",
    hex: "#81D8D0"
  }
} as const;

function recordTitle(record: ContentRecord): string {
  const caption = record.caption || record.contentPillar || "";
  const firstSentence = caption.split(/[.!?\n]/)[0]?.trim();

  if (firstSentence) {
    return firstSentence.length > 36 ? `${firstSentence.slice(0, 33)}...` : firstSentence;
  }

  return contentTypeLabel(record.contentType);
}

function recordSubtitle(record: ContentRecord): string {
  if (record.contentPillar) {
    return record.contentPillar;
  }

  if (record.scheduledAt) {
    return `Scheduled ${formatShortTime(record.scheduledAt)}`;
  }

  return statusLabel(record.status);
}

function contentTypeLabel(type: ContentType): string {
  return type === "POST" ? "Feed Post" : type[0] + type.slice(1).toLowerCase();
}

function statusLabel(status: ContentStatus): string {
  if (status === "APPROVED") return "Ready";

  return status
    .toLowerCase()
    .replace("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function localizedContentStatusLabel(status: ContentStatus, locale: Locale): string {
  if (locale === "en") return statusLabel(status);

  return {
    APPROVED: "جاهز",
    DRAFT: "مسودة",
    FAILED: "يحتاج إلى مراجعة",
    IN_REVIEW: "قيد المراجعة",
    PUBLISHED: "منشور",
    SCHEDULED: "مجدول"
  }[status];
}

function localizedContentTypeLabel(type: ContentType, locale: Locale): string {
  if (locale === "en") return contentTypeLabel(type);

  return {
    CAROUSEL: "منشور متعدد الصور",
    POST: "منشور",
    REEL: "ريل",
    STORY: "ستوري"
  }[type];
}

function campaignOriginLabel(record: ContentRecord, locale: Locale): string {
  if (record.campaignWeek === undefined) return locale === "ar" ? "مسودة حملة" : "Campaign draft";
  return locale === "ar" ? `مسودة حملة · الأسبوع ${record.campaignWeek}` : `Campaign draft · Week ${record.campaignWeek}`;
}

function contentCardFromRecord(record: ContentRecord, locale: Locale, index: number): ContentReadyCardModel {
  const accentNames: Accent[] = ["teal", "gold", "amber", "teal"];
  const status = record.scheduledAt ? formatShortTime(record.scheduledAt) : statusLabel(record.status);
  const cta =
    record.status === "SCHEDULED" || record.status === "PUBLISHED" ? "View Details" : record.status === "APPROVED" ? "Schedule Post" : "Review & mark ready";

  return {
    accent: accentNames[index % accentNames.length] ?? "teal",
    cta,
    href: `/${locale}/app/content-studio?item=${record.id}`,
    label: contentTypeLabel(record.contentType),
    status,
    subtitle: recordSubtitle(record),
    title: recordTitle(record)
  };
}

function formatShortTime(value: string): string {
  return new Intl.DateTimeFormat("en", { hour: "numeric", minute: "2-digit" }).format(new Date(value));
}

function contentPipelineTimestamp(record: ContentRecord, locale: Locale): string {
  const value = record.publishedAt ?? record.scheduledAt ?? record.plannedAt ?? record.updatedAt;
  const prefix =
    record.publishedAt !== undefined
      ? locale === "ar"
        ? "نُشر"
        : "Published"
      : record.scheduledAt !== undefined
        ? locale === "ar"
          ? "مجدول"
          : "Scheduled"
        : record.plannedAt !== undefined
          ? locale === "ar"
            ? "مخطط"
            : "Planned"
          : locale === "ar"
            ? "آخر تحديث"
            : "Updated";
  const formatted = new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
    month: "short",
    timeZone: "Asia/Bahrain"
  }).format(new Date(value));

  return `${prefix} · ${formatted}`;
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: value >= 10000 ? 1 : 0, notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function formatMetricValue(value: number | null): string {
  return value === null ? "—" : formatCompactNumber(value);
}

function contentStudioError(error: unknown): string {
  const message = error instanceof Error ? error.message : "MARKOS could not complete that action.";
  const lower = message.toLowerCase();
  if (lower.includes("vault") || lower.includes("context")) {
    return "Your Business Profile needs more context before MARKOS can create grounded content. Complete at least one profile section, then try again.";
  }
  if (lower.includes("quota") || lower.includes("limit")) {
    return "This workspace has reached its current generation allowance. Upgrade or wait for the next plan cycle before generating more content.";
  }
  if (lower.includes("payload too large") || lower.includes("body is too large")) {
    return "That image is too large for this upload path. Choose a JPEG no larger than 8 MB.";
  }
  if (lower.includes("unauthorized") || lower.includes("401")) {
    return "Your session is missing or expired. Sign in again so MARKOS can save work to the right workspace.";
  }
  return message;
}

async function approveContentRecord(client: MarkosApiClient, record: ContentRecord): Promise<ContentRecord> {
  if (record.status === "APPROVED") {
    return record;
  }

  if (record.status === "DRAFT") {
    const reviewRecord = await client.updateContentStatus(record.id, "IN_REVIEW");
    return client.updateContentStatus(reviewRecord.id, "APPROVED");
  }

  if (record.status === "IN_REVIEW") {
    return client.updateContentStatus(record.id, "APPROVED");
  }

  throw new Error(`Only draft or in-review content can be marked Ready. Current status: ${statusLabel(record.status)}.`);
}

const performanceHighlights = [
  { accent: "teal" as const, icon: TrendingUp, label: "New Followers", meta: "24-hour change", sub: "+24%", value: "+847" },
  { accent: "amber" as const, icon: Zap, label: "Engagement Rate", meta: "vs. baseline", sub: "3.2x", value: "92%" },
  { accent: "teal" as const, icon: Target, label: "Total Reach", meta: "Unique viewers", sub: "124K", value: "156K" },
  { accent: "amber" as const, icon: MessageCircle, label: "Conversations", meta: "High-value leads", sub: "47", value: "234" }
];

const strategicInsights = [
  {
    accent: "teal" as const,
    body: "Your audience engagement has shifted 2 hours later in the evening. Optimal posting time is now 7:30-9:00 PM.",
    cta: "Adjust campaign schedule",
    icon: Clock,
    title: "Audience Behavior Shift Detected"
  },
  {
    accent: "gold" as const,
    body: "Luxury jewelry posts are generating 3.2x more engagement. Your audience is responding to premium positioning and craftsmanship storytelling.",
    cta: "Create more luxury content",
    icon: TrendingUp,
    title: "Content Performance Pattern"
  },
  {
    accent: "amber" as const,
    body: "New followers have 2.1x higher engagement rate than your existing audience. Your content is attracting highly qualified leads.",
    cta: "Maintain current strategy",
    icon: Users,
    title: "Audience Quality Improvement"
  }
];

const opportunityCards = [
  {
    accent: "gold" as const,
    confidence: "94%",
    impact: "High",
    lift: "+340%",
    reach: "+2,400",
    theme: "Campaign Opportunity",
    title: "Luxury Jewelry Collection Launch",
    why: ["Recent posts in this category achieved 92% engagement", "Luxury searches are up 156% in your audience"],
    pieces: ["Craftsmanship reel", "Collection carousel", "Limited drop story"]
  },
  {
    accent: "teal" as const,
    confidence: "87%",
    impact: "Medium-High",
    lift: "+220%",
    reach: "+1,800",
    theme: "Content Theme",
    title: "Sustainability Story Series",
    why: ["Sustainability keywords show 89% positive sentiment", "Low competition in your niche for this angle"],
    pieces: ["Sourcing journey", "Supplier spotlight", "Recycled materials showcase"]
  },
  {
    accent: "amber" as const,
    confidence: "91%",
    impact: "Medium",
    lift: "+180%",
    reach: "+1,200",
    theme: "Social Proof",
    title: "Customer Testimonial Spotlight",
    why: ["Customer posts mentioning you are up 234%", "Testimonials show 2.1x engagement"],
    pieces: ["Buyer interview", "Unboxing compilation", "Community story"]
  }
];

const campaignTimeline = [
  ["1", "Teaser Post", "7:30 PM", "Carousel"],
  ["2", "Behind the Scenes", "7:30 PM", "Reel"],
  ["3", "Story Series", "12:00 PM", "Stories"],
  ["4", "Collection Reveal", "7:30 PM", "Post + Carousel"],
  ["6", "Limited Edition Announcement", "7:30 PM", "Post"],
  ["7", "Final Call", "8:00 PM", "Stories + Post"]
];

const performanceRows = [
  { comments: "234", likes: "1,847", roi: "3.2x", score: "94", title: "Summer Collection Launch", views: "24,500" },
  { comments: "187", likes: "1,423", roi: "2.8x", score: "87", title: "Behind the Scenes Reel", views: "18,900" },
  { comments: "145", likes: "1,156", roi: "2.1x", score: "76", title: "Customer Testimonials", views: "15,600" },
  { comments: "98", likes: "892", roi: "1.9x", score: "68", title: "Product Tutorial", views: "12,300" }
];

export function FinalDashboard({ locale }: { locale: Locale }) {
  const now = useMemo(() => new Intl.DateTimeFormat(locale, { hour: "numeric", minute: "2-digit" }).format(new Date()), [locale]);
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [liveState, setLiveState] = useState<DashboardLiveState>({
    analytics: null,
    contentItems: [],
    error: "",
    loading: false,
    publishingQueue: [],
    vaultScore: null
  });
  const firstName = session?.user.fullName.split(/\s+/)[0] || "there";
  const workspaceName = session?.workspace.name || "your workspace";
  const readyItems = liveState.contentItems.filter(
    (item) => item.status === "DRAFT" || item.status === "IN_REVIEW" || item.status === "APPROVED" || item.status === "SCHEDULED"
  );
  const topContent = liveState.contentItems[0];
  const analyticsTotals = liveState.analytics?.totals;
  const missionTitle = topContent ? recordTitle(topContent) : locale === "ar" ? "أنشئ أول مسودة محتوى" : "Create your first content draft";
  const missionCta = topContent
    ? topContent.status === "APPROVED"
      ? locale === "ar"
        ? "جدولة المحتوى"
        : "Schedule content"
      : locale === "ar"
        ? "مراجعة المحتوى"
        : "Review content"
    : locale === "ar"
      ? "فتح إنشاء المحتوى"
      : "Open Create";
  const missionHref = topContent ? `/${locale}/app/content-studio?item=${topContent.id}` : `/${locale}/app/content-studio`;
  const copy =
    locale === "ar"
      ? {
          businessProfile: "ملف النشاط",
          contentEmpty: "لا توجد مسودات بعد. عندما تنشئ محتوى، سيظهر هنا للمراجعة.",
          contentReady: "المحتوى الجاري",
          create: "إنشاء محتوى",
          greeting: `مرحباً بعودتك، ${firstName}`,
          insight: "الوصول",
          latest: "آخر 7 أيام",
          next: "الخطوة التالية",
          noData: "بانتظار البيانات",
          openAll: "عرض الكل",
          profileReady: "جاهزية الملف",
          scheduled: "المجدول",
          campaigns: "فتح الحملات",
          subtitle: topContent ? `لديك محتوى ${statusLabel(topContent.status)} جاهز للخطوة التالية.` : "ابدأ بحملة أو أنشئ أول مسودة عندما تكون جاهزاً.",
          today: "اليوم في",
          workspaceContent: "عناصر مساحة العمل"
        }
      : {
          businessProfile: "Business profile",
          contentEmpty: "No drafts yet. Once you create content, it will appear here for review.",
          contentReady: "Work in progress",
          create: "Create content",
          greeting: `Welcome back, ${firstName}`,
          insight: "Reach",
          latest: "Last 7 days",
          next: "Next up",
          noData: "Waiting for data",
          openAll: "View all",
          profileReady: "Profile readiness",
          scheduled: "Scheduled",
          campaigns: "Open Campaigns",
          subtitle: topContent
            ? `${recordTitle(topContent)} is ${statusLabel(topContent.status).toLowerCase()} and ready for its next step.`
            : "Start with a Campaign, or create the first draft when you are ready.",
          today: "Today in",
          workspaceContent: "Workspace items"
        };

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;
    setLiveState((current) => ({ ...current, error: "", loading: true }));

    async function loadDashboard() {
      const [contentResult, queueResult, analyticsResult, vaultResult] = await Promise.allSettled([
        client.contentItems(),
        client.publishingQueue(),
        client.analytics({ days: 7 }),
        client.vaultScore()
      ]);

      if (cancelled) {
        return;
      }

      const rejected = [contentResult, queueResult, analyticsResult, vaultResult].find((result) => result.status === "rejected");

      setLiveState({
        analytics: analyticsResult.status === "fulfilled" ? analyticsResult.value : null,
        contentItems: contentResult.status === "fulfilled" ? contentResult.value : [],
        error: rejected?.status === "rejected" ? contentStudioError(rejected.reason) : "",
        loading: false,
        publishingQueue: queueResult.status === "fulfilled" ? queueResult.value : [],
        vaultScore: vaultResult.status === "fulfilled" ? vaultResult.value : null
      });
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [client, session]);

  return (
    <section className="min-w-0 space-y-6 xl:space-y-7">
      <section className="sunlit-panel rounded-[1.75rem] border-s-4 border-s-[var(--sunlit-coral)] p-5 sm:p-6">
        <div className="flex flex-col gap-5 xl:flex-row xl:items-center xl:justify-between">
          <div className="min-w-0">
            <p className="text-xs font-extrabold uppercase tracking-[.12em] text-[var(--sunlit-pink)]">
              {copy.today} {workspaceName} · {now}
            </p>
            <h2 className="mt-2 font-display text-2xl font-bold tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{copy.greeting}</h2>
            <p className="mt-2 max-w-3xl text-base leading-7 text-[var(--sunlit-muted)]">{copy.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a className="sunlit-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" href={missionHref}>
              {missionCta} <ArrowRight size={17} />
            </a>
            <a className="sunlit-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" href={`/${locale}/app/campaigns`}>
              {copy.campaigns}
            </a>
          </div>
        </div>
      </section>

      {!session ? (
        <article className="sunlit-panel-soft rounded-2xl p-5">
          <p className="font-extrabold text-[var(--sunlit-ink)]">Live work needs a workspace session.</p>
          <p className="mt-2 text-[var(--sunlit-muted)]">Sign in or complete onboarding first so work can be saved to the correct workspace.</p>
        </article>
      ) : liveState.loading ? (
        <article className="sunlit-panel rounded-2xl p-5">
          <p className="font-extrabold text-[var(--sunlit-ink)]">Loading workspace...</p>
          <p className="mt-2 text-[var(--sunlit-muted)]">Checking content, schedule, insights, and your Business Profile.</p>
        </article>
      ) : liveState.error ? (
        <article className="rounded-2xl border border-[rgb(199_53_80_/_24%)] bg-[rgb(199_53_80_/_7%)] p-5">
          <p className="font-extrabold text-[var(--sunlit-danger)]">The workspace could not be loaded.</p>
          <p className="mt-2 text-[var(--sunlit-ink-soft)]">{liveState.error}</p>
        </article>
      ) : liveState.vaultScore?.entryCount === 0 ? (
        <article className="sunlit-panel-soft rounded-2xl p-5">
          <p className="font-extrabold text-[var(--sunlit-ink)]">Your Business Profile needs more detail.</p>
          <p className="mt-2 text-[var(--sunlit-muted)]">Add business context before generating grounded work.</p>
        </article>
      ) : null}

      <section className="grid min-w-0 gap-4 md:grid-cols-3">
        <SunlitMetricCard
          icon={Palette}
          label={copy.workspaceContent}
          note={liveState.contentItems.length ? copy.contentReady : copy.contentEmpty}
          tone="coral"
          value={String(liveState.contentItems.length)}
        />
        <SunlitMetricCard
          icon={Calendar}
          label={copy.scheduled}
          note={liveState.publishingQueue[0]?.scheduledAt ? formatShortTime(liveState.publishingQueue[0].scheduledAt) : copy.noData}
          tone="yellow"
          value={String(liveState.publishingQueue.length)}
        />
        <SunlitMetricCard
          icon={Eye}
          label={copy.insight}
          note={copy.latest}
          tone="aqua"
          value={analyticsTotals?.reach ? formatCompactNumber(analyticsTotals.reach) : "—"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.25fr)_minmax(19rem,.75fr)]">
        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="flex items-start gap-4">
            <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
              <Target size={22} />
            </span>
            <div className="min-w-0 flex-1">
              <p className="sunlit-eyebrow">{copy.next}</p>
              <h2 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sunlit-ink)]">{missionTitle}</h2>
              <p className="mt-2 text-base leading-7 text-[var(--sunlit-muted)]">{topContent ? copy.subtitle : copy.contentEmpty}</p>
              <a className="sunlit-primary mt-6 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" href={missionHref}>
                {missionCta} <ArrowRight size={17} />
              </a>
            </div>
          </div>
        </article>

        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="flex items-center justify-between gap-4">
            <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]">
              <Brain size={22} />
            </span>
            <span className="text-3xl font-bold text-[var(--sunlit-ink)]">{liveState.vaultScore ? `${liveState.vaultScore.score}%` : "—"}</span>
          </div>
          <h2 className="mt-5 text-xl font-bold text-[var(--sunlit-ink)]">{copy.profileReady}</h2>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--sunlit-paper-deep)]">
            <div className="h-full rounded-full bg-[var(--sunlit-aqua)]" style={{ width: `${liveState.vaultScore?.score ?? 0}%` }} />
          </div>
          <a className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[var(--sunlit-aqua-dark)]" href={`/${locale}/app/knowledge`}>
            {copy.businessProfile} <ArrowRight size={16} />
          </a>
        </article>
      </section>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-[var(--sunlit-ink)]">{copy.contentReady}</h2>
        <a className="inline-flex items-center gap-2 text-sm font-extrabold text-[var(--sunlit-pink)]" href={`/${locale}/app/content-studio`}>
          {copy.openAll} <ArrowRight size={17} />
        </a>
      </div>
      {readyItems.length > 0 ? (
        <section className="grid min-w-0 gap-4 md:grid-cols-2 xl:grid-cols-4">
          {readyItems.slice(0, 4).map((item, index) => (
            <a
              className="sunlit-panel group rounded-2xl p-5 transition hover:-translate-y-0.5 hover:border-[rgb(217_63_122_/_24%)]"
              href={`/${locale}/app/content-studio?item=${item.id}`}
              key={item.id}
            >
              <div className="flex items-center justify-between gap-3">
                <span
                  className={
                    index % 2 === 0
                      ? "grid h-10 w-10 place-items-center rounded-xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]"
                      : "grid h-10 w-10 place-items-center rounded-xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
                  }
                >
                  <Palette size={18} />
                </span>
                <span className="rounded-full bg-[var(--sunlit-paper)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--sunlit-muted)]">
                  {statusLabel(item.status)}
                </span>
              </div>
              <h3 className="mt-5 line-clamp-2 font-bold leading-6 text-[var(--sunlit-ink)]">{recordTitle(item)}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--sunlit-muted)]">{recordSubtitle(item)}</p>
            </a>
          ))}
        </section>
      ) : (
        <article className="sunlit-panel-soft rounded-[1.75rem] p-6 xl:p-7">
          <p className="text-xl font-bold text-[var(--sunlit-ink)]">{copy.contentEmpty}</p>
          <a
            className="sunlit-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold"
            href={`/${locale}/app/content-studio`}
          >
            {copy.create} <ArrowRight size={17} />
          </a>
        </article>
      )}
    </section>
  );
}

function SunlitMetricCard({
  icon,
  label,
  note,
  tone,
  value
}: {
  icon: IconType;
  label: string;
  note: string;
  tone: "aqua" | "coral" | "yellow";
  value: string;
}) {
  const Icon = icon;
  const toneClass =
    tone === "aqua"
      ? "bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
      : tone === "yellow"
        ? "bg-[rgb(246_196_83_/_20%)] text-[var(--sunlit-warning)]"
        : "bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]";
  return (
    <article className="sunlit-panel rounded-2xl p-5">
      <div className="flex items-start justify-between gap-4">
        <span className={`grid h-11 w-11 place-items-center rounded-xl ${toneClass}`}>
          <Icon size={20} />
        </span>
        <strong className="text-3xl font-bold tracking-tight text-[var(--sunlit-ink)]">{value}</strong>
      </div>
      <p className="mt-5 font-extrabold text-[var(--sunlit-ink)]">{label}</p>
      <p className="mt-1 line-clamp-2 text-sm leading-5 text-[var(--sunlit-muted)]">{note}</p>
    </article>
  );
}

export function DailyBriefingPanel({ locale }: { locale: Locale }) {
  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle icon={Calendar} subtitle="Thursday, June 18" title="Daily Marketing Briefing" />
      <article className="lux-card rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
        <h2 className="font-display text-2xl font-bold text-white xl:text-3xl">Executive Summary</h2>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-[#D6DEEA] xl:text-lg">
          <p>
            <span className="font-bold text-[#81D8D0]">Strong momentum continues.</span> Your luxury jewelry content is resonating exceptionally well with your
            target audience, driving 3.2x higher engagement than your baseline.
          </p>
          <p>
            I have identified a <span className="font-bold text-[#D4AF37]">golden opportunity window</span> this evening, 7:30-9:00 PM, when your audience will
            be most receptive.
          </p>
          <p>
            <span className="font-bold text-[#00C9A7]">24-hour growth: +847 followers</span> with engagement rate at 92%, significantly above your industry
            benchmark of 4.2%.
          </p>
        </div>
      </article>

      <SectionHeading title="Performance Highlights" />
      <section className="grid min-w-0 gap-5 lg:grid-cols-2">
        {performanceHighlights.map((item) => (
          <PerformanceCard key={item.label} {...item} />
        ))}
      </section>

      <SectionHeading title="Strategic Insights" />
      <section className="grid gap-5">
        {strategicInsights.map((item) => (
          <article className="lux-card-muted rounded-[1.75rem] p-5 xl:p-7" key={item.title}>
            <div className="flex gap-5">
              <IconTile accentName={item.accent} icon={item.icon} />
              <div>
                <h3 className="text-xl font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-[#D6DEEA] xl:text-lg">{item.body}</p>
                <a className="mt-5 inline-flex items-center gap-2 text-base font-bold text-[#81D8D0] xl:text-lg" href={`/${locale}/app/campaign-builder`}>
                  {item.cta} <ArrowRight size={19} />
                </a>
              </div>
            </div>
          </article>
        ))}
      </section>

      <SectionHeading title="Recommended Actions for Today" />
      <article className="lux-card rounded-[1.75rem] p-5 xl:p-7">
        {[
          ["10:00 AM", "Review and approve AI-generated luxury jewelry content", "15 min"],
          ["2:00 PM", "Respond to high-value comments and DMs", "20 min"],
          ["7:30 PM", "Launch prepared campaign in the optimal engagement window", "5 min"],
          ["9:00 PM", "Monitor campaign performance and engagement", "10 min"]
        ].map(([time, title, duration], index) => (
          <div
            className={
              index === 0
                ? "grid gap-4 py-5 md:grid-cols-[120px_1fr_auto] xl:grid-cols-[130px_1fr_auto]"
                : "grid gap-4 border-t border-[#81D8D0]/10 py-5 md:grid-cols-[120px_1fr_auto] xl:grid-cols-[130px_1fr_auto]"
            }
            key={time}
          >
            <p className="font-mono text-base font-bold text-[#81D8D0] xl:text-lg">{time}</p>
            <div>
              <p className="text-lg font-bold text-white xl:text-xl">{title}</p>
              <p className="mt-1 text-base text-[#9AA7BD] xl:text-lg">{duration}</p>
            </div>
            <a
              className="rounded-full bg-[#C7CDD8]/18 px-5 py-2.5 text-center font-bold text-white transition hover:bg-[#81D8D0]/20 xl:px-7 xl:py-3"
              href={`/${locale}/app/campaign-builder`}
            >
              Schedule
            </a>
          </div>
        ))}
      </article>
    </section>
  );
}

export function OpportunitiesPanel({ locale }: { locale: Locale }) {
  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle
        icon={Sparkles}
        subtitle="I've discovered 3 high-impact opportunities by analyzing your audience behavior, industry trends, and competitor strategies."
        title="Content Opportunities"
      />
      <div className="grid gap-6">
        {opportunityCards.map((card) => (
          <OpportunityCard key={card.title} locale={locale} {...card} />
        ))}
      </div>
    </section>
  );
}

export function CampaignBuilderPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [campaignPrompt, setCampaignPrompt] = useState(
    "Launch a high-performing campaign for our most important offer. Use the Knowledge Vault for audience, positioning, language, and brand voice."
  );
  const [campaignRecords, setCampaignRecords] = useState<ContentRecord[]>([]);
  const [campaignMessage, setCampaignMessage] = useState("");
  const [generatingCampaign, setGeneratingCampaign] = useState(false);
  const [schedulingCampaign, setSchedulingCampaign] = useState(false);
  const templates = [
    ["Product Launch", "7-day campaign to maximize launch impact", "8 posts", "7 days", Zap],
    ["Brand Awareness", "Build recognition and expand reach", "12 posts", "14 days", TrendingUp],
    ["Engagement Boost", "Deepen connection with your audience", "10 posts", "10 days", MessageCircle]
  ] as const;
  const timelineRecords = campaignRecords.length > 0 ? campaignRecords : [];

  async function generateCampaignDrafts() {
    if (!session) {
      setCampaignMessage("Sign in or complete onboarding first so MARKOS can save campaign drafts to a workspace.");
      return;
    }

    const trimmedPrompt = campaignPrompt.trim();
    if (trimmedPrompt.length < 12) {
      setCampaignMessage("Describe the campaign goal, audience, offer, and timing before generating.");
      return;
    }

    setGeneratingCampaign(true);
    setCampaignMessage("MARKOS is generating a saved campaign content batch...");

    try {
      const drafts = await client.generateContent({
        count: 4,
        topic: trimmedPrompt
      });
      setCampaignRecords(drafts);
      setCampaignMessage(`${drafts.length} campaign drafts generated and saved to the workspace.`);
      setStep(2);
    } catch (error) {
      setCampaignMessage(contentStudioError(error));
    } finally {
      setGeneratingCampaign(false);
    }
  }

  async function scheduleCampaign() {
    if (!session) {
      setCampaignMessage("Sign in again before scheduling campaign content.");
      return;
    }

    if (campaignRecords.length === 0) {
      setCampaignMessage("Generate campaign drafts before scheduling.");
      return;
    }

    setSchedulingCampaign(true);
    setCampaignMessage("Approving and scheduling campaign items...");

    try {
      const scheduledRecords: ContentRecord[] = [];

      for (const [index, record] of campaignRecords.entries()) {
        const approved = await approveContentRecord(client, record);
        const scheduledDate = new Date(Date.now() + (index + 1) * 24 * 60 * 60 * 1000);
        scheduledDate.setHours(19, 30, 0, 0);
        scheduledRecords.push(await client.scheduleContent(approved.id, scheduledDate.toISOString()));
      }

      setCampaignRecords(scheduledRecords);
      setCampaignMessage(`${scheduledRecords.length} campaign items approved and scheduled.`);
      setStep(3);
    } catch (error) {
      setCampaignMessage(contentStudioError(error));
    } finally {
      setSchedulingCampaign(false);
    }
  }

  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle icon={MarkosAiIcon} subtitle="I'll help you create a high-performing campaign in minutes, not days." title="AI Campaign Builder">
        <div className="mt-8 grid gap-4 text-base md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center xl:mt-10 xl:text-lg">
          {["Campaign Goal", "AI Generation", "Review & Launch"].map((label, index) => (
            <div className="contents" key={label}>
              <button
                className={step === index + 1 ? "flex items-center gap-4 text-white" : "flex items-center gap-4 text-[#6F7B8F]"}
                onClick={() => setStep(index + 1)}
                type="button"
              >
                <span
                  className={
                    step === index + 1
                      ? "grid h-12 w-12 place-items-center rounded-full bg-[#81D8D0] font-bold text-[#0F1419]"
                      : "grid h-12 w-12 place-items-center rounded-full bg-white/14 font-bold"
                  }
                >
                  {index + 1}
                </span>
                <span className="font-bold">{label}</span>
              </button>
              {index < 2 ? <span className="hidden h-px bg-white/20 md:block" /> : null}
            </div>
          ))}
        </div>
      </HeroTitle>

      {campaignMessage ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#81D8D0]/20 p-5">
          <p className="font-semibold text-[#D6DEEA]">{campaignMessage}</p>
        </article>
      ) : null}

      {step === 1 ? (
        <>
          <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
            <h2 className="text-2xl font-bold text-white">Campaign Brief</h2>
            <textarea
              className="mt-5 min-h-28 w-full resize-none rounded-[1.25rem] border border-[#81D8D0]/10 bg-white/[.045] p-4 text-base leading-relaxed text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45 xl:min-h-32 xl:p-5 xl:text-lg"
              onChange={(event) => setCampaignPrompt(event.target.value)}
              value={campaignPrompt}
            />
            <button
              className="mt-5 inline-flex items-center gap-3 rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-6 py-3.5 text-base font-bold text-white transition hover:bg-[#81D8D0]/18 disabled:cursor-not-allowed disabled:opacity-60 xl:px-7 xl:py-4 xl:text-lg"
              disabled={generatingCampaign}
              onClick={generateCampaignDrafts}
              type="button"
            >
              {generatingCampaign ? <span className="lux-thinking-dot" aria-hidden="true" /> : <MarkosAiIcon size={20} />}
              {generatingCampaign ? "Generating campaign..." : "Generate Campaign Drafts"}
            </button>
          </article>
          <SectionHeading title="Choose Your Campaign Type" />
          <section className="grid gap-5 lg:grid-cols-3 xl:gap-6">
            {templates.map(([title, body, posts, days, Icon]) => (
              <button
                className="lux-card-muted rounded-[1.5rem] p-5 text-left transition hover:border-[#81D8D0]/45 hover:bg-[#81D8D0]/8 xl:p-6"
                key={title}
                onClick={() => {
                  setCampaignPrompt(
                    `${title}: ${body}. Build a ${days.toLowerCase()} plan with ${posts.toLowerCase()} for our active workspace audience and offer.`
                  );
                }}
                type="button"
              >
                <IconTile accentName="teal" icon={Icon} />
                <h3 className="mt-5 text-xl font-bold text-white xl:mt-6 xl:text-2xl">{title}</h3>
                <p className="mt-4 text-base text-[#AAB5C7] xl:text-lg">{body}</p>
                <div className="mt-7 flex justify-between text-base text-[#9AA7BD]">
                  <span>{posts}</span>
                  <span>{days}</span>
                </div>
                <span className="mt-10 inline-flex items-center gap-2 rounded-full border border-[#81D8D0]/20 px-6 py-3 font-bold text-[#81D8D0]">
                  Select Template <ArrowRight size={18} />
                </span>
              </button>
            ))}
          </section>
        </>
      ) : null}

      {step >= 2 ? (
        <section className="space-y-6 xl:space-y-8">
          <div className="flex items-center justify-between">
            <SectionHeading title="AI-Generated Campaign Preview" />
            <button
              className="rounded-full border border-[#81D8D0]/20 px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60"
              disabled={generatingCampaign}
              onClick={generateCampaignDrafts}
              type="button"
            >
              {generatingCampaign ? "Regenerating..." : "Regenerate"}
            </button>
          </div>
          <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
            <div className="mb-6 flex items-center gap-4 xl:mb-8 xl:gap-5">
              <IconTile accentName="teal" icon={Sparkles} />
              <div>
                <h3 className="text-xl font-bold text-white xl:text-2xl">Workspace Campaign Drafts</h3>
                <p className="mt-2 text-base text-[#D6DEEA] xl:text-lg">
                  {timelineRecords.length || 0} saved content pieces - approval required before scheduling
                </p>
              </div>
            </div>
            {timelineRecords.length > 0 ? (
              <div className="grid gap-4">
                {timelineRecords.map((record, index) => (
                  <a
                    className="lux-card-muted grid gap-4 rounded-[1.5rem] p-5 transition hover:border-[#81D8D0]/35 md:grid-cols-[80px_1fr_auto] xl:grid-cols-[90px_1fr_auto] xl:gap-5"
                    href={`/${locale}/app/content-studio?item=${record.id}`}
                    key={record.id}
                  >
                    <div className="border-r border-white/10 pr-5">
                      <p className="text-2xl font-bold text-white xl:text-3xl">{index + 1}</p>
                      <p className="text-[#9AA7BD]">Day</p>
                    </div>
                    <div>
                      <p className="text-xl font-bold text-white">{recordTitle(record)}</p>
                      <p className="mt-2 text-lg text-[#9AA7BD]">
                        {record.scheduledAt ? formatShortTime(record.scheduledAt) : "7:30 PM"} - {contentTypeLabel(record.contentType)}
                      </p>
                    </div>
                    <span className="self-center rounded-full bg-[#81D8D0]/12 px-4 py-2 font-bold text-[#81D8D0]">{statusLabel(record.status)}</span>
                  </a>
                ))}
              </div>
            ) : (
              <article className="lux-card-muted rounded-[1.25rem] p-6">
                <p className="text-lg font-bold text-white">No campaign drafts generated yet.</p>
                <p className="mt-2 text-[#B8C4D8]">Return to the brief step and generate a saved campaign batch first.</p>
              </article>
            )}
          </article>

          <SectionHeading title="Campaign Objectives" />
          <section className="grid gap-4 sm:grid-cols-3 xl:gap-5">
            <ObjectiveCard icon={Target} label="Reach Goal" sub="Projected impressions" value="125K" />
            <ObjectiveCard icon={Zap} label="Engagement" sub="Expected interactions" value="12.5K" />
            <ObjectiveCard icon={TrendingUp} label="Conversion" sub="Estimated rate" value="8.2%" />
          </section>
          <div className="flex flex-wrap items-center justify-between gap-5">
            <button
              className="inline-flex items-center gap-3 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 xl:text-xl"
              disabled={schedulingCampaign || campaignRecords.length === 0}
              onClick={scheduleCampaign}
              type="button"
            >
              <Calendar size={24} /> {schedulingCampaign ? "Scheduling..." : "Schedule Campaign"} <ArrowRight size={24} />
            </button>
            <button
              className="rounded-[1.5rem] bg-white/16 px-8 py-4 text-lg font-bold text-white transition hover:bg-[#81D8D0]/16 xl:px-10 xl:py-5 xl:text-xl"
              onClick={() => setSaved(true)}
              type="button"
            >
              {saved ? "Draft Saved" : "Save as Draft"}
            </button>
          </div>
        </section>
      ) : null}
    </section>
  );
}

export function FinalAnalyticsPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [days, setDays] = useState(7);
  const [trendMetric, setTrendMetric] = useState<"engagement" | "impressions" | "reach">("reach");
  const [summary, setSummary] = useState<AnalyticsSummary | null>(null);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");

  useEffect(() => {
    if (!session) {
      setSummary(null);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setMessage("");

    void client
      .analytics({ days })
      .then((nextSummary) => {
        if (!cancelled) setSummary(nextSummary);
      })
      .catch((error) => {
        if (!cancelled) setMessage(contentStudioError(error));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [client, days, session]);

  async function exportReport() {
    if (!session) {
      setMessage("Sign in before exporting workspace insights.");
      return;
    }

    setExporting(true);
    setMessage("");

    try {
      const report = await client.exportMonthlyAnalyticsPdf({ locale });
      const url = URL.createObjectURL(new Blob([report], { type: "application/pdf" }));
      const link = document.createElement("a");
      link.href = url;
      link.download = `markos-insights-${new Date().toISOString().slice(0, 7)}.pdf`;
      link.click();
      URL.revokeObjectURL(url);
      setMessage("Monthly report downloaded.");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setExporting(false);
    }
  }

  const totals = summary?.totals;
  const comparison = summary?.comparison;
  const viewsMetric: keyof AnalyticsMetricTotals = totals?.views !== null && totals?.views !== undefined ? "views" : "impressions";
  const daily = summary?.daily.filter((item) => item.totals[trendMetric] !== null) ?? [];
  const maximumTrendValue = Math.max(...daily.map((item) => item.totals[trendMetric] ?? 0), 1);
  const syncedContentCount = new Set(summary?.records.flatMap((record) => (record.contentItemId ? [record.contentItemId] : [])) ?? []).size;
  const contentBuckets = summary?.byMetricType.filter((item) => item.metricType === "POST" || item.metricType === "REEL" || item.metricType === "STORY") ?? [];
  const audienceBucket = summary?.byMetricType.find((item) => item.metricType === "AUDIENCE");
  const hasAnalytics = (summary?.records.length ?? 0) > 0 && totals !== undefined && Object.values(totals).some((value) => value !== null);
  const periodLabel = summary ? formatInsightsDateRange(locale, summary.from, summary.to) : "";
  const previousPeriodLabel = comparison ? formatInsightsDateRange(locale, comparison.from, comparison.to) : "";
  const copy =
    locale === "ar"
      ? {
          audience: "الجمهور",
          audienceUnavailable: "لا تتضمن المزامنة الحالية توزيع الجمهور حسب العمر أو الموقع أو الجنس. سنعرضه هنا عندما يصبح متاحاً من المصدر.",
          comparison: "مقارنة الفترات",
          comparisonEmpty: "تحتاج المقارنة إلى بيانات من الفترة السابقة.",
          contentInteractions: "تفاعلات المحتوى",
          contentPerformance: "أداء المحتوى المنشور",
          empty: "ستظهر بيانات الأداء الحقيقية هنا بعد ربط إنستغرام ومزامنة أول مجموعة من الإحصاءات.",
          export: "تصدير التقرير الشهري",
          followers: "المتابعون",
          heading: "الإحصاءات",
          impressions: "مرات الظهور",
          latestSync: "آخر مزامنة",
          noContent: "لا توجد منشورات مرتبطة ببيانات أداء خلال هذه الفترة.",
          noSync: "لا توجد بيانات متزامنة بعد",
          previous: "الفترة السابقة",
          profileActivity: "نشاط الملف الشخصي",
          published: "محتوى تمت مزامنته",
          range: days === 7 ? "7 أيام" : "30 يوماً",
          reach: "الحسابات التي تم الوصول إليها",
          reportWindow: "فترة التقرير",
          shares: "المشاركات",
          subtitle: "راجع ما وصل إلى جمهورك وما حرّك التفاعل، ثم استخدمه لتحسين الحملة التالية.",
          topContent: "أفضل المحتويات",
          trend: "اتجاه الأداء",
          unavailable: "غير متاح",
          views: "المشاهدات"
        }
      : {
          audience: "Audience insights",
          audienceUnavailable:
            "The current sync does not include age, location, or gender breakdowns. MARKOS will show them here when the source provides them.",
          comparison: "Period comparison",
          comparisonEmpty: "Comparison needs data from the preceding period.",
          contentInteractions: "Content interactions",
          contentPerformance: "Published content performance",
          empty: "Real performance data will appear here after Instagram is connected and the first insights are synced.",
          export: "Export monthly report",
          followers: "Followers",
          heading: "Insights",
          impressions: "Impressions",
          latestSync: "Latest sync",
          noContent: "No published content has linked performance data in this period.",
          noSync: "No synced insights yet",
          previous: "Previous period",
          profileActivity: "Profile activity",
          published: "Content with synced data",
          range: days === 7 ? "7 days" : "30 days",
          reach: "Accounts reached",
          reportWindow: "Reporting period",
          shares: "Shares",
          subtitle: "See what reached people and moved them to act, then use it to improve the next Campaign.",
          topContent: "Top-performing posts",
          trend: "Performance trend",
          unavailable: "Unavailable",
          views: "Views"
        };

  const metricCards: Array<{
    icon: IconType;
    label: string;
    metric: keyof AnalyticsMetricTotals;
    tone: "aqua" | "coral" | "pink" | "yellow";
  }> = [
    { icon: Eye, label: viewsMetric === "views" ? copy.views : copy.impressions, metric: viewsMetric, tone: "pink" },
    { icon: Users, label: copy.reach, metric: "reach", tone: "aqua" },
    { icon: Heart, label: copy.contentInteractions, metric: "engagement", tone: "coral" },
    { icon: TrendingUp, label: copy.followers, metric: "followers", tone: "yellow" },
    { icon: MousePointerClick, label: copy.profileActivity, metric: "profileViews", tone: "aqua" },
    { icon: Share2, label: copy.shares, metric: "shares", tone: "pink" }
  ];

  return (
    <section aria-busy={loading} className="space-y-5 xl:space-y-6">
      <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-start justify-between gap-5">
          <div className="max-w-3xl">
            <p className="sunlit-eyebrow">Instagram performance</p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{copy.heading}</h1>
            <p className="mt-2 max-w-2xl text-base leading-7 text-[var(--sunlit-muted)]">{copy.subtitle}</p>
            <div className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-2 text-xs font-bold text-[var(--sunlit-muted)]">
              <span>
                {copy.reportWindow}: {periodLabel || copy.range}
              </span>
              <span>
                {copy.latestSync}: {summary?.latestSyncedAt ? formatInsightsTimestamp(locale, summary.latestSyncedAt) : copy.unavailable}
              </span>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <div aria-label={copy.reportWindow} className="inline-flex rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-1" role="group">
              {[7, 30].map((option) => (
                <button
                  aria-pressed={days === option}
                  className={`min-h-9 rounded-lg px-4 text-sm font-extrabold transition ${
                    days === option ? "bg-white text-[var(--sunlit-ink)] shadow-sm" : "text-[var(--sunlit-muted)] hover:text-[var(--sunlit-ink)]"
                  }`}
                  key={option}
                  onClick={() => setDays(option)}
                  type="button"
                >
                  {locale === "ar" ? (option === 7 ? "7 أيام" : "30 يوماً") : `${option} days`}
                </button>
              ))}
            </div>
            <button
              className="sunlit-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
              disabled={exporting || !session}
              onClick={() => void exportReport()}
              type="button"
            >
              <FileBarChart2 aria-hidden="true" size={17} />
              {exporting ? (locale === "ar" ? "جارٍ التجهيز..." : "Preparing...") : copy.export}
            </button>
          </div>
        </div>
      </section>

      {message ? (
        <article
          className="rounded-2xl border border-[var(--sunlit-line-strong)] bg-white/85 p-4 text-sm font-bold text-[var(--sunlit-ink-soft)]"
          role="status"
        >
          {message}
        </article>
      ) : null}

      <section className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {metricCards.map((item) => (
          <InsightsMetricCard
            change={comparison?.percentageChanges[item.metric] ?? null}
            comparisonAvailable={comparison?.totals[item.metric] !== null && comparison?.totals[item.metric] !== undefined}
            icon={item.icon}
            key={item.metric}
            label={item.label}
            loading={loading && !summary}
            locale={locale}
            tone={item.tone}
            value={totals?.[item.metric] ?? null}
          />
        ))}
      </section>

      {!loading && !hasAnalytics ? (
        <section className="sunlit-panel grid min-h-56 place-items-center rounded-[1.75rem] p-8 text-center">
          <div className="max-w-xl">
            <BarChart3 className="mx-auto text-[var(--sunlit-aqua-dark)]" size={42} />
            <h2 className="mt-4 text-xl font-bold text-[var(--sunlit-ink)]">{copy.noSync}</h2>
            <p className="mt-2 text-base leading-7 text-[var(--sunlit-muted)]">{copy.empty}</p>
          </div>
        </section>
      ) : null}

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.45fr)_minmax(19rem,.55fr)]">
        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <p className="sunlit-eyebrow">{copy.trend}</p>
              <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]">{periodLabel || copy.range}</h2>
            </div>
            <div className="flex flex-wrap gap-2">
              {(["reach", "impressions", "engagement"] as const).map((metric) => (
                <button
                  aria-pressed={trendMetric === metric}
                  className={`rounded-lg border px-3 py-2 text-xs font-extrabold transition ${
                    trendMetric === metric
                      ? "border-[var(--sunlit-aqua)] bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
                      : "border-[var(--sunlit-line)] text-[var(--sunlit-muted)] hover:text-[var(--sunlit-ink)]"
                  }`}
                  key={metric}
                  onClick={() => setTrendMetric(metric)}
                  type="button"
                >
                  {insightsMetricLabel(locale, metric)}
                </button>
              ))}
            </div>
          </div>
          {daily.length > 0 ? (
            <div className="mt-6 overflow-x-auto rounded-2xl bg-[var(--sunlit-paper)] px-4 pb-4 pt-6">
              <div className="flex h-64 min-w-[34rem] items-end gap-2" role="img" aria-label={`${insightsMetricLabel(locale, trendMetric)} · ${periodLabel}`}>
                {daily.map((item) => (
                  <div className="group flex min-w-3 flex-1 flex-col items-center justify-end gap-2" key={item.dataDate}>
                    <span className="rounded-md bg-white px-2 py-1 text-[10px] font-bold text-[var(--sunlit-ink)] opacity-0 shadow-sm transition group-hover:opacity-100 group-focus-within:opacity-100">
                      {formatMetricValue(item.totals[trendMetric])}
                    </span>
                    <div
                      className="w-full min-w-2 rounded-t-md bg-gradient-to-t from-[var(--sunlit-aqua)] to-[var(--sunlit-coral)] transition-[height]"
                      style={{ height: `${Math.max(8, ((item.totals[trendMetric] ?? 0) / maximumTrendValue) * 178)}px` }}
                      title={`${formatInsightsDay(locale, item.dataDate)}: ${formatMetricValue(item.totals[trendMetric])}`}
                    />
                    <span className="text-[10px] font-bold text-[var(--sunlit-muted)]">{formatInsightsDay(locale, item.dataDate)}</span>
                  </div>
                ))}
              </div>
            </div>
          ) : (
            <InsightsUnavailableState label={copy.unavailable} locale={locale} />
          )}
        </article>

        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <p className="sunlit-eyebrow">{copy.comparison}</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]">{previousPeriodLabel || copy.previous}</h2>
          <div className="mt-5 grid gap-1">
            {(["reach", "impressions", "engagement", "profileViews"] as const).map((metric) => (
              <InsightsComparisonRow
                change={comparison?.percentageChanges[metric] ?? null}
                current={totals?.[metric] ?? null}
                key={metric}
                label={insightsMetricLabel(locale, metric)}
                locale={locale}
                previous={comparison?.totals[metric] ?? null}
              />
            ))}
          </div>
          {!comparison || !Object.values(comparison.totals).some((value) => value !== null) ? (
            <p className="mt-4 rounded-xl bg-[var(--sunlit-paper)] p-3 text-sm leading-6 text-[var(--sunlit-muted)]">{copy.comparisonEmpty}</p>
          ) : null}
        </article>
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,.8fr)_minmax(0,1.2fr)]">
        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="sunlit-eyebrow">{copy.contentPerformance}</p>
              <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]">
                {syncedContentCount} {copy.published}
              </h2>
            </div>
            <Activity aria-hidden="true" className="text-[var(--sunlit-coral-deep)]" size={24} />
          </div>
          {contentBuckets.length > 0 ? (
            <div className="mt-5 grid gap-3 sm:grid-cols-3 xl:grid-cols-1 2xl:grid-cols-3">
              {contentBuckets.map((bucket) => (
                <div className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4" key={bucket.metricType}>
                  <p className="text-sm font-extrabold text-[var(--sunlit-ink)]">{insightsContentBucketLabel(locale, bucket.metricType)}</p>
                  <dl className="mt-3 grid gap-2 text-xs">
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[var(--sunlit-muted)]">{copy.reach}</dt>
                      <dd className="font-bold text-[var(--sunlit-ink)]">{formatMetricValue(bucket.totals.reach)}</dd>
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <dt className="text-[var(--sunlit-muted)]">{copy.contentInteractions}</dt>
                      <dd className="font-bold text-[var(--sunlit-ink)]">{formatMetricValue(bucket.totals.engagement)}</dd>
                    </div>
                  </dl>
                </div>
              ))}
            </div>
          ) : (
            <InsightsUnavailableState label={copy.noContent} locale={locale} />
          )}
        </article>

        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <p className="sunlit-eyebrow">{copy.topContent}</p>
          <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]">
            {locale === "ar" ? "ما الذي حقق أفضل استجابة" : "What earned the strongest response"}
          </h2>
          <div className="mt-6 grid gap-3">
            {summary?.topContent.length ? (
              summary.topContent.slice(0, 4).map((item, index) => (
                <a
                  className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4 transition hover:border-[var(--sunlit-line-strong)]"
                  href={`/${locale}/app/content-studio?item=${item.contentItemId}`}
                  key={item.contentItemId}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-paper-deep)] text-sm font-bold text-[var(--sunlit-pink)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-extrabold leading-6 text-[var(--sunlit-ink)]">{item.caption || contentTypeLabel(item.contentType)}</p>
                      <p className="mt-1 text-sm text-[var(--sunlit-muted)]">
                        {formatMetricValue(item.metrics.reach)} {copy.reach} · {formatMetricValue(item.engagement)} {copy.contentInteractions}
                      </p>
                    </div>
                  </div>
                </a>
              ))
            ) : (
              <div className="rounded-2xl bg-[var(--sunlit-paper)] p-5">
                <p className="font-extrabold text-[var(--sunlit-ink)]">{copy.noContent}</p>
              </div>
            )}
          </div>
        </article>
      </section>

      <section className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
        <div className="grid gap-5 lg:grid-cols-[minmax(0,.45fr)_minmax(0,.55fr)] lg:items-center">
          <div>
            <p className="sunlit-eyebrow">{copy.audience}</p>
            <div className="mt-3 flex items-end gap-3">
              <p className="text-4xl font-bold tracking-tight text-[var(--sunlit-ink)]">
                {formatMetricValue(audienceBucket?.totals.followers ?? totals?.followers ?? null)}
              </p>
              <p className="pb-1 text-sm font-bold text-[var(--sunlit-muted)]">{copy.followers}</p>
            </div>
          </div>
          <div className="rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] p-5">
            <p className="text-sm leading-6 text-[var(--sunlit-muted)]">{copy.audienceUnavailable}</p>
          </div>
        </div>
      </section>
    </section>
  );
}

function InsightsMetricCard({
  change,
  comparisonAvailable,
  icon: Icon,
  label,
  loading,
  locale,
  tone,
  value
}: {
  change: number | null;
  comparisonAvailable: boolean;
  icon: IconType;
  label: string;
  loading: boolean;
  locale: Locale;
  tone: "aqua" | "coral" | "pink" | "yellow";
  value: number | null;
}) {
  const tones = {
    aqua: "bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]",
    coral: "bg-[rgb(255_102_90_/_12%)] text-[var(--sunlit-coral-deep)]",
    pink: "bg-[rgb(226_56_123_/_10%)] text-[var(--sunlit-pink)]",
    yellow: "bg-[var(--sunlit-yellow-soft)] text-[var(--sunlit-ink)]"
  } as const;
  const changeLabel = formatInsightsChange(locale, change, comparisonAvailable);
  const ChangeIcon = change !== null && change < 0 ? ArrowDownRight : ArrowUpRight;

  return (
    <article className="sunlit-panel rounded-2xl p-4 sm:p-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="text-base font-bold text-[var(--sunlit-muted)]">{label}</p>
          <p className="mt-2 text-3xl font-bold tracking-tight text-[var(--sunlit-ink)]">{loading ? "…" : formatMetricValue(value)}</p>
        </div>
        <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-xl ${tones[tone]}`}>
          <Icon aria-hidden="true" size={20} strokeWidth={2} />
        </span>
      </div>
      <p
        className={`mt-3 inline-flex items-center gap-1 text-xs font-extrabold ${change !== null && change < 0 ? "text-[var(--sunlit-danger)]" : "text-[var(--sunlit-aqua-dark)]"}`}
      >
        {change !== null ? <ChangeIcon aria-hidden="true" size={14} /> : null}
        {changeLabel}
      </p>
    </article>
  );
}

function InsightsComparisonRow({
  change,
  current,
  label,
  locale,
  previous
}: {
  change: number | null;
  current: number | null;
  label: string;
  locale: Locale;
  previous: number | null;
}) {
  return (
    <div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-4 border-b border-[var(--sunlit-line)] py-3 last:border-0">
      <div className="min-w-0">
        <p className="truncate text-base font-extrabold text-[var(--sunlit-ink)]">{label}</p>
        <p className="mt-1 text-xs text-[var(--sunlit-muted)]">
          {formatMetricValue(current)} · {locale === "ar" ? "السابق" : "previous"} {formatMetricValue(previous)}
        </p>
      </div>
      <span className={`text-sm font-extrabold ${change !== null && change < 0 ? "text-[var(--sunlit-danger)]" : "text-[var(--sunlit-aqua-dark)]"}`}>
        {formatInsightsChange(locale, change, previous !== null)}
      </span>
    </div>
  );
}

function InsightsUnavailableState({ label, locale }: { label: string; locale: Locale }) {
  return (
    <div className="mt-6 grid min-h-44 place-items-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] p-6 text-center">
      <div className="max-w-sm">
        <BarChart3 aria-hidden="true" className="mx-auto text-[var(--sunlit-aqua-dark)]" size={30} />
        <p className="mt-3 text-sm font-bold leading-6 text-[var(--sunlit-muted)]">
          {label || (locale === "ar" ? "لا توجد بيانات متاحة." : "No data is available.")}
        </p>
      </div>
    </div>
  );
}

function insightsMetricLabel(locale: Locale, metric: keyof AnalyticsMetricTotals): string {
  const labels: Record<Locale, Record<keyof AnalyticsMetricTotals, string>> = {
    ar: {
      comments: "التعليقات",
      engagement: "التفاعلات",
      followers: "المتابعون",
      impressions: "مرات الظهور",
      likes: "الإعجابات",
      profileViews: "زيارات الملف",
      reach: "الوصول",
      saves: "عمليات الحفظ",
      shares: "المشاركات",
      views: "المشاهدات"
    },
    en: {
      comments: "Comments",
      engagement: "Interactions",
      followers: "Followers",
      impressions: "Impressions",
      likes: "Likes",
      profileViews: "Profile activity",
      reach: "Reach",
      saves: "Saves",
      shares: "Shares",
      views: "Views"
    }
  };

  return labels[locale][metric];
}

function insightsContentBucketLabel(locale: Locale, metricType: string): string {
  const labels: Record<string, [string, string]> = {
    POST: ["Post", "منشور"],
    REEL: ["Reel", "ريل"],
    STORY: ["Story", "قصة"]
  };
  const label = labels[metricType];
  return label ? label[locale === "ar" ? 1 : 0] : metricType;
}

function formatInsightsChange(locale: Locale, change: number | null, comparisonAvailable: boolean): string {
  if (change === null)
    return comparisonAvailable
      ? locale === "ar"
        ? "لا يمكن حساب النسبة"
        : "Change unavailable"
      : locale === "ar"
        ? "لا توجد فترة سابقة"
        : "No prior-period data";
  const formatted = `${change > 0 ? "+" : ""}${new Intl.NumberFormat(locale === "ar" ? "ar-BH" : "en-BH", { maximumFractionDigits: 1 }).format(change)}%`;
  return locale === "ar" ? `${formatted} عن الفترة السابقة` : `${formatted} vs previous`;
}

function formatInsightsDateRange(locale: Locale, from: string, to: string): string {
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { day: "numeric", month: "short", year: "numeric", timeZone: "UTC" });
  return `${formatter.format(new Date(from))} – ${formatter.format(new Date(to))}`;
}

function formatInsightsTimestamp(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
}

function formatInsightsDay(locale: Locale, value: string): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { day: "numeric", month: "short", timeZone: "UTC" }).format(new Date(value));
}

interface FinalVaultState {
  score: VaultCompletenessScore;
  vault: Record<VaultSection, KnowledgeVaultEntry[]>;
}

const finalVaultModules: Array<{ description: string; sections: VaultSection[]; title: string }> = [
  { description: "Core business details, category, and location", sections: ["COMPANY"], title: "Company Info" },
  { description: "Background, purpose, and positioning", sections: ["STORY"], title: "Your Story" },
  { description: "Offers, services, and customer value", sections: ["PRODUCTS"], title: "Products & Services" },
  { description: "Who you want to reach and what matters to them", sections: ["AUDIENCE"], title: "Target Audience" },
  { description: "The alternatives your customers may consider", sections: ["COMPETITORS"], title: "Competitors" },
  { description: "Voice, personality, and visual direction", sections: ["BRAND", "TONE"], title: "Brand Identity" },
  { description: "The outcomes your marketing should support", sections: ["OBJECTIVES"], title: "Marketing Objectives" }
];

export function FinalVaultPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [data, setData] = useState<FinalVaultState | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);
  const [refreshVersion, setRefreshVersion] = useState(0);

  useEffect(() => {
    if (!session) return;

    let active = true;
    setLoading(true);
    setError("");

    void Promise.all([client.vaultScore(), client.vault()])
      .then(([score, vault]) => {
        if (active) setData({ score, vault });
      })
      .catch((requestError) => {
        if (active) setError(requestError instanceof Error ? requestError.message : "Could not load the workspace Vault.");
      })
      .finally(() => {
        if (active) setLoading(false);
      });

    return () => {
      active = false;
    };
  }, [client, refreshVersion, session]);

  const modules = useMemo(() => {
    const completedSections = new Set(data?.score.completedSections ?? []);

    return finalVaultModules.map((module) => ({
      ...module,
      completed: module.sections.every((section) => completedSections.has(section)),
      updatedAt: latestVaultUpdate(data?.vault, module.sections)
    }));
  }, [data]);

  const completedCount = modules.filter((module) => module.completed).length;
  const score = data?.score.score ?? 0;
  const copy =
    locale === "ar"
      ? {
          complete: "مكتمل",
          edit: "مراجعة الملف وتعديله",
          heading: "ملف النشاط",
          incomplete: "يحتاج إلى معلومات",
          modules: "أقسام الملف",
          refresh: "تحديث",
          refreshing: "جارٍ التحديث...",
          subtitle: "المعلومات المعتمدة التي يستخدمها MARKOS لتوجيه استراتيجية النشاط والحملات والمحتوى.",
          updated: "آخر تحديث"
        }
      : {
          complete: "Complete",
          edit: "Review and edit profile",
          heading: "Business Profile",
          incomplete: "Needs information",
          modules: "Profile sections",
          refresh: "Refresh",
          refreshing: "Refreshing...",
          subtitle: "The approved business context MARKOS uses to guide business strategy, Campaigns, and content.",
          updated: "Last updated"
        };

  return (
    <section className="space-y-6 xl:space-y-7">
      <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-center">
          <div className="max-w-3xl">
            <p className="sunlit-eyebrow">{copy.modules}</p>
            <h1 className="mt-2 font-display text-2xl font-bold tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{copy.heading}</h1>
            <p className="mt-2 text-base leading-7 text-[var(--sunlit-muted)]">{copy.subtitle}</p>
            <a
              className="sunlit-primary mt-5 inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold"
              href={`/${locale}/onboarding?mode=edit`}
            >
              {copy.edit} <ArrowRight size={17} />
            </a>
          </div>
          <div className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-5">
            <div className="flex items-end justify-between gap-4">
              <div>
                <p className="text-sm font-extrabold uppercase tracking-[.12em] text-[var(--sunlit-muted)]">Profile readiness</p>
                <p className="mt-2 text-base font-bold text-[var(--sunlit-ink-soft)]">
                  {loading && !data ? "Loading profile..." : `${completedCount} of ${modules.length} sections`}
                </p>
              </div>
              <p className="text-3xl font-bold text-[var(--sunlit-pink)]">{score}%</p>
            </div>
            <div className="mt-4 h-2.5 overflow-hidden rounded-full bg-[var(--sunlit-paper-deep)]">
              <div className="h-full rounded-full bg-[var(--sunlit-aqua)] transition-[width]" style={{ width: `${score}%` }} />
            </div>
            <button
              className="mt-4 text-sm font-extrabold text-[var(--sunlit-aqua-dark)] disabled:opacity-50"
              disabled={loading}
              onClick={() => setRefreshVersion((current) => current + 1)}
              type="button"
            >
              {loading ? copy.refreshing : copy.refresh}
            </button>
          </div>
        </div>
      </section>

      {error ? (
        <p className="rounded-2xl border border-[rgb(199_53_80_/_22%)] bg-[rgb(199_53_80_/_7%)] p-5 text-sm font-semibold text-[var(--sunlit-danger)]">
          {error}
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-bold text-[var(--sunlit-ink)]">{copy.modules}</h2>
        <span className="text-sm font-bold text-[var(--sunlit-muted)]">
          {completedCount}/{modules.length}
        </span>
      </div>
      <section className="grid gap-4 lg:grid-cols-2">
        {modules.map((module, index) => (
          <article
            className={
              module.completed
                ? "sunlit-panel rounded-[1.75rem] p-5 xl:p-6"
                : "rounded-[1.75rem] border border-[var(--sunlit-line)] bg-[rgb(245_242_239_/_72%)] p-5 opacity-75 xl:p-6"
            }
            key={module.title}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4">
                <span
                  className={
                    module.completed
                      ? "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
                      : "grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[var(--sunlit-muted)]"
                  }
                >
                  {index % 2 === 0 ? <Brain size={20} /> : <Sparkles size={20} />}
                </span>
                <div>
                  <h3 className="text-xl font-bold text-[var(--sunlit-ink)]">{module.title}</h3>
                  <p className="mt-2 text-base leading-6 text-[var(--sunlit-muted)]">{module.description}</p>
                  <p className="mt-4 text-xs font-bold text-[var(--sunlit-muted)]">
                    {copy.updated}: {module.updatedAt ? formatVaultUpdatedAt(module.updatedAt, locale) : "Never"}
                  </p>
                </div>
              </div>
              <span
                className={
                  module.completed
                    ? "inline-flex items-center gap-1.5 rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-aqua-dark)]"
                    : "inline-flex items-center rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-muted)]"
                }
              >
                {module.completed ? <CheckCircle2 aria-label={`${module.title} complete`} size={15} /> : null}
                {module.completed ? copy.complete : copy.incomplete}
              </span>
            </div>
          </article>
        ))}
      </section>
      <article className="sunlit-panel-soft flex items-start gap-4 rounded-[1.75rem] p-6">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white text-[var(--sunlit-pink)]">
          <Lightbulb size={20} />
        </span>
        <div>
          <h2 className="text-lg font-bold text-[var(--sunlit-ink)]">One profile, used across MARKOS</h2>
          <p className="mt-2 max-w-4xl text-base leading-7 text-[var(--sunlit-muted)]">
            Changes to approved business context can influence future business strategy, Campaigns, and content. Existing saved work remains unchanged until you
            create a new version.
          </p>
        </div>
      </article>
    </section>
  );
}

function latestVaultUpdate(vault: Record<VaultSection, KnowledgeVaultEntry[]> | undefined, sections: VaultSection[]): string | null {
  if (!vault) return null;

  const timestamps = sections
    .flatMap((section) => vault[section] ?? [])
    .map((entry) => entry.updatedAt)
    .filter(Boolean)
    .sort();
  return timestamps.at(-1) ?? null;
}

function formatVaultUpdatedAt(value: string, locale: Locale): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", {
    dateStyle: "medium",
    timeStyle: "short"
  }).format(new Date(value));
}

function ProfileRow({ locale, name }: { locale: Locale; name: string }) {
  const [open, setOpen] = useState(false);
  const [logoutQueued, setLogoutQueued] = useState(false);
  const menuItems = [
    { href: `/${locale}/app/settings#profile`, icon: User, label: "My Profile" },
    { href: `/${locale}/app/settings#business`, icon: Building2, label: "Business Settings" },
    { href: `/${locale}/app/settings#accounts`, icon: Link2, label: "Connected Accounts" },
    { href: `/${locale}/app/settings#billing`, icon: CreditCard, label: "Subscription & Billing" },
    { href: `/${locale}/app/settings#notifications`, icon: Bell, label: "Notifications" },
    { href: `/${locale}/app/settings#help`, icon: CircleHelp, label: "Help Center" }
  ] as const;

  return (
    <div className="relative z-50 hidden justify-end sm:flex">
      <button
        aria-expanded={open}
        aria-haspopup="menu"
        className="flex items-center gap-3 rounded-full border border-[#81D8D0]/18 bg-[#111920] px-4 py-2.5 text-white shadow-[0_16px_50px_rgba(0,0,0,.28)] transition hover:border-[#81D8D0]/35 hover:bg-[#14222A]"
        onClick={() => setOpen((current) => !current)}
        onKeyDown={(event) => {
          if (event.key === "Escape") {
            setOpen(false);
          }
        }}
        type="button"
      >
        <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#81D8D0] to-[#D4AF37] text-base font-bold text-[#0F1419]">
          M
        </span>
        <span className="text-lg font-bold">{name}</span>
        <Settings size={18} className="text-[#9AA7BD]" />
        {open ? <ChevronUp size={18} className="text-[#9AA7BD]" /> : <ChevronDown size={18} className="text-[#9AA7BD]" />}
      </button>

      {open ? (
        <div
          className="absolute right-0 top-[calc(100%+0.85rem)] z-50 w-[22rem] rounded-[1.5rem] border border-[#81D8D0]/22 bg-[#111920] p-2 shadow-[0_28px_90px_rgba(0,0,0,.62)]"
          role="menu"
        >
          <div className="rounded-[1.2rem] border border-[#81D8D0]/10 bg-[#16232B] p-2">
            {menuItems.map((item) => {
              const Icon = item.icon;
              return (
                <a
                  className="flex items-center gap-4 rounded-2xl px-4 py-3 text-base font-semibold text-[#D6DEEA] transition hover:bg-[#81D8D0]/10 hover:text-white focus:bg-[#81D8D0]/10 focus:text-white focus:outline-none"
                  href={item.href}
                  key={item.label}
                  onClick={() => setOpen(false)}
                  role="menuitem"
                >
                  <Icon size={19} className="text-[#9AA7BD]" />
                  {item.label}
                </a>
              );
            })}
            <button
              className="flex w-full items-center gap-4 rounded-2xl px-4 py-3 text-left text-base font-semibold text-[#FF6B6B] transition hover:bg-[#FF6B6B]/10 focus:bg-[#FF6B6B]/10 focus:outline-none"
              onClick={() => {
                setLogoutQueued(true);
                void logoutBrowserSession(locale);
              }}
              role="menuitem"
              type="button"
            >
              <LogOut size={19} />
              {logoutQueued ? "Logout queued" : "Logout"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function HeroTitle({ children, icon, subtitle, title }: { children?: ReactNode; icon: IconType; subtitle: string; title: string }) {
  const Icon = icon;
  return (
    <section className="lux-card min-w-0 rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <IconTile accentName="teal" icon={Icon} size="lg" />
        <div>
          <h1 className="min-w-0 font-display text-3xl font-bold tracking-normal text-white sm:text-4xl">{title}</h1>
          <p className="mt-3 min-w-0 max-w-5xl text-base leading-relaxed text-[#D6DEEA] sm:text-lg xl:text-xl">{subtitle}</p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SectionHeading({ title }: { title: string }) {
  return <h2 className="font-display text-2xl font-bold text-white xl:text-3xl">{title}</h2>;
}

function SectionLabel({ accentName, label }: { accentName: Accent; label: string }) {
  return (
    <h2 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[.14em] text-[#9AA7BD]">
      <span className="h-2.5 w-2.5 rounded-full" style={{ backgroundColor: accent[accentName].hex }} />
      {label}
    </h2>
  );
}

function IconTile({ accentName, icon, size = "md" }: { accentName: Accent; icon: IconType; size?: "lg" | "md" }) {
  const Icon = icon;
  return (
    <div
      className={
        size === "lg" ? "grid h-16 w-16 shrink-0 place-items-center rounded-full border" : "grid h-12 w-12 shrink-0 place-items-center rounded-xl border"
      }
      style={{ background: accent[accentName].bg, borderColor: accent[accentName].border }}
    >
      <Icon className={accent[accentName].className} size={size === "lg" ? 30 : 22} strokeWidth={1.8} />
    </div>
  );
}

function MetricRingCard({ accentName, icon, label, sub, value }: { accentName: Accent; icon: IconType; label: string; sub: string; value: string }) {
  const color = accent[accentName].hex;
  const Icon = icon;
  return (
    <article className="lux-card-muted rounded-[1.5rem] p-5 text-center xl:p-6">
      <div
        className="mx-auto grid h-28 w-28 place-items-center rounded-full xl:h-32 xl:w-32"
        style={{ background: `conic-gradient(${color} 0 82%, rgba(255,255,255,.08) 82% 100%)`, filter: `drop-shadow(0 0 16px ${color}44)` }}
      >
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[#111920] xl:h-24 xl:w-24">
          <Icon className={accent[accentName].className} size={32} />
        </div>
      </div>
      <p className="mt-4 text-sm text-[#9AA7BD] xl:mt-5 xl:text-base">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-white xl:text-4xl">{value}</p>
      <p className={`mt-3 text-sm font-bold xl:mt-4 xl:text-base ${accent[accentName].className}`}>
        {sub} <ArrowRight className="inline" size={15} />
      </p>
    </article>
  );
}

function MiniStat({ accentName, icon, label, value }: { accentName: Accent; icon: IconType; label: string; value: string }) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3">
      <Icon className={accent[accentName].className} size={20} />
      <div>
        <p className="text-[#9AA7BD]">{label}</p>
        <p className={`text-xl font-bold ${accent[accentName].className}`}>{value}</p>
      </div>
    </div>
  );
}

function ContentReadyCard({ accent: accentName, cta, href, label, locale, status, subtitle, title }: ContentReadyCardModel & { locale: Locale }) {
  const cardHref = href ?? (cta === "Schedule Post" ? `/${locale}/app/campaign-builder` : `/${locale}/app/content-studio`);
  const color = accent[accentName].hex;
  const borderColor = accent[accentName].border;
  const previewBackground =
    accentName === "teal"
      ? "linear-gradient(135deg, rgba(129,216,208,.18), rgba(212,175,55,.08), rgba(244,164,96,.14))"
      : accentName === "gold"
        ? "linear-gradient(135deg, rgba(212,175,55,.18), rgba(244,164,96,.12), rgba(129,216,208,.08))"
        : "linear-gradient(135deg, rgba(244,164,96,.18), rgba(129,216,208,.08), rgba(212,175,55,.12))";

  function previewArtwork() {
    if (label === "Carousel") {
      return (
        <div className="absolute inset-0 flex flex-col justify-between p-6">
          <div className="flex items-center justify-between">
            <span className="h-2 w-2 rounded-full bg-[#81D8D0] shadow-[0_0_14px_rgba(129,216,208,.75)]" />
            <div className="flex gap-1">
              <span className="h-1 w-12 rounded-full bg-[#81D8D0]" />
              <span className="h-1 w-12 rounded-full bg-[#81D8D0]/30" />
              <span className="h-1 w-12 rounded-full bg-[#81D8D0]/30" />
            </div>
          </div>
          <div className="text-center">
            <p className="font-display text-2xl font-bold text-white">{title}</p>
            <p className="mt-2 text-sm font-semibold text-[#81D8D0]">{subtitle}</p>
          </div>
          <p className="text-center text-xs text-[#9AA7BD]">
            Swipe for details <ArrowRight className="inline" size={12} />
          </p>
        </div>
      );
    }

    if (label === "Reel") {
      return (
        <div className="absolute inset-0 flex flex-col justify-between p-6">
          <div className="flex justify-end">
            <span className="grid h-8 w-8 place-items-center rounded-lg border border-[#D4AF37]/30 bg-[#D4AF37]/16 text-[#D4AF37]">
              <Play size={15} fill="currentColor" />
            </span>
          </div>
          <div className="space-y-2">
            <span className="block h-1 w-16 rounded-full bg-[#D4AF37]/60" />
            <span className="block h-1 w-24 rounded-full bg-[#D4AF37]/35" />
            <span className="block h-1 w-20 rounded-full bg-[#D4AF37]/25" />
          </div>
          <p className="text-xs font-bold text-[#D6DEEA]">{subtitle}</p>
        </div>
      );
    }

    if (label === "Story") {
      return (
        <div className="absolute inset-0 flex flex-col justify-between p-6">
          <div className="flex gap-1">
            {[0, 1, 2, 3].map((index) => (
              <span className={index === 0 ? "h-0.5 flex-1 rounded-full bg-[#F4A460]" : "h-0.5 flex-1 rounded-full bg-[#F4A460]/35"} key={index} />
            ))}
          </div>
          <div className="text-center">
            <span className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full border border-[#F4A460]/45 bg-[#F4A460]/22 text-[#F4A460]">
              <Heart size={24} />
            </span>
            <p className="text-xs font-bold text-[#D6DEEA]">{title}</p>
          </div>
          <p className="text-center text-xs text-[#9AA7BD]">{subtitle}</p>
        </div>
      );
    }

    return (
      <div className="absolute inset-0 grid place-items-center p-6">
        <div className="text-center">
          <span className="mx-auto mb-5 grid h-16 w-16 place-items-center rounded-2xl border border-[#81D8D0]/30 bg-[#81D8D0]/18 text-[#81D8D0]">
            <Eye size={32} />
          </span>
          <p className="font-display text-xl font-bold text-white">{title}</p>
          <p className="mt-1 text-sm font-bold text-[#D4AF37]">{subtitle}</p>
        </div>
      </div>
    );
  }

  return (
    <article className="group overflow-hidden rounded-[1.5rem] border bg-[#111920]/82 transition hover:bg-[#132129]" style={{ borderColor }}>
      <div className="relative aspect-square overflow-hidden" style={{ background: previewBackground }}>
        <div className="absolute inset-0 bg-[#0F1419]/14 transition group-hover:bg-transparent" />
        {previewArtwork()}
      </div>
      <div className="bg-[#111920]/92 p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="text-base font-bold text-white">{label}</p>
          <span className="rounded-full border px-3 py-1 text-xs font-bold" style={{ background: accent[accentName].bg, borderColor, color }}>
            {status}
          </span>
        </div>
        <a
          className="block w-full rounded-full border px-4 py-2 text-center text-sm font-bold transition hover:brightness-125"
          href={cardHref}
          style={{ borderColor, background: accent[accentName].bg, color }}
        >
          {cta}
        </a>
      </div>
    </article>
  );
}

function PerformanceCard({ accent: accentName, icon, label, meta, sub, value }: (typeof performanceHighlights)[number]) {
  return (
    <article className="lux-card-muted rounded-[1.75rem] p-5 xl:p-7">
      <div className="flex items-center gap-4 xl:gap-6">
        <IconTile accentName={accentName} icon={icon} />
        <div>
          <p className="font-display text-2xl font-bold text-white xl:text-3xl">{value}</p>
          <p className="text-base text-white xl:text-lg">{label}</p>
        </div>
      </div>
      <div className="mt-5 flex justify-between text-base xl:mt-7 xl:text-lg">
        <span className="text-[#9AA7BD]">{meta}</span>
        <span className={`font-bold ${accent[accentName].className}`}>{sub}</span>
      </div>
      <div className="mt-5 h-2 rounded-full bg-[#182436]">
        <div className="h-full w-[78%] rounded-full" style={{ background: accent[accentName].hex }} />
      </div>
    </article>
  );
}

function OpportunityCard({
  accent: accentName,
  confidence,
  impact,
  lift,
  locale,
  pieces,
  reach,
  theme,
  title,
  why
}: (typeof opportunityCards)[number] & { locale: Locale }) {
  return (
    <article className="lux-card rounded-[1.5rem] p-5 xl:p-6" style={{ borderColor: accent[accentName].border }}>
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-base font-bold text-[#D6DEEA] xl:text-lg">{theme}</p>
          <h2 className="mt-4 font-display text-2xl font-bold text-white xl:text-3xl">{title}</h2>
          <p className="mt-4 max-w-5xl text-base leading-relaxed text-[#B8C4D8] xl:text-lg">
            Your audience is showing strong interest in this content angle. MARKOS can convert it into a campaign or a content batch immediately.
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold text-white xl:text-4xl">{confidence}</p>
          <p className="text-base text-[#9AA7BD] xl:text-lg">Confidence</p>
        </div>
      </div>
      <div className="mt-6 grid gap-4 sm:grid-cols-3 xl:mt-8 xl:gap-5">
        <GlassStat icon={Eye} label="Projected Reach" value={reach} />
        <GlassStat icon={Zap} label="Engagement Lift" value={lift} />
        <GlassStat icon={Target} label="Impact Level" value={impact} />
      </div>
      <div className="mt-6 grid gap-5 lg:grid-cols-2 xl:mt-8 xl:gap-6">
        <div>
          <h3 className="text-lg font-bold text-white">Why This Will Work</h3>
          <ul className="mt-4 space-y-3 text-base text-[#B8C4D8]">
            {why.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Suggested Content Pieces</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {pieces.map((piece) => (
              <span className="rounded-full bg-white/10 px-4 py-2 font-semibold text-[#D6DEEA]" key={piece}>
                {piece}
              </span>
            ))}
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 xl:mt-8 xl:gap-4">
        <a
          className="lux-button-primary inline-flex items-center gap-3 rounded-full px-6 py-3 text-base font-bold xl:px-7 xl:py-3.5"
          href={`/${locale}/app/content-studio`}
        >
          <Sparkles size={20} /> Generate Content <ArrowRight size={20} />
        </a>
        <a className="rounded-full border border-[#81D8D0]/18 px-6 py-3 text-base font-bold text-white xl:px-7 xl:py-3.5" href={`/${locale}/app/analytics`}>
          View Analysis
        </a>
        <a
          className="rounded-full border border-[#81D8D0]/18 px-6 py-3 text-base font-bold text-[#D6DEEA] xl:px-7 xl:py-3.5"
          href={`/${locale}/app/campaign-builder`}
        >
          Schedule Later
        </a>
      </div>
    </article>
  );
}

function GlassStat({ icon, label, value }: { icon: IconType; label: string; value: string }) {
  const Icon = icon;
  return (
    <div className="lux-card-quiet rounded-[1.35rem] p-4 xl:p-5">
      <p className="flex items-center gap-3 text-[#9AA7BD]">
        <Icon size={18} />
        {label}
      </p>
      <p className="mt-4 font-display text-2xl font-bold text-white xl:text-3xl">{value}</p>
    </div>
  );
}

function ObjectiveCard({ icon, label, sub, value }: { icon: IconType; label: string; sub: string; value: string }) {
  const Icon = icon;
  return (
    <article className="lux-card-muted rounded-[1.5rem] p-5 xl:p-7">
      <p className="flex items-center gap-3 text-lg font-bold text-white xl:gap-4 xl:text-xl">
        <Icon size={24} /> {label}
      </p>
      <p className="mt-5 font-display text-3xl font-bold text-white xl:mt-6 xl:text-4xl">{value}</p>
      <p className="mt-3 text-base text-[#9AA7BD] xl:text-lg">{sub}</p>
    </article>
  );
}

function ScoreBadge({ score }: { score: string }) {
  return (
    <div className="grid h-28 w-28 place-items-center rounded-full" style={{ background: "conic-gradient(#81D8D0 0 78%, rgba(255,255,255,.08) 78% 100%)" }}>
      <div className="grid h-20 w-20 place-items-center rounded-full bg-[#111920] text-center">
        <span className="text-2xl font-bold text-[#81D8D0]">{score}</span>
        <span className="text-xs uppercase text-[#9AA7BD]">Score</span>
      </div>
    </div>
  );
}
