"use client";

import { useEffect, useMemo, useState, type ReactNode } from "react";
import {
  ArrowRight,
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
  Heart,
  Image,
  Instagram,
  Lightbulb,
  Link2,
  LogOut,
  MessageCircle,
  Palette,
  Play,
  Settings,
  Sparkles,
  Target,
  TrendingUp,
  User,
  Users,
  Wand2,
  Zap
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import type { AnalyticsSummary, ContentRecord, ContentStatus, ContentType, Locale, VaultCompletenessScore } from "@markos/shared-types";
import { logoutBrowserSession, useMarkosClient, useMarkosSession } from "./browser-session";

type Accent = "amber" | "gold" | "teal";
type IconType = typeof Sparkles;
type StudioContentType = Extract<ContentType, "POST" | "REEL" | "CAROUSEL" | "STORY">;

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
  ["POST", "Post", Image],
  ["REEL", "Reel", Play],
  ["CAROUSEL", "Carousel", Image],
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
  return status
    .toLowerCase()
    .replace("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function contentCardFromRecord(record: ContentRecord, locale: Locale, index: number): ContentReadyCardModel {
  const accentNames: Accent[] = ["teal", "gold", "amber", "teal"];
  const status = record.scheduledAt ? formatShortTime(record.scheduledAt) : statusLabel(record.status);
  const cta =
    record.status === "SCHEDULED" || record.status === "PUBLISHED"
      ? "View Details"
      : record.status === "APPROVED"
        ? "Schedule Post"
        : "Review & Approve";

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

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", { maximumFractionDigits: value >= 10000 ? 1 : 0, notation: value >= 10000 ? "compact" : "standard" }).format(value);
}

function parseHashtags(value: string): string[] {
  return value
    .split(/[\s,]+/)
    .map((tag) => tag.trim())
    .filter(Boolean)
    .map((tag) => (tag.startsWith("#") ? tag : `#${tag}`))
    .filter((tag, index, all) => all.indexOf(tag) === index)
    .slice(0, 30);
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

function contentStudioError(error: unknown): string {
  const message = error instanceof Error ? error.message : "MARKOS could not complete that action.";
  const lower = message.toLowerCase();

  if (lower.includes("vault") || lower.includes("context")) {
    return "The Knowledge Vault needs business memory before MARKOS can generate grounded content. Complete at least one Vault section, then generate again.";
  }

  if (lower.includes("quota") || lower.includes("limit")) {
    return "This workspace has reached its current AI quota. Upgrade or wait for the quota window to reset before generating more content.";
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

  throw new Error(`Only draft or in-review content can be approved. Current status: ${statusLabel(record.status)}.`);
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
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [liveState, setLiveState] = useState<DashboardLiveState>({
    analytics: null,
    contentItems: [],
    error: "",
    loading: false,
    publishingQueue: [],
    vaultScore: null
  });
  const aiPrompts = ["What should I post today?", "Create a reel about my product.", "Explain this opportunity.", "Show revenue opportunities."];
  const firstName = session?.user.fullName.split(/\s+/)[0] || "there";
  const workspaceName = session?.workspace.name || "your workspace";
  const readyItems = liveState.contentItems.filter((item) => item.status === "DRAFT" || item.status === "IN_REVIEW" || item.status === "APPROVED" || item.status === "SCHEDULED");
  const dynamicCards = readyItems.slice(0, 4).map((item, index) => contentCardFromRecord(item, locale, index));
  const topContent = liveState.contentItems[0];
  const analyticsTotals = liveState.analytics?.totals;
  const growthValue = analyticsTotals?.followers ? `+${formatCompactNumber(analyticsTotals.followers)}` : liveState.contentItems.length ? `${liveState.contentItems.length}` : "Needs data";
  const reachValue = analyticsTotals?.reach ? formatCompactNumber(analyticsTotals.reach) : liveState.analytics ? "0" : "Needs data";
  const bestTimeValue = liveState.publishingQueue[0]?.scheduledAt ? formatShortTime(liveState.publishingQueue[0].scheduledAt) : "Set schedule";
  const missionTitle = topContent ? recordTitle(topContent) : "Create your first workspace-backed content draft";
  const missionCta = topContent ? (topContent.status === "APPROVED" ? "Schedule Content" : "Review Content") : "Open Content Studio";
  const missionHref = topContent ? `/${locale}/app/content-studio?item=${topContent.id}` : `/${locale}/app/content-studio`;

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
    <section className="min-w-0 space-y-5 xl:space-y-6">
      <ProfileRow locale={locale} name={firstName === "there" ? "MARKOS" : firstName} />
      <section className="lux-card relative w-full min-w-0 overflow-hidden rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
        <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-[#81D8D0]/10 blur-3xl xl:h-80 xl:w-80" />
        <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-[#D4AF37]/10 blur-3xl xl:h-80 xl:w-80" />
        <div className="relative min-w-0 max-w-6xl">
          <div className="mb-5 flex items-center gap-4 xl:mb-6">
            <div className="lux-ai-core shrink-0" aria-hidden="true" />
            <div>
              <p className="text-base text-[#9AA7BD]">{now}</p>
              <p className="text-sm font-bold uppercase tracking-[.12em] text-[#81D8D0]">Your AI Chief Marketing Officer</p>
            </div>
          </div>
          <h1 className="min-w-0 break-words font-display text-3xl font-bold tracking-normal text-white sm:text-4xl 2xl:text-5xl">Good Morning, {firstName}</h1>
          <p className="mt-4 min-w-0 max-w-5xl break-words text-lg leading-relaxed text-[#D6DEEA] sm:text-xl 2xl:text-2xl">
            {topContent ? (
              <>
                MARKOS found <span className="font-bold text-[#81D8D0]">{statusLabel(topContent.status).toLowerCase()} content</span> in <span className="font-bold text-[#D4AF37]">{workspaceName}</span> ready for the next workflow step.
              </>
            ) : (
              <>
                MARKOS is ready to generate real, workspace-backed marketing work once your session and Knowledge Vault are connected.
              </>
            )}
          </p>
        </div>
      </section>

      {!session ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#D4AF37]/24 p-5">
          <p className="font-bold text-white">Live work needs a workspace session.</p>
          <p className="mt-2 text-[#B8C4D8]">Sign in or complete onboarding first so generated content can be stored, reviewed, approved, and scheduled against the correct workspace.</p>
        </article>
      ) : liveState.loading ? (
        <article className="lux-card-muted rounded-[1.25rem] p-5">
          <p className="font-bold text-white">Loading live workspace data...</p>
          <p className="mt-2 text-[#B8C4D8]">MARKOS is checking content, queue, analytics, and Vault grounding.</p>
        </article>
      ) : liveState.error ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#F4A460]/24 p-5">
          <p className="font-bold text-white">The API could not load dashboard work.</p>
          <p className="mt-2 text-[#F4A460]">{liveState.error}</p>
        </article>
      ) : liveState.vaultScore?.entryCount === 0 ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#D4AF37]/24 p-5">
          <p className="font-bold text-white">Knowledge Vault is empty.</p>
          <p className="mt-2 text-[#B8C4D8]">Complete at least one Vault section before asking MARKOS to generate grounded content.</p>
        </article>
      ) : null}

      <section className="grid min-w-0 gap-4 sm:grid-cols-3 xl:gap-5">
        <MetricRingCard accentName="teal" icon={TrendingUp} label="Content/Followers" sub={liveState.contentItems.length ? `${liveState.contentItems.length} workspace items` : "Generate first draft"} value={growthValue} />
        <MetricRingCard accentName="gold" icon={Clock} label="Best Posting Time" sub={liveState.publishingQueue.length ? "Next scheduled item" : "Approve then schedule"} value={bestTimeValue} />
        <MetricRingCard accentName="amber" icon={Eye} label="Reach" sub={liveState.analytics ? "Last 7 days" : "Connect analytics"} value={reachValue} />
      </section>

      <SectionLabel accentName="teal" label="Today's Mission" />
      <section className="lux-card rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center xl:gap-6">
          <IconTile accentName="teal" icon={Target} size="lg" />
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold text-white xl:text-3xl">{missionTitle}</h2>
            <div className="mt-5 flex flex-wrap gap-5 xl:gap-7">
              <MiniStat accentName="teal" icon={Eye} label="Reach" value={analyticsTotals?.reach ? formatCompactNumber(analyticsTotals.reach) : "Needs data"} />
              <MiniStat accentName="gold" icon={TrendingUp} label="Queue" value={String(liveState.publishingQueue.length)} />
              <MiniStat accentName="amber" icon={CheckCircle2} label="Vault" value={liveState.vaultScore ? `${liveState.vaultScore.score}%` : "N/A"} />
            </div>
            <div className="mt-7 flex flex-wrap gap-4">
              <a className="lux-button-primary inline-flex items-center gap-3 rounded-full px-6 py-3 text-base font-bold xl:px-8 xl:py-4 xl:text-lg" href={missionHref}>
                {missionCta} <ArrowRight size={21} />
              </a>
              <a className="rounded-full border border-[#81D8D0]/20 px-6 py-3 text-base font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/45 hover:bg-[#81D8D0]/10 xl:px-8 xl:py-4 xl:text-lg" href={`/${locale}/app/opportunities`}>
                View Other Opportunities
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <SectionLabel accentName="gold" label="Content Ready" />
        <a className="inline-flex items-center gap-2 text-lg font-bold text-[#81D8D0]" href={`/${locale}/app/content-studio`}>View All <ArrowRight size={19} /></a>
      </div>
      {dynamicCards.length > 0 ? (
        <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dynamicCards.map((card) => <ContentReadyCard key={`${card.label}-${card.title}-${card.status}`} locale={locale} {...card} />)}
        </section>
      ) : (
        <article className="lux-card-muted rounded-[1.5rem] p-5 xl:p-7">
          <p className="text-xl font-bold text-white">No generated workspace content yet.</p>
          <p className="mt-3 max-w-3xl text-[#B8C4D8]">Use Content Studio to generate the first real draft. It will appear here after MARKOS saves it to your workspace.</p>
          <a className="mt-5 inline-flex items-center gap-3 rounded-full border border-[#81D8D0]/24 bg-[#81D8D0]/10 px-6 py-3 font-bold text-[#81D8D0]" href={`/${locale}/app/content-studio`}>
            Generate content <ArrowRight size={18} />
          </a>
        </article>
      )}

      <div className="fixed bottom-24 right-5 z-50 sm:bottom-8 sm:right-8">
        {assistantOpen ? (
          <div className="mb-4 w-[min(20rem,calc(100vw-2.5rem))] rounded-[1.35rem] border border-[#81D8D0]/22 bg-[#111920] p-4 shadow-[0_24px_70px_rgba(0,0,0,.5)]">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="font-bold text-white">Ask Your AI CMO</p>
              <button className="text-[#9AA7BD] transition hover:text-white" onClick={() => setAssistantOpen(false)} type="button">
                Close
              </button>
            </div>
            <div className="grid gap-2">
              {aiPrompts.map((prompt) => (
                <a className="rounded-xl border border-[#81D8D0]/12 bg-[#81D8D0]/6 px-4 py-2.5 text-sm font-semibold text-[#D6DEEA] transition hover:border-[#81D8D0]/30 hover:bg-[#81D8D0]/10 hover:text-white" href={`/${locale}/app/content-studio`} key={prompt}>
                  {prompt}
                </a>
              ))}
            </div>
          </div>
        ) : null}
        <button
          aria-expanded={assistantOpen}
          aria-label="Ask MARKOS"
          className="grid h-14 w-14 place-items-center rounded-full bg-gradient-to-br from-[#81D8D0] via-[#D4AF37] to-[#F4A460] text-[#0F1419] shadow-[0_18px_48px_rgba(212,175,55,.32)] transition hover:scale-105 xl:h-16 xl:w-16"
          onClick={() => setAssistantOpen((current) => !current)}
          type="button"
        >
          <Sparkles size={30} strokeWidth={2.2} />
        </button>
      </div>
    </section>
  );
}

