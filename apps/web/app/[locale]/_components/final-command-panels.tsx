"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
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
  DollarSign,
  Eye,
  ExternalLink,
  FileBarChart2,
  Heart,
  Image as ImageIcon,
  Instagram,
  Lightbulb,
  Link2,
  LogOut,
  MessageCircle,
  MousePointerClick,
  Palette,
  Pencil,
  Play,
  RefreshCcw,
  RotateCcw,
  Settings,
  Share2,
  Sparkles,
  Target,
  TrendingUp,
  Trash2,
  Upload,
  User,
  Users,
  Wand2,
  X,
  Zap
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type {
  AnalyticsMetricTotals,
  AnalyticsSummary,
  CampaignRecord,
  ContentDraft,
  ContentRecord,
  ContentStatus,
  ContentType,
  KnowledgeVaultEntry,
  Locale,
  MediaAssetRecord,
  VaultCompletenessScore,
  VaultSection
} from "@markos/shared-types";
import { instagramImageConstraints } from "@markos/validation";
import { logoutBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";
import {
  bahrainInputValue,
  contentDraftFieldsFromRecord,
  contentDraftHasMeaningfulWork,
  contentDraftIsDirty,
  contentDraftPayload,
  emptyContentDraftFields,
  parseDraftHashtags as parseHashtags,
  type ContentDraftFields
} from "./content-studio-draft-state";
import { ContentTypeStep, InstagramPostPreview } from "./content-studio-composer";
import { ContentStudioAssistantPanel, EmptyStudioPreview, type StudioSidePanel } from "./content-studio-assistant";
import { MarkosAiIcon } from "./markos-ai-icon";

type Accent = "amber" | "gold" | "teal";
type IconType = typeof Sparkles;
type StudioContentType = Extract<ContentType, "POST" | "REEL" | "CAROUSEL" | "STORY">;
type StudioExitIntent = { kind: "home"; note?: string } | { href: string; kind: "navigate" };

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
  const caption = record.captionEn ?? record.captionAr ?? record.contentPillar ?? "";
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

  if (record.hashtags[0]) {
    return record.hashtags[0].replace(/^#/, "");
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

function initialScheduleDate(): string {
  const nextDay = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return nextDay.toISOString().slice(0, 10);
}

function toScheduleIso(date: string, time: string): string {
  const scheduled = new Date(`${date}T${time}:00`);

  if (Number.isNaN(scheduled.getTime())) {
    throw new Error("Choose a valid schedule date and time.");
  }

  if (scheduled.getTime() <= Date.now()) {
    throw new Error("Choose a future time before scheduling.");
  }

  return scheduled.toISOString();
}

function fileAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("MARKOS could not read that image. Choose the file again."));
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      const separator = result.indexOf(",");

      if (separator < 0) {
        reject(new Error("MARKOS could not read that image. Choose the file again."));
        return;
      }

      resolve(result.slice(separator + 1));
    };
    reader.readAsDataURL(file);
  });
}

function imageDimensions(file: File): Promise<{ height: number; width: number }> {
  return new Promise((resolve, reject) => {
    const objectUrl = URL.createObjectURL(file);
    const image = new window.Image();
    image.onerror = () => {
      URL.revokeObjectURL(objectUrl);
      reject(new Error("That JPEG could not be decoded. Choose a valid image file."));
    };
    image.onload = () => {
      URL.revokeObjectURL(objectUrl);
      resolve({ height: image.naturalHeight, width: image.naturalWidth });
    };
    image.src = objectUrl;
  });
}

function formatFileSize(sizeBytes: number): string {
  if (sizeBytes < 1024 * 1024) return `${Math.max(1, Math.round(sizeBytes / 1024))} KB`;
  return `${(sizeBytes / (1024 * 1024)).toFixed(1)} MB`;
}

