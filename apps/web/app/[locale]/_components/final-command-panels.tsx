"use client";

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type ReactNode } from "react";
import {
  ArrowRight,
  BarChart3,
  Bell,
  Bookmark,
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
  Heart,
  Image as ImageIcon,
  ImagePlus,
  Instagram,
  Lightbulb,
  Link2,
  LogOut,
  Maximize2,
  MessageCircle,
  MoreHorizontal,
  Palette,
  Pencil,
  Play,
  Repeat2,
  RotateCcw,
  Send,
  Settings,
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
  AnalyticsSummary,
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

type Accent = "amber" | "gold" | "teal";
type IconType = typeof Sparkles;
type StudioContentType = Extract<ContentType, "POST" | "REEL" | "CAROUSEL" | "STORY">;
type ContentPipelineFilter = "ALL" | "DRAFTS" | "READY" | "SCHEDULED" | "PUBLISHED";
type ContentStudioHomePanel = "AI_DRAFT" | "DRAFTS" | "IDEAS" | null;
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

const studioTypes: Array<[StudioContentType, string, IconType]> = [
  ["POST", "Post", ImageIcon],
  ["REEL", "Reel", Play],
  ["CAROUSEL", "Carousel", ImageIcon],
  ["STORY", "Story", Instagram]
];

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

function contentPipelineTitle(record: ContentRecord, locale: Locale): string {
  const preferredCaption = locale === "ar" ? (record.captionAr ?? record.captionEn) : (record.captionEn ?? record.captionAr);
  const firstSentence = (preferredCaption ?? record.contentPillar ?? "").split(/[.!?\n]/)[0]?.trim();

  if (!firstSentence) return localizedContentTypeLabel(record.contentType, locale);
  return firstSentence.length > 58 ? `${firstSentence.slice(0, 55)}...` : firstSentence;
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

function matchesContentPipelineFilter(record: ContentRecord, filter: ContentPipelineFilter): boolean {
  if (filter === "DRAFTS") {
    return record.status === "DRAFT" || record.status === "IN_REVIEW";
  }

  if (filter === "READY") {
    return record.status === "APPROVED";
  }

  return filter === "ALL" || record.status === filter;
}

function sortContentPipelineRecords(records: ContentRecord[], filter: ContentPipelineFilter): ContentRecord[] {
  return [...records].sort((left, right) => {
    if (filter === "SCHEDULED") {
      return new Date(left.scheduledAt ?? left.updatedAt).getTime() - new Date(right.scheduledAt ?? right.updatedAt).getTime();
    }

    const leftPriority = left.status === "SCHEDULED" ? 0 : left.status === "APPROVED" ? 1 : 2;
    const rightPriority = right.status === "SCHEDULED" ? 0 : right.status === "APPROVED" ? 1 : 2;

    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }

    return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
  });
}

function contentStatusBadgeClass(status: ContentStatus): string {
  if (status === "SCHEDULED") return "bg-[var(--sunlit-aqua-soft)] text-[#157A70]";
  if (status === "APPROVED" || status === "PUBLISHED") return "bg-[#EEF8E9] text-[#44713A]";
  if (status === "FAILED") return "bg-[#FFF0F1] text-[#A43C49]";
  return "bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-ink-soft)]";
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
    return "This workspace has reached its current AI quota. Upgrade or wait for the quota window to reset before generating more content.";
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
          strategy: "فتح الاستراتيجية",
          subtitle: topContent
            ? `لديك محتوى ${statusLabel(topContent.status)} جاهز للخطوة التالية.`
            : "ابدأ من الاستراتيجية أو أنشئ أول مسودة عندما تكون جاهزاً.",
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
          strategy: "Open Strategy",
          subtitle: topContent
            ? `${recordTitle(topContent)} is ${statusLabel(topContent.status).toLowerCase()} and ready for its next step.`
            : "Start with your Strategy, or create the first draft when you are ready.",
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
            <h2 className="mt-2 font-display text-2xl font-black tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{copy.greeting}</h2>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sunlit-muted)]">{copy.subtitle}</p>
          </div>
          <div className="flex shrink-0 flex-wrap gap-2">
            <a className="sunlit-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" href={missionHref}>
              {missionCta} <ArrowRight size={17} />
            </a>
            <a className="sunlit-secondary inline-flex min-h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" href={`/${locale}/app/strategy`}>
              {copy.strategy}
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
              <h2 className="mt-2 font-display text-2xl font-black tracking-tight text-[var(--sunlit-ink)]">{missionTitle}</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">{topContent ? copy.subtitle : copy.contentEmpty}</p>
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
            <span className="text-3xl font-black text-[var(--sunlit-ink)]">{liveState.vaultScore ? `${liveState.vaultScore.score}%` : "—"}</span>
          </div>
          <h2 className="mt-5 text-lg font-black text-[var(--sunlit-ink)]">{copy.profileReady}</h2>
          <div className="mt-3 h-2 overflow-hidden rounded-full bg-[var(--sunlit-paper-deep)]">
            <div className="h-full rounded-full bg-[var(--sunlit-aqua)]" style={{ width: `${liveState.vaultScore?.score ?? 0}%` }} />
          </div>
          <a className="mt-5 inline-flex items-center gap-2 text-sm font-extrabold text-[var(--sunlit-aqua-dark)]" href={`/${locale}/app/knowledge`}>
            {copy.businessProfile} <ArrowRight size={16} />
          </a>
        </article>
      </section>

      <div className="flex items-center justify-between gap-4">
        <h2 className="text-xl font-black text-[var(--sunlit-ink)]">{copy.contentReady}</h2>
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
              <h3 className="mt-5 line-clamp-2 font-black leading-6 text-[var(--sunlit-ink)]">{recordTitle(item)}</h3>
              <p className="mt-2 line-clamp-2 text-sm leading-6 text-[var(--sunlit-muted)]">{recordSubtitle(item)}</p>
            </a>
          ))}
        </section>
      ) : (
        <article className="sunlit-panel-soft rounded-[1.75rem] p-6 xl:p-7">
          <p className="text-xl font-black text-[var(--sunlit-ink)]">{copy.contentEmpty}</p>
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
        <strong className="text-3xl font-black tracking-tight text-[var(--sunlit-ink)]">{value}</strong>
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
      <HeroTitle icon={Sparkles} subtitle="I'll help you create a high-performing campaign in minutes, not days." title="AI Campaign Builder">
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
              {generatingCampaign ? <span className="lux-thinking-dot" aria-hidden="true" /> : <Sparkles size={20} />}
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
  const [contentFilter, setContentFilter] = useState<ContentPipelineFilter>("ALL");
  const [homePanel, setHomePanel] = useState<ContentStudioHomePanel>(null);
  const [prompt, setPrompt] = useState("");
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [mediaAssets, setMediaAssets] = useState<MediaAssetRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<ContentRecord | null>(null);
  const [editorOpen, setEditorOpen] = useState(false);
  const [draftBaseline, setDraftBaseline] = useState<ContentDraftFields | null>(null);
  const [captionLanguage, setCaptionLanguage] = useState<"ar" | "en">(locale);
  const [captionEn, setCaptionEn] = useState("");
  const [captionAr, setCaptionAr] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [plannedAtInput, setPlannedAtInput] = useState("");
  const [selectedMediaId, setSelectedMediaId] = useState<string | null>(null);
  const [imagePrompt, setImagePrompt] = useState("");
  const [imageAspectRatio, setImageAspectRatio] = useState<"1:1" | "4:5" | "9:16">("4:5");
  const [scheduleDate, setScheduleDate] = useState(initialScheduleDate);
  const [scheduleTime, setScheduleTime] = useState("19:30");
  const [message, setMessage] = useState("");
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [generating, setGenerating] = useState(false);
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
  const [expandedMedia, setExpandedMedia] = useState<MediaAssetRecord | null>(null);
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
          blankDescription: "Open an editable draft without calling AI or consuming quota.",
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
  const contentIdeaStarters =
    locale === "ar"
      ? [
          ["خلف الكواليس", "عرّف المتابعين على شخص أو خطوة أو تفصيل يصنع الفرق في عملك."],
          ["منتج تحت الضوء", "اشرح لمن صُمم أحد منتجاتك ولماذا يختاره العملاء."],
          ["إجابة على سؤال متكرر", "حوّل سؤالاً حقيقياً من العملاء إلى منشور مفيد وسهل الحفظ."],
          ["قصة عميل", "شارك نتيجة أو تجربة حقيقية من دون اختلاق أرقام أو اقتباسات."],
          ["دعوة محلية", "أنشئ سبباً واضحاً يدعو جمهور البحرين للزيارة أو التواصل هذا الأسبوع."]
        ]
      : [
          ["Behind the scenes", "Introduce a person, process, or detail that makes your business different."],
          ["Product spotlight", "Explain who one offer is for and why customers choose it."],
          ["Answer a common question", "Turn a real customer question into something useful and saveable."],
          ["Customer story", "Share a real outcome or experience without inventing numbers or quotes."],
          ["Local invitation", "Give your Bahrain audience a clear reason to visit or get in touch this week."]
        ];
  const contentPipelineCopy =
    locale === "ar"
      ? {
          all: "الكل",
          drafts: "المسودات",
          empty: "لا يوجد محتوى في هذه المرحلة حتى الآن.",
          heading: "المحتوى والجدول",
          note: "تعكس هذه القائمة الحالة والأوقات المحفوظة في MARKOS، ولا تؤكد بحد ذاتها النشر على إنستغرام.",
          published: "المنشور",
          ready: "جاهز",
          scheduled: "المجدول",
          subtitle: "افتح أي مسودة محفوظة أو راجع مواعيد المحتوى القادمة."
        }
      : {
          all: "All",
          drafts: "Drafts",
          empty: "There is no content at this stage yet.",
          heading: "Content and schedule",
          note: "This list reflects saved MARKOS status and times; it does not by itself confirm publication on Instagram.",
          published: "Published",
          ready: "Ready",
          scheduled: "Scheduled",
          subtitle: "Open any saved draft or review the next content times."
        };
  const contentPipelineFilters: Array<[ContentPipelineFilter, string]> = [
    ["ALL", contentPipelineCopy.all],
    ["DRAFTS", contentPipelineCopy.drafts],
    ["READY", contentPipelineCopy.ready],
    ["SCHEDULED", contentPipelineCopy.scheduled],
    ["PUBLISHED", contentPipelineCopy.published]
  ];
  const contentPipelineCounts = useMemo<Record<ContentPipelineFilter, number>>(
    () => ({
      ALL: records.length,
      DRAFTS: records.filter((record) => matchesContentPipelineFilter(record, "DRAFTS")).length,
      PUBLISHED: records.filter((record) => record.status === "PUBLISHED").length,
      READY: records.filter((record) => record.status === "APPROVED").length,
      SCHEDULED: records.filter((record) => record.status === "SCHEDULED").length
    }),
    [records]
  );
  const visibleContentRecords = useMemo(
    () =>
      sortContentPipelineRecords(
        records.filter((record) => matchesContentPipelineFilter(record, contentFilter)),
        contentFilter
      ),
    [contentFilter, records]
  );
  const selectedTypeLabel = studioTypes.find(([value]) => value === contentType)?.[1] ?? "Post";
  const currentDraftFields: ContentDraftFields = {
    callToAction,
    captionAr,
    captionEn,
    contentType,
    hashtagsText,
    plannedAtInput
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
    setLoadingRecords(true);
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
        } else if (requestedItemId) {
          setMessage(locale === "ar" ? "تعذر العثور على المحتوى المطلوب في مساحة العمل هذه." : "That content item was not found in this workspace.");
        }
      } catch (error) {
        if (!cancelled) {
          setMessage(contentStudioError(error));
        }
      } finally {
        if (!cancelled) {
          setLoadingRecords(false);
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

    if (record) {
      const fields = contentDraftFieldsFromRecord(record);
      setEditorOpen(true);
      setContentType(fields.contentType);
      setCaptionEn(fields.captionEn);
      setCaptionAr(fields.captionAr);
      setHashtagsText(fields.hashtagsText);
      setCallToAction(fields.callToAction);
      setPlannedAtInput(fields.plannedAtInput);
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
      setCaptionEn("");
      setCaptionAr("");
      setHashtagsText("");
      setCallToAction("");
      setPlannedAtInput("");
      setDraftBaseline(null);
      setSelectedMediaId(null);
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
    setHomePanel(null);

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

  function createBlankDraft() {
    if (!session) {
      setMessage(
        locale === "ar"
          ? "سجّل الدخول أو أكمل الإعداد أولاً حتى يتمكن MARKOS من حفظ المسودة."
          : "Sign in or complete onboarding first so MARKOS can save the draft."
      );
      return;
    }

    const fields = emptyContentDraftFields("POST");
    setCurrentRecord(null);
    setEditorOpen(true);
    setContentType(fields.contentType);
    setCaptionEn(fields.captionEn);
    setCaptionAr(fields.captionAr);
    setHashtagsText(fields.hashtagsText);
    setCallToAction(fields.callToAction);
    setPlannedAtInput(fields.plannedAtInput);
    setDraftBaseline(fields);
    setSelectedMediaId(null);
    setHomePanel(null);
    setMessage(
      locale === "ar"
        ? "هذه المسودة لم تُحفظ بعد. لن يُنشئ MARKOS سجلاً حتى تحفظ عملاً فعلياً."
        : "This draft is not saved yet. MARKOS will create a record only after you save real work."
    );
  }

  function openAiDraft(idea?: string) {
    if (idea) {
      setPrompt(idea);
    }
    setHomePanel("AI_DRAFT");
  }

  async function generate() {
    const trimmedPrompt = prompt.trim();

    if (!session) {
      setMessage("Sign in or complete onboarding first so MARKOS can save generated work to a workspace.");
      return;
    }

    if (trimmedPrompt.length < 8) {
      setMessage("Describe what MARKOS should create before generating.");
      return;
    }

    setGenerating(true);
    setMessage("MARKOS is thinking through your Vault context and generating a saved draft...");

    try {
      const drafts = await client.generateContent({
        contentType,
        count: 1,
        topic: trimmedPrompt
      });
      const draft = drafts[0];

      if (!draft) {
        throw new Error("The API returned no content draft.");
      }

      upsertRecord(draft);
      applyRecord(draft, "Draft generated and saved to this workspace.");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setGenerating(false);
    }
  }

  async function persistEditableDraft(showMessage = true): Promise<ContentRecord | null> {
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

    if (!currentRecord && !hasMeaningfulDraftWork) {
      setMessage(
        locale === "ar"
          ? "أضف نصاً أو وسوماً أو موعداً مخططاً له قبل حفظ المسودة."
          : "Add a caption, hashtags, call to action, or planned time before saving this draft."
      );
      return null;
    }

    setSaving(true);

    try {
      const payload = contentDraftPayload(currentDraftFields);
      const updated = currentRecord
        ? await client.updateContent(currentRecord.id, {
            callToAction: payload.callToAction,
            captionAr: payload.captionAr,
            captionEn: payload.captionEn,
            hashtags: payload.hashtags,
            plannedAt: payload.plannedAt
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
      setHomePanel("DRAFTS");
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

    if (!session || !currentRecord) {
      setMessage("Generate or choose a saved draft before uploading an image.");
      return;
    }

    if (!canManageMedia) {
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
      const editableRecord = canEdit ? await persistEditableDraft(false) : currentRecord;
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

  async function generateImage() {
    if (!session || !currentRecord) {
      setMessage("Generate or choose a saved draft before creating an image.");
      return;
    }

    if (!canManageMedia) {
      setMessage(`Media cannot be changed while this item is ${statusLabel(currentRecord.status).toLowerCase()}.`);
      return;
    }

    setGeneratingImage(true);
    setMessage("MARKOS is generating and saving a publish-ready JPEG. This can take up to two minutes...");

    try {
      const editableRecord = canEdit ? await persistEditableDraft(false) : currentRecord;
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
      setExpandedMedia(null);
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
    <section className="grid min-h-[calc(100vh-8rem)] min-w-0 gap-6 xl:grid-cols-[minmax(0,1fr)_420px] xl:gap-7">
      <div className="min-w-0 space-y-6">
        <section className="sunlit-panel rounded-[1.5rem] border-s-4 border-s-[var(--sunlit-pink)] p-4 sm:px-5 sm:py-4">
          {editorOpen ? (
            <div className="flex items-center justify-between gap-4">
              <div className="min-w-0">
                <p className="sunlit-eyebrow">{locale === "ar" ? "محرر المسودة" : "Draft editor"}</p>
                <h1 className="mt-1 truncate font-display text-xl font-black tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-2xl">
                  {currentRecord ? contentPipelineTitle(currentRecord, locale) : locale === "ar" ? "مسودة منشور جديدة" : "New post draft"}
                </h1>
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
            <>
              <p className="sunlit-eyebrow">{studioHomeCopy.eyebrow}</p>
              <h1 className="mt-1 font-display text-2xl font-black tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{studioHomeCopy.title}</h1>
              <p className="mt-1 max-w-3xl text-base leading-6 text-[var(--sunlit-muted)]">{studioHomeCopy.subtitle}</p>
            </>
          )}
        </section>
        {message ? (
          <article className="sunlit-panel-soft rounded-2xl p-5">
            <p className="text-sm font-bold leading-6 text-[var(--sunlit-ink-soft)]">{message}</p>
          </article>
        ) : null}

        {!editorOpen ? (
          <>
            <article className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
              <div className="grid gap-3 sm:grid-cols-3">
                {[
                  [studioHomeCopy.statsDrafts, contentPipelineCounts.DRAFTS, "bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-ink-soft)]"],
                  [studioHomeCopy.statsScheduled, contentPipelineCounts.SCHEDULED, "bg-[var(--sunlit-aqua-soft)] text-[#157A70]"],
                  [studioHomeCopy.statsPublished, contentPipelineCounts.PUBLISHED, "bg-[#EEF8E9] text-[#44713A]"]
                ].map(([label, value, className]) => (
                  <div className={`flex items-center justify-between rounded-2xl px-4 py-3 ${className}`} key={label}>
                    <span className="text-sm font-extrabold">{label}</span>
                    <span className="text-xl font-black">{value}</span>
                  </div>
                ))}
              </div>
              <div className="mt-5 grid gap-4 lg:grid-cols-2">
                <button
                  className="sunlit-primary flex min-h-36 items-start gap-4 rounded-2xl p-5 text-start lg:col-span-2"
                  onClick={createBlankDraft}
                  type="button"
                >
                  <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-white/20">
                    <Pencil size={21} />
                  </span>
                  <span>
                    <span className="block text-lg font-black">{studioHomeCopy.blankAction}</span>
                    <span className="mt-1 block text-sm font-semibold leading-6 opacity-85">{studioHomeCopy.blankDescription}</span>
                  </span>
                </button>
                <StudioHomeAction
                  active={homePanel === "AI_DRAFT"}
                  description={studioHomeCopy.aiDescription}
                  icon={Wand2}
                  label={studioHomeCopy.aiAction}
                  onClick={() => openAiDraft()}
                />
                <StudioHomeAction
                  active={homePanel === "IDEAS"}
                  description={studioHomeCopy.ideasDescription}
                  icon={Lightbulb}
                  label={studioHomeCopy.ideasAction}
                  onClick={() => setHomePanel("IDEAS")}
                />
                <StudioHomeAction
                  active={homePanel === "DRAFTS"}
                  badge={contentPipelineCounts.DRAFTS}
                  description={studioHomeCopy.continueDescription}
                  icon={Clock}
                  label={studioHomeCopy.continueAction}
                  onClick={() => {
                    setContentFilter("DRAFTS");
                    setHomePanel("DRAFTS");
                  }}
                />
                <a
                  className="rounded-2xl border border-[var(--sunlit-line)] bg-white p-5 text-start transition hover:border-[var(--sunlit-line-strong)] hover:shadow-sm"
                  href={`/${locale}/app/calendar`}
                >
                  <span className="flex items-start gap-4">
                    <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-aqua-soft)] text-[#157A70]">
                      <Calendar size={21} />
                    </span>
                    <span>
                      <span className="block font-black text-[var(--sunlit-ink)]">{studioHomeCopy.calendarAction}</span>
                      <span className="mt-1 block text-sm font-semibold leading-6 text-[var(--sunlit-muted)]">{studioHomeCopy.calendarDescription}</span>
                    </span>
                  </span>
                </a>
              </div>
            </article>

            {homePanel === "AI_DRAFT" ? (
              <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
                <div className="flex items-center gap-3">
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
                    <Wand2 size={22} />
                  </span>
                  <div>
                    <h2 className="text-xl font-black text-[var(--sunlit-ink)]">{studioHomeCopy.aiTitle}</h2>
                    <p className="mt-1 text-sm text-[var(--sunlit-muted)]">
                      {locale === "ar" ? "اختر النوع ثم وضّح الهدف والجمهور والعرض." : "Choose a format, then explain the objective, audience, and offer."}
                    </p>
                  </div>
                </div>
                <div className="mt-6 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
                  {studioTypes.map(([value, , Icon]) => (
                    <button
                      className={
                        contentType === value
                          ? "rounded-xl border border-[rgb(217_63_122_/_28%)] bg-[var(--sunlit-paper-deep)] px-4 py-3 text-start font-extrabold text-[var(--sunlit-pink)]"
                          : "rounded-xl border border-[var(--sunlit-line)] bg-white px-4 py-3 text-start font-bold text-[var(--sunlit-ink-soft)] transition hover:border-[var(--sunlit-line-strong)]"
                      }
                      key={value}
                      onClick={() => setContentType(value)}
                      type="button"
                    >
                      <span className="inline-flex items-center gap-3">
                        <Icon size={19} />
                        {localizedContentTypeLabel(value, locale)}
                      </span>
                    </button>
                  ))}
                </div>
                <textarea
                  className="sunlit-field mt-5 min-h-36 resize-y rounded-xl p-4 text-base leading-7 outline-none"
                  dir={locale === "ar" ? "rtl" : "ltr"}
                  onChange={(event) => setPrompt(event.target.value)}
                  placeholder={
                    locale === "ar"
                      ? "صف المحتوى المطلوب، بما في ذلك العرض والجمهور واللغة والهدف."
                      : "Describe the content, including the offer, audience, language, and objective."
                  }
                  value={prompt}
                />
                <button
                  className="sunlit-primary mt-5 inline-flex min-h-12 w-full items-center justify-center gap-3 rounded-xl px-6 text-base font-extrabold disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={generating}
                  onClick={generate}
                  type="button"
                >
                  {generating ? <span className="lux-thinking-dot" aria-hidden="true" /> : <Wand2 size={20} />}
                  {generating ? (locale === "ar" ? "جارٍ إنشاء المسودة..." : "Creating your draft...") : locale === "ar" ? "إنشاء المسودة" : "Generate draft"}
                </button>
              </article>
            ) : null}

            {homePanel === "IDEAS" ? (
              <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
                <p className="sunlit-eyebrow">{locale === "ar" ? "أفكار المحتوى" : "Content ideas"}</p>
                <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]">{locale === "ar" ? "اختر فكرة لتطويرها" : "Choose an idea to develop"}</h2>
                <div className="mt-5 grid gap-3">
                  {contentIdeaStarters.map(([title, description]) => (
                    <button
                      className="rounded-2xl border border-[var(--sunlit-line)] bg-white p-5 text-start transition hover:border-[var(--sunlit-line-strong)] hover:shadow-sm"
                      key={title}
                      onClick={() => openAiDraft(`${title}. ${description}`)}
                      type="button"
                    >
                      <span className="font-black text-[var(--sunlit-ink)]">{title}</span>
                      <span className="mt-1 block text-sm leading-6 text-[var(--sunlit-muted)]">{description}</span>
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--sunlit-muted)]">
                  {locale === "ar"
                    ? "لن يتم حفظ أي شيء حتى تختار الفكرة وتطلب إنشاء المسودة."
                    : "Nothing is saved until you select an idea and ask MARKOS to create the draft."}
                </p>
              </section>
            ) : null}

            {homePanel === "DRAFTS" ? (
              loadingRecords ? (
                <article className="sunlit-panel rounded-2xl p-6 text-[var(--sunlit-muted)]">
                  {locale === "ar" ? "جارٍ تحميل المحتوى..." : "Loading workspace content..."}
                </article>
              ) : (
                <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6" aria-labelledby="content-pipeline-heading">
                  <div className="flex flex-wrap items-start justify-between gap-4">
                    <div>
                      <p className="sunlit-eyebrow">{locale === "ar" ? "مكتبة المحتوى" : "Content library"}</p>
                      <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]" id="content-pipeline-heading">
                        {contentPipelineCopy.heading}
                      </h2>
                      <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">{contentPipelineCopy.subtitle}</p>
                    </div>
                    <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-3 py-1.5 text-sm font-extrabold text-[var(--sunlit-ink-soft)]">
                      {records.length}
                    </span>
                  </div>
                  <div className="mt-5 flex gap-2 overflow-x-auto pb-1" role="group" aria-label={locale === "ar" ? "تصفية المحتوى" : "Filter content"}>
                    {contentPipelineFilters.map(([value, label]) => (
                      <button
                        aria-pressed={contentFilter === value}
                        className={
                          contentFilter === value
                            ? "shrink-0 rounded-full bg-[var(--sunlit-ink)] px-4 py-2 text-sm font-extrabold text-white"
                            : "shrink-0 rounded-full border border-[var(--sunlit-line)] bg-white px-4 py-2 text-sm font-bold text-[var(--sunlit-ink-soft)] transition hover:border-[var(--sunlit-line-strong)]"
                        }
                        key={value}
                        onClick={() => setContentFilter(value)}
                        type="button"
                      >
                        {label} <span className="ms-1 opacity-65">{contentPipelineCounts[value]}</span>
                      </button>
                    ))}
                  </div>
                  {visibleContentRecords.length === 0 ? (
                    <div className="mt-5 rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper-deep)] px-5 py-8 text-center text-sm font-bold text-[var(--sunlit-muted)]">
                      {contentPipelineCopy.empty}
                    </div>
                  ) : (
                    <div className="mt-5 grid max-h-[34rem] gap-3 overflow-y-auto pe-1">
                      {visibleContentRecords.map((record) => (
                        <button
                          className="rounded-2xl border border-[var(--sunlit-line)] bg-white px-5 py-4 text-start transition hover:border-[var(--sunlit-line-strong)] hover:shadow-sm"
                          key={record.id}
                          onClick={() => applyRecord(record, locale === "ar" ? "تم فتح المحتوى المحفوظ." : "Loaded saved content.")}
                          type="button"
                        >
                          <span className="flex items-start justify-between gap-4">
                            <span className="min-w-0">
                              <span className="block truncate font-extrabold text-[var(--sunlit-ink)]">{contentPipelineTitle(record, locale)}</span>
                              <span className="mt-2 flex flex-wrap items-center gap-x-4 gap-y-2 text-xs font-bold text-[var(--sunlit-muted)]">
                                <span>{localizedContentTypeLabel(record.contentType, locale)}</span>
                                <span className="inline-flex items-center gap-1.5">
                                  {record.scheduledAt ? <Calendar size={14} /> : <Clock size={14} />}
                                  {contentPipelineTimestamp(record, locale)}
                                </span>
                                {record.mediaIds.length > 0 ? (
                                  <span className="inline-flex items-center gap-1.5">
                                    <ImageIcon size={14} />
                                    {record.mediaIds.length}
                                  </span>
                                ) : null}
                              </span>
                            </span>
                            <span className={`shrink-0 rounded-full px-3 py-1 text-xs font-extrabold ${contentStatusBadgeClass(record.status)}`}>
                              {localizedContentStatusLabel(record.status, locale)}
                            </span>
                          </span>
                        </button>
                      ))}
                    </div>
                  )}
                  <p className="mt-4 text-xs leading-5 text-[var(--sunlit-muted)]">{contentPipelineCopy.note}</p>
                </section>
              )
            ) : null}
          </>
        ) : null}

        {editorOpen ? (
          <>
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

            <EditorBlock
              action={currentRecord ? (locale === "ar" ? "حفظ التعديلات" : "Save edits") : locale === "ar" ? "حفظ المسودة" : "Save draft"}
              busy={saving}
              disabled={!canEdit || !isDraftDirty}
              onAction={() => void persistEditableDraft()}
              title={locale === "ar" ? "النص" : "Caption"}
            >
              <div className="mb-5 flex flex-wrap gap-2" role="group" aria-label="Caption language">
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
              <textarea
                className="min-h-56 w-full resize-y border-0 bg-transparent text-lg leading-relaxed text-[var(--sunlit-ink)] outline-none placeholder:text-[var(--sunlit-muted)] xl:min-h-64"
                dir={captionLanguage === "ar" ? "rtl" : "ltr"}
                disabled={!canEdit}
                onChange={(event) => setActiveCaption(event.target.value)}
                placeholder={locale === "ar" ? "اكتب النص العربي لهذا المنشور." : "Write the caption for this post."}
                value={activeCaption}
              />
              <div className="mt-8 border-t border-[var(--sunlit-line)] pt-5 text-sm text-[var(--sunlit-muted)]">{activeCaption.length} / 2,200 characters</div>
            </EditorBlock>

            <EditorBlock
              action={locale === "ar" ? "حفظ الوسوم" : "Save tags"}
              busy={saving}
              disabled={!canEdit || !isDraftDirty}
              onAction={() => void persistEditableDraft()}
              title={locale === "ar" ? "الوسوم" : "Hashtags"}
            >
              <textarea
                className="min-h-24 w-full resize-y border-0 bg-transparent text-base leading-relaxed text-[var(--sunlit-ink)] outline-none placeholder:text-[var(--sunlit-muted)]"
                disabled={!canEdit}
                onChange={(event) => setHashtagsText(event.target.value)}
                placeholder="#Generated #Hashtags"
                value={hashtagsText}
              />
            </EditorBlock>

            <EditorBlock
              action={locale === "ar" ? "حفظ الدعوة" : "Save CTA"}
              busy={saving}
              disabled={!canEdit || !isDraftDirty}
              onAction={() => void persistEditableDraft()}
              title={locale === "ar" ? "الدعوة إلى الإجراء" : "Call to action"}
            >
              <input
                className="w-full border-0 bg-transparent text-base text-[var(--sunlit-ink)] outline-none placeholder:text-[var(--sunlit-muted)]"
                disabled={!canEdit}
                onChange={(event) => setCallToAction(event.target.value)}
                placeholder={locale === "ar" ? "مثال: أرسل لنا رسالة لمعرفة المزيد" : "Example: Send us a message to learn more"}
                value={callToAction}
              />
            </EditorBlock>

            <EditorBlock
              action={currentRecord ? (locale === "ar" ? "حفظ الموعد" : "Save planned time") : locale === "ar" ? "حفظ المسودة" : "Save draft"}
              busy={saving}
              disabled={!canEdit || !isDraftDirty}
              onAction={() => void persistEditableDraft()}
              title={locale === "ar" ? "موعد النشر المخطط" : "Planned publication"}
            >
              <input
                aria-describedby="planned-publication-help"
                aria-label={locale === "ar" ? "موعد النشر المخطط" : "Planned publication"}
                className="sunlit-field h-12 w-full rounded-xl px-4 text-base outline-none sm:max-w-sm"
                disabled={!canEdit}
                onChange={(event) => setPlannedAtInput(event.target.value)}
                type="datetime-local"
                value={plannedAtInput}
              />
              <p className="mt-4 text-sm leading-6 text-[var(--sunlit-muted)]" id="planned-publication-help">
                {locale === "ar"
                  ? "اختياري. يظهر المحتوى في التقويم في هذا الموعد، لكنه لن يُنشر حتى يصبح جاهزاً ثم تتم جدولته. اتركه فارغاً لحفظه ضمن غير المجدول."
                  : "Optional. This places the content on Calendar, but it will not publish until it is marked Ready and scheduled. Leave it empty to keep the draft in Unscheduled."}
              </p>
            </EditorBlock>

            <section>
              <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-black text-[var(--sunlit-ink)]">Images</h2>
                  <p className="mt-1 text-sm text-[var(--sunlit-muted)]">Upload a publish-ready JPEG or generate one with MARKOS AI.</p>
                </div>
                <span className="rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                  {attachedMediaAssets.length} attached
                </span>
              </div>
              <article className="sunlit-panel rounded-[1.75rem] p-5 xl:p-6">
                {selectedMedia ? (
                  <div className="overflow-hidden rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper-deep)]">
                    <button
                      aria-label={`Expand ${selectedMedia.filename}`}
                      className="group relative grid max-h-72 min-h-48 w-full place-items-center overflow-hidden bg-[var(--sunlit-paper-deep)]"
                      onClick={() => setExpandedMedia(selectedMedia)}
                      type="button"
                    >
                      {/* Workspace media can use API origins or data URLs that Next Image cannot safely preconfigure. */}
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img alt={selectedMedia.filename} className="max-h-72 w-full object-contain" src={selectedMedia.publicUrl} />
                      <span className="absolute bottom-3 right-3 inline-flex items-center gap-2 rounded-full bg-black/75 px-3 py-2 text-xs font-extrabold text-white opacity-90 transition group-hover:opacity-100">
                        <Maximize2 size={15} /> Expand
                      </span>
                    </button>
                    <div className="flex flex-wrap items-center justify-between gap-3 border-t border-[var(--sunlit-line)] bg-white px-4 py-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-extrabold text-[var(--sunlit-ink)]">{selectedMedia.filename}</p>
                        <p className="mt-1 text-xs text-[var(--sunlit-muted)]">
                          {selectedMedia.width && selectedMedia.height ? `${selectedMedia.width} × ${selectedMedia.height} · ` : ""}
                          {formatFileSize(selectedMedia.sizeBytes)}
                        </p>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        <a
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--sunlit-line)] px-4 text-sm font-extrabold text-[var(--sunlit-ink-soft)]"
                          href={selectedMedia.publicUrl}
                          rel="noreferrer"
                          target="_blank"
                        >
                          <ExternalLink size={16} /> Open original
                        </a>
                        <button
                          className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-[var(--sunlit-line)] px-4 text-sm font-extrabold text-[var(--sunlit-pink)] disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={!canManageMedia || removingMedia}
                          onClick={() => void removeSelectedMedia()}
                          type="button"
                        >
                          <Trash2 size={17} /> {removingMedia ? "Removing..." : "Remove from draft"}
                        </button>
                      </div>
                    </div>
                  </div>
                ) : (
                  <div className="grid min-h-44 place-items-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper-deep)] p-6 text-center">
                    <div>
                      <ImagePlus className="mx-auto text-[var(--sunlit-pink)]" size={34} />
                      <p className="mt-3 font-extrabold text-[var(--sunlit-ink)]">No image attached yet</p>
                      <p className="mt-1 text-sm text-[var(--sunlit-muted)]">Create or upload one after saving a content draft.</p>
                    </div>
                  </div>
                )}

                {attachedMediaAssets.length > 1 ? (
                  <div className="mt-4 flex gap-3 overflow-x-auto pb-1">
                    {attachedMediaAssets.map((asset) => (
                      <button
                        aria-label={`Preview ${asset.filename}`}
                        className={
                          selectedMedia?.id === asset.id
                            ? "h-16 w-16 shrink-0 overflow-hidden rounded-xl border-2 border-[var(--sunlit-pink)]"
                            : "h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-[var(--sunlit-line)]"
                        }
                        key={asset.id}
                        onClick={() => setSelectedMediaId(asset.id)}
                        type="button"
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img alt="" className="h-full w-full object-cover" src={asset.publicUrl} />
                      </button>
                    ))}
                  </div>
                ) : null}

                <div className="mt-5 grid gap-4 lg:grid-cols-2">
                  <div className="rounded-2xl bg-[var(--sunlit-paper-deep)] p-4">
                    <h3 className="font-extrabold text-[var(--sunlit-ink)]">Upload from your device</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">
                      JPEG only, no larger than 8 MB, 320–1,440 px wide, and between 4:5 portrait and 1.91:1 landscape.
                    </p>
                    <label className="sunlit-secondary mt-4 inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-xl px-4 text-sm font-extrabold has-[:disabled]:cursor-not-allowed has-[:disabled]:opacity-50">
                      <Upload size={18} /> {uploading ? "Uploading..." : "Choose JPEG"}
                      <input
                        accept=".jpg,.jpeg,image/jpeg"
                        aria-label="Upload JPEG"
                        className="sr-only"
                        disabled={!currentRecord || !canManageMedia || uploading}
                        onChange={(event) => void uploadImage(event)}
                        type="file"
                      />
                    </label>
                  </div>

                  <div className="rounded-2xl bg-[var(--sunlit-paper-deep)] p-4">
                    <h3 className="font-extrabold text-[var(--sunlit-ink)]">Generate an AI image</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">Uses the saved caption when the optional direction is empty.</p>
                    <input
                      className="sunlit-field mt-3 h-11 rounded-xl px-3 text-sm outline-none"
                      disabled={!canManageMedia}
                      onChange={(event) => setImagePrompt(event.target.value)}
                      placeholder="Optional visual direction"
                      value={imagePrompt}
                    />
                    <div className="mt-3 flex flex-wrap gap-3">
                      <select
                        aria-label="Image aspect ratio"
                        className="sunlit-field h-11 rounded-xl px-3 text-sm font-bold outline-none"
                        disabled={!canManageMedia}
                        onChange={(event) => setImageAspectRatio(event.target.value as "1:1" | "4:5" | "9:16")}
                        value={imageAspectRatio}
                      >
                        <option value="1:1">Square · 1:1</option>
                        <option value="4:5">Portrait · 4:5</option>
                        {contentType === "POST" ? null : <option value="9:16">Story / Reel · 9:16</option>}
                      </select>
                      <button
                        className="sunlit-primary inline-flex min-h-11 items-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={!currentRecord || !canManageMedia || generatingImage}
                        onClick={() => void generateImage()}
                        type="button"
                      >
                        <Wand2 size={18} /> {generatingImage ? "Generating..." : "Generate image"}
                      </button>
                    </div>
                  </div>
                </div>
                <p className="mt-4 text-xs leading-5 text-[var(--sunlit-muted)]">
                  MARKOS saves generated images as Instagram-ready JPEGs in this workspace. Review every generated image before marking the post Ready.
                  Instagram may still recompress the file and convert non-sRGB color to sRGB.
                </p>
              </article>
            </section>

            <EditorBlock title="Schedule">
              <div className="grid gap-4 sm:grid-cols-2">
                <input
                  className="sunlit-field h-12 rounded-xl px-4 text-base outline-none"
                  disabled={currentRecord?.status !== "APPROVED"}
                  onChange={(event) => setScheduleDate(event.target.value)}
                  type="date"
                  value={scheduleDate}
                />
                <input
                  className="sunlit-field h-12 rounded-xl px-4 text-base outline-none"
                  disabled={currentRecord?.status !== "APPROVED"}
                  onChange={(event) => setScheduleTime(event.target.value)}
                  type="time"
                  value={scheduleTime}
                />
              </div>
              <p className="mt-4 text-sm leading-6 text-[var(--sunlit-muted)]">
                {currentRecord?.status === "SCHEDULED"
                  ? `Scheduled for ${formatShortTime(currentRecord.scheduledAt ?? new Date().toISOString())}. Cancelling returns it to Ready; it does not delete the content.`
                  : "Ready is a separate required step. Once ready, choose a future time and add the item to the publishing queue."}
              </p>
            </EditorBlock>

            <EditorBlock action="Copy" disabled={!hasMeaningfulDraftWork} onAction={() => void copyCaption()} title="Actions">
              <div className="flex flex-wrap gap-3">
                <button
                  className="sunlit-primary min-h-11 rounded-xl px-5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    currentRecord?.status === "APPROVED"
                      ? scheduling
                      : currentRecord?.status === "SCHEDULED"
                        ? unscheduling
                        : !canApprove || approving || (!currentRecord && !hasMeaningfulDraftWork)
                  }
                  onClick={() => {
                    if (currentRecord?.status === "APPROVED") {
                      void scheduleDraft();
                    } else if (currentRecord?.status === "SCHEDULED") {
                      requestCancelSchedule();
                    } else {
                      void acceptDraft();
                    }
                  }}
                  type="button"
                >
                  {approving
                    ? "Marking ready..."
                    : scheduling
                      ? "Scheduling..."
                      : unscheduling
                        ? "Cancelling..."
                        : currentRecord?.status === "APPROVED"
                          ? "Schedule"
                          : currentRecord?.status === "SCHEDULED"
                            ? "Cancel schedule"
                            : currentRecord && !canApprove
                              ? statusLabel(currentRecord.status)
                              : "Mark as ready"}
                </button>
                <button
                  className="sunlit-secondary min-h-11 rounded-xl px-5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  onClick={() =>
                    requestReturnToCreateHome(
                      locale === "ar"
                        ? "تم حفظ العمل المؤكد. اختر كيف تريد بدء المحتوى التالي."
                        : "Your confirmed work is saved. Choose how to start the next item."
                    )
                  }
                  type="button"
                >
                  {locale === "ar" ? "إنشاء محتوى آخر" : "Create another"}
                </button>
                <button
                  className="sunlit-secondary min-h-11 rounded-xl px-5 text-sm font-extrabold disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!currentRecord}
                  onClick={() => void shareCaption()}
                  type="button"
                >
                  Share
                </button>
                <button
                  className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-[rgb(217_63_122_/_28%)] bg-white px-5 text-sm font-extrabold text-[var(--sunlit-pink)] disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!canDelete || deleting}
                  onClick={requestDeleteDraft}
                  title={currentRecord?.status === "SCHEDULED" ? "Cancel the schedule before deleting this post" : undefined}
                  type="button"
                >
                  <Trash2 size={17} /> {deleting ? "Deleting..." : "Delete post draft"}
                </button>
              </div>
              {currentRecord?.status === "SCHEDULED" ? (
                <p className="mt-4 text-sm font-bold text-[var(--sunlit-muted)]">Cancel the schedule first; deletion remains a separate confirmed action.</p>
              ) : null}
            </EditorBlock>
          </>
        ) : null}
      </div>

      <aside className="sticky top-6 hidden h-[calc(100vh-7.5rem)] flex-col items-center justify-center rounded-[2rem] bg-[var(--sunlit-paper-deep)] p-6 xl:flex">
        <p className="sunlit-eyebrow mb-5 self-start">Instagram preview</p>
        <InstagramPreview
          brandName={session?.workspace.name ?? "yourbrand"}
          caption={locale === "ar" ? captionAr || captionEn : captionEn || captionAr}
          hashtags={parseHashtags(hashtagsText)}
          locale={locale}
          media={selectedMedia}
          scheduledAt={currentRecord?.scheduledAt}
          type={selectedTypeLabel}
        />
        {currentRecord ? (
          <button
            className="mt-6 inline-flex items-center gap-3 text-base font-extrabold text-[var(--sunlit-pink)] disabled:cursor-not-allowed disabled:opacity-50"
            disabled={(!canSchedule && currentRecord.status !== "SCHEDULED") || scheduling || unscheduling}
            onClick={() => void (currentRecord.status === "SCHEDULED" ? requestCancelSchedule() : scheduleDraft())}
            type="button"
          >
            {scheduling ? "Scheduling..." : unscheduling ? "Cancelling..." : currentRecord.status === "SCHEDULED" ? "Cancel Schedule" : "Schedule Post"}
            {currentRecord.status === "SCHEDULED" ? <RotateCcw size={22} /> : <ArrowRight size={24} />}
          </button>
        ) : editorOpen ? (
          <p className="mt-6 max-w-xs text-center text-sm font-bold leading-6 text-[var(--sunlit-muted)]">
            {locale === "ar" ? "احفظ عملاً فعلياً أولاً لإضافة الوسائط أو الانتقال إلى الجدولة." : "Save real work first to add media or move into scheduling."}
          </p>
        ) : (
          <a className="mt-6 inline-flex items-center gap-3 text-base font-extrabold text-[var(--sunlit-pink)]" href={`/${locale}/app/calendar`}>
            {studioHomeCopy.calendarAction} <ArrowRight className={locale === "ar" ? "rotate-180" : ""} size={24} />
          </a>
        )}
      </aside>

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

      {expandedMedia ? <MediaViewerDialog media={expandedMedia} onClose={() => setExpandedMedia(null)} /> : null}
    </section>
  );
}

export function FinalAnalyticsPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [days, setDays] = useState(7);
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
  const audienceMetric =
    totals && typeof totals.profileViews === "number"
      ? { label: "Profile views", value: totals.profileViews }
      : { label: "Followers", value: totals?.followers ?? null };
  const daily = summary?.daily.filter((item) => item.totals.reach !== null).slice(-14) ?? [];
  const maximumReach = Math.max(...daily.map((item) => item.totals.reach ?? 0), 1);
  const copy =
    locale === "ar"
      ? {
          empty: "ستظهر بيانات الأداء هنا بعد ربط إنستغرام ومزامنة أول مجموعة من الإحصاءات.",
          export: "تصدير التقرير الشهري",
          heading: "الإحصاءات",
          range: days === 7 ? "آخر 7 أيام" : "آخر 30 يوماً",
          subtitle: "افهم ما ينجح، ثم حوّل ذلك إلى خطوة واضحة للمحتوى التالي."
        }
      : {
          empty: "Performance data will appear here after Instagram is connected and the first insights are synced.",
          export: "Export monthly report",
          heading: "Insights",
          range: days === 7 ? "Last 7 days" : "Last 30 days",
          subtitle: "See what is working, then turn it into a clear next move for your content."
        };

  return (
    <section className="space-y-6 xl:space-y-7">
      <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-5">
          <div className="max-w-3xl">
            <p className="sunlit-eyebrow">Instagram performance</p>
            <h1 className="mt-2 font-display text-2xl font-black tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{copy.heading}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">{copy.subtitle}</p>
          </div>
          <div className="flex flex-wrap gap-3">
            <button
              className="sunlit-secondary inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-extrabold"
              onClick={() => setDays(days === 7 ? 30 : 7)}
              type="button"
            >
              {copy.range}
            </button>
            <button
              className="sunlit-primary inline-flex min-h-11 items-center rounded-xl px-5 text-sm font-extrabold disabled:opacity-50"
              disabled={exporting || !session}
              onClick={() => void exportReport()}
              type="button"
            >
              {exporting ? "Preparing..." : copy.export}
            </button>
          </div>
        </div>
      </section>

      {message ? <article className="sunlit-panel-soft rounded-2xl p-5 text-sm font-bold text-[var(--sunlit-ink-soft)]">{message}</article> : null}

      <section className="grid gap-4 sm:grid-cols-3 xl:gap-6">
        <SunlitMetricCard
          icon={Users}
          label={audienceMetric.label}
          note={copy.range}
          tone="aqua"
          value={loading ? "…" : totals ? formatMetricValue(audienceMetric.value) : "—"}
        />
        <SunlitMetricCard icon={Eye} label="Reach" note={copy.range} tone="yellow" value={loading ? "…" : totals ? formatMetricValue(totals.reach) : "—"} />
        <SunlitMetricCard
          icon={Heart}
          label="Engagements"
          note={copy.range}
          tone="coral"
          value={loading ? "…" : totals ? formatMetricValue(totals.engagement) : "—"}
        />
      </section>

      <section className="grid gap-5 xl:grid-cols-[minmax(0,1.35fr)_minmax(20rem,.65fr)]">
        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <p className="sunlit-eyebrow">Reach over time</p>
          <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]">Daily Instagram reach</h2>
          {daily.length > 0 ? (
            <div className="mt-7 flex h-72 items-end gap-2 rounded-2xl bg-[var(--sunlit-paper)] px-5 pb-5 pt-8">
              {daily.map((item) => (
                <div className="group flex min-w-0 flex-1 flex-col items-center justify-end gap-2" key={item.dataDate}>
                  <span className="invisible rounded-md bg-[var(--sunlit-ink)] px-2 py-1 text-[10px] font-bold text-white group-hover:visible">
                    {formatMetricValue(item.totals.reach)}
                  </span>
                  <div
                    className="w-full min-w-2 rounded-t-lg bg-gradient-to-t from-[var(--sunlit-aqua)] to-[var(--sunlit-coral)] transition-[height]"
                    style={{ height: `${Math.max(8, ((item.totals.reach ?? 0) / maximumReach) * 190)}px` }}
                  />
                  <span className="text-[10px] font-bold text-[var(--sunlit-muted)]">{new Date(item.dataDate).getDate()}</span>
                </div>
              ))}
            </div>
          ) : (
            <div className="mt-7 grid min-h-72 place-items-center rounded-2xl border border-dashed border-[var(--sunlit-line-strong)] bg-[var(--sunlit-paper)] p-8 text-center">
              <div className="max-w-md">
                <BarChart3 className="mx-auto text-[var(--sunlit-aqua)]" size={38} />
                <p className="mt-4 font-extrabold text-[var(--sunlit-ink)]">No synced insight data yet</p>
                <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">{copy.empty}</p>
              </div>
            </div>
          )}
        </article>
        <article className="sunlit-panel rounded-[1.75rem] p-6 sm:p-7">
          <p className="sunlit-eyebrow">Content signals</p>
          <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]">Top content</h2>
          <div className="mt-6 grid gap-3">
            {summary?.topContent.length ? (
              summary.topContent.slice(0, 4).map((item, index) => (
                <a
                  className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4 transition hover:border-[var(--sunlit-line-strong)]"
                  href={`/${locale}/app/content-studio?item=${item.contentItemId}`}
                  key={item.contentItemId}
                >
                  <div className="flex items-start gap-3">
                    <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-paper-deep)] text-sm font-black text-[var(--sunlit-pink)]">
                      {index + 1}
                    </span>
                    <div className="min-w-0">
                      <p className="line-clamp-2 font-extrabold leading-6 text-[var(--sunlit-ink)]">{item.caption || contentTypeLabel(item.contentType)}</p>
                      <p className="mt-1 text-sm text-[var(--sunlit-muted)]">
                        {formatMetricValue(item.metrics.reach)} reach · {formatMetricValue(item.engagement)} engagements
                      </p>
                    </div>
                  </div>
                </a>
              ))
            ) : (
              <div className="rounded-2xl bg-[var(--sunlit-paper)] p-5">
                <p className="font-extrabold text-[var(--sunlit-ink)]">Nothing to rank yet</p>
                <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">
                  Once content has synced performance data, the strongest posts will appear here.
                </p>
              </div>
            )}
          </div>
        </article>
      </section>
    </section>
  );
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
          subtitle: "المعلومات المعتمدة التي يستخدمها MARKOS لفهم نشاطك وتوجيه الاستراتيجية والمحتوى.",
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
          subtitle: "The approved business context MARKOS uses to guide Strategy and content.",
          updated: "Last updated"
        };

  return (
    <section className="space-y-6 xl:space-y-7">
      <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
        <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_20rem] xl:items-center">
          <div className="max-w-3xl">
            <p className="sunlit-eyebrow">{copy.modules}</p>
            <h1 className="mt-2 font-display text-2xl font-black tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{copy.heading}</h1>
            <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">{copy.subtitle}</p>
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
                <p className="text-xs font-extrabold uppercase tracking-[.14em] text-[var(--sunlit-muted)]">Profile readiness</p>
                <p className="mt-2 text-sm font-bold text-[var(--sunlit-ink-soft)]">
                  {loading && !data ? "Loading profile..." : `${completedCount} of ${modules.length} sections`}
                </p>
              </div>
              <p className="text-3xl font-black text-[var(--sunlit-pink)]">{score}%</p>
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
        <h2 className="text-xl font-black text-[var(--sunlit-ink)]">{copy.modules}</h2>
        <span className="text-sm font-bold text-[var(--sunlit-muted)]">
          {completedCount}/{modules.length}
        </span>
      </div>
      <section className="grid gap-5 lg:grid-cols-2">
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
                  <h3 className="text-lg font-black text-[var(--sunlit-ink)]">{module.title}</h3>
                  <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">{module.description}</p>
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
          <h2 className="font-black text-[var(--sunlit-ink)]">One profile, used across MARKOS</h2>
          <p className="mt-2 max-w-4xl text-sm leading-6 text-[var(--sunlit-muted)]">
            Changes to approved business context can influence future Strategy and content. Existing saved work remains unchanged until you create a new
            version.
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
  badge,
  description,
  icon,
  label,
  onClick
}: {
  active: boolean;
  badge?: number;
  description: string;
  icon: IconType;
  label: string;
  onClick: () => void;
}) {
  const Icon = icon;

  return (
    <button
      aria-pressed={active}
      className={
        active
          ? "rounded-2xl border border-[rgb(217_63_122_/_28%)] bg-[var(--sunlit-paper-deep)] p-5 text-start shadow-sm"
          : "rounded-2xl border border-[var(--sunlit-line)] bg-white p-5 text-start transition hover:border-[var(--sunlit-line-strong)] hover:shadow-sm"
      }
      onClick={onClick}
      type="button"
    >
      <span className="flex items-start gap-4">
        <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
          <Icon size={21} />
        </span>
        <span className="min-w-0 flex-1">
          <span className="flex items-center justify-between gap-3">
            <span className="font-black text-[var(--sunlit-ink)]">{label}</span>
            {badge === undefined ? null : (
              <span className="rounded-full bg-white px-2.5 py-1 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">{badge}</span>
            )}
          </span>
          <span className="mt-1 block text-sm font-semibold leading-6 text-[var(--sunlit-muted)]">{description}</span>
        </span>
      </span>
    </button>
  );
}