export function DailyBriefingPanel({ locale }: { locale: Locale }) {
  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle icon={Calendar} subtitle="Thursday, June 18" title="Daily Marketing Briefing" />
      <article className="lux-card rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
        <h2 className="font-display text-2xl font-bold text-white xl:text-3xl">Executive Summary</h2>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-[#D6DEEA] xl:text-lg">
          <p><span className="font-bold text-[#81D8D0]">Strong momentum continues.</span> Your luxury jewelry content is resonating exceptionally well with your target audience, driving 3.2x higher engagement than your baseline.</p>
          <p>I have identified a <span className="font-bold text-[#D4AF37]">golden opportunity window</span> this evening, 7:30-9:00 PM, when your audience will be most receptive.</p>
          <p><span className="font-bold text-[#00C9A7]">24-hour growth: +847 followers</span> with engagement rate at 92%, significantly above your industry benchmark of 4.2%.</p>
        </div>
      </article>

      <SectionHeading title="Performance Highlights" />
      <section className="grid min-w-0 gap-5 lg:grid-cols-2">
        {performanceHighlights.map((item) => <PerformanceCard key={item.label} {...item} />)}
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
                <a className="mt-5 inline-flex items-center gap-2 text-base font-bold text-[#81D8D0] xl:text-lg" href={`/${locale}/app/campaign-builder`}>{item.cta} <ArrowRight size={19} /></a>
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
          <div className={index === 0 ? "grid gap-4 py-5 md:grid-cols-[120px_1fr_auto] xl:grid-cols-[130px_1fr_auto]" : "grid gap-4 border-t border-[#81D8D0]/10 py-5 md:grid-cols-[120px_1fr_auto] xl:grid-cols-[130px_1fr_auto]"} key={time}>
            <p className="font-mono text-base font-bold text-[#81D8D0] xl:text-lg">{time}</p>
            <div>
              <p className="text-lg font-bold text-white xl:text-xl">{title}</p>
              <p className="mt-1 text-base text-[#9AA7BD] xl:text-lg">{duration}</p>
            </div>
            <a className="rounded-full bg-[#C7CDD8]/18 px-5 py-2.5 text-center font-bold text-white transition hover:bg-[#81D8D0]/20 xl:px-7 xl:py-3" href={`/${locale}/app/campaign-builder`}>Schedule</a>
          </div>
        ))}
      </article>
    </section>
  );
}