function instagramImageDimensionsError(width: number, height: number): string | undefined {
  if (width < instagramImageConstraints.minWidth || width > instagramImageConstraints.maxWidth) {
    return "Choose a JPEG between 320 and 1,440 pixels wide.";
  }

  const aspectRatio = width / height;
  if (aspectRatio < instagramImageConstraints.minAspectRatio || aspectRatio > instagramImageConstraints.maxAspectRatio) {
    return "Choose a JPEG with an aspect ratio between 4:5 portrait and 1.91:1 landscape.";
  }

  return undefined;
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

function isStudioContentType(value: string | null): value is StudioContentType {
  return value === "POST" || value === "REEL" || value === "CAROUSEL" || value === "STORY";
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

export function ContentStudioPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [contentType, setContentType] = useState<StudioContentType>("POST");
  const [contentTypeConfirmed, setContentTypeConfirmed] = useState(false);
  const [prompt, setPrompt] = useState("");
  const [sidePanel, setSidePanel] = useState<StudioSidePanel>("assistant");
  const [assistantSuggestion, setAssistantSuggestion] = useState<ContentDraft | null>(null);
  const [assistantCaption, setAssistantCaption] = useState("");
  const [assistantVisualDirection, setAssistantVisualDirection] = useState("");
  const [assistantMessage, setAssistantMessage] = useState("");
  const [assistantMessageKind, setAssistantMessageKind] = useState<"error" | "info" | "success">("info");
  const [assistantBusy, setAssistantBusy] = useState(false);
  const [assistantReplacementWarning, setAssistantReplacementWarning] = useState(false);
  const assistantGenerationRef = useRef(0);
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<ContentRecord | null>(null);
  const [campaignContext, setCampaignContext] = useState<CampaignRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftBaseline, setDraftBaseline] = useState<ContentDraftFields | null>(null);
  const [brief, setBrief] = useState("");
  const [campaignGoal, setCampaignGoal] = useState("");
  const [captionLanguage, setCaptionLanguage] = useState<"ar" | "en">(locale);
  const [captionEn, setCaptionEn] = useState("");
  const [captionAr, setCaptionAr] = useState("");
  const [contentPillar, setContentPillar] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [plannedAtInput, setPlannedAtInput] = useState("");
  const [tone, setTone] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageAspectRatio, setImageAspectRatio] = useState<"1:1" | "4:5" | "9:16">("4:5");
  const [imageComposerOpen, setImageComposerOpen] = useState(false);
  const [mediaLibraryOpen, setMediaLibraryOpen] = useState(false);
  const [scheduleDate, setScheduleDate] = useState(initialScheduleDate);
  const [scheduleTime, setScheduleTime] = useState("19:30");
  const [schedulePanelOpen, setSchedulePanelOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [generating, setGenerating] = useState(false);
  const [reviewingGenerated, setReviewingGenerated] = useState(false);
  const [revisionPrompt, setRevisionPrompt] = useState("");
  const [revising, setRevising] = useState(false);
  const [generatingImage, setGeneratingImage] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [removingMedia, setRemovingMedia] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [unscheduling, setUnscheduling] = useState(false);
  const [reopening, setReopening] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [confirmation, setConfirmation] = useState<"cancel-schedule" | "delete-draft" | null>(null);
  const [pendingExit, setPendingExit] = useState<StudioExitIntent | null>(null);
  const ignoreUnsavedWarningRef = useRef(false);
  const studioHomeCopy =
    locale === "ar"
      ? {
          aiAction: "اكتب مسودة مع MARKOS AI",
          aiDescription: "حوّل فكرة أو عرضاً إلى مسودة مبنية على ملف نشاطك التجاري.",
          aiTitle: "صف المنشور الذي تريد إنشاءه",
          blankAction: "ابدأ منشوراً فارغاً",
          blankDescription: "افتح مسودة قابلة للتحرير من دون استخدام الذكاء الاصطناعي أو استهلاك الرصيد.",
          calendarAction: "افتح التقويم",
          calendarDescription: "راجع ما تم نشره وما هو مجدول واختر موعدك التالي.",
          continueAction: "تابع مسودة",
          continueDescription: "ارجع إلى المحتوى المحفوظ وعدّل من حيث توقفت.",
          eyebrow: "إنشاء",
          ideasAction: "استكشف أفكار المحتوى",
          ideasDescription: "اختر نقطة بداية قبل إنشاء أي مسودة.",
          statsDrafts: "مسودات",
          statsPublished: "منشور",
          statsScheduled: "مجدول",
          subtitle: "ابدأ بنفسك أو اطلب مساعدة MARKOS فقط عندما تحتاجها.",
          title: "كيف تريد أن تبدأ منشورك التالي؟"
        }
      : {
          aiAction: "Draft with MARKOS AI",
          aiDescription: "Turn an idea or offer into a draft grounded in your Business Profile.",
          aiTitle: "Describe the post you want to create",
          blankAction: "Start a blank post",
          blankDescription: "Open an editable draft and write it yourself.",
          calendarAction: "Open Calendar",
          calendarDescription: "Review published and scheduled work, then choose what comes next.",
          continueAction: "Continue a draft",
          continueDescription: "Return to saved content and pick up where you left off.",
          eyebrow: "Create",
          ideasAction: "Explore content ideas",
          ideasDescription: "Choose a useful starting point before anything is saved.",
          statsDrafts: "Drafts",
          statsPublished: "Published",
          statsScheduled: "Scheduled",
          subtitle: "Start on your own, or ask MARKOS for help only when you want it.",
          title: "How do you want to start your next post?"
        };
  const currentDraftFields: ContentDraftFields = {
    brief,
    callToAction,
    campaignGoal,
    captionAr,
    captionEn,
    contentPillar,
    contentType,
    hashtagsText,
    plannedAtInput,
    tone
  };
  const isDraftDirty = editorOpen && draftBaseline !== null && contentDraftIsDirty(currentDraftFields, draftBaseline);
  const hasMeaningfulDraftWork = editorOpen && contentDraftHasMeaningfulWork(currentDraftFields);
  const canEdit = editorOpen && (currentRecord === null || currentRecord.status === "DRAFT" || currentRecord.status === "IN_REVIEW");
  const canApprove = canEdit;
  const canSchedule = currentRecord?.status === "APPROVED";
  const canManageMedia = currentRecord !== null && canEdit;
  const canDelete = currentRecord !== null && currentRecord.status !== "SCHEDULED" && currentRecord.status !== "PUBLISHED";
  const attachedMediaAssets = currentRecord
    ? currentRecord.mediaIds.map((id) => mediaAssets.find((asset) => asset.id === id)).filter((asset): asset is MediaAssetRecord => asset !== undefined)
    : [];
  const selectedMedia = attachedMediaAssets.find((asset) => asset?.id === selectedMediaId) ?? attachedMediaAssets[0] ?? null;
  const activeCaption = captionLanguage === "ar" ? captionAr : captionEn;
  const setActiveCaption = captionLanguage === "ar" ? setCaptionAr : setCaptionEn;

  useEffect(() => {
    if (contentType === "POST" && imageAspectRatio === "9:16") {
      setImageAspectRatio("4:5");
    }
  }, [contentType, imageAspectRatio]);

  useEffect(() => {
    if (!schedulePanelOpen) return;

    function closeSchedulePanel(event: KeyboardEvent) {
      if (event.key === "Escape" && !scheduling) {
        setSchedulePanelOpen(false);
      }
    }

    window.addEventListener("keydown", closeSchedulePanel);
    return () => window.removeEventListener("keydown", closeSchedulePanel);
  }, [schedulePanelOpen, scheduling]);

  useEffect(() => {
    if (!isDraftDirty) return;

    function warnBeforeUnload(event: BeforeUnloadEvent) {
      if (ignoreUnsavedWarningRef.current) return;
      event.preventDefault();
      event.returnValue = "";
    }

    function interceptWorkspaceNavigation(event: MouseEvent) {
      if (ignoreUnsavedWarningRef.current || event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) {
        return;
      }

      const target = event.target;
      const anchor = target instanceof Element ? target.closest<HTMLAnchorElement>("a[href]") : null;
      if (!anchor || anchor.target === "_blank" || anchor.hasAttribute("download")) return;

      const destination = new URL(anchor.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;

      event.preventDefault();
      event.stopPropagation();
      setPendingExit({ href: destination.href, kind: "navigate" });
    }

    window.addEventListener("beforeunload", warnBeforeUnload);
    document.addEventListener("click", interceptWorkspaceNavigation, true);
    return () => {
      window.removeEventListener("beforeunload", warnBeforeUnload);
      document.removeEventListener("click", interceptWorkspaceNavigation, true);
    };
  }, [isDraftDirty]);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const urlType = params.get("type")?.toUpperCase() ?? null;
    if (isStudioContentType(urlType)) {
      setContentType(urlType);
    }

    if (!session) {
      return;
    }

    let cancelled = false;
    setMessage("");

    async function loadRecords() {
      try {
        const [nextRecords, nextMediaAssets] = await Promise.all([client.contentItems(), client.mediaAssets()]);

        if (cancelled) {
          return;
        }

        setRecords(nextRecords);
        setMediaAssets(nextMediaAssets);
        const requestedItemId = params.get("item");
        const requestedRecord = requestedItemId ? nextRecords.find((item) => item.id === requestedItemId) : undefined;

        if (requestedRecord) {
          applyRecord(requestedRecord);
          setReviewingGenerated(Boolean(requestedRecord.aiPromptUsed && ["DRAFT", "IN_REVIEW"].includes(requestedRecord.status)));
          if (requestedRecord.campaignId) {
            void client
              .campaigns()
              .then((nextCampaigns) => {
                if (!cancelled) setCampaignContext(nextCampaigns.find((campaign) => campaign.id === requestedRecord.campaignId) ?? null);
              })
              .catch(() => {
                if (!cancelled) setCampaignContext(null);
              });
          }
        } else if (requestedItemId) {
          setMessage(locale === "ar" ? "تعذر العثور على المحتوى المطلوب في مساحة العمل هذه." : "That content item was not found in this workspace.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(contentStudioError(error));
        }
      }
    }

    void loadRecords();

    return () => {
      cancelled = true;
    };
  }, [client, locale, session]);

  function applyRecord(record: ContentRecord | null, note?: string) {
    setCurrentRecord(record);
    setSchedulePanelOpen(false);
    setContentTypeConfirmed(record !== null);
    setImageComposerOpen(false);
    setMediaLibraryOpen(false);

    if (record) {
      const fields = contentDraftFieldsFromRecord(record);
      setEditorOpen(true);
      setSidePanel(record.mediaIds.length > 0 ? "preview" : "assistant");
      setBrief(fields.brief);
      setPrompt(fields.brief);
      setContentType(fields.contentType);
      setCampaignGoal(fields.campaignGoal);
      setCaptionEn(fields.captionEn);
      setCaptionAr(fields.captionAr);
      setContentPillar(fields.contentPillar);
      setHashtagsText(fields.hashtagsText);
      setCallToAction(fields.callToAction);
      setPlannedAtInput(fields.plannedAtInput);
      setTone(fields.tone);
      setDraftBaseline(fields);
      setSelectedMediaId(record.mediaIds[0] ?? null);

      const publishingInstant = record.scheduledAt ?? record.plannedAt;
      if (publishingInstant) {
        const localValue = bahrainInputValue(publishingInstant);
        setScheduleDate(localValue.slice(0, 10));
        setScheduleTime(localValue.slice(11));
      } else {
        setScheduleDate(initialScheduleDate());
        setScheduleTime("19:30");
      }
    } else {
      setEditorOpen(false);
      setBrief("");
      setCampaignGoal("");
      setCaptionEn("");
      setCaptionAr("");
      setContentPillar("");
      setHashtagsText("");
      setCallToAction("");
      setPlannedAtInput("");
      setTone("");
      setCampaignContext(null);
      setDraftBaseline(null);
      setSelectedMediaId(null);
      setReviewingGenerated(false);
      setRevisionPrompt("");
      setPrompt("");
    }

    if (note !== undefined) {
      setMessage(note);
    }
  }

  function upsertRecord(record: ContentRecord) {
    setRecords((current) => {
      const existingIndex = current.findIndex((item) => item.id === record.id);
      if (existingIndex === -1) {
        return [record, ...current];
      }

      const next = [...current];
      next[existingIndex] = record;
      return next;
    });
  }

  function upsertMediaAsset(mediaAsset: MediaAssetRecord) {
    setMediaAssets((current) => {
      const existingIndex = current.findIndex((item) => item.id === mediaAsset.id);
      if (existingIndex === -1) return [mediaAsset, ...current];
      const next = [...current];
      next[existingIndex] = mediaAsset;
      return next;
    });
  }

  function returnToCreateHome(note?: string) {
    applyRecord(null, note);
    setAssistantSuggestion(null);
    setAssistantCaption("");
    setAssistantVisualDirection("");
    setAssistantMessage("");
    setAssistantReplacementWarning(false);

    const url = new URL(window.location.href);
    url.searchParams.delete("item");
    window.history.replaceState({}, "", `${url.pathname}${url.search}${url.hash}`);
  }

  function requestReturnToCreateHome(note?: string) {
    if (isDraftDirty) {
      setPendingExit({ kind: "home", ...(note === undefined ? {} : { note }) });
      return;
    }

    returnToCreateHome(note);
  }

  function completeExit(intent: StudioExitIntent) {
    if (intent.kind === "home") {
      returnToCreateHome(intent.note);
      return;
    }

    ignoreUnsavedWarningRef.current = true;
    window.location.assign(intent.href);
  }

  function discardDraftAndExit() {
    const intent = pendingExit;
    if (!intent) return;
    setPendingExit(null);
    completeExit(intent);
  }

  async function saveDraftAndExit() {
    const intent = pendingExit;
    if (!intent) return;
    const saved = await persistEditableDraft(false);
    if (!saved) {
      setPendingExit(null);
      return;
    }
    setPendingExit(null);
    completeExit(intent);
  }

  function openStudio(mode: "ai" | "manual") {
    const fields = emptyContentDraftFields(contentType);
    setCurrentRecord(null);
    setEditorOpen(true);
    setContentTypeConfirmed(false);
    setDraftBaseline(fields);
    setCampaignContext(null);
    setReviewingGenerated(false);
    setSelectedMediaId(null);
    setSidePanel(mode === "ai" ? "assistant" : "preview");
    setAssistantSuggestion(null);
    setAssistantCaption("");
    setAssistantVisualDirection("");
    setAssistantMessage("");
    setAssistantReplacementWarning(false);
    setMessage("");
  }

  async function generateAssistantIdea() {
    const trimmedPrompt = prompt.trim();

    if (!session) {
      setAssistantMessageKind("error");
      setAssistantMessage(locale === "ar" ? "سجّل الدخول قبل استخدام مساعد MARKOS." : "Sign in before using the MARKOS assistant.");
      return;
    }

    if (trimmedPrompt.length < 8) {
      setAssistantMessageKind("error");
      setAssistantMessage(locale === "ar" ? "صف ما تريد أن ينشئه MARKOS أولاً." : "Describe what MARKOS should create first.");
      return;
    }

    if (!contentTypeConfirmed) {
      setAssistantMessageKind("error");
      setAssistantMessage(locale === "ar" ? "اختر نوع المحتوى في الخطوة الأولى." : "Choose a content type in step 1.");
      return;
    }

    const generationId = assistantGenerationRef.current + 1;
    assistantGenerationRef.current = generationId;
    setAssistantBusy(true);
    setAssistantReplacementWarning(false);
    setAssistantMessageKind("info");
    setAssistantMessage(locale === "ar" ? "يستخدم MARKOS ملف نشاطك لتطوير الفكرة." : "MARKOS is using your Business Profile to develop the idea.");

    try {
      const idea = await client.ideateContent({
        contentType,
        topic: trimmedPrompt,
        ...(currentRecord?.campaignId ? { campaignId: currentRecord.campaignId } : {})
      });
      if (assistantGenerationRef.current !== generationId) return;
      const suggestedCaption = locale === "ar" ? idea.captionAr || idea.captionEn || "" : idea.captionEn || idea.captionAr || "";
      const visualDirection =
        idea.visualDirection?.trim() ||
        (locale === "ar"
          ? `صورة أصلية لمنشور ${localizedContentTypeLabel(contentType, locale)} تعبّر عن: ${trimmedPrompt}`
          : `An original ${localizedContentTypeLabel(contentType, locale)} visual that communicates: ${trimmedPrompt}`);
      setAssistantSuggestion(idea);
      setAssistantCaption(suggestedCaption);
      setAssistantVisualDirection(visualDirection);
      setAssistantMessageKind("success");
      setAssistantMessage(locale === "ar" ? "الاقتراح جاهز للمراجعة والتعديل." : "The suggestion is ready to review and edit.");
    } catch (error) {
      if (assistantGenerationRef.current !== generationId) return;
      setAssistantMessageKind("error");
      setAssistantMessage(contentStudioError(error));
    } finally {
      if (assistantGenerationRef.current === generationId) setAssistantBusy(false);
    }
  }

  function cancelAssistantIdea() {
    assistantGenerationRef.current += 1;
    setAssistantBusy(false);
    setAssistantMessageKind("info");
    setAssistantMessage(locale === "ar" ? "تم إلغاء انتظار الاقتراح." : "Suggestion cancelled.");
  }

  function insertAssistantIdea(force = false) {
    if (!assistantSuggestion || !assistantCaption.trim() || !assistantVisualDirection.trim()) return;
    const replacesCaption = activeCaption.trim().length > 0 && activeCaption.trim() !== assistantCaption.trim();
    const replacesVisual = imagePrompt.trim().length > 0 && imagePrompt.trim() !== assistantVisualDirection.trim();
    if (!force && (replacesCaption || replacesVisual)) {
      setAssistantReplacementWarning(true);
      return;
    }

    setActiveCaption(assistantCaption);
    setImagePrompt(assistantVisualDirection);
    setImageComposerOpen(true);
    setMediaLibraryOpen(false);
    setAssistantReplacementWarning(false);
    setAssistantMessageKind("success");
    setAssistantMessage(
      locale === "ar"
        ? "تمت إضافة النص والتوجيه البصري إلى الاستوديو. يمكنك تعديلهما أو بدء إنشاء الصورة."
        : "Caption and visual direction inserted into the studio. You can edit either one or start image generation."
    );
  }

  async function persistEditableDraft(showMessage = true, allowEmpty = false): Promise<ContentRecord | null> {
    if (!session) {
      setMessage("Sign in again before saving edits.");
      return null;
    }

    if (!editorOpen) {
      setMessage("Open or generate a draft before saving edits.");
      return null;
    }

    if (!canEdit) {
      if (showMessage) {
        setMessage(`This item is ${statusLabel(currentRecord?.status ?? "DRAFT").toLowerCase()} and cannot be edited in this state.`);
      }
      return currentRecord;
    }

    if (!currentRecord && !contentTypeConfirmed) {
      setMessage(locale === "ar" ? "اختر نوع المحتوى قبل حفظ المسودة." : "Choose a content type before saving this draft.");
      return null;
    }

    if (!currentRecord && !hasMeaningfulDraftWork && !allowEmpty) {
      setMessage(
        locale === "ar" ? "أضف نصاً أو وسوماً أو دعوة إلى إجراء قبل حفظ المسودة." : "Add a caption, hashtags, or call to action before saving this draft."
      );
      return null;
    }

    setSaving(true);

    try {
      const payload = contentDraftPayload(currentDraftFields);
      const updated = currentRecord
        ? await client.updateContent(currentRecord.id, {
            contentType: payload.contentType,
            brief: payload.brief,
            callToAction: payload.callToAction,
            campaignGoal: payload.campaignGoal,
            captionAr: payload.captionAr,
            captionEn: payload.captionEn,
            contentPillar: payload.contentPillar,
            hashtags: payload.hashtags,
            plannedAt: payload.plannedAt,
            tone: payload.tone
          })
        : await client.createContent(payload);
      upsertRecord(updated);
      applyRecord(
        updated,
        showMessage
          ? locale === "ar"
            ? "تم حفظ المسودة في مساحة العمل."
            : currentRecord
              ? "Edits saved to the workspace draft."
              : "Draft saved to the workspace."
          : undefined
      );
      return updated;
    } catch (error) {
      setMessage(contentStudioError(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function generateCampaignContent() {
    if (!session || !currentRecord?.campaignId) {
      setMessage(locale === "ar" ? "افتح فكرة محفوظة من حملة أولاً." : "Open a saved Campaign idea first.");
      return;
    }

    if (brief.trim().length < 3) {
      setMessage(locale === "ar" ? "أضف موضوعاً أو فكرة قبل الإنشاء." : "Add a topic or post idea before generating.");
      return;
    }

    setGenerating(true);
    setMessage(locale === "ar" ? "يحفظ MARKOS السياق ثم ينشئ المسودة..." : "MARKOS is saving the context and creating the draft...");

    try {
      const saved = await persistEditableDraft(false, true);
      if (!saved) return;
      const generated = await client.generateContentForItem(saved.id, { topic: brief.trim(), contentType });
      upsertRecord(generated);
      applyRecord(generated, locale === "ar" ? "تم إنشاء المسودة من سياق الحملة." : "Draft generated from the Campaign context.");
      setReviewingGenerated(true);
      setRevisionPrompt("");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setGenerating(false);
    }
  }

  async function reviseGeneratedContent() {
    const instruction = revisionPrompt.trim();

    if (!session || !currentRecord?.aiPromptUsed) {
      setMessage(locale === "ar" ? "أنشئ المحتوى قبل طلب المراجعة." : "Generate content before requesting a revision.");
      return;
    }

    if (instruction.length < 3) {
      setMessage(locale === "ar" ? "أضف توجيهاً واضحاً للمراجعة." : "Add a clear revision instruction.");
      return;
    }

    setRevising(true);
    setMessage(locale === "ar" ? "يراجع MARKOS المسودة مع الحفاظ على سياق الحملة..." : "MARKOS is revising the draft while preserving its Campaign context...");

    try {
      const revised = await client.reviseContentItem(currentRecord.id, { instruction });
      upsertRecord(revised);
      applyRecord(revised, locale === "ar" ? "تم تحديث المعاينة. يمكنك طلب تعديل آخر." : "Preview updated. You can request another revision.");
      setReviewingGenerated(true);
      setRevisionPrompt("");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setRevising(false);
    }
  }

  async function acceptDraft() {
    if (!session || !editorOpen) {
      setMessage("Open or generate a workspace draft before marking it ready.");
      return;
    }

    setApproving(true);

    try {
      const editableRecord = canEdit ? await persistEditableDraft(false) : currentRecord;
      if (!editableRecord) {
        return;
      }

      const approved = await approveContentRecord(client, editableRecord);
      upsertRecord(approved);
      applyRecord(approved, "Content marked Ready. It is now eligible for scheduling.");
      setReviewingGenerated(false);
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setApproving(false);
    }
  }

  async function scheduleDraft() {
    if (!session || !currentRecord) {
      setMessage("Generate or choose a workspace draft before scheduling.");
      return;
    }

    if (!canSchedule) {
      setMessage(
        currentRecord.status === "SCHEDULED"
          ? "This item is already scheduled. Cancel its schedule before choosing a different time."
          : "Mark this draft Ready before choosing its publishing time."
      );
      return;
    }

    setScheduling(true);

    try {
      const scheduledAt = toScheduleIso(scheduleDate, scheduleTime);
      const scheduled = await client.scheduleContent(currentRecord.id, scheduledAt);
      upsertRecord(scheduled);
      applyRecord(scheduled, `Scheduled for ${formatShortTime(scheduled.scheduledAt ?? scheduledAt)}.`);
      setSchedulePanelOpen(false);
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setScheduling(false);
    }
  }

  async function reopenForEditing() {
    if (!session || !currentRecord || currentRecord.status !== "APPROVED") {
      setMessage("Only Ready content can be reopened directly. Cancel a schedule first if this item is scheduled.");
      return;
    }

    setReopening(true);

    try {
      const draft = await client.updateContentStatus(currentRecord.id, "DRAFT");
      upsertRecord(draft);
      applyRecord(draft, "Ready state removed. The post is a draft again and its caption, hashtags, and media can be edited.");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setReopening(false);
    }
  }

  function requestCancelSchedule() {
    if (!session || !currentRecord || currentRecord.status !== "SCHEDULED") {
      setMessage("Choose a scheduled item before cancelling its publishing time.");
      return;
    }

    setConfirmation("cancel-schedule");
  }

  async function cancelSchedule() {
    if (!session || !currentRecord || currentRecord.status !== "SCHEDULED") {
      setMessage("Choose a scheduled item before cancelling its publishing time.");
      return;
    }

    setUnscheduling(true);

    try {
      const unscheduled = await client.unscheduleContent(currentRecord.id);
      upsertRecord(unscheduled);
      applyRecord(unscheduled, "Schedule cancelled. The item has returned to the Ready queue.");
      setConfirmation(null);
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setUnscheduling(false);
    }
  }

  function requestDeleteDraft() {
    if (!session || !currentRecord) {
      setMessage("Choose a saved post draft before deleting it.");
      return;
    }

    if (currentRecord.status === "SCHEDULED") {
      setMessage("Cancel this post's schedule first. Once it returns to Ready, you can delete it separately.");
      return;
    }

    if (currentRecord.status === "PUBLISHED") {
      setMessage("This action deletes MarkOS drafts; it does not remove an already-published Instagram post.");
      return;
    }

    setConfirmation("delete-draft");
  }

  async function deleteDraft() {
    if (!session || !currentRecord || !canDelete) {
      setMessage("Choose a deletable post draft first.");
      return;
    }

    setDeleting(true);

    try {
      const deletedId = currentRecord.id;
      await client.deleteContent(deletedId);
      const remainingRecords = records.filter((record) => record.id !== deletedId);
      setRecords(remainingRecords);
      returnToCreateHome("Post draft deleted from MarkOS. Its media files remain in the workspace media library.");
      setConfirmation(null);
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setDeleting(false);
    }
  }

  async function uploadImage(event: ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = "";

    if (!file) return;

    await uploadImageFile(file);
  }

  async function uploadImageFile(file: File) {
    if (!session) {
      setMessage("Sign in again before uploading an image.");
      return;
    }

    if (!contentTypeConfirmed) {
      setMessage(locale === "ar" ? "اختر نوع المحتوى قبل إضافة الوسائط." : "Choose a content type before adding media.");
      return;
    }

    if (currentRecord && !canManageMedia) {
      setMessage(`Media cannot be changed while this item is ${statusLabel(currentRecord.status).toLowerCase()}.`);
      return;
    }

    if (file.type.toLowerCase() !== "image/jpeg" || !/\.jpe?g$/i.test(file.name)) {
      setMessage("Choose a JPEG (.jpg or .jpeg). The controlled Instagram publishing path does not accept PNG, SVG, or renamed files.");
      return;
    }

    if (file.size <= 0 || file.size > instagramImageConstraints.maxSizeBytes) {
      setMessage("Choose a non-empty JPEG no larger than 8 MB.");
      return;
    }

    setUploading(true);
    setMessage("Reading the JPEG and uploading it through the workspace API...");
    let uploadedAsset: MediaAssetRecord | null = null;

    try {
      const editableRecord = canEdit ? await persistEditableDraft(false, true) : currentRecord;
      if (!editableRecord) return;

      const [{ height, width }, base64Data] = await Promise.all([imageDimensions(file), fileAsBase64(file)]);
      const dimensionsError = instagramImageDimensionsError(width, height);

      if (dimensionsError) {
        throw new Error(dimensionsError);
      }

      uploadedAsset = await client.uploadMedia({
        base64Data,
        filename: file.name,
        height,
        mimeType: file.type,
        type: "IMAGE",
        width
      });
      const attached = await client.attachMediaToContent(editableRecord.id, uploadedAsset.id);
      upsertMediaAsset(uploadedAsset);
      upsertRecord(attached);
      setSelectedMediaId(uploadedAsset.id);
      applyRecord(attached, `${file.name} uploaded and attached to this workspace draft.`);
      setSelectedMediaId(uploadedAsset.id);
    } catch (error) {
      if (uploadedAsset) {
        try {
          await client.deleteMediaAsset(uploadedAsset.id);
        } catch {
          // The upload may have attached successfully before a later response failed. Preserve it for safe operator review.
        }
      }
      setMessage(contentStudioError(error));
    } finally {
      setUploading(false);
    }
  }

  async function attachExistingMedia(mediaAsset: MediaAssetRecord) {
    if (!session) {
      setMessage("Sign in again before choosing an item from the Media Library.");
      return;
    }

    if (!contentTypeConfirmed) {
      setMessage(locale === "ar" ? "اختر نوع المحتوى قبل إضافة الوسائط." : "Choose a content type before adding media.");
      return;
    }

    if (currentRecord && !canManageMedia) {
      setMessage(`Media cannot be changed while this item is ${statusLabel(currentRecord.status).toLowerCase()}.`);
      return;
    }

    setUploading(true);

    try {
      const editableRecord = canEdit ? await persistEditableDraft(false, true) : currentRecord;
      if (!editableRecord) return;
      const attached = await client.attachMediaToContent(editableRecord.id, mediaAsset.id);
      upsertRecord(attached);
      applyRecord(attached, `${mediaAsset.filename} attached from the Media Library.`);
      setSelectedMediaId(mediaAsset.id);
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setUploading(false);
    }
  }

  async function generateImage() {
    if (!session) {
      setMessage("Sign in again before creating an image.");
      return;
    }

    if (!contentTypeConfirmed) {
      setMessage(locale === "ar" ? "اختر نوع المحتوى قبل إنشاء صورة." : "Choose a content type before generating an image.");
      return;
    }

    if (currentRecord && !canManageMedia) {
      setMessage(`Media cannot be changed while this item is ${statusLabel(currentRecord.status).toLowerCase()}.`);
      return;
    }

    setGeneratingImage(true);
    setMessage("MARKOS is generating and saving a publish-ready JPEG. This can take up to two minutes...");

    try {
      const editableRecord = canEdit ? await persistEditableDraft(false, true) : currentRecord;
      if (!editableRecord) return;
      const trimmedImagePrompt = imagePrompt.trim();
      const generated = await client.generateContentImage(editableRecord.id, {
        aspectRatio: imageAspectRatio,
        ...(trimmedImagePrompt ? { prompt: trimmedImagePrompt } : {})
      });
      upsertMediaAsset(generated.mediaAsset);
      upsertRecord(generated.contentItem);
      applyRecord(generated.contentItem, "AI image generated, saved, and attached to this draft.");
      setSelectedMediaId(generated.mediaAsset.id);
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setGeneratingImage(false);
    }
  }

  async function removeSelectedMedia() {
    if (!session || !currentRecord || !selectedMedia) {
      setMessage("Choose an attached image before removing it from this draft.");
      return;
    }

    if (!canManageMedia) {
      setMessage(`Media cannot be changed while this item is ${statusLabel(currentRecord.status).toLowerCase()}.`);
      return;
    }

    setRemovingMedia(true);

    try {
      const updated = await client.detachMediaFromContent(currentRecord.id, selectedMedia.id);
      upsertRecord(updated);
      applyRecord(updated, "Image removed from this draft. The asset remains safely available in the workspace media library.");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setRemovingMedia(false);
    }
  }

  async function copyCaption() {
    const text = [captionEn, captionAr, callToAction, hashtagsText].filter(Boolean).join("\n\n");

    if (!text.trim()) {
      setMessage("There is no generated content to copy yet.");
      return;
    }

    await navigator.clipboard.writeText(text);
    setMessage("Caption copied.");
  }

  async function shareCaption() {
    const text = [captionEn, captionAr, callToAction, hashtagsText].filter(Boolean).join("\n\n");

    if (!text.trim()) {
      setMessage("There is no generated content to share yet.");
      return;
    }

    if ("share" in navigator) {
      await navigator.share({ text, title: "MARKOS AI content draft" });
      setMessage("Draft shared.");
      return;
    }

    await copyCaption();
  }

  return (
    <section className={`min-w-0 ${editorOpen ? "grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(380px,460px)] xl:gap-6" : ""}`}>
      <div
        aria-label={editorOpen ? (locale === "ar" ? "محرر المنشور" : "Post composer") : undefined}
        className={
          editorOpen
            ? "sunlit-create-editor-frame sunlit-panel flex min-w-0 flex-col overflow-hidden rounded-[1.75rem] xl:h-[calc(100vh-4.5rem)]"
            : "min-w-0 space-y-6"
        }
        role={editorOpen ? "region" : undefined}
      >
        <section
          className={editorOpen ? "border-b border-[var(--sunlit-line)] px-5 py-4 sm:px-6" : "flex flex-col gap-5 sm:flex-row sm:items-end sm:justify-between"}
        >
          {editorOpen ? (
            <div className="flex flex-wrap items-center justify-between gap-4">
              <div className="min-w-0">
                <h1 className="truncate font-display text-xl font-bold tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-2xl">
                  {locale === "ar" ? "منشور إنستغرام جديد" : "New Instagram post"}
                </h1>
                <p className="mt-1 text-sm font-semibold text-[var(--sunlit-muted)]">
                  {currentRecord?.campaignId
                    ? campaignOriginLabel(currentRecord, locale)
                    : locale === "ar"
                      ? "أنشئ المنشور أولاً. يبقى النشر قراراً منفصلاً."
                      : "Compose the post first. Publishing remains a separate decision."}
                </p>
              </div>
              <button
                className="sunlit-secondary inline-flex min-h-11 shrink-0 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"
                onClick={() =>
                  requestReturnToCreateHome(locale === "ar" ? "تم حفظ العمل المؤكد في مساحة العمل." : "Your confirmed changes remain saved in the workspace.")
                }
                type="button"
              >
                <ArrowRight className={locale === "ar" ? "" : "rotate-180"} size={17} />
                {locale === "ar" ? "العودة" : "Back to Create"}
              </button>
            </div>
          ) : (
            <div>
              <p className="sunlit-eyebrow">{studioHomeCopy.eyebrow}</p>
              <h1 className="mt-2 max-w-4xl font-display text-4xl font-bold tracking-[-.045em] text-[var(--sunlit-ink)] sm:text-5xl">
                {locale === "ar" ? "كيف تريد أن تبدأ؟" : "How would you like to begin?"}
              </h1>
              <p className="mt-3 max-w-3xl text-base leading-7 text-[var(--sunlit-muted)] sm:text-lg">
                {locale === "ar" ? "أنشئ مع MARKOS أو استكشف فكرة أولاً." : "Create with MARKOS, or explore an idea first."}
              </p>
            </div>
          )}
        </section>
        {message ? (
          <article className={editorOpen ? "mx-5 mt-4 rounded-xl bg-[var(--sunlit-paper-deep)] px-4 py-3" : "sunlit-panel-soft rounded-2xl p-5"}>
            <p className="text-sm font-bold leading-6 text-[var(--sunlit-ink-soft)]">{message}</p>
          </article>
        ) : null}

        {!editorOpen ? (
          <div className="grid gap-5 lg:grid-cols-2">
            <StudioHomeAction
              active={false}
              cta={studioHomeCopy.blankAction}
              description={studioHomeCopy.blankDescription}
              icon={Pencil}
              label={studioHomeCopy.blankAction}
              onClick={() => openStudio("manual")}
              tone="coral"
            />
            <StudioHomeAction
              active={false}
              cta={studioHomeCopy.aiAction}
              description={studioHomeCopy.aiDescription}
              icon={MarkosAiIcon}
              label={studioHomeCopy.aiAction}
              onClick={() => openStudio("ai")}
              tone="aqua"
            />
          </div>
        ) : null}

        {editorOpen && reviewingGenerated && currentRecord ? (
          <div className="sunlit-card-scroll min-h-0 flex-1 space-y-5 overflow-y-auto px-5 py-5 sm:px-6">
            <section className="rounded-[1.5rem] border border-[rgb(33_191_174_/_28%)] bg-[linear-gradient(145deg,var(--sunlit-aqua-soft),white)] p-5 sm:p-6">
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="max-w-3xl">
                  <p className="sunlit-eyebrow">{locale === "ar" ? "مراجعة المسودة" : "Review generated content"}</p>
                  <h2 className="mt-2 text-2xl font-bold tracking-[-.025em] text-[var(--sunlit-ink)]">
                    {locale === "ar" ? "راجع المحتوى قبل اعتماده" : "Make sure this feels right before it moves forward"}
                  </h2>
                  <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">
                    {locale === "ar"
                      ? "يمكنك طلب تعديلات متتالية من MARKOS، أو الانتقال إلى التحرير اليدوي والوسائط."
                      : "Ask MARKOS for another revision, or continue into manual editing and media when the direction is right."}
                  </p>
                </div>
                <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-2 text-xs font-extrabold text-[var(--sunlit-ink-soft)] shadow-sm">
                  <CheckCircle2 className="text-[var(--sunlit-aqua)]" size={16} /> {locale === "ar" ? "مسودة محفوظة" : "Saved draft"}
                </span>
              </div>

              <div className="mt-5 flex flex-wrap gap-2">
                <span className="inline-flex items-center gap-2 rounded-full border border-[var(--sunlit-line)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                  <Instagram size={15} /> Instagram
                </span>
                <span className="rounded-full border border-[var(--sunlit-line)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                  {localizedContentTypeLabel(currentRecord.contentType, locale)}
                </span>
                {currentRecord.plannedAt ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--sunlit-line)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                    <Calendar size={15} /> {new Date(currentRecord.plannedAt).toLocaleDateString(locale === "ar" ? "ar-BH" : "en-GB")}
                  </span>
                ) : null}
                {campaignContext ? (
                  <span className="inline-flex items-center gap-2 rounded-full border border-[var(--sunlit-line)] bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                    <Target size={15} /> {campaignContext.title}
                  </span>
                ) : null}
              </div>
            </section>

            <section className="grid gap-4 xl:grid-cols-2">
              <article className="rounded-[1.5rem] border border-[var(--sunlit-line)] bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-[var(--sunlit-ink)]">English</h3>
                  <span className="text-xs font-bold text-[var(--sunlit-muted)]">{captionEn.length} / 2,200</span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-[var(--sunlit-ink-soft)]" dir="ltr">
                  {captionEn}
                </p>
              </article>
              <article className="rounded-[1.5rem] border border-[var(--sunlit-line)] bg-white p-5 sm:p-6">
                <div className="flex items-center justify-between gap-3">
                  <h3 className="font-bold text-[var(--sunlit-ink)]">العربية</h3>
                  <span className="text-xs font-bold text-[var(--sunlit-muted)]">{captionAr.length} / 2,200</span>
                </div>
                <p className="mt-4 whitespace-pre-wrap text-base leading-7 text-[var(--sunlit-ink-soft)]" dir="rtl">
                  {captionAr}
                </p>
              </article>
            </section>

            <section className="grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(16rem,.45fr)]">
              <article className="rounded-[1.5rem] border border-[var(--sunlit-line)] bg-white p-5 sm:p-6">
                <p className="text-sm font-extrabold text-[var(--sunlit-ink)]">{locale === "ar" ? "تفاصيل المنشور" : "Post details"}</p>
                <div className="mt-4 space-y-3 text-sm leading-6 text-[var(--sunlit-ink-soft)]">
                  <p>
                    <strong>{locale === "ar" ? "الدعوة إلى الإجراء: " : "Call to action: "}</strong>
                    {callToAction}
                  </p>
                  <p className="break-words text-[var(--sunlit-muted)]">{hashtagsText}</p>
                  {currentRecord.campaignGoal ? (
                    <p>
                      <strong>{locale === "ar" ? "هدف المنشور: " : "Post objective: "}</strong>
                      {currentRecord.campaignGoal}
                    </p>
                  ) : null}
                  {campaignContext ? (
                    <details className="rounded-xl bg-[var(--sunlit-paper)] px-4 py-3">
                      <summary className="cursor-pointer font-extrabold text-[var(--sunlit-ink)]">
                        {locale === "ar" ? "سياق الحملة الأصلي" : "Original Campaign context"}
                      </summary>
                      <p className="mt-3 text-[var(--sunlit-muted)]">{campaignContext.content.summary}</p>
                    </details>
                  ) : null}
                </div>
              </article>

              <article className="rounded-[1.5rem] border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-5 sm:p-6">
                <div className="flex items-center gap-3">
                  <span className="grid h-10 w-10 place-items-center rounded-xl bg-white text-[var(--sunlit-pink)]">
                    <MessageCircle size={18} />
                  </span>
                  <div>
                    <h3 className="font-bold text-[var(--sunlit-ink)]">{locale === "ar" ? "راجع مع MARKOS" : "Revise with MarkOS"}</h3>
                    <p className="mt-1 text-xs leading-5 text-[var(--sunlit-muted)]">
                      {locale === "ar" ? "تعليمات واحدة واضحة في كل مرة." : "Give one clear instruction at a time."}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {(locale === "ar"
                    ? ["اجعله أقصر", "استخدم نبرة أكثر مهنية", "أضف دعوة أقوى", "أعد كتابته بالعربية"]
                    : ["Make it shorter", "Use a more professional tone", "Add a stronger call to action", "Rewrite it in Arabic"]
                  ).map((suggestion) => (
                    <button
                      className="rounded-full border border-[var(--sunlit-line)] bg-white px-3 py-1.5 text-xs font-bold text-[var(--sunlit-ink-soft)] transition hover:border-[var(--sunlit-line-strong)]"
                      key={suggestion}
                      onClick={() => setRevisionPrompt(suggestion)}
                      type="button"
                    >
                      {suggestion}
                    </button>
                  ))}
                </div>
                <textarea
                  className="sunlit-field mt-4 min-h-28 resize-none rounded-xl p-4 text-sm leading-6 outline-none"
                  disabled={revising}
                  maxLength={1000}
                  onChange={(event) => setRevisionPrompt(event.target.value)}
                  placeholder={locale === "ar" ? "مثال: اجعله أقصر وأضف دعوة أوضح." : "For example: Make it shorter and add a clearer call to action."}
                  value={revisionPrompt}
                />
                <button
                  className="sunlit-primary mt-3 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={revising || revisionPrompt.trim().length < 3}
                  onClick={() => void reviseGeneratedContent()}
                  type="button"
                >
                  {revising ? <RefreshCcw className="animate-spin" size={17} /> : <Wand2 size={17} />}
                  {revising ? (locale === "ar" ? "جارٍ تطبيق التعديلات..." : "Applying changes...") : locale === "ar" ? "راجع مع MARKOS" : "Revise with MarkOS"}
                </button>
              </article>
            </section>

            <div className="flex flex-wrap justify-end gap-3 pb-1">
              <button
                className="sunlit-secondary min-h-12 rounded-xl px-6 text-sm font-extrabold"
                disabled={revising || approving}
                onClick={() => setReviewingGenerated(false)}
                type="button"
              >
                {locale === "ar" ? "متابعة التحرير والوسائط" : "Continue editing and media"}
              </button>
              <button
                className="sunlit-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-55"
                disabled={revising || approving}
                onClick={() => void acceptDraft()}
                type="button"
              >
                <CheckCircle2 size={18} />{" "}
                {approving ? (locale === "ar" ? "جارٍ الاعتماد..." : "Marking ready...") : locale === "ar" ? "اعتماد كجاهز" : "Mark as ready"}
              </button>
            </div>
          </div>
        ) : null}

        {editorOpen && !reviewingGenerated ? (
          <div className="sunlit-card-scroll min-h-0 flex-1 space-y-6 overflow-y-auto px-5 py-5 sm:px-6">
            {currentRecord && !canEdit ? (
              <article className="sunlit-panel-soft flex flex-wrap items-center justify-between gap-4 rounded-2xl p-5">
                <div>
                  <p className="font-extrabold text-[var(--sunlit-ink)]">
                    {currentRecord.status === "APPROVED"
                      ? "Ready content is locked against accidental changes."
                      : currentRecord.status === "SCHEDULED"
                        ? "Cancel the schedule before editing or deleting this post."
                        : "This post is locked in its current state."}
                  </p>
                  <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">
                    {currentRecord.status === "APPROVED"
                      ? "Reopening it removes the Ready state and returns the post to Draft."
                      : "MARKOS keeps readiness, scheduling, and content changes as explicit separate actions."}
                  </p>
                </div>
                {currentRecord.status === "APPROVED" ? (
                  <button
                    className="sunlit-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={reopening}
                    onClick={() => void reopenForEditing()}
                    type="button"
                  >
                    <Pencil size={17} /> {reopening ? "Reopening..." : "Edit post"}
                  </button>
                ) : null}
              </article>
            ) : null}

            {currentRecord?.campaignId ? (
              <section className="rounded-[1.5rem] border border-[rgb(33_191_174_/_30%)] bg-[linear-gradient(145deg,var(--sunlit-aqua-soft),white)] p-5 sm:p-6">
                <div className="flex flex-wrap items-start justify-between gap-4">
                  <div>
                    <p className="sunlit-eyebrow">{locale === "ar" ? "نقطة بداية من الحملة" : "Campaign starting point"}</p>
                    <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]">
                      {campaignContext?.title ?? (locale === "ar" ? "فكرة محتوى مرتبطة بحملة" : "Campaign-linked content idea")}
                    </h2>
                    <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">
                      {locale === "ar"
                        ? "راجع ما نقله MARKOS من الحملة وعدّله قبل إنشاء المحتوى."
                        : "Review what MARKOS transferred from the Campaign and adjust it before generation."}
                    </p>
                  </div>
                  <span className="inline-flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                    <Instagram size={15} /> Instagram
                  </span>
                </div>

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)] lg:col-span-2">
                    {locale === "ar" ? "الموضوع أو فكرة المنشور" : "Topic or post idea"}
                    <textarea
                      className="sunlit-field min-h-24 resize-none rounded-xl p-4 text-base font-normal leading-7 outline-none"
                      disabled={!canEdit}
                      maxLength={1000}
                      onChange={(event) => setBrief(event.target.value)}
                      value={brief}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                    {locale === "ar" ? "هدف المنشور" : "Post objective"}
                    <input
                      className="sunlit-field h-12 rounded-xl px-4 text-base font-normal outline-none"
                      disabled={!canEdit}
                      maxLength={500}
                      onChange={(event) => setCampaignGoal(event.target.value)}
                      value={campaignGoal}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                    {locale === "ar" ? "ركيزة المحتوى" : "Content pillar"}
                    <input
                      className="sunlit-field h-12 rounded-xl px-4 text-base font-normal outline-none"
                      disabled={!canEdit}
                      maxLength={160}
                      onChange={(event) => setContentPillar(event.target.value)}
                      value={contentPillar}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                    {locale === "ar" ? "نبرة الصوت" : "Tone"}
                    <input
                      className="sunlit-field h-12 rounded-xl px-4 text-base font-normal outline-none"
                      disabled={!canEdit}
                      maxLength={200}
                      onChange={(event) => setTone(event.target.value)}
                      placeholder={locale === "ar" ? "مثال: ودود، واثق" : "For example: friendly, confident"}
                      value={tone}
                    />
                  </label>
                  <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                    {locale === "ar" ? "التاريخ المخطط" : "Planned date"}
                    <input
                      className="sunlit-field h-12 rounded-xl px-4 text-base font-normal outline-none"
                      disabled={!canEdit}
                      onChange={(event) => setPlannedAtInput(event.target.value ? `${event.target.value}T${plannedAtInput.slice(11) || "12:00"}` : "")}
                      type="date"
                      value={plannedAtInput.slice(0, 10)}
                    />
                  </label>
                </div>

                {campaignContext ? (
                  <details className="mt-4 rounded-xl border border-[var(--sunlit-line)] bg-white/80 px-4 py-3">
                    <summary className="cursor-pointer text-sm font-extrabold text-[var(--sunlit-ink-soft)]">
                      {locale === "ar" ? "سياق الحملة" : "Campaign context"}
                    </summary>
                    <p className="mt-3 text-sm leading-6 text-[var(--sunlit-muted)]">{campaignContext.content.summary}</p>
                    {campaignContext.objective ? (
                      <p className="mt-2 text-sm font-bold text-[var(--sunlit-ink-soft)]">
                        {locale === "ar" ? "الهدف العام: " : "Campaign objective: "}
                        {campaignContext.objective}
                      </p>
                    ) : null}
                  </details>
                ) : null}

                <button
                  className="sunlit-primary mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-6 text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-55"
                  disabled={!canEdit || generating || brief.trim().length < 3}
                  onClick={() => void generateCampaignContent()}
                  type="button"
                >
                  {generating ? <RefreshCcw className="animate-spin" size={19} /> : <Wand2 size={19} />}
                  {generating
                    ? locale === "ar"
                      ? "جارٍ إنشاء المسودة..."
                      : "Creating draft..."
                    : locale === "ar"
                      ? "أنشئ باستخدام MARKOS"
                      : "Generate with MarkOS"}
                </button>
              </section>
            ) : null}

            <ContentTypeStep
              expanded={!contentTypeConfirmed}
              locale={locale}
              locked={currentRecord !== null && currentRecord.campaignId === undefined}
              onChangeRequest={() => setContentTypeConfirmed(false)}
              onSelect={(value) => {
                setContentType(value);
                setContentTypeConfirmed(true);
              }}
              value={contentType}
            />

            <section>
              <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[var(--sunlit-ink)]">{locale === "ar" ? "2 · الوسائط" : "2 · Media"}</h2>
                  <p className="mt-1 text-sm text-[var(--sunlit-muted)]">
                    {locale === "ar" ? "أضف أو أنشئ وسائط للمنشور." : "Add or generate media for your post."}
                  </p>
                </div>
                {attachedMediaAssets.length > 0 ? (
                  <span className="rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                    {attachedMediaAssets.length} {locale === "ar" ? "مرفق" : "attached"}
                  </span>
                ) : null}
              </div>

              {selectedMedia ? (
                <div className="mb-3 flex flex-wrap items-center justify-between gap-4 rounded-2xl border border-[var(--sunlit-line)] bg-white px-4 py-3">
                  <div className="flex min-w-0 items-center gap-3">
                    <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-coral-soft)] text-[var(--sunlit-pink)]">
                      <ImageIcon size={18} />
                    </span>
                    <div className="min-w-0">
                      <p className="truncate text-sm font-extrabold text-[var(--sunlit-ink)]">{selectedMedia.filename}</p>
                      <p className="mt-0.5 text-xs text-[var(--sunlit-muted)]">
                        {selectedMedia.width && selectedMedia.height ? `${selectedMedia.width} × ${selectedMedia.height} · ` : ""}
                        {formatFileSize(selectedMedia.sizeBytes)}
                      </p>
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    <a
                      className="sunlit-secondary inline-flex min-h-10 items-center gap-2 rounded-xl px-4 text-sm font-extrabold"
                      href={selectedMedia.publicUrl}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <ExternalLink size={16} /> {locale === "ar" ? "فتح" : "Open"}
                    </a>
                    <button
                      className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[rgb(217_63_122_/_28%)] bg-white px-4 text-sm font-extrabold text-[var(--sunlit-pink)] disabled:opacity-50"
                      disabled={!canManageMedia || removingMedia}
                      onClick={() => void removeSelectedMedia()}
                      type="button"
                    >
                      <Trash2 size={16} /> {removingMedia ? "Removing..." : locale === "ar" ? "إزالة" : "Remove"}
                    </button>
                  </div>
                </div>
              ) : null}

              <label
                className="grid min-h-28 cursor-pointer place-items-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-white px-5 py-5 text-center transition hover:border-[var(--sunlit-aqua)] has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-55"
                onDragOver={(event) => event.preventDefault()}
                onDrop={(event) => {
                  event.preventDefault();
                  const file = event.dataTransfer.files[0];
                  if (file) void uploadImageFile(file);
                }}
              >
                <span>
                  <span className="mx-auto grid h-10 w-10 place-items-center rounded-full bg-[var(--sunlit-paper-deep)] text-[#316A9B]">
                    <Upload size={19} />
                  </span>
                  <strong className="mt-2 block text-sm text-[var(--sunlit-ink)]">
                    {uploading ? "Uploading…" : locale === "ar" ? "اسحب صورة JPEG هنا أو اخترها من جهازك" : "Drag and drop a JPEG here or browse your device"}
                  </strong>
                  <small className="mt-1 block text-xs font-semibold text-[var(--sunlit-muted)]">
                    {contentTypeConfirmed
                      ? "JPEG · up to 8 MB · 320–1,440 px wide"
                      : locale === "ar"
                        ? "اختر نوع المحتوى أولاً"
                        : "Choose a content type first"}
                  </small>
                </span>
                <input
                  accept=".jpg,.jpeg,image/jpeg"
                  aria-label="Upload JPEG"
                  className="sr-only"
                  disabled={!contentTypeConfirmed || (currentRecord !== null && !canManageMedia) || uploading}
                  onChange={(event) => void uploadImage(event)}
                  type="file"
                />
              </label>

              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <button
                  aria-expanded={imageComposerOpen}
                  className="sunlit-secondary flex min-h-14 items-center gap-3 rounded-2xl px-4 text-start disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!contentTypeConfirmed || (currentRecord !== null && !canManageMedia)}
                  onClick={() => {
                    setImageComposerOpen((value) => !value);
                    setMediaLibraryOpen(false);
                  }}
                  type="button"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--sunlit-paper-deep)] text-[#316A9B]">
                    <Wand2 size={17} />
                  </span>
                  <span>
                    <strong className="block text-sm">{locale === "ar" ? "إنشاء صورة" : "Generate image"}</strong>
                    <small className="block text-xs font-semibold text-[var(--sunlit-muted)]">
                      {locale === "ar" ? "أنشئ باستخدام MARKOS AI" : "Create with MARKOS AI"}
                    </small>
                  </span>
                </button>
                <button
                  aria-expanded={mediaLibraryOpen}
                  className="sunlit-secondary flex min-h-14 items-center gap-3 rounded-2xl px-4 text-start disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!contentTypeConfirmed || (currentRecord !== null && !canManageMedia) || mediaAssets.length === 0}
                  onClick={() => {
                    setMediaLibraryOpen((value) => !value);
                    setImageComposerOpen(false);
                  }}
                  type="button"
                >
                  <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-[var(--sunlit-paper-deep)] text-[#316A9B]">
                    <ImageIcon size={17} />
                  </span>
                  <span>
                    <strong className="block text-sm">{locale === "ar" ? "مكتبة الوسائط" : "Media Library"}</strong>
                    <small className="block text-xs font-semibold text-[var(--sunlit-muted)]">
                      {mediaAssets.length > 0
                        ? locale === "ar"
                          ? "اختر من ملفاتك"
                          : "Choose from your assets"
                        : locale === "ar"
                          ? "لا توجد وسائط محفوظة"
                          : "No saved assets yet"}
                    </small>
                  </span>
                </button>
              </div>

              {imageComposerOpen ? (
                <div className="mt-3 grid gap-3 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper-deep)] p-4 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:items-end">
                  <label className="grid gap-2 text-xs font-extrabold text-[var(--sunlit-ink)]">
                    {locale === "ar" ? "توجيه بصري اختياري" : "Optional visual direction"}
                    <input
                      className="sunlit-field h-11 rounded-xl px-3 text-sm font-normal outline-none"
                      onChange={(event) => setImagePrompt(event.target.value)}
                      value={imagePrompt}
                    />
                  </label>
                  <select
                    aria-label="Image aspect ratio"
                    className="sunlit-field h-11 rounded-xl px-3 text-sm font-bold outline-none"
                    onChange={(event) => setImageAspectRatio(event.target.value as "1:1" | "4:5" | "9:16")}
                    value={imageAspectRatio}
                  >
                    <option value="1:1">Square · 1:1</option>
                    <option value="4:5">Portrait · 4:5</option>
                    {contentType === "POST" ? null : <option value="9:16">Vertical · 9:16</option>}
                  </select>
                  <button
                    className="sunlit-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
                    disabled={generatingImage}
                    onClick={() => void generateImage()}
                    type="button"
                  >
                    <Wand2 size={17} /> {generatingImage ? "Generating…" : locale === "ar" ? "إنشاء" : "Generate"}
                  </button>
                </div>
              ) : null}

              {mediaLibraryOpen ? (
                <div className="mt-3 grid max-h-48 gap-2 overflow-y-auto rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper-deep)] p-3 sm:grid-cols-2">
                  {mediaAssets.map((asset) => {
                    const attached = currentRecord?.mediaIds.includes(asset.id) ?? false;
                    return (
                      <button
                        className="flex min-w-0 items-center gap-3 rounded-xl border border-[var(--sunlit-line)] bg-white px-3 py-3 text-start disabled:opacity-50"
                        disabled={attached || uploading}
                        key={asset.id}
                        onClick={() => void attachExistingMedia(asset)}
                        type="button"
                      >
                        <ImageIcon className="shrink-0 text-[#316A9B]" size={17} />
                        <span className="min-w-0">
                          <strong className="block truncate text-sm text-[var(--sunlit-ink)]">{asset.filename}</strong>
                          <small className="block text-xs font-semibold text-[var(--sunlit-muted)]">
                            {attached ? "Attached" : formatFileSize(asset.sizeBytes)}
                          </small>
                        </span>
                      </button>
                    );
                  })}
                </div>
              ) : null}

              {attachedMediaAssets.length > 1 ? (
                <div className="mt-3 flex gap-2 overflow-x-auto pb-1">
                  {attachedMediaAssets.map((asset) => (
                    <button
                      className={
                        selectedMedia?.id === asset.id
                          ? "max-w-56 shrink-0 truncate rounded-full border border-[var(--sunlit-pink)] bg-white px-4 py-2 text-xs font-extrabold text-[var(--sunlit-pink)]"
                          : "max-w-56 shrink-0 truncate rounded-full border border-[var(--sunlit-line)] bg-white px-4 py-2 text-xs font-bold text-[var(--sunlit-ink-soft)]"
                      }
                      key={asset.id}
                      onClick={() => setSelectedMediaId(asset.id)}
                      type="button"
                    >
                      {asset.filename}
                    </button>
                  ))}
                </div>
              ) : null}
            </section>

            <section>
              <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
                <div>
                  <h2 className="text-xl font-bold text-[var(--sunlit-ink)]">{locale === "ar" ? "3 · النص" : "3 · Caption"}</h2>
                  <p className="mt-1 text-sm text-[var(--sunlit-muted)]">
                    {locale === "ar" ? "اكتب باللغة التي سيظهر بها المنشور." : "Write in the language your audience will see."}
                  </p>
                </div>
                <div className="flex flex-wrap gap-2" role="group" aria-label="Caption language">
                  {(
                    [
                      ["en", "English"],
                      ["ar", "العربية"]
                    ] as const
                  ).map(([value, label]) => (
                    <button
                      className={
                        captionLanguage === value
                          ? "rounded-full bg-[var(--sunlit-ink)] px-4 py-2 text-sm font-extrabold text-white"
                          : "rounded-full border border-[var(--sunlit-line)] bg-white px-4 py-2 text-sm font-bold text-[var(--sunlit-ink-soft)]"
                      }
                      key={value}
                      onClick={() => setCaptionLanguage(value)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              </div>
              <article className="rounded-[1.5rem] border border-[var(--sunlit-line)] bg-white p-5 xl:p-6">
                <textarea
                  className="min-h-44 w-full resize-none border-0 bg-transparent text-lg leading-relaxed text-[var(--sunlit-ink)] outline-none placeholder:text-[var(--sunlit-muted)]"
                  dir={captionLanguage === "ar" ? "rtl" : "ltr"}
                  disabled={!canEdit}
                  maxLength={2200}
                  onChange={(event) => setActiveCaption(event.target.value)}
                  placeholder={locale === "ar" ? "اكتب النص العربي لهذا المنشور." : "Write the caption in your own words…"}
                  value={activeCaption}
                />
                <div className="mt-5 flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sunlit-line)] pt-4 text-xs font-semibold text-[var(--sunlit-muted)]">
                  <span>{locale === "ar" ? "لن تستبدل اقتراحات MARKOS نصك تلقائياً." : "MARKOS suggestions never replace your text automatically."}</span>
                  <span dir="ltr">{activeCaption.length} / 2,200</span>
                </div>
              </article>
            </section>

            <details className="group rounded-[1.5rem] border border-[var(--sunlit-line)] bg-white">
              <summary className="flex min-h-16 cursor-pointer list-none items-center justify-between gap-4 px-5 py-4 font-extrabold text-[var(--sunlit-ink)] marker:content-none xl:px-6">
                <span>{locale === "ar" ? "تفاصيل إنستغرام" : "Instagram details"}</span>
                <span className="inline-flex items-center gap-2 text-sm text-[var(--sunlit-muted)]">
                  {locale === "ar" ? "اختياري" : "Optional"}
                  <ChevronDown className="transition group-open:rotate-180" size={18} />
                </span>
              </summary>
              <div className="grid gap-5 border-t border-[var(--sunlit-line)] px-5 py-5 xl:grid-cols-2 xl:px-6">
                <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                  {locale === "ar" ? "الوسوم" : "Hashtags"}
                  <textarea
                    className="sunlit-field min-h-28 resize-none rounded-xl p-4 text-base font-normal leading-7 outline-none"
                    disabled={!canEdit}
                    onChange={(event) => setHashtagsText(event.target.value)}
                    placeholder="#Generated #Hashtags"
                    value={hashtagsText}
                  />
                </label>
                <label className="grid content-start gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                  {locale === "ar" ? "الدعوة إلى الإجراء" : "Call to action"}
                  <input
                    className="sunlit-field h-12 rounded-xl px-4 text-base font-normal outline-none"
                    disabled={!canEdit}
                    onChange={(event) => setCallToAction(event.target.value)}
                    placeholder={locale === "ar" ? "مثال: أرسل لنا رسالة لمعرفة المزيد" : "Example: Send us a message to learn more"}
                    value={callToAction}
                  />
                </label>
              </div>
            </details>

            <details className="group rounded-2xl border border-[var(--sunlit-line)] bg-white/70">
              <summary className="flex min-h-14 cursor-pointer list-none items-center justify-between gap-4 px-5 py-3 text-sm font-extrabold text-[var(--sunlit-ink-soft)] marker:content-none">
                <span>{locale === "ar" ? "المزيد من الإجراءات" : "More actions"}</span>
                <ChevronDown className="transition group-open:rotate-180" size={17} />
              </summary>
              <div className="flex flex-wrap gap-3 border-t border-[var(--sunlit-line)] px-5 py-4">
                <button
                  className="sunlit-secondary min-h-10 rounded-xl px-4 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!hasMeaningfulDraftWork}
                  onClick={() => void copyCaption()}
                  type="button"
                >
                  {locale === "ar" ? "نسخ النص" : "Copy caption"}
                </button>
                <button
                  className="sunlit-secondary min-h-10 rounded-xl px-4 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!currentRecord}
                  onClick={() => void shareCaption()}
                  type="button"
                >
                  {locale === "ar" ? "مشاركة" : "Share"}
                </button>
                <button
                  className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[rgb(217_63_122_/_28%)] bg-white px-4 text-sm font-extrabold text-[var(--sunlit-pink)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canDelete || deleting}
                  onClick={requestDeleteDraft}
                  title={currentRecord?.status === "SCHEDULED" ? "Cancel the schedule before deleting this post" : undefined}
                  type="button"
                >
                  <Trash2 size={16} /> {deleting ? "Deleting..." : locale === "ar" ? "حذف المسودة" : "Delete draft"}
                </button>
              </div>
            </details>
          </div>
        ) : null}
        {editorOpen && !reviewingGenerated ? (
          <footer className="flex flex-wrap items-center justify-between gap-4 border-t border-[var(--sunlit-line)] bg-white/95 px-5 py-4 shadow-[0_-14px_35px_rgba(32,33,43,.06)] sm:px-6">
            <div className="min-w-0">
              <p className="flex items-center gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                <span
                  className={`h-2.5 w-2.5 rounded-full ${
                    isDraftDirty
                      ? "bg-[var(--sunlit-coral)]"
                      : currentRecord?.status === "SCHEDULED"
                        ? "bg-[#4E77D8]"
                        : currentRecord?.status === "APPROVED"
                          ? "bg-[#28A67A]"
                          : "bg-[var(--sunlit-aqua)]"
                  }`}
                />
                {isDraftDirty
                  ? locale === "ar"
                    ? "تغييرات غير محفوظة"
                    : "Unsaved changes"
                  : currentRecord
                    ? localizedContentStatusLabel(currentRecord.status, locale)
                    : locale === "ar"
                      ? "مسودة جديدة"
                      : "New draft"}
              </p>
              <p className="mt-1 truncate text-xs font-semibold text-[var(--sunlit-muted)]">
                {isDraftDirty
                  ? locale === "ar"
                    ? "احفظ مرة واحدة عندما تصبح جاهزاً."
                    : "Save once when you are ready."
                  : currentRecord?.status === "APPROVED"
                    ? locale === "ar"
                      ? "جاهز للجدولة، لكنه لم يدخل قائمة النشر بعد."
                      : "Ready to schedule, but not yet in the publishing queue."
                    : currentRecord?.status === "SCHEDULED"
                      ? contentPipelineTimestamp(currentRecord, locale)
                      : currentRecord === null
                        ? locale === "ar"
                          ? "أضف محتوى لتفعيل الحفظ."
                          : "Add content to enable saving."
                        : locale === "ar"
                          ? "المسودة محفوظة في مساحة العمل."
                          : "The draft is saved in this workspace."}
              </p>
            </div>
            <button
              className="sunlit-primary inline-flex min-h-12 items-center justify-center rounded-xl px-6 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
              disabled={
                currentRecord?.status === "APPROVED"
                  ? scheduling
                  : currentRecord?.status === "SCHEDULED"
                    ? unscheduling
                    : isDraftDirty || currentRecord === null
                      ? saving || !hasMeaningfulDraftWork || (currentRecord === null && !contentTypeConfirmed)
                      : !canApprove || approving
              }
              onClick={() => {
                if (currentRecord?.status === "APPROVED") {
                  setSchedulePanelOpen(true);
                } else if (currentRecord?.status === "SCHEDULED") {
                  requestCancelSchedule();
                } else if (isDraftDirty || currentRecord === null) {
                  void persistEditableDraft();
                } else {
                  void acceptDraft();
                }
              }}
              type="button"
            >
              {saving
                ? locale === "ar"
                  ? "جارٍ الحفظ..."
                  : "Saving..."
                : approving
                  ? locale === "ar"
                    ? "جارٍ التجهيز..."
                    : "Marking ready..."
                  : scheduling
                    ? locale === "ar"
                      ? "جارٍ الجدولة..."
                      : "Scheduling..."
                    : unscheduling
                      ? locale === "ar"
                        ? "جارٍ الإلغاء..."
                        : "Cancelling..."
                      : currentRecord?.status === "APPROVED"
                        ? locale === "ar"
                          ? "جدولة"
                          : "Schedule"
                        : currentRecord?.status === "SCHEDULED"
                          ? locale === "ar"
                            ? "إلغاء الجدولة"
                            : "Cancel schedule"
                          : isDraftDirty || currentRecord === null
                            ? locale === "ar"
                              ? "حفظ المسودة"
                              : "Save draft"
                            : locale === "ar"
                              ? "تحديد كجاهز"
                              : "Mark as ready"}
            </button>
          </footer>
        ) : null}
      </div>

      {editorOpen ? (
        <div className="min-h-[620px] xl:sticky xl:top-6 xl:h-[calc(100vh-4.5rem)] xl:min-h-0">
          <ContentStudioAssistantPanel
            activePanel={sidePanel}
            assistantCaption={assistantCaption}
            assistantMessage={assistantMessage}
            assistantMessageKind={assistantMessageKind}
            assistantVisualDirection={assistantVisualDirection}
            busy={assistantBusy}
            canGenerate={contentTypeConfirmed && prompt.trim().length >= 8}
            contentType={contentType}
            hasSuggestion={assistantSuggestion !== null}
            locale={locale}
            onCancel={cancelAssistantIdea}
            onCaptionChange={setAssistantCaption}
            onDismissReplacement={() => setAssistantReplacementWarning(false)}
            onGenerate={() => void generateAssistantIdea()}
            onInsert={insertAssistantIdea}
            onPanelChange={setSidePanel}
            onPromptChange={setPrompt}
            onVisualDirectionChange={setAssistantVisualDirection}
            preview={
              selectedMedia ? (
                <InstagramPostPreview
                  brandName={session?.workspace.name ?? "yourbrand"}
                  caption={locale === "ar" ? captionAr || captionEn : captionEn || captionAr}
                  hashtags={parseHashtags(hashtagsText)}
                  locale={locale}
                  media={selectedMedia}
                  scheduledAt={currentRecord?.scheduledAt}
                />
              ) : (
                <EmptyStudioPreview locale={locale} />
              )
            }
            prompt={prompt}
            replacementWarning={assistantReplacementWarning}
          />
        </div>
      ) : null}

      {schedulePanelOpen && currentRecord?.status === "APPROVED" ? (
        <div className="fixed inset-0 z-[80] flex justify-end bg-[rgb(32_33_43_/_42%)] rtl:justify-start" role="presentation">
          <button
            aria-label={locale === "ar" ? "إغلاق لوحة الجدولة" : "Close scheduling panel"}
            className="absolute inset-0 cursor-default"
            disabled={scheduling}
            onClick={() => setSchedulePanelOpen(false)}
            type="button"
          />
          <aside
            aria-labelledby="schedule-panel-title"
            aria-modal="true"
            className="sunlit-schedule-drawer-enter relative flex h-full w-full max-w-lg flex-col bg-[var(--sunlit-paper)] shadow-[-24px_0_70px_rgba(32,33,43,.2)] rtl:shadow-[24px_0_70px_rgba(32,33,43,.2)]"
            role="dialog"
          >
            <header className="flex items-start justify-between gap-5 border-b border-[var(--sunlit-line)] px-6 py-6 sm:px-8">
              <div>
                <p className="sunlit-eyebrow">{locale === "ar" ? "الخطوة الأخيرة" : "Final step"}</p>
                <h2 className="mt-2 font-display text-3xl font-bold tracking-[-.04em] text-[var(--sunlit-ink)]" id="schedule-panel-title">
                  {locale === "ar" ? "جدولة هذا المنشور" : "Schedule this post"}
                </h2>
                <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">
                  {locale === "ar"
                    ? "راجع وقت النشر الدقيق قبل إضافة المنشور إلى قائمة الانتظار."
                    : "Review the exact publishing time before adding this Ready post to the queue."}
                </p>
              </div>
              <button
                aria-label={locale === "ar" ? "إغلاق" : "Close"}
                className="sunlit-secondary grid h-11 w-11 shrink-0 place-items-center rounded-full"
                disabled={scheduling}
                onClick={() => setSchedulePanelOpen(false)}
                type="button"
              >
                <X size={20} />
              </button>
            </header>

            <div className="flex-1 overflow-y-auto px-6 py-6 sm:px-8">
              <article className="rounded-2xl bg-[var(--sunlit-aqua-soft)] p-5">
                <p className="text-sm font-extrabold text-[var(--sunlit-ink)]">{locale === "ar" ? "جاهز للجدولة" : "Ready to schedule"}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--sunlit-ink-soft)]">
                  {locale === "ar"
                    ? "لن يتم تعديل النص أو الوسائط. التأكيد يضيف وقت النشر فقط."
                    : "Your copy and media will not change. Confirming only adds the publishing time."}
                </p>
              </article>

              <div className="mt-7 grid gap-5 sm:grid-cols-2">
                <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                  {locale === "ar" ? "تاريخ النشر" : "Publish date"}
                  <input
                    className="sunlit-field h-12 rounded-xl px-4 text-base font-normal outline-none"
                    onChange={(event) => setScheduleDate(event.target.value)}
                    type="date"
                    value={scheduleDate}
                  />
                </label>
                <label className="grid gap-2 text-sm font-extrabold text-[var(--sunlit-ink)]">
                  {locale === "ar" ? "وقت النشر" : "Publish time"}
                  <input
                    className="sunlit-field h-12 rounded-xl px-4 text-base font-normal outline-none"
                    onChange={(event) => setScheduleTime(event.target.value)}
                    type="time"
                    value={scheduleTime}
                  />
                </label>
              </div>

              <div className="mt-7 rounded-2xl border border-[var(--sunlit-line)] bg-white p-5">
                <p className="font-extrabold text-[var(--sunlit-ink)]">{locale === "ar" ? "بتوقيت البحرين" : "Bahrain time"}</p>
                <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">
                  {locale === "ar"
                    ? "التأكيد ينشئ الجدولة الفعلية ويضيف المنشور إلى قائمة النشر."
                    : "Confirming creates the active schedule and adds this post to the publishing queue."}
                </p>
              </div>
            </div>

            <footer className="flex flex-wrap justify-end gap-3 border-t border-[var(--sunlit-line)] bg-white px-6 py-5 sm:px-8">
              <button
                className="sunlit-secondary min-h-12 rounded-xl px-6 text-sm font-extrabold"
                disabled={scheduling}
                onClick={() => setSchedulePanelOpen(false)}
                type="button"
              >
                {locale === "ar" ? "إلغاء" : "Cancel"}
              </button>
              <button
                className="sunlit-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-xl px-6 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                disabled={scheduling || !scheduleDate || !scheduleTime}
                onClick={() => void scheduleDraft()}
                type="button"
              >
                <Calendar size={18} />
                {scheduling ? (locale === "ar" ? "جارٍ الجدولة..." : "Scheduling...") : locale === "ar" ? "تأكيد الجدولة" : "Confirm schedule"}
              </button>
            </footer>
          </aside>
        </div>
      ) : null}

      {confirmation ? (
        <ConfirmationDialog
          busy={confirmation === "cancel-schedule" ? unscheduling : deleting}
          confirmLabel={confirmation === "cancel-schedule" ? "Yes, cancel schedule" : "Yes, delete draft"}
          description={
            confirmation === "cancel-schedule"
              ? "This removes the publishing time and returns the post to Ready. It does not delete the post."
              : "This removes the post draft from MarkOS. Its media files remain in the workspace media library."
          }
          onCancel={() => setConfirmation(null)}
          onConfirm={() => void (confirmation === "cancel-schedule" ? cancelSchedule() : deleteDraft())}
          title={confirmation === "cancel-schedule" ? "Cancel this scheduled post?" : "Delete this post draft?"}
          tone={confirmation === "cancel-schedule" ? "neutral" : "danger"}
        />
      ) : null}

      {pendingExit ? (
        <UnsavedDraftDialog
          busy={saving}
          locale={locale}
          onDiscard={discardDraftAndExit}
          onKeepEditing={() => setPendingExit(null)}
          onSave={() => void saveDraftAndExit()}
        />
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

function StudioHomeAction({
  active,
  cta,
  description,
  icon,
  label,
  onClick,
  tone = "plain"
}: {
  active: boolean;
  cta: string;
  description: string;
  icon: IconType;
  label: string;
  onClick: () => void;
  tone?: "aqua" | "coral" | "plain";
}) {
  const Icon = icon;
  const cardClass =
    tone === "coral"
      ? "border-[rgb(255_102_90_/_42%)] bg-[#FFF9F6]"
      : active
        ? "border-[rgb(217_63_122_/_28%)] bg-[var(--sunlit-paper-deep)] shadow-sm"
        : "border-[var(--sunlit-line)] bg-white hover:border-[var(--sunlit-line-strong)] hover:shadow-sm";
  const iconClass =
    tone === "coral"
      ? "bg-[rgb(255_102_90_/_10%)] text-[var(--sunlit-coral)]"
      : tone === "aqua"
        ? "bg-[var(--sunlit-aqua-soft)] text-[#216A84]"
        : "bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]";

  return (
    <button
      aria-pressed={active}
      className={`group flex min-h-56 flex-col rounded-[1.75rem] border p-5 text-start transition sm:p-6 ${cardClass}`}
      onClick={onClick}
      type="button"
    >
      <span className="flex items-start gap-4">
        <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-2xl ${iconClass}`}>
          <Icon size={21} />
        </span>
      </span>
      <span className="mt-5 block text-xl font-bold text-[var(--sunlit-ink)]">{label}</span>
      <span className="mt-2 block text-sm font-semibold leading-6 text-[var(--sunlit-muted)]">{description}</span>
      <span className="mt-auto inline-flex items-center gap-2 pt-5 text-sm font-extrabold text-[var(--sunlit-pink)]">
        {cta} <ArrowRight className="transition group-hover:translate-x-1 rtl:rotate-180 rtl:group-hover:-translate-x-1" size={16} />
      </span>
    </button>
  );
}

function ConfirmationDialog({
  busy,
  confirmLabel,
  description,
  onCancel,
  onConfirm,
  title,
  tone
}: {
  busy: boolean;
  confirmLabel: string;
  description: string;
  onCancel: () => void;
  onConfirm: () => void;
  title: string;
  tone: "danger" | "neutral";
}) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onCancel();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [busy, onCancel]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-[rgb(32_33_43_/_58%)] p-5 backdrop-blur-sm">
      <article
        aria-describedby="studio-confirmation-description"
        aria-labelledby="studio-confirmation-title"
        aria-modal="true"
        className="sunlit-panel w-full max-w-md rounded-[1.75rem] p-6 shadow-2xl"
        role="dialog"
      >
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="sunlit-eyebrow">Confirmation required</p>
            <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]" id="studio-confirmation-title">
              {title}
            </h2>
          </div>
          <button aria-label="Close confirmation" className="rounded-full p-2 text-[var(--sunlit-muted)]" disabled={busy} onClick={onCancel} type="button">
            <X size={20} />
          </button>
        </div>
        <p className="mt-4 text-sm leading-6 text-[var(--sunlit-muted)]" id="studio-confirmation-description">
          {description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="sunlit-secondary min-h-11 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"
            disabled={busy}
            onClick={onCancel}
            type="button"
          >
            Keep post
          </button>
          <button
            className={
              tone === "danger"
                ? "min-h-11 rounded-xl bg-[var(--sunlit-pink)] px-5 text-sm font-extrabold text-white disabled:opacity-50"
                : "sunlit-primary min-h-11 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"
            }
            disabled={busy}
            onClick={onConfirm}
            type="button"
          >
            {busy ? "Working..." : confirmLabel}
          </button>
        </div>
      </article>
    </div>
  );
}

function UnsavedDraftDialog({
  busy,
  locale,
  onDiscard,
  onKeepEditing,
  onSave
}: {
  busy: boolean;
  locale: Locale;
  onDiscard: () => void;
  onKeepEditing: () => void;
  onSave: () => void;
}) {
  useEffect(() => {
    function keepEditingOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) onKeepEditing();
    }

    document.addEventListener("keydown", keepEditingOnEscape);
    return () => document.removeEventListener("keydown", keepEditingOnEscape);
  }, [busy, onKeepEditing]);

  const copy =
    locale === "ar"
      ? {
          description: "لديك تغييرات لم تُحفظ. يمكنك حفظ المسودة، تجاهل التغييرات، أو متابعة التحرير.",
          discard: "تجاهل التغييرات",
          eyebrow: "مسودة غير محفوظة",
          keep: "متابعة التحرير",
          save: "حفظ المسودة",
          saving: "جارٍ الحفظ...",
          title: "هل تريد حفظ هذه المسودة؟"
        }
      : {
          description: "You have unsaved changes. Save the draft, discard those changes, or keep editing.",
          discard: "Discard changes",
          eyebrow: "Unsaved draft",
          keep: "Keep editing",
          save: "Save draft",
          saving: "Saving...",
          title: "Save this draft before leaving?"
        };

  return (
    <div className="fixed inset-0 z-[90] grid place-items-center bg-[rgb(32_33_43_/_58%)] p-5 backdrop-blur-sm">
      <article
        aria-describedby="unsaved-draft-description"
        aria-labelledby="unsaved-draft-title"
        aria-modal="true"
        className="sunlit-panel w-full max-w-lg rounded-[1.75rem] p-6 shadow-2xl"
        role="dialog"
      >
        <p className="sunlit-eyebrow">{copy.eyebrow}</p>
        <h2 className="mt-2 text-xl font-bold text-[var(--sunlit-ink)]" id="unsaved-draft-title">
          {copy.title}
        </h2>
        <p className="mt-4 text-sm leading-6 text-[var(--sunlit-muted)]" id="unsaved-draft-description">
          {copy.description}
        </p>
        <div className="mt-6 flex flex-wrap justify-end gap-3">
          <button
            className="sunlit-secondary min-h-11 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"
            disabled={busy}
            onClick={onKeepEditing}
            type="button"
          >
            {copy.keep}
          </button>
          <button
            className="min-h-11 rounded-xl border border-[rgb(217_63_122_/_28%)] bg-white px-5 text-sm font-extrabold text-[var(--sunlit-pink)] disabled:opacity-50"
            disabled={busy}
            onClick={onDiscard}
            type="button"
          >
            {copy.discard}
          </button>
          <button className="sunlit-primary min-h-11 rounded-xl px-5 text-sm font-extrabold disabled:opacity-50" disabled={busy} onClick={onSave} type="button">
            {busy ? copy.saving : copy.save}
          </button>
        </div>
      </article>
    </div>
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