function EditorBlock({
  action,
  busy = false,
  children,
  disabled = false,
  onAction,
  title
}: {
  action?: string;
  busy?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onAction?: () => void;
  title: string;
}) {
  function handleAction() {
    onAction?.();
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-black text-[var(--sunlit-ink)]">{title}</h2>
        {action ? (
          <button
            className="text-sm font-extrabold text-[var(--sunlit-pink)] disabled:cursor-not-allowed disabled:opacity-45"
            disabled={disabled || busy}
            onClick={handleAction}
            type="button"
          >
            {busy ? "Working..." : action}
          </button>
        ) : null}
      </div>
      <article className="sunlit-panel rounded-[1.75rem] p-5 xl:p-6">{children}</article>
    </section>
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
            <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]" id="studio-confirmation-title">
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
        <h2 className="mt-2 text-xl font-black text-[var(--sunlit-ink)]" id="unsaved-draft-title">
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

function MediaViewerDialog({ media, onClose }: { media: MediaAssetRecord; onClose: () => void }) {
  useEffect(() => {
    function closeOnEscape(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }

    document.addEventListener("keydown", closeOnEscape);
    return () => document.removeEventListener("keydown", closeOnEscape);
  }, [onClose]);

  return (
    <div className="fixed inset-0 z-[80] grid place-items-center bg-black/80 p-4 backdrop-blur-sm">
      <article
        aria-label={`Expanded preview of ${media.filename}`}
        aria-modal="true"
        className="relative flex max-h-[94vh] w-full max-w-6xl flex-col overflow-hidden rounded-2xl bg-black"
        role="dialog"
      >
        <div className="flex items-center justify-between gap-4 bg-black px-4 py-3 text-white">
          <p className="truncate text-sm font-extrabold">{media.filename}</p>
          <div className="flex items-center gap-2">
            <a
              className="inline-flex min-h-10 items-center gap-2 rounded-xl border border-white/25 px-3 text-sm font-bold"
              href={media.publicUrl}
              rel="noreferrer"
              target="_blank"
            >
              <ExternalLink size={16} /> Open original
            </a>
            <button aria-label="Close expanded image" className="rounded-xl border border-white/25 p-2.5" onClick={onClose} type="button">
              <X size={19} />
            </button>
          </div>
        </div>
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img alt={media.filename} className="min-h-0 w-full flex-1 object-contain" src={media.publicUrl} />
      </article>
    </div>
  );
}

function InstagramPreview({
  brandName,
  caption,
  hashtags,
  locale,
  media,
  scheduledAt,
  type
}: {
  brandName: string;
  caption: string;
  hashtags: string[];
  locale: Locale;
  media: MediaAssetRecord | null;
  scheduledAt: string | undefined;
  type: string;
}) {
  const cleanBrand = brandName.trim().replace(/^@/, "").replace(/\s+/g, "_").toLowerCase().slice(0, 30) || "yourbrand";
  const captionWithTags = [caption.trim(), hashtags.join(" ")].filter(Boolean).join("\n\n");
  const [expanded, setExpanded] = useState(false);
  const isLongCaption = captionWithTags.length > 150;
  const visibleCaption = expanded || !isLongCaption ? captionWithTags : `${captionWithTags.slice(0, 147).trimEnd()}…`;
  const direction = /[\u0600-\u06ff]/.test(captionWithTags) ? "rtl" : "ltr";
  const scheduledLabel = scheduledAt
    ? new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-BH", { day: "numeric", month: "long" }).format(new Date(scheduledAt))
    : undefined;

  useEffect(() => setExpanded(false), [captionWithTags]);

  return (
    <div className="mx-auto max-w-full rounded-[2.5rem] bg-[var(--sunlit-ink)] p-2.5 shadow-[0_24px_70px_rgba(32,33,43,.22)]">
      <article className="h-[min(620px,calc(100vh-11rem))] min-h-[460px] w-[min(350px,calc(100vw-4rem))] overflow-y-auto rounded-[2rem] bg-white text-[#171717]">
        <header className="flex items-center justify-between px-4 py-3">
          <div className="flex min-w-0 items-center gap-3">
            <span
              aria-label="Workspace avatar placeholder"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-gradient-to-br from-[var(--sunlit-yellow)] via-[var(--sunlit-coral)] to-[var(--sunlit-pink)] text-sm font-black text-white"
            >
              {cleanBrand.slice(0, 1).toUpperCase()}
            </span>
            <span className="truncate text-sm font-extrabold">{cleanBrand}</span>
          </div>
          <MoreHorizontal aria-hidden="true" size={22} />
        </header>

        {media ? (
          // The natural dimensions preserve feed framing without an artificial crop.
          // eslint-disable-next-line @next/next/no-img-element
          <img alt={media.filename} className="block h-auto w-full bg-black/5" src={media.publicUrl} />
        ) : (
          <div className="grid aspect-[4/5] place-items-center bg-[#f4f4f4] p-8 text-center">
            <div>
              <ImagePlus className="mx-auto text-black/35" size={42} />
              <p className="mt-3 text-sm font-bold text-black/55">Attach a JPEG to preview the {type.toLowerCase()} framing.</p>
            </div>
          </div>
        )}

        <div className="px-4 pb-5 pt-3">
          <div className="flex items-center justify-between">
            <div aria-label="Instagram action preview" className="flex items-center gap-4">
              <Heart aria-hidden="true" size={25} strokeWidth={1.8} />
              <MessageCircle aria-hidden="true" size={25} strokeWidth={1.8} />
              <Repeat2 aria-hidden="true" size={25} strokeWidth={1.8} />
              <Send aria-hidden="true" size={24} strokeWidth={1.8} />
            </div>
            <Bookmark aria-hidden="true" size={25} strokeWidth={1.8} />
          </div>
          <p className="mt-3 text-[10px] font-bold uppercase tracking-[.12em] text-black/40">Follower preview · no fabricated metrics</p>
          {captionWithTags ? (
            <p className="mt-3 whitespace-pre-wrap text-sm leading-5" dir={direction}>
              <span className="font-extrabold">{cleanBrand}</span> {visibleCaption}
              {isLongCaption ? (
                <button className="ms-1 font-semibold text-black/50" onClick={() => setExpanded((value) => !value)} type="button">
                  {expanded ? "less" : "more"}
                </button>
              ) : null}
            </p>
          ) : (
            <p className="mt-3 text-sm text-black/45">Caption preview will appear here.</p>
          )}
          {scheduledLabel ? <p className="mt-3 text-xs text-black/45">{scheduledLabel}</p> : null}
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