export function OpportunitiesPanel({ locale }: { locale: Locale }) {
  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle icon={Sparkles} subtitle="I've discovered 3 high-impact opportunities by analyzing your audience behavior, industry trends, and competitor strategies." title="Content Opportunities" />
      <div className="grid gap-6">
        {opportunityCards.map((card) => <OpportunityCard key={card.title} locale={locale} {...card} />)}
      </div>
    </section>
  );
}

export function CampaignBuilderPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [campaignPrompt, setCampaignPrompt] = useState("Launch a high-performing campaign for our most important offer. Use the Knowledge Vault for audience, positioning, language, and brand voice.");
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
                <span className={step === index + 1 ? "grid h-12 w-12 place-items-center rounded-full bg-[#81D8D0] font-bold text-[#0F1419]" : "grid h-12 w-12 place-items-center rounded-full bg-white/14 font-bold"}>{index + 1}</span>
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
            <button className="mt-5 inline-flex items-center gap-3 rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-6 py-3.5 text-base font-bold text-white transition hover:bg-[#81D8D0]/18 disabled:cursor-not-allowed disabled:opacity-60 xl:px-7 xl:py-4 xl:text-lg" disabled={generatingCampaign} onClick={generateCampaignDrafts} type="button">
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
                  setCampaignPrompt(`${title}: ${body}. Build a ${days.toLowerCase()} plan with ${posts.toLowerCase()} for our active workspace audience and offer.`);
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
                <span className="mt-10 inline-flex items-center gap-2 rounded-full border border-[#81D8D0]/20 px-6 py-3 font-bold text-[#81D8D0]">Select Template <ArrowRight size={18} /></span>
              </button>
            ))}
          </section>
        </>
      ) : null}

      {step >= 2 ? (
        <section className="space-y-6 xl:space-y-8">
          <div className="flex items-center justify-between">
            <SectionHeading title="AI-Generated Campaign Preview" />
            <button className="rounded-full border border-[#81D8D0]/20 px-6 py-3 font-bold text-white disabled:cursor-not-allowed disabled:opacity-60" disabled={generatingCampaign} onClick={generateCampaignDrafts} type="button">{generatingCampaign ? "Regenerating..." : "Regenerate"}</button>
          </div>
          <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
            <div className="mb-6 flex items-center gap-4 xl:mb-8 xl:gap-5">
              <IconTile accentName="teal" icon={Sparkles} />
              <div>
                <h3 className="text-xl font-bold text-white xl:text-2xl">Workspace Campaign Drafts</h3>
                <p className="mt-2 text-base text-[#D6DEEA] xl:text-lg">{timelineRecords.length || 0} saved content pieces - approval required before scheduling</p>
              </div>
            </div>
            {timelineRecords.length > 0 ? (
              <div className="grid gap-4">
                {timelineRecords.map((record, index) => (
                  <a className="lux-card-muted grid gap-4 rounded-[1.5rem] p-5 transition hover:border-[#81D8D0]/35 md:grid-cols-[80px_1fr_auto] xl:grid-cols-[90px_1fr_auto] xl:gap-5" href={`/${locale}/app/content-studio?item=${record.id}`} key={record.id}>
                  <div className="border-r border-white/10 pr-5">
                    <p className="text-2xl font-bold text-white xl:text-3xl">{index + 1}</p>
                    <p className="text-[#9AA7BD]">Day</p>
                  </div>
                  <div>
                    <p className="text-xl font-bold text-white">{recordTitle(record)}</p>
                    <p className="mt-2 text-lg text-[#9AA7BD]">{record.scheduledAt ? formatShortTime(record.scheduledAt) : "7:30 PM"} - {contentTypeLabel(record.contentType)}</p>
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
            <button className="inline-flex items-center gap-3 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 xl:text-xl" disabled={schedulingCampaign || campaignRecords.length === 0} onClick={scheduleCampaign} type="button"><Calendar size={24} /> {schedulingCampaign ? "Scheduling..." : "Schedule Campaign"} <ArrowRight size={24} /></button>
            <button className="rounded-[1.5rem] bg-white/16 px-8 py-4 text-lg font-bold text-white transition hover:bg-[#81D8D0]/16 xl:px-10 xl:py-5 xl:text-xl" onClick={() => setSaved(true)} type="button">{saved ? "Draft Saved" : "Save as Draft"}</button>
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
  const [prompt, setPrompt] = useState("");
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<ContentRecord | null>(null);
  const [caption, setCaption] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [scheduleDate, setScheduleDate] = useState(initialScheduleDate);
  const [scheduleTime, setScheduleTime] = useState("19:30");
  const [message, setMessage] = useState("");
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const selectedTypeLabel = studioTypes.find(([value]) => value === contentType)?.[1] ?? "Post";
  const canEdit = currentRecord?.status === "DRAFT" || currentRecord?.status === "IN_REVIEW";
  const canSchedule = currentRecord !== null && currentRecord.status !== "SCHEDULED" && currentRecord.status !== "PUBLISHED" && currentRecord.status !== "FAILED";

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
        const nextRecords = await client.contentItems();

        if (cancelled) {
          return;
        }

        setRecords(nextRecords);
        const requestedItemId = params.get("item");
        const requestedRecord = requestedItemId ? nextRecords.find((item) => item.id === requestedItemId) : null;
        const latestEditable = nextRecords.find((item) => item.status === "DRAFT" || item.status === "IN_REVIEW" || item.status === "APPROVED") ?? nextRecords[0] ?? null;

        if (requestedRecord ?? latestEditable) {
          applyRecord(requestedRecord ?? latestEditable);
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
  }, [client, session]);

  function applyRecord(record: ContentRecord | null, note?: string) {
    setCurrentRecord(record);

    if (record) {
      setContentType(record.contentType);
      setCaption(record.captionEn ?? record.captionAr ?? "");
      setHashtagsText(record.hashtags.join(" "));
      setCallToAction(record.callToAction ?? "");
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

    if (!currentRecord) {
      setMessage("Generate or choose a draft before saving edits.");
      return null;
    }

    if (!canEdit) {
      if (showMessage) {
        setMessage(`This item is ${statusLabel(currentRecord.status).toLowerCase()} and cannot be edited in this state.`);
      }
      return currentRecord;
    }

    setSaving(true);

    try {
      const updated = await client.updateContent(currentRecord.id, {
        callToAction: callToAction.trim() || null,
        captionEn: caption.trim() || null,
        hashtags: parseHashtags(hashtagsText)
      });
      upsertRecord(updated);
      applyRecord(updated, showMessage ? "Edits saved to the workspace draft." : undefined);
      return updated;
    } catch (error) {
      setMessage(contentStudioError(error));
      return null;
    } finally {
      setSaving(false);
    }
  }

  async function acceptDraft() {
    if (!session || !currentRecord) {
      setMessage("Generate or choose a workspace draft before approving.");
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
      applyRecord(approved, "Content approved. It is now eligible for scheduling.");
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
      setMessage(`This item is ${statusLabel(currentRecord.status).toLowerCase()} and cannot be scheduled from here.`);
      return;
    }

    setScheduling(true);

    try {
      const scheduledAt = toScheduleIso(scheduleDate, scheduleTime);
      const editableRecord = canEdit ? await persistEditableDraft(false) : currentRecord;
      if (!editableRecord) {
        return;
      }

      const approved = await approveContentRecord(client, editableRecord);
      const scheduled = await client.scheduleContent(approved.id, scheduledAt);
      upsertRecord(scheduled);
      applyRecord(scheduled, `Scheduled for ${formatShortTime(scheduled.scheduledAt ?? scheduledAt)}.`);
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setScheduling(false);
    }
  }

  async function copyCaption() {
    const text = [caption, callToAction, hashtagsText].filter(Boolean).join("\n\n");

    if (!text.trim()) {
      setMessage("There is no generated content to copy yet.");
      return;
    }

    await navigator.clipboard.writeText(text);
    setMessage("Caption copied.");
  }

  async function shareCaption() {
    const text = [caption, callToAction, hashtagsText].filter(Boolean).join("\n\n");

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
    <section className="grid min-h-[calc(100vh-72px)] min-w-0 gap-6 xl:grid-cols-[minmax(320px,500px)_1fr] xl:gap-8">
      <div className="min-w-0 space-y-5 xl:space-y-7">
        <div>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">AI Content Studio</h1>
          <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">Generate, edit, approve, and schedule workspace-backed content.</p>
        </div>
        {message ? (
          <article className="lux-card-muted rounded-[1.25rem] border-[#81D8D0]/20 p-5">
            <p className="text-base font-semibold text-[#D6DEEA]">{message}</p>
          </article>
        ) : null}
        <section>
          <h2 className="mb-4 text-xl font-bold text-white">Content Type</h2>
          <div className="grid gap-4 sm:grid-cols-2">
            {studioTypes.map(([value, label, Icon]) => (
              <button className={contentType === value ? "rounded-full border border-[#81D8D0] bg-[#81D8D0]/10 px-5 py-4 text-left font-bold text-white xl:px-6 xl:py-5" : "rounded-full border border-[#81D8D0]/16 bg-[#81D8D0]/6 px-5 py-4 text-left font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/35 xl:px-6 xl:py-5"} key={value} onClick={() => setContentType(value)} type="button">
                <span className="inline-flex items-center gap-4"><Icon size={22} />{label}</span>
              </button>
            ))}
          </div>
        </section>

        <article className="lux-card rounded-[1.75rem] p-5 xl:p-7">
          <h2 className="flex items-center gap-3 text-xl font-bold text-white"><Sparkles className="text-[#81D8D0]" /> AI Content Generator</h2>
          <textarea
            className="mt-5 min-h-32 w-full resize-none rounded-[1.25rem] border border-[#81D8D0]/10 bg-white/[.045] p-4 text-base leading-relaxed text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45 xl:min-h-36 xl:p-5 xl:text-lg"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the content you want MARKOS to create, including offer, audience, language, and objective."
            value={prompt}
          />
          <button className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-6 py-3.5 text-base font-bold text-white transition hover:bg-[#81D8D0]/18 disabled:cursor-not-allowed disabled:opacity-60 xl:px-7 xl:py-4 xl:text-lg" disabled={generating} onClick={generate} type="button">
            {generating ? <span className="lux-thinking-dot" aria-hidden="true" /> : <Wand2 size={20} />}
            {generating ? "MARKOS is generating..." : "Generate with AI"}
          </button>
        </article>

        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[.16em] text-[#9AA7BD]">Quick Prompts</h2>
          <div className="flex flex-wrap gap-3">
            {["Behind the scenes", "Product showcase", "Customer testimonial", "Limited offer", "Story time"].map((prompt) => (
              <button className="rounded-full border border-[#81D8D0]/14 bg-[#81D8D0]/7 px-5 py-3 font-semibold text-[#D6DEEA] transition hover:border-[#81D8D0]/36 hover:text-white" key={prompt} onClick={() => setPrompt(`Create a ${selectedTypeLabel.toLowerCase()} about ${prompt.toLowerCase()} for our current campaign. Use the Knowledge Vault for brand voice and audience context.`)} type="button">{prompt}</button>
            ))}
          </div>
        </section>

        {loadingRecords ? (
          <article className="lux-card-muted rounded-[1.75rem] p-6 text-[#D6DEEA]">Loading workspace drafts...</article>
        ) : records.length > 0 ? (
          <section>
            <h2 className="mb-4 text-xl font-bold text-white">Workspace Drafts</h2>
            <div className="grid gap-3">
              {records.slice(0, 4).map((record) => (
                <button
                  className={currentRecord?.id === record.id ? "rounded-2xl border border-[#81D8D0]/40 bg-[#81D8D0]/10 px-5 py-4 text-left" : "rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 px-5 py-4 text-left transition hover:border-[#81D8D0]/30"}
                  key={record.id}
                  onClick={() => applyRecord(record, "Loaded workspace draft.")}
                  type="button"
                >
                  <span className="block font-bold text-white">{recordTitle(record)}</span>
                  <span className="mt-1 block text-sm text-[#9AA7BD]">{contentTypeLabel(record.contentType)} - {statusLabel(record.status)}</span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <EditorBlock action="Save edits" busy={saving} disabled={!currentRecord || !canEdit} onAction={() => void persistEditableDraft()} title="Caption">
          <textarea
            className="min-h-56 w-full resize-none border-0 bg-transparent text-lg leading-relaxed text-white outline-none placeholder:text-[#8B95A8] xl:min-h-72 xl:text-xl"
            disabled={!canEdit}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Generated caption will appear here after MARKOS creates a draft."
            value={caption}
          />
          <div className="mt-8 border-t border-white/10 pt-5 text-[#9AA7BD]">{caption.length} / 2,200 characters</div>
        </EditorBlock>

        <EditorBlock action="Save tags" busy={saving} disabled={!currentRecord || !canEdit} onAction={() => void persistEditableDraft()} title="Hashtags">
          <textarea
            className="min-h-24 w-full resize-none border-0 bg-transparent text-base leading-relaxed text-white outline-none placeholder:text-[#8B95A8] xl:min-h-28 xl:text-lg"
            disabled={!canEdit}
            onChange={(event) => setHashtagsText(event.target.value)}
            placeholder="#Generated #Hashtags"
            value={hashtagsText}
          />
        </EditorBlock>

        <EditorBlock action="Schedule" busy={scheduling} disabled={!currentRecord || !canSchedule} onAction={() => void scheduleDraft()} title="Schedule">
          <div className="grid gap-4 sm:grid-cols-2">
            <input className="rounded-full border border-[#81D8D0]/12 bg-white/[.055] px-4 py-3 text-lg text-white outline-none focus:border-[#81D8D0]/40 xl:px-5 xl:py-4 xl:text-xl" onChange={(event) => setScheduleDate(event.target.value)} type="date" value={scheduleDate} />
            <input className="rounded-full border border-[#81D8D0]/12 bg-white/[.055] px-4 py-3 text-lg text-white outline-none focus:border-[#81D8D0]/40 xl:px-5 xl:py-4 xl:text-xl" onChange={(event) => setScheduleTime(event.target.value)} type="time" value={scheduleTime} />
          </div>
          <p className="mt-4 text-[#9AA7BD]">Scheduling will save edits, approve the draft if needed, then create a scheduled content item.</p>
        </EditorBlock>

        <EditorBlock action="Copy" disabled={!currentRecord} onAction={() => void copyCaption()} title="Actions">
          <div className="flex flex-wrap gap-3">
            <button className="rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-6 py-3 font-bold text-[#81D8D0] disabled:cursor-not-allowed disabled:opacity-50" disabled={!currentRecord || approving} onClick={acceptDraft} type="button">{approving ? "Approving..." : "Accept & Approve"}</button>
            <button className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-6 py-3 font-bold text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-50" disabled={generating || !prompt.trim()} onClick={generate} type="button">Regenerate</button>
            <button className="rounded-full border border-[#F4A460]/20 bg-[#F4A460]/10 px-6 py-3 font-bold text-[#F4A460] disabled:cursor-not-allowed disabled:opacity-50" disabled={!currentRecord} onClick={() => void shareCaption()} type="button">Share</button>
          </div>
        </EditorBlock>
      </div>

      <aside className="sticky top-6 hidden h-[calc(100vh-72px)] flex-col items-center justify-center xl:flex">
        <InstagramPreview brandName={session?.workspace.name ?? "yourbrand"} caption={caption} hashtags={parseHashtags(hashtagsText)} type={selectedTypeLabel} />
        <button className="mt-6 inline-flex items-center gap-3 text-xl font-bold text-white disabled:cursor-not-allowed disabled:opacity-50" disabled={!currentRecord || scheduling} onClick={scheduleDraft} type="button">
          {scheduling ? "Scheduling..." : "Schedule Post"} <ArrowRight size={24} />
        </button>
      </aside>
    </section>
  );
}

export function FinalAnalyticsPanel({ locale }: { locale: Locale }) {
  const [range, setRange] = useState("Last 7 days");
  const [exported, setExported] = useState(false);
  return (
    <section className="space-y-6 xl:space-y-8">
      <div className="flex flex-wrap items-start justify-between gap-5">
        <div>
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Analytics Command Center <span className="rounded-full border border-[#81D8D0]/22 px-3 py-1.5 text-base text-[#81D8D0]">Live</span></h1>
          <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">AI-powered intelligence dashboard</p>
        </div>
        <div className="flex gap-3 xl:gap-4">
          <button className="rounded-full border border-[#81D8D0]/18 px-6 py-3 text-base font-bold text-white xl:px-8 xl:py-4 xl:text-lg" onClick={() => setRange(range === "Last 7 days" ? "Last 30 days" : "Last 7 days")} type="button">{range}</button>
          <button className="lux-button-primary rounded-full px-6 py-3 text-base font-bold xl:px-8 xl:py-4 xl:text-lg" onClick={() => setExported(true)} type="button">{exported ? "Report Ready" : "Export Report"}</button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3 xl:gap-6">
        <MetricRingCard accentName="teal" icon={Users} label="Followers" sub="+12.5%" value="12,847" />
        <MetricRingCard accentName="gold" icon={Eye} label="Reach" sub="+18%" value="156K" />
        <MetricRingCard accentName="amber" icon={Heart} label="Engagement" sub="+0.3%" value="4.8%" />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_340px] xl:gap-6 xl:grid-cols-[1fr_380px]">
        <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
          <SectionLabel accentName="teal" label="Growth Intelligence" />
          <p className="mt-2 text-lg text-[#9AA7BD] xl:text-xl">Follower trajectory and engagement correlation</p>
          <div className="mt-7 h-[300px] rounded-[1.5rem] border border-[#81D8D0]/10 bg-[#81D8D0]/5 p-5 xl:mt-9 xl:h-[360px] xl:p-6">
            <svg className="h-full w-full" viewBox="0 0 760 300" preserveAspectRatio="none">
              {[0, 1, 2, 3].map((i) => <line key={i} x1="0" x2="760" y1={48 + i * 68} y2={48 + i * 68} stroke="rgba(129,216,208,.08)" strokeDasharray="5 8" />)}
              <path d="M0 220 C160 215 260 214 380 205 C520 195 620 170 760 145" fill="none" stroke="#81D8D0" strokeWidth="4" />
              <path d="M0 300 L0 220 C160 215 260 214 380 205 C520 195 620 170 760 145 L760 300 Z" fill="rgba(129,216,208,.15)" />
              <path d="M0 292 L760 292" stroke="#D4AF37" strokeWidth="4" />
            </svg>
          </div>
        </article>
        <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
          <SectionLabel accentName="gold" label="Audience Orbit" />
          <p className="mt-2 text-lg text-[#9AA7BD] xl:text-xl">Demographic distribution</p>
          <div className="mt-7 grid place-items-center xl:mt-9">
            <div className="grid h-48 w-48 place-items-center rounded-full xl:h-56 xl:w-56" style={{ background: "conic-gradient(#81D8D0 0 28%, #D4AF37 28% 70%, #F4A460 70% 90%, #5FC4BA 90% 100%)" }}>
              <div className="grid h-24 w-24 place-items-center rounded-full bg-[#0F1419] text-center text-[#D4AF37] xl:h-28 xl:w-28">
                <Users size={34} />
                <span className="text-sm text-[#9AA7BD]">Total</span>
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-3 xl:mt-8 xl:space-y-4">
            {["18-24 28%", "25-34 42%", "35-44 20%", "45+ 10%"].map((row) => <p className="text-lg font-bold text-white xl:text-xl" key={row}>{row}</p>)}
          </div>
        </article>
      </section>

      <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
        <div className="flex items-center justify-between">
          <SectionLabel accentName="amber" label="Performance Instruments" />
          <a className="inline-flex items-center gap-2 text-lg font-bold text-[#81D8D0] xl:text-xl" href={`/${locale}/app/content-studio`}>View All <ArrowRight size={22} /></a>
        </div>
        <div className="mt-6 grid gap-4 xl:mt-8 xl:gap-5">
          {performanceRows.map(({ comments, likes, roi, score, title, views }) => (
            <div className="lux-card-muted grid gap-4 rounded-[1.5rem] p-5 md:grid-cols-[100px_1fr_auto] xl:grid-cols-[120px_1fr_auto] xl:gap-5 xl:p-6" key={title}>
              <ScoreBadge score={score} />
              <div>
              <p className="text-lg font-bold text-white xl:text-xl">{title}</p>
              <p className="mt-3 text-base text-[#D6DEEA] xl:text-lg">{views} views - {likes} likes - {comments} comments</p>
                <div className="mt-5 h-2 rounded-full bg-[#182436]"><div className="h-full w-[78%] rounded-full bg-gradient-to-r from-[#81D8D0] to-[#D4AF37]" /></div>
              </div>
              <p className="self-center text-center text-2xl font-bold text-[#81D8D0] xl:text-3xl">{roi}<span className="block text-xs text-[#9AA7BD]">ROI</span></p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export function FinalVaultPanel() {
  const modules = ["Company Info", "Your Story", "Products & Services", "Target Audience", "Competitors", "Brand Identity", "Marketing Objectives"];
  return (
    <section className="space-y-6 xl:space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">Knowledge Vault</h1>
        <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">The foundation of your AI-powered marketing strategy</p>
      </div>
      <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Vault Completion</h2>
            <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">6 of 7 modules complete</p>
          </div>
          <p className="text-3xl font-bold text-[#F4A460] xl:text-4xl">86%</p>
        </div>
        <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/12 xl:mt-7 xl:h-4"><div className="h-full w-[86%] rounded-full bg-gradient-to-r from-[#F4A460] to-[#D4AF37]" /></div>
        <p className="mt-5 text-base text-[#D6DEEA] xl:text-lg">Complete all modules to unlock advanced AI features and more accurate content recommendations.</p>
      </article>
      <section className="grid gap-5 lg:grid-cols-2">
        {modules.map((module, index) => (
          <article className={module === "Competitors" ? "lux-card rounded-[1.75rem] border-[#F4A460]/35 p-5 xl:p-7" : "lux-card-muted rounded-[1.75rem] p-5 xl:p-7"} key={module}>
            <div className="flex items-start justify-between gap-4">
              <div className="flex items-start gap-4 xl:gap-5">
                <IconTile accentName={module === "Competitors" ? "amber" : "teal"} icon={index % 2 === 0 ? Brain : Sparkles} />
                <div>
                  <h3 className="text-xl font-bold text-white">{module}</h3>
                  <p className="mt-2 text-base text-[#9AA7BD] xl:text-lg">{module === "Competitors" ? "Competitive landscape analysis" : "Updated business memory and brand context"}</p>
                  <p className="mt-5 text-[#6F7B8F]">Last updated: {module === "Competitors" ? "Never" : "May 15, 2026"}</p>
                </div>
              </div>
              <span className={module === "Competitors" ? "text-[#F4A460]" : "text-[#00C9A7]"}>{module === "Competitors" ? "Complete" : <CheckCircle2 size={26} />}</span>
            </div>
          </article>
        ))}
      </section>
      <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
        <h2 className="text-2xl font-bold text-white">How the Knowledge Vault Works</h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:mt-8 xl:grid-cols-3 xl:gap-6">
          {["You provide context", "AI learns your brand", "Personalized content"].map((title, index) => (
            <div className="lux-card-muted rounded-[1.5rem] p-5 xl:p-6" key={title}>
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#F4A460]/13 text-xl font-bold text-[#F4A460]">{index + 1}</span>
              <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
              <p className="mt-3 text-base leading-relaxed text-[#9AA7BD] xl:text-lg">MARKOS turns structured context into retrievable business memory for every agent.</p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export function FinalSettingsPanel() {
  const [managed, setManaged] = useState<string | null>(null);
  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle icon={Settings} subtitle="Workspace, billing, language, channels, and security controls." title="Settings" />
      <section className="grid gap-5 lg:grid-cols-2 xl:gap-6">
        {["Workspace Profile", "Language & Region", "Instagram Connection", "Billing & Usage", "Team Access", "Security"].map((title, index) => (
          <article className="lux-card-muted rounded-[1.75rem] p-5 xl:p-7" key={title}>
            <IconTile accentName={index % 3 === 0 ? "teal" : index % 3 === 1 ? "gold" : "amber"} icon={index % 2 === 0 ? Settings : Users} />
            <h2 className="mt-5 text-xl font-bold text-white">{title}</h2>
            <p className="mt-3 text-base leading-relaxed text-[#9AA7BD] xl:text-lg">Production controls stay visible without breaking the command-center visual system.</p>
            <button className="mt-6 inline-flex items-center gap-2 text-base font-bold text-[#81D8D0] xl:text-lg" onClick={() => setManaged(title)} type="button">{managed === title ? "Opened" : "Manage"} <ArrowRight size={18} /></button>
          </article>
        ))}
      </section>
    </section>
  );
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
        <span className="grid h-11 w-11 place-items-center rounded-full bg-gradient-to-br from-[#81D8D0] to-[#D4AF37] text-base font-bold text-[#0F1419]">M</span>
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
      className={size === "lg" ? "grid h-16 w-16 shrink-0 place-items-center rounded-full border" : "grid h-12 w-12 shrink-0 place-items-center rounded-xl border"}
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
      <div className="mx-auto grid h-28 w-28 place-items-center rounded-full xl:h-32 xl:w-32" style={{ background: `conic-gradient(${color} 0 82%, rgba(255,255,255,.08) 82% 100%)`, filter: `drop-shadow(0 0 16px ${color}44)` }}>
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[#111920] xl:h-24 xl:w-24">
          <Icon className={accent[accentName].className} size={32} />
        </div>
      </div>
      <p className="mt-4 text-sm text-[#9AA7BD] xl:mt-5 xl:text-base">{label}</p>
      <p className="mt-2 font-display text-3xl font-bold text-white xl:text-4xl">{value}</p>
      <p className={`mt-3 text-sm font-bold xl:mt-4 xl:text-base ${accent[accentName].className}`}>{sub} <ArrowRight className="inline" size={15} /></p>
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
          <p className="text-center text-xs text-[#9AA7BD]">Swipe for details <ArrowRight className="inline" size={12} /></p>
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
        <a className="block w-full rounded-full border px-4 py-2 text-center text-sm font-bold transition hover:brightness-125" href={cardHref} style={{ borderColor, background: accent[accentName].bg, color }}>
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
          <p className="mt-4 max-w-5xl text-base leading-relaxed text-[#B8C4D8] xl:text-lg">Your audience is showing strong interest in this content angle. MARKOS can convert it into a campaign or a content batch immediately.</p>
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
            {why.map((item) => <li key={item}>{item}</li>)}
          </ul>
        </div>
        <div>
          <h3 className="text-lg font-bold text-white">Suggested Content Pieces</h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {pieces.map((piece) => <span className="rounded-full bg-white/10 px-4 py-2 font-semibold text-[#D6DEEA]" key={piece}>{piece}</span>)}
          </div>
        </div>
      </div>
      <div className="mt-6 flex flex-wrap gap-3 xl:mt-8 xl:gap-4">
        <a className="lux-button-primary inline-flex items-center gap-3 rounded-full px-6 py-3 text-base font-bold xl:px-7 xl:py-3.5" href={`/${locale}/app/content-studio`}>
          <Sparkles size={20} /> Generate Content <ArrowRight size={20} />
        </a>
        <a className="rounded-full border border-[#81D8D0]/18 px-6 py-3 text-base font-bold text-white xl:px-7 xl:py-3.5" href={`/${locale}/app/analytics`}>View Analysis</a>
        <a className="rounded-full border border-[#81D8D0]/18 px-6 py-3 text-base font-bold text-[#D6DEEA] xl:px-7 xl:py-3.5" href={`/${locale}/app/campaign-builder`}>Schedule Later</a>
      </div>
    </article>
  );
}

function GlassStat({ icon, label, value }: { icon: IconType; label: string; value: string }) {
  const Icon = icon;
  return (
    <div className="lux-card-quiet rounded-[1.35rem] p-4 xl:p-5">
      <p className="flex items-center gap-3 text-[#9AA7BD]"><Icon size={18} />{label}</p>
      <p className="mt-4 font-display text-2xl font-bold text-white xl:text-3xl">{value}</p>
    </div>
  );
}

function ObjectiveCard({ icon, label, sub, value }: { icon: IconType; label: string; sub: string; value: string }) {
  const Icon = icon;
  return (
    <article className="lux-card-muted rounded-[1.5rem] p-5 xl:p-7">
      <p className="flex items-center gap-3 text-lg font-bold text-white xl:gap-4 xl:text-xl"><Icon size={24} /> {label}</p>
      <p className="mt-5 font-display text-3xl font-bold text-white xl:mt-6 xl:text-4xl">{value}</p>
      <p className="mt-3 text-base text-[#9AA7BD] xl:text-lg">{sub}</p>
    </article>
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
  action: string;
  busy?: boolean;
  children: ReactNode;
  disabled?: boolean;
  onAction?: () => void;
  title: string;
}) {
  const [applied, setApplied] = useState(false);

  function handleAction() {
    setApplied(true);
    onAction?.();
  }

  return (
    <section>
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-xl font-bold text-white">{title}</h2>
        <button className="font-bold text-white disabled:cursor-not-allowed disabled:opacity-45" disabled={disabled || busy} onClick={handleAction} type="button">{busy ? "Working..." : applied ? "Applied" : action}</button>
      </div>
      <article className="lux-card-muted rounded-[1.75rem] p-5 xl:p-6">{children}</article>
    </section>
  );
}

function InstagramPreview({ brandName, caption, hashtags, type }: { brandName: string; caption: string; hashtags: string[]; type: string }) {
  const cleanBrand = brandName.trim().toLowerCase().replace(/[^a-z0-9]+/g, "") || "yourbrand";
  const previewCaption = caption.trim() || "Generated caption preview will appear here after MARKOS creates a workspace draft.";
  const previewTags = hashtags.slice(0, 4).join(" ");
  return (
    <div className="mx-auto max-w-full rounded-[3rem] bg-black p-3 shadow-[0_30px_90px_rgba(0,0,0,.45)] sm:p-4">
      <div className="h-[min(590px,calc(100vh-12rem))] min-h-[440px] w-[min(360px,calc(100vw-4rem))] overflow-hidden rounded-[2.5rem] bg-white text-black sm:w-[min(390px,calc(100vw-4rem))] xl:h-[min(640px,calc(100vh-11rem))]">
        <div className="flex items-center justify-between border-b border-black/5 px-5 py-4">
          <span className="font-bold">{cleanBrand}</span>
          <span className="text-2xl">...</span>
        </div>
        <div className="grid h-[min(340px,45vh)] place-items-center bg-gradient-to-br from-[#101820] via-[#15232B] to-[#2B2415] text-center xl:h-[min(380px,48vh)]">
          <Sparkles className="mx-auto text-[#81D8D0]" size={60} />
          <p className="mt-4 text-lg font-bold text-white xl:mt-5 xl:text-xl">{type} preview</p>
        </div>
        <div className="space-y-3 p-4 xl:p-5">
          <div className="flex justify-between text-xl xl:text-2xl">
            <span>Like  Comment  Share</span>
            <span>Save</span>
          </div>
          <p className="font-bold">2,847 likes</p>
          <p><span className="font-bold">{cleanBrand}</span> {previewCaption}</p>
          {previewTags ? <p className="text-sm text-black/65">{previewTags}</p> : null}
        </div>
      </div>
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
