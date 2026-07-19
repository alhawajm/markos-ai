"use client";

import {
  useEffect,
  useMemo,
  useState,
  type FormEvent,
  type ReactNode,
} from "react";
import {
  ArrowRight,
  AlertTriangle,
  BarChart3,
  Bell,
  BookOpen,
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
  Download,
  Eye,
  FileText,
  Heart,
  Image as ImageIcon,
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
  Zap,
} from "lucide-react";
import { MarkosApiClient } from "@markos/api-client";
import { getBrowserApiBaseUrl } from "./api-base-url";
import type {
  AnalyticsSummary,
  AuthSession,
  BrandBookExportRecord,
  BrandKit,
  CampaignPackageRecord,
  ContentRecord,
  ContentStatus,
  ContentType,
  GeneratedMediaVariantRecord,
  Locale,
  MediaAssetRecord,
  OfferRecord,
  ProductRecord,
  VaultCompletenessScore,
  VaultSection,
  VaultWebsiteIngestCandidate,
  VaultWebsiteIngestDraft,
  VaultWebsiteIngestJob,
  VisualMode,
} from "@markos/shared-types";

type Accent = "amber" | "gold" | "teal";
type IconType = typeof Sparkles;
type StudioContentType = Extract<
  ContentType,
  "POST" | "REEL" | "CAROUSEL" | "STORY"
>;

interface ContentReadyCardModel {
  accent: Accent;
  cta: string;
  href?: string;
  label: string;
  status: string;
  subtitle: string;
  title: string;
}

interface CampaignItemEdit {
  callToAction: string;
  caption: string;
  hashtags: string;
}

interface DashboardLiveState {
  analytics: AnalyticsSummary | null;
  contentItems: ContentRecord[];
  error: string;
  loading: boolean;
  publishingQueue: ContentRecord[];
  vaultScore: VaultCompletenessScore | null;
}

interface EditableIngestCandidate {
  candidate: VaultWebsiteIngestCandidate;
  selected: boolean;
  valueError: string;
  valueText: string;
}

interface CatalogPickerState {
  error: string;
  loading: boolean;
  offers: OfferRecord[];
  products: ProductRecord[];
  refresh: () => void;
  selectedOfferId: string;
  selectedProductId: string;
  setSelectedOfferId: (offerId: string) => void;
  setSelectedProductId: (productId: string) => void;
}

const sessionKey = "markos.session";
const apiBaseUrl = getBrowserApiBaseUrl();

const accent = {
  amber: {
    bg: "rgba(244, 164, 96, .12)",
    border: "rgba(244, 164, 96, .28)",
    className: "text-[#F4A460]",
    hex: "#F4A460",
  },
  gold: {
    bg: "rgba(212, 175, 55, .12)",
    border: "rgba(212, 175, 55, .28)",
    className: "text-[#D4AF37]",
    hex: "#D4AF37",
  },
  teal: {
    bg: "rgba(129, 216, 208, .12)",
    border: "rgba(129, 216, 208, .28)",
    className: "text-[#81D8D0]",
    hex: "#81D8D0",
  },
} as const;

const studioTypes: Array<[StudioContentType, string, IconType]> = [
  ["POST", "Post", ImageIcon],
  ["REEL", "Reel", Play],
  ["CAROUSEL", "Carousel", ImageIcon],
  ["STORY", "Story", Instagram],
];

const visualModes: Array<[VisualMode, string, string, IconType]> = [
  [
    "PRODUCT_PHOTO",
    "Product Hero",
    "Accurate product-first creative",
    ImageIcon,
  ],
  ["LIFESTYLE_STORY", "Lifestyle Story", "Aspirational brand scene", Heart],
  ["AD_CREATIVE", "Ad Creative", "Offer-led conversion visual", Zap],
  ["BACKGROUND_VARIANT", "Background", "Clean branded backdrop", Palette],
];

const visualAspectRatios = ["1:1", "4:5", "9:16"] as const;
type VisualAspectRatio = (typeof visualAspectRatios)[number];

const vaultModules: Array<{
  description: string;
  icon: IconType;
  section: VaultSection;
  title: string;
}> = [
  {
    description: "Business name, positioning, market, and languages",
    icon: Building2,
    section: "COMPANY",
    title: "Company Info",
  },
  {
    description: "Mission, origin, proof points, and unique value",
    icon: Sparkles,
    section: "STORY",
    title: "Your Story",
  },
  {
    description: "Products, services, packages, and commercial context",
    icon: Target,
    section: "PRODUCTS",
    title: "Products & Services",
  },
  {
    description: "Customer demographics, needs, and purchase triggers",
    icon: Users,
    section: "AUDIENCE",
    title: "Target Audience",
  },
  {
    description: "Competitive landscape and positioning gaps",
    icon: TrendingUp,
    section: "COMPETITORS",
    title: "Competitors",
  },
  {
    description: "Visual style, colors, assets, and brand constraints",
    icon: Palette,
    section: "BRAND",
    title: "Brand Identity",
  },
  {
    description: "Voice, tone, messaging rules, and content objectives",
    icon: Brain,
    section: "OBJECTIVES",
    title: "Marketing Objectives",
  },
];

const websiteIngestCoreSections: VaultSection[] = [
  "COMPANY",
  "STORY",
  "PRODUCTS",
  "BRAND",
  "TONE",
];

function useMarkosSession() {
  const [session, setSession] = useState<AuthSession | null>(null);

  useEffect(() => {
    const stored = window.localStorage.getItem(sessionKey);
    if (!stored) {
      return;
    }

    try {
      setSession(JSON.parse(stored) as AuthSession);
    } catch {
      window.localStorage.removeItem(sessionKey);
    }
  }, []);

  return session;
}

function useMarkosClient(session: AuthSession | null) {
  return useMemo(() => {
    const baseOptions = { baseUrl: apiBaseUrl };

    return new MarkosApiClient(
      session
        ? {
            ...baseOptions,
            accessToken: session.tokens.accessToken,
            workspaceId: session.workspace.id,
          }
        : baseOptions,
    );
  }, [session]);
}

function useCatalogPickerState(
  session: AuthSession | null,
  client: MarkosApiClient,
): CatalogPickerState {
  const [products, setProducts] = useState<ProductRecord[]>([]);
  const [offers, setOffers] = useState<OfferRecord[]>([]);
  const [selectedProductId, setSelectedProductId] = useState("");
  const [selectedOfferId, setSelectedOfferId] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [refreshKey, setRefreshKey] = useState(0);

  useEffect(() => {
    if (!session) {
      setProducts([]);
      setOffers([]);
      setSelectedProductId("");
      setSelectedOfferId("");
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    async function loadCatalog() {
      try {
        const [nextProducts, nextOffers] = await Promise.all([
          client.catalogProducts({ status: "ACTIVE" }),
          client.catalogOffers({ status: "ACTIVE" }),
        ]);

        if (cancelled) {
          return;
        }

        setProducts(nextProducts);
        setOffers(nextOffers);
      } catch {
        if (!cancelled) {
          setError(
            "Catalog context could not load. MARKOS can still generate from the Vault.",
          );
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [client, refreshKey, session]);

  return {
    error,
    loading,
    offers,
    products,
    refresh: () => setRefreshKey((current) => current + 1),
    selectedOfferId,
    selectedProductId,
    setSelectedOfferId,
    setSelectedProductId,
  };
}

function catalogGenerationPayload(catalog: CatalogPickerState): {
  offerId?: string;
  productId?: string;
} {
  return {
    ...(catalog.selectedProductId
      ? { productId: catalog.selectedProductId }
      : {}),
    ...(catalog.selectedOfferId ? { offerId: catalog.selectedOfferId } : {}),
  };
}

function recordTitle(record: ContentRecord): string {
  const caption =
    record.captionEn ?? record.captionAr ?? record.contentPillar ?? "";
  const firstSentence = caption.split(/[.!?\n]/)[0]?.trim();

  if (firstSentence) {
    return firstSentence.length > 36
      ? `${firstSentence.slice(0, 33)}...`
      : firstSentence;
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

function contentCardFromRecord(
  record: ContentRecord,
  locale: Locale,
  index: number,
): ContentReadyCardModel {
  const accentNames: Accent[] = ["teal", "gold", "amber", "teal"];
  const status = record.scheduledAt
    ? formatShortTime(record.scheduledAt)
    : statusLabel(record.status);
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
    title: recordTitle(record),
  };
}

function formatShortTime(value: string): string {
  return new Intl.DateTimeFormat("en", {
    hour: "numeric",
    minute: "2-digit",
  }).format(new Date(value));
}

function formatCompactNumber(value: number): string {
  return new Intl.NumberFormat("en", {
    maximumFractionDigits: value >= 10000 ? 1 : 0,
    notation: value >= 10000 ? "compact" : "standard",
  }).format(value);
}

function formatCatalogPrice(
  priceMinor: number | undefined,
  currency: string,
): string | null {
  if (priceMinor === undefined) {
    return null;
  }

  const divisor = currency === "BHD" ? 1000 : 100;
  const formatted = new Intl.NumberFormat("en", {
    maximumFractionDigits: currency === "BHD" ? 3 : 2,
    minimumFractionDigits: currency === "BHD" ? 3 : 2,
  }).format(priceMinor / divisor);

  return `${currency} ${formatted}`;
}

function formatCatalogDate(value: string | undefined): string {
  if (value === undefined) {
    return "Always on";
  }

  return new Intl.DateTimeFormat("en", {
    day: "numeric",
    month: "short",
    year: "numeric",
  }).format(new Date(value));
}

function parseBhdPriceMinor(value: string): number | undefined {
  const trimmed = value.trim();

  if (!trimmed) {
    return undefined;
  }

  const amount = Number(trimmed);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error("Enter a valid BHD price.");
  }

  return Math.round(amount * 1000);
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

function campaignItemEditFromRecord(record: ContentRecord): CampaignItemEdit {
  return {
    callToAction: record.callToAction ?? "",
    caption: record.captionEn ?? record.captionAr ?? record.contentPillar ?? "",
    hashtags: record.hashtags.join(" "),
  };
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
  const message =
    error instanceof Error
      ? error.message
      : "MARKOS could not complete that action.";
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

function visualStudioError(error: unknown): string {
  const message =
    error instanceof Error
      ? error.message
      : "Visual Studio could not complete that action.";
  const lower = message.toLowerCase();

  if (lower.includes("approved")) {
    return "Approve the generated visual before attaching it to content.";
  }

  if (lower.includes("quota") || lower.includes("limit")) {
    return "This workspace has reached its AI image quota. Upgrade or wait for the quota window to reset before generating more visuals.";
  }

  if (lower.includes("catalog")) {
    return "The selected product or offer is no longer active. Pick an active catalog record, then generate again.";
  }

  return contentStudioError(error);
}

function visualModeLabel(mode: VisualMode): string {
  return visualModes.find(([value]) => value === mode)?.[1] ?? "Visual";
}

function generatedVariantStatusLabel(
  variant: GeneratedMediaVariantRecord,
): string {
  if (variant.status === "APPROVED") {
    return "Approved";
  }

  if (variant.status === "REJECTED") {
    return "Rejected";
  }

  return "Review required";
}

function isStudioContentType(value: string | null): value is StudioContentType {
  return (
    value === "POST" ||
    value === "REEL" ||
    value === "CAROUSEL" ||
    value === "STORY"
  );
}

async function approveContentRecord(
  client: MarkosApiClient,
  record: ContentRecord,
): Promise<ContentRecord> {
  if (record.status === "APPROVED") {
    return record;
  }

  if (record.status === "DRAFT") {
    const reviewRecord = await client.updateContentStatus(
      record.id,
      "IN_REVIEW",
    );
    return client.updateContentStatus(reviewRecord.id, "APPROVED");
  }

  if (record.status === "IN_REVIEW") {
    return client.updateContentStatus(record.id, "APPROVED");
  }

  throw new Error(
    `Only draft or in-review content can be approved. Current status: ${statusLabel(record.status)}.`,
  );
}

const performanceHighlights = [
  {
    accent: "teal" as const,
    icon: TrendingUp,
    label: "New Followers",
    meta: "24-hour change",
    sub: "+24%",
    value: "+847",
  },
  {
    accent: "amber" as const,
    icon: Zap,
    label: "Engagement Rate",
    meta: "vs. baseline",
    sub: "3.2x",
    value: "92%",
  },
  {
    accent: "teal" as const,
    icon: Target,
    label: "Total Reach",
    meta: "Unique viewers",
    sub: "124K",
    value: "156K",
  },
  {
    accent: "amber" as const,
    icon: MessageCircle,
    label: "Conversations",
    meta: "High-value leads",
    sub: "47",
    value: "234",
  },
];

const strategicInsights = [
  {
    accent: "teal" as const,
    body: "Your audience engagement has shifted 2 hours later in the evening. Optimal posting time is now 7:30-9:00 PM.",
    cta: "Adjust campaign schedule",
    icon: Clock,
    title: "Audience Behavior Shift Detected",
  },
  {
    accent: "gold" as const,
    body: "Luxury jewelry posts are generating 3.2x more engagement. Your audience is responding to premium positioning and craftsmanship storytelling.",
    cta: "Create more luxury content",
    icon: TrendingUp,
    title: "Content Performance Pattern",
  },
  {
    accent: "amber" as const,
    body: "New followers have 2.1x higher engagement rate than your existing audience. Your content is attracting highly qualified leads.",
    cta: "Maintain current strategy",
    icon: Users,
    title: "Audience Quality Improvement",
  },
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
    why: [
      "Recent posts in this category achieved 92% engagement",
      "Luxury searches are up 156% in your audience",
    ],
    pieces: ["Craftsmanship reel", "Collection carousel", "Limited drop story"],
  },
  {
    accent: "teal" as const,
    confidence: "87%",
    impact: "Medium-High",
    lift: "+220%",
    reach: "+1,800",
    theme: "Content Theme",
    title: "Sustainability Story Series",
    why: [
      "Sustainability keywords show 89% positive sentiment",
      "Low competition in your niche for this angle",
    ],
    pieces: [
      "Sourcing journey",
      "Supplier spotlight",
      "Recycled materials showcase",
    ],
  },
  {
    accent: "amber" as const,
    confidence: "91%",
    impact: "Medium",
    lift: "+180%",
    reach: "+1,200",
    theme: "Social Proof",
    title: "Customer Testimonial Spotlight",
    why: [
      "Customer posts mentioning you are up 234%",
      "Testimonials show 2.1x engagement",
    ],
    pieces: ["Buyer interview", "Unboxing compilation", "Community story"],
  },
];

const campaignTimeline = [
  ["1", "Teaser Post", "7:30 PM", "Carousel"],
  ["2", "Behind the Scenes", "7:30 PM", "Reel"],
  ["3", "Story Series", "12:00 PM", "Stories"],
  ["4", "Collection Reveal", "7:30 PM", "Post + Carousel"],
  ["6", "Limited Edition Announcement", "7:30 PM", "Post"],
  ["7", "Final Call", "8:00 PM", "Stories + Post"],
];

const performanceRows = [
  {
    comments: "234",
    likes: "1,847",
    roi: "3.2x",
    score: "94",
    title: "Summer Collection Launch",
    views: "24,500",
  },
  {
    comments: "187",
    likes: "1,423",
    roi: "2.8x",
    score: "87",
    title: "Behind the Scenes Reel",
    views: "18,900",
  },
  {
    comments: "145",
    likes: "1,156",
    roi: "2.1x",
    score: "76",
    title: "Customer Testimonials",
    views: "15,600",
  },
  {
    comments: "98",
    likes: "892",
    roi: "1.9x",
    score: "68",
    title: "Product Tutorial",
    views: "12,300",
  },
];

export function FinalDashboard({ locale }: { locale: Locale }) {
  const now = useMemo(
    () =>
      new Intl.DateTimeFormat(locale, {
        hour: "numeric",
        minute: "2-digit",
      }).format(new Date()),
    [locale],
  );
  const session = useMarkosSession();
  const client = useMarkosClient(session);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [liveState, setLiveState] = useState<DashboardLiveState>({
    analytics: null,
    contentItems: [],
    error: "",
    loading: false,
    publishingQueue: [],
    vaultScore: null,
  });
  const aiPrompts = [
    "What should I post today?",
    "Create a reel about my product.",
    "Explain this opportunity.",
    "Show revenue opportunities.",
  ];
  const firstName = session?.user.fullName.split(/\s+/)[0] || "there";
  const workspaceName = session?.workspace.name || "your workspace";
  const readyItems = liveState.contentItems.filter(
    (item) =>
      item.status === "DRAFT" ||
      item.status === "IN_REVIEW" ||
      item.status === "APPROVED" ||
      item.status === "SCHEDULED",
  );
  const dynamicCards = readyItems
    .slice(0, 4)
    .map((item, index) => contentCardFromRecord(item, locale, index));
  const topContent = liveState.contentItems[0];
  const analyticsTotals = liveState.analytics?.totals;
  const growthValue = analyticsTotals?.followers
    ? `+${formatCompactNumber(analyticsTotals.followers)}`
    : liveState.contentItems.length
      ? `${liveState.contentItems.length}`
      : "Needs data";
  const reachValue = analyticsTotals?.reach
    ? formatCompactNumber(analyticsTotals.reach)
    : liveState.analytics
      ? "0"
      : "Needs data";
  const bestTimeValue = liveState.publishingQueue[0]?.scheduledAt
    ? formatShortTime(liveState.publishingQueue[0].scheduledAt)
    : "Set schedule";
  const missionTitle = topContent
    ? recordTitle(topContent)
    : "Create your first workspace-backed content draft";
  const missionCta = topContent
    ? topContent.status === "APPROVED"
      ? "Schedule Content"
      : "Review Content"
    : "Open Content Studio";
  const missionHref = topContent
    ? `/${locale}/app/content-studio?item=${topContent.id}`
    : `/${locale}/app/content-studio`;

  useEffect(() => {
    if (!session) {
      return;
    }

    let cancelled = false;
    setLiveState((current) => ({ ...current, error: "", loading: true }));

    async function loadDashboard() {
      const [contentResult, queueResult, analyticsResult, vaultResult] =
        await Promise.allSettled([
          client.contentItems(),
          client.publishingQueue(),
          client.analytics({ days: 7 }),
          client.vaultScore(),
        ]);

      if (cancelled) {
        return;
      }

      const rejected = [
        contentResult,
        queueResult,
        analyticsResult,
        vaultResult,
      ].find((result) => result.status === "rejected");

      setLiveState({
        analytics:
          analyticsResult.status === "fulfilled" ? analyticsResult.value : null,
        contentItems:
          contentResult.status === "fulfilled" ? contentResult.value : [],
        error:
          rejected?.status === "rejected"
            ? contentStudioError(rejected.reason)
            : "",
        loading: false,
        publishingQueue:
          queueResult.status === "fulfilled" ? queueResult.value : [],
        vaultScore:
          vaultResult.status === "fulfilled" ? vaultResult.value : null,
      });
    }

    void loadDashboard();

    return () => {
      cancelled = true;
    };
  }, [client, session]);

  return (
    <section className="min-w-0 space-y-5 xl:space-y-6">
      <ProfileRow
        locale={locale}
        name={firstName === "there" ? "MARKOS" : firstName}
      />
      <section className="lux-card relative w-full min-w-0 overflow-hidden rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
        <div className="absolute -left-20 top-0 h-64 w-64 rounded-full bg-[#81D8D0]/10 blur-3xl xl:h-80 xl:w-80" />
        <div className="absolute -right-20 bottom-0 h-64 w-64 rounded-full bg-[#D4AF37]/10 blur-3xl xl:h-80 xl:w-80" />
        <div className="relative min-w-0 max-w-6xl">
          <div className="mb-5 flex items-center gap-4 xl:mb-6">
            <div className="lux-ai-core shrink-0" aria-hidden="true" />
            <div>
              <p className="text-base text-[#9AA7BD]">{now}</p>
              <p className="text-sm font-bold uppercase tracking-[.12em] text-[#81D8D0]">
                Your AI Chief Marketing Officer
              </p>
            </div>
          </div>
          <h1 className="min-w-0 break-words font-display text-3xl font-bold tracking-normal text-white sm:text-4xl 2xl:text-5xl">
            Good Morning, {firstName}
          </h1>
          <p className="mt-4 min-w-0 max-w-5xl break-words text-lg leading-relaxed text-[#D6DEEA] sm:text-xl 2xl:text-2xl">
            {topContent ? (
              <>
                MARKOS found{" "}
                <span className="font-bold text-[#81D8D0]">
                  {statusLabel(topContent.status).toLowerCase()} content
                </span>{" "}
                in{" "}
                <span className="font-bold text-[#D4AF37]">
                  {workspaceName}
                </span>{" "}
                ready for the next workflow step.
              </>
            ) : (
              <>
                MARKOS is ready to generate real, workspace-backed marketing
                work once your session and Knowledge Vault are connected.
              </>
            )}
          </p>
        </div>
      </section>

      {!session ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#D4AF37]/24 p-5">
          <p className="font-bold text-white">
            Live work needs a workspace session.
          </p>
          <p className="mt-2 text-[#B8C4D8]">
            Sign in or complete onboarding first so generated content can be
            stored, reviewed, approved, and scheduled against the correct
            workspace.
          </p>
        </article>
      ) : liveState.loading ? (
        <article className="lux-card-muted rounded-[1.25rem] p-5">
          <p className="font-bold text-white">Loading live workspace data...</p>
          <p className="mt-2 text-[#B8C4D8]">
            MARKOS is checking content, queue, analytics, and Vault grounding.
          </p>
        </article>
      ) : liveState.error ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#F4A460]/24 p-5">
          <p className="font-bold text-white">
            The API could not load dashboard work.
          </p>
          <p className="mt-2 text-[#F4A460]">{liveState.error}</p>
        </article>
      ) : liveState.vaultScore?.entryCount === 0 ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#D4AF37]/24 p-5">
          <p className="font-bold text-white">Knowledge Vault is empty.</p>
          <p className="mt-2 text-[#B8C4D8]">
            Complete at least one Vault section before asking MARKOS to generate
            grounded content.
          </p>
        </article>
      ) : null}

      <section className="grid min-w-0 gap-4 sm:grid-cols-3 xl:gap-5">
        <MetricRingCard
          accentName="teal"
          icon={TrendingUp}
          label="Content/Followers"
          sub={
            liveState.contentItems.length
              ? `${liveState.contentItems.length} workspace items`
              : "Generate first draft"
          }
          value={growthValue}
        />
        <MetricRingCard
          accentName="gold"
          icon={Clock}
          label="Best Posting Time"
          sub={
            liveState.publishingQueue.length
              ? "Next scheduled item"
              : "Approve then schedule"
          }
          value={bestTimeValue}
        />
        <MetricRingCard
          accentName="amber"
          icon={Eye}
          label="Reach"
          sub={liveState.analytics ? "Last 7 days" : "Connect analytics"}
          value={reachValue}
        />
      </section>

      <SectionLabel accentName="teal" label="Today's Mission" />
      <section className="lux-card rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center xl:gap-6">
          <IconTile accentName="teal" icon={Target} size="lg" />
          <div className="flex-1">
            <h2 className="font-display text-2xl font-bold text-white xl:text-3xl">
              {missionTitle}
            </h2>
            <div className="mt-5 flex flex-wrap gap-5 xl:gap-7">
              <MiniStat
                accentName="teal"
                icon={Eye}
                label="Reach"
                value={
                  analyticsTotals?.reach
                    ? formatCompactNumber(analyticsTotals.reach)
                    : "Needs data"
                }
              />
              <MiniStat
                accentName="gold"
                icon={TrendingUp}
                label="Queue"
                value={String(liveState.publishingQueue.length)}
              />
              <MiniStat
                accentName="amber"
                icon={CheckCircle2}
                label="Vault"
                value={
                  liveState.vaultScore
                    ? `${liveState.vaultScore.score}%`
                    : "N/A"
                }
              />
            </div>
            <div className="mt-7 flex flex-wrap gap-4">
              <a
                className="lux-button-primary inline-flex items-center gap-3 rounded-full px-6 py-3 text-base font-bold xl:px-8 xl:py-4 xl:text-lg"
                href={missionHref}
              >
                {missionCta} <ArrowRight size={21} />
              </a>
              <a
                className="rounded-full border border-[#81D8D0]/20 px-6 py-3 text-base font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/45 hover:bg-[#81D8D0]/10 xl:px-8 xl:py-4 xl:text-lg"
                href={`/${locale}/app/opportunities`}
              >
                View Other Opportunities
              </a>
            </div>
          </div>
        </div>
      </section>

      <div className="flex items-center justify-between gap-4">
        <SectionLabel accentName="gold" label="Content Ready" />
        <a
          className="inline-flex items-center gap-2 text-lg font-bold text-[#81D8D0]"
          href={`/${locale}/app/content-studio`}
        >
          View All <ArrowRight size={19} />
        </a>
      </div>
      {dynamicCards.length > 0 ? (
        <section className="grid min-w-0 gap-4 sm:grid-cols-2 xl:grid-cols-4">
          {dynamicCards.map((card) => (
            <ContentReadyCard
              key={`${card.label}-${card.title}-${card.status}`}
              locale={locale}
              {...card}
            />
          ))}
        </section>
      ) : (
        <article className="lux-card-muted rounded-[1.5rem] p-5 xl:p-7">
          <p className="text-xl font-bold text-white">
            No generated workspace content yet.
          </p>
          <p className="mt-3 max-w-3xl text-[#B8C4D8]">
            Use Content Studio to generate the first real draft. It will appear
            here after MARKOS saves it to your workspace.
          </p>
          <a
            className="mt-5 inline-flex items-center gap-3 rounded-full border border-[#81D8D0]/24 bg-[#81D8D0]/10 px-6 py-3 font-bold text-[#81D8D0]"
            href={`/${locale}/app/content-studio`}
          >
            Generate content <ArrowRight size={18} />
          </a>
        </article>
      )}

      <div className="fixed bottom-24 right-5 z-50 sm:bottom-8 sm:right-8">
        {assistantOpen ? (
          <div className="mb-4 w-[min(20rem,calc(100vw-2.5rem))] rounded-[1.35rem] border border-[#81D8D0]/22 bg-[#111920] p-4 shadow-[0_24px_70px_rgba(0,0,0,.5)]">
            <div className="mb-3 flex items-center justify-between gap-4">
              <p className="font-bold text-white">Ask Your AI CMO</p>
              <button
                className="text-[#9AA7BD] transition hover:text-white"
                onClick={() => setAssistantOpen(false)}
                type="button"
              >
                Close
              </button>
            </div>
            <div className="grid gap-2">
              {aiPrompts.map((prompt) => (
                <a
                  className="rounded-xl border border-[#81D8D0]/12 bg-[#81D8D0]/6 px-4 py-2.5 text-sm font-semibold text-[#D6DEEA] transition hover:border-[#81D8D0]/30 hover:bg-[#81D8D0]/10 hover:text-white"
                  href={`/${locale}/app/content-studio`}
                  key={prompt}
                >
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
      <HeroTitle
        icon={Calendar}
        subtitle="Thursday, June 18"
        title="Daily Marketing Briefing"
      />
      <article className="lux-card rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
        <h2 className="font-display text-2xl font-bold text-white xl:text-3xl">
          Executive Summary
        </h2>
        <div className="mt-5 space-y-4 text-base leading-relaxed text-[#D6DEEA] xl:text-lg">
          <p>
            <span className="font-bold text-[#81D8D0]">
              Strong momentum continues.
            </span>{" "}
            Your luxury jewelry content is resonating exceptionally well with
            your target audience, driving 3.2x higher engagement than your
            baseline.
          </p>
          <p>
            I have identified a{" "}
            <span className="font-bold text-[#D4AF37]">
              golden opportunity window
            </span>{" "}
            this evening, 7:30-9:00 PM, when your audience will be most
            receptive.
          </p>
          <p>
            <span className="font-bold text-[#00C9A7]">
              24-hour growth: +847 followers
            </span>{" "}
            with engagement rate at 92%, significantly above your industry
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
          <article
            className="lux-card-muted rounded-[1.75rem] p-5 xl:p-7"
            key={item.title}
          >
            <div className="flex gap-5">
              <IconTile accentName={item.accent} icon={item.icon} />
              <div>
                <h3 className="text-xl font-bold text-white">{item.title}</h3>
                <p className="mt-3 text-base leading-relaxed text-[#D6DEEA] xl:text-lg">
                  {item.body}
                </p>
                <a
                  className="mt-5 inline-flex items-center gap-2 text-base font-bold text-[#81D8D0] xl:text-lg"
                  href={`/${locale}/app/campaign-builder`}
                >
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
          [
            "10:00 AM",
            "Review and approve AI-generated luxury jewelry content",
            "15 min",
          ],
          ["2:00 PM", "Respond to high-value comments and DMs", "20 min"],
          [
            "7:30 PM",
            "Launch prepared campaign in the optimal engagement window",
            "5 min",
          ],
          ["9:00 PM", "Monitor campaign performance and engagement", "10 min"],
        ].map(([time, title, duration], index) => (
          <div
            className={
              index === 0
                ? "grid gap-4 py-5 md:grid-cols-[120px_1fr_auto] xl:grid-cols-[130px_1fr_auto]"
                : "grid gap-4 border-t border-[#81D8D0]/10 py-5 md:grid-cols-[120px_1fr_auto] xl:grid-cols-[130px_1fr_auto]"
            }
            key={time}
          >
            <p className="font-mono text-base font-bold text-[#81D8D0] xl:text-lg">
              {time}
            </p>
            <div>
              <p className="text-lg font-bold text-white xl:text-xl">{title}</p>
              <p className="mt-1 text-base text-[#9AA7BD] xl:text-lg">
                {duration}
              </p>
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

function CatalogContextPicker({
  catalog,
  compact = false,
}: {
  catalog: CatalogPickerState;
  compact?: boolean;
}) {
  const selectedProduct = catalog.products.find(
    (product) => product.id === catalog.selectedProductId,
  );
  const selectedOffer = catalog.offers.find(
    (offer) => offer.id === catalog.selectedOfferId,
  );
  const offerOptions = catalog.selectedProductId
    ? catalog.offers.filter(
        (offer) =>
          offer.productId === undefined ||
          offer.productId === catalog.selectedProductId,
      )
    : catalog.offers;

  function updateProduct(productId: string) {
    catalog.setSelectedProductId(productId);

    if (catalog.selectedOfferId) {
      const offer = catalog.offers.find(
        (item) => item.id === catalog.selectedOfferId,
      );

      if (productId && offer?.productId && offer.productId !== productId) {
        catalog.setSelectedOfferId("");
      }
    }
  }

  return (
    <article
      className={
        compact
          ? "lux-card-muted rounded-[1.5rem] p-5"
          : "lux-card rounded-[1.5rem] p-5 xl:p-6"
      }
    >
      <div className="flex items-start justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-3 text-xl font-bold text-white">
            <Target className="text-[#81D8D0]" size={22} /> Commercial Context
          </h2>
          <p className="mt-2 text-sm text-[#9AA7BD]">
            Optional, but recommended. It tells MARKOS exactly what product or
            offer to build around.
          </p>
        </div>
        {catalog.loading ? (
          <span className="lux-thinking-dot mt-1" aria-hidden="true" />
        ) : null}
      </div>

      {catalog.error ? (
        <p className="mt-4 rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-4 py-3 text-sm font-semibold text-[#D4AF37]">
          {catalog.error}
        </p>
      ) : null}

      <div className="mt-5 grid gap-4 md:grid-cols-2">
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[.16em] text-[#9AA7BD]">
            Product
          </span>
          <select
            className="mt-2 w-full rounded-full border border-[#81D8D0]/14 bg-[#0F171A] px-4 py-3 text-base font-semibold text-white outline-none focus:border-[#81D8D0]/45"
            disabled={catalog.loading || catalog.products.length === 0}
            onChange={(event) => updateProduct(event.target.value)}
            value={catalog.selectedProductId}
          >
            <option value="">
              {catalog.products.length === 0
                ? "No active products yet"
                : "Use Vault context"}
            </option>
            {catalog.products.map((product) => (
              <option key={product.id} value={product.id}>
                {product.name}
                {formatCatalogPrice(product.priceMinor, product.currency)
                  ? ` - ${formatCatalogPrice(product.priceMinor, product.currency)}`
                  : ""}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="text-xs font-bold uppercase tracking-[.16em] text-[#9AA7BD]">
            Offer
          </span>
          <select
            className="mt-2 w-full rounded-full border border-[#81D8D0]/14 bg-[#0F171A] px-4 py-3 text-base font-semibold text-white outline-none focus:border-[#81D8D0]/45"
            disabled={catalog.loading || offerOptions.length === 0}
            onChange={(event) => catalog.setSelectedOfferId(event.target.value)}
            value={catalog.selectedOfferId}
          >
            <option value="">
              {offerOptions.length === 0
                ? "No active offers yet"
                : "No specific offer"}
            </option>
            {offerOptions.map((offer) => (
              <option key={offer.id} value={offer.id}>
                {offer.title}
                {formatCatalogPrice(offer.priceMinor, offer.currency)
                  ? ` - ${formatCatalogPrice(offer.priceMinor, offer.currency)}`
                  : ""}{" "}
                - {formatCatalogDate(offer.endsAt)}
              </option>
            ))}
          </select>
        </label>
      </div>

      {selectedProduct || selectedOffer ? (
        <div className="mt-5 rounded-[1.25rem] border border-[#81D8D0]/12 bg-[#81D8D0]/7 p-4 text-sm text-[#D6DEEA]">
          <p className="font-bold text-white">Selected for generation</p>
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            {selectedProduct ? (
              <div className="rounded-2xl border border-[#81D8D0]/12 bg-[#0F171A]/70 p-3">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#81D8D0]">
                  Product
                </p>
                <p className="mt-1 font-semibold text-white">
                  {selectedProduct.name}
                </p>
                <p className="mt-1 text-xs text-[#9AA7BD]">
                  {formatCatalogPrice(
                    selectedProduct.priceMinor,
                    selectedProduct.currency,
                  ) ?? "No price set"}
                </p>
              </div>
            ) : null}
            {selectedOffer ? (
              <div className="rounded-2xl border border-[#D4AF37]/12 bg-[#D4AF37]/7 p-3">
                <p className="text-xs font-bold uppercase tracking-[.14em] text-[#D4AF37]">
                  Offer
                </p>
                <p className="mt-1 font-semibold text-white">
                  {selectedOffer.title}
                </p>
                <p className="mt-1 text-xs text-[#9AA7BD]">
                  {formatCatalogPrice(
                    selectedOffer.priceMinor,
                    selectedOffer.currency,
                  ) ?? "No price set"}{" "}
                  - {formatCatalogDate(selectedOffer.endsAt)}
                </p>
              </div>
            ) : null}
          </div>
        </div>
      ) : null}
    </article>
  );
}

export function CatalogPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(session);
  const catalog = useCatalogPickerState(session, client);
  const [productName, setProductName] = useState("");
  const [productCategory, setProductCategory] = useState("");
  const [productDescription, setProductDescription] = useState("");
  const [productPrice, setProductPrice] = useState("");
  const [offerTitle, setOfferTitle] = useState("");
  const [offerProductId, setOfferProductId] = useState("");
  const [offerDescription, setOfferDescription] = useState("");
  const [offerPrice, setOfferPrice] = useState("");
  const [offerEndsAt, setOfferEndsAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState<"offer" | "product" | string | null>(null);

  const productById = useMemo(
    () => new Map(catalog.products.map((product) => [product.id, product])),
    [catalog.products],
  );

  async function createProduct(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      setMessage("Sign in before creating catalog products.");
      return;
    }

    const name = productName.trim();

    if (!name) {
      setMessage("Product name is required.");
      return;
    }

    setBusy("product");
    setMessage("Saving product to the catalog and Vault...");

    try {
      const priceMinor = parseBhdPriceMinor(productPrice);
      await client.createCatalogProduct({
        name,
        ...(productCategory.trim() ? { category: productCategory.trim() } : {}),
        ...(productDescription.trim()
          ? { description: productDescription.trim() }
          : {}),
        ...(priceMinor === undefined ? {} : { priceMinor }),
        benefits: [],
        salesChannels: ["Instagram", "WhatsApp"],
      });
      setProductName("");
      setProductCategory("");
      setProductDescription("");
      setProductPrice("");
      catalog.refresh();
      setMessage(
        "Product saved. MARKOS can now use it in campaign and content generation.",
      );
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setBusy(null);
    }
  }

  async function createOffer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      setMessage("Sign in before creating catalog offers.");
      return;
    }

    const title = offerTitle.trim();

    if (!title) {
      setMessage("Offer title is required.");
      return;
    }

    setBusy("offer");
    setMessage("Saving offer to the catalog and Vault...");

    try {
      const priceMinor = parseBhdPriceMinor(offerPrice);
      await client.createCatalogOffer({
        title,
        ...(offerProductId ? { productId: offerProductId } : {}),
        ...(offerDescription.trim()
          ? { description: offerDescription.trim() }
          : {}),
        ...(priceMinor === undefined ? {} : { priceMinor }),
        ...(offerEndsAt
          ? { endsAt: new Date(`${offerEndsAt}T23:59:00`).toISOString() }
          : {}),
      });
      setOfferTitle("");
      setOfferDescription("");
      setOfferPrice("");
      setOfferEndsAt("");
      catalog.refresh();
      setMessage(
        "Offer saved. Campaign generation can now target it directly.",
      );
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setBusy(null);
    }
  }

  async function archiveProduct(product: ProductRecord) {
    setBusy(product.id);
    setMessage(`Archiving ${product.name}...`);

    try {
      await client.archiveCatalogProduct(product.id);
      catalog.refresh();
      setMessage("Product archived. Linked active offers were archived too.");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setBusy(null);
    }
  }

  async function archiveOffer(offer: OfferRecord) {
    setBusy(offer.id);
    setMessage(`Archiving ${offer.title}...`);

    try {
      await client.archiveCatalogOffer(offer.id);
      catalog.refresh();
      setMessage("Offer archived.");
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle
        icon={Target}
        subtitle="Products and offers become structured commercial memory for campaign, content, and strategy generation."
        title="Product Catalog"
      />

      {message ? (
        <article className="lux-card-muted rounded-[1.25rem] border-[#81D8D0]/20 p-5">
          <p className="font-semibold text-[#D6DEEA]">{message}</p>
        </article>
      ) : null}

      <section className="grid gap-5 lg:grid-cols-2 xl:gap-6">
        <form
          className="lux-card rounded-[1.5rem] p-5 xl:p-6"
          onSubmit={createProduct}
        >
          <h2 className="text-2xl font-bold text-white">Add Product</h2>
          <div className="mt-5 grid gap-4">
            <input
              className="rounded-full border border-[#81D8D0]/12 bg-white/[.045] px-5 py-3 text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45"
              onChange={(event) => setProductName(event.target.value)}
              placeholder="Product name"
              value={productName}
            />
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                className="rounded-full border border-[#81D8D0]/12 bg-white/[.045] px-5 py-3 text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45"
                onChange={(event) => setProductCategory(event.target.value)}
                placeholder="Category"
                value={productCategory}
              />
              <input
                className="rounded-full border border-[#81D8D0]/12 bg-white/[.045] px-5 py-3 text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45"
                inputMode="decimal"
                onChange={(event) => setProductPrice(event.target.value)}
                placeholder="Price in BHD"
                value={productPrice}
              />
            </div>
            <textarea
              className="min-h-28 resize-none rounded-[1.25rem] border border-[#81D8D0]/12 bg-white/[.045] p-5 text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45"
              onChange={(event) => setProductDescription(event.target.value)}
              placeholder="What it is, who it is for, and why it matters"
              value={productDescription}
            />
          </div>
          <button
            className="mt-5 inline-flex items-center gap-3 rounded-full bg-[#81D8D0] px-6 py-3.5 font-bold text-[#0F1419] transition hover:bg-[#9FE5DF] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy === "product"}
            type="submit"
          >
            {busy === "product" ? (
              <span className="lux-thinking-dot" aria-hidden="true" />
            ) : (
              <Sparkles size={19} />
            )}
            {busy === "product" ? "Saving..." : "Save Product"}
          </button>
        </form>

        <form
          className="lux-card rounded-[1.5rem] p-5 xl:p-6"
          onSubmit={createOffer}
        >
          <h2 className="text-2xl font-bold text-white">Add Offer</h2>
          <div className="mt-5 grid gap-4">
            <input
              className="rounded-full border border-[#D4AF37]/16 bg-white/[.045] px-5 py-3 text-white outline-none placeholder:text-[#8B95A8] focus:border-[#D4AF37]/50"
              onChange={(event) => setOfferTitle(event.target.value)}
              placeholder="Offer title"
              value={offerTitle}
            />
            <select
              className="rounded-full border border-[#D4AF37]/16 bg-[#0F171A] px-5 py-3 text-white outline-none focus:border-[#D4AF37]/50"
              onChange={(event) => setOfferProductId(event.target.value)}
              value={offerProductId}
            >
              <option value="">No linked product</option>
              {catalog.products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
            <div className="grid gap-4 sm:grid-cols-2">
              <input
                className="rounded-full border border-[#D4AF37]/16 bg-white/[.045] px-5 py-3 text-white outline-none placeholder:text-[#8B95A8] focus:border-[#D4AF37]/50"
                inputMode="decimal"
                onChange={(event) => setOfferPrice(event.target.value)}
                placeholder="Offer price in BHD"
                value={offerPrice}
              />
              <input
                className="rounded-full border border-[#D4AF37]/16 bg-white/[.045] px-5 py-3 text-white outline-none focus:border-[#D4AF37]/50"
                onChange={(event) => setOfferEndsAt(event.target.value)}
                type="date"
                value={offerEndsAt}
              />
            </div>
            <textarea
              className="min-h-28 resize-none rounded-[1.25rem] border border-[#D4AF37]/16 bg-white/[.045] p-5 text-white outline-none placeholder:text-[#8B95A8] focus:border-[#D4AF37]/50"
              onChange={(event) => setOfferDescription(event.target.value)}
              placeholder="Discount, urgency, terms, or launch angle"
              value={offerDescription}
            />
          </div>
          <button
            className="mt-5 inline-flex items-center gap-3 rounded-full bg-[#D4AF37] px-6 py-3.5 font-bold text-[#0F1419] transition hover:bg-[#E7C957] disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busy === "offer"}
            type="submit"
          >
            {busy === "offer" ? (
              <span className="lux-thinking-dot" aria-hidden="true" />
            ) : (
              <Target size={19} />
            )}
            {busy === "offer" ? "Saving..." : "Save Offer"}
          </button>
        </form>
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_1fr] xl:gap-6">
        <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
          <div className="flex items-center justify-between gap-4">
            <SectionLabel accentName="teal" label="Active Products" />
            {catalog.loading ? (
              <span className="lux-thinking-dot" aria-hidden="true" />
            ) : null}
          </div>
          <div className="mt-5 grid gap-4">
            {catalog.products.length === 0 ? (
              <p className="rounded-[1.25rem] border border-[#81D8D0]/12 bg-[#81D8D0]/6 p-5 text-[#9AA7BD]">
                No active products yet. Add one above so MARKOS has concrete
                commercial context.
              </p>
            ) : (
              catalog.products.map((product) => (
                <article
                  className="rounded-[1.25rem] border border-[#81D8D0]/14 bg-[#81D8D0]/6 p-5"
                  key={product.id}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h3 className="text-lg font-bold text-white">
                        {product.name}
                      </h3>
                      <p className="mt-1 text-sm text-[#9AA7BD]">
                        {product.category ?? "Uncategorized"}
                        {formatCatalogPrice(
                          product.priceMinor,
                          product.currency,
                        )
                          ? ` - ${formatCatalogPrice(product.priceMinor, product.currency)}`
                          : ""}
                      </p>
                    </div>
                    <button
                      className="rounded-full border border-[#F4A460]/20 px-4 py-2 text-sm font-bold text-[#F4A460] disabled:opacity-50"
                      disabled={busy === product.id}
                      onClick={() => void archiveProduct(product)}
                      type="button"
                    >
                      Archive
                    </button>
                  </div>
                  {product.description ? (
                    <p className="mt-4 text-sm leading-relaxed text-[#D6DEEA]">
                      {product.description}
                    </p>
                  ) : null}
                  {product.salesChannels.length > 0 ? (
                    <p className="mt-4 text-xs font-bold uppercase tracking-[.14em] text-[#81D8D0]">
                      {product.salesChannels.join(" / ")}
                    </p>
                  ) : null}
                </article>
              ))
            )}
          </div>
        </article>

        <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
          <SectionLabel accentName="gold" label="Active Offers" />
          <div className="mt-5 grid gap-4">
            {catalog.offers.length === 0 ? (
              <p className="rounded-[1.25rem] border border-[#D4AF37]/12 bg-[#D4AF37]/7 p-5 text-[#9AA7BD]">
                No active offers yet. Offers help MARKOS generate more specific
                angles and calls to action.
              </p>
            ) : (
              catalog.offers.map((offer) => {
                const linkedProduct = offer.productId
                  ? productById.get(offer.productId)
                  : undefined;
                return (
                  <article
                    className="rounded-[1.25rem] border border-[#D4AF37]/14 bg-[#D4AF37]/7 p-5"
                    key={offer.id}
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div>
                        <h3 className="text-lg font-bold text-white">
                          {offer.title}
                        </h3>
                        <p className="mt-1 text-sm text-[#9AA7BD]">
                          {linkedProduct?.name ?? "Standalone offer"} -{" "}
                          {formatCatalogDate(offer.endsAt)}
                        </p>
                      </div>
                      <button
                        className="rounded-full border border-[#F4A460]/20 px-4 py-2 text-sm font-bold text-[#F4A460] disabled:opacity-50"
                        disabled={busy === offer.id}
                        onClick={() => void archiveOffer(offer)}
                        type="button"
                      >
                        Archive
                      </button>
                    </div>
                    {offer.description ? (
                      <p className="mt-4 text-sm leading-relaxed text-[#D6DEEA]">
                        {offer.description}
                      </p>
                    ) : null}
                    <div className="mt-4 flex flex-wrap gap-2">
                      {formatCatalogPrice(offer.priceMinor, offer.currency) ? (
                        <span className="rounded-full bg-[#D4AF37]/12 px-3 py-1 text-xs font-bold text-[#D4AF37]">
                          {formatCatalogPrice(offer.priceMinor, offer.currency)}
                        </span>
                      ) : null}
                      <span className="rounded-full bg-[#81D8D0]/10 px-3 py-1 text-xs font-bold text-[#81D8D0]">
                        {offer.status}
                      </span>
                    </div>
                  </article>
                );
              })
            )}
          </div>
        </article>
      </section>

      <article className="lux-card-muted rounded-[1.5rem] p-5 xl:p-6">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div>
            <h2 className="text-xl font-bold text-white">
              Use Catalog Context
            </h2>
            <p className="mt-2 text-[#9AA7BD]">
              Pick these products and offers directly inside Campaign Builder
              and Content Studio.
            </p>
          </div>
          <a
            className="inline-flex items-center gap-2 rounded-full bg-[#81D8D0] px-6 py-3 font-bold text-[#0F1419]"
            href={`/${locale}/app/campaign-builder`}
          >
            Build Campaign <ArrowRight size={19} />
          </a>
        </div>
      </article>
    </section>
  );
}

export function CampaignBuilderPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(session);
  const catalog = useCatalogPickerState(session, client);
  const [step, setStep] = useState(1);
  const [saved, setSaved] = useState(false);
  const [campaignPrompt, setCampaignPrompt] = useState(
    "Launch a high-performing campaign for our most important offer. Use the Knowledge Vault for audience, positioning, language, and brand voice.",
  );
  const [campaignPackage, setCampaignPackage] =
    useState<CampaignPackageRecord | null>(null);
  const [campaignRecords, setCampaignRecords] = useState<ContentRecord[]>([]);
  const [campaignMessage, setCampaignMessage] = useState("");
  const [generatingCampaign, setGeneratingCampaign] = useState(false);
  const [approvingCampaign, setApprovingCampaign] = useState(false);
  const [schedulingCampaign, setSchedulingCampaign] = useState(false);
  const [rejectingContentId, setRejectingContentId] = useState<string | null>(
    null,
  );
  const [editingContentId, setEditingContentId] = useState<string | null>(null);
  const [savingContentId, setSavingContentId] = useState<string | null>(null);
  const [campaignEdits, setCampaignEdits] = useState<
    Record<string, CampaignItemEdit>
  >({});
  const templates = [
    [
      "Product Launch",
      "7-day campaign to maximize launch impact",
      "8 posts",
      "7 days",
      Zap,
    ],
    [
      "Brand Awareness",
      "Build recognition and expand reach",
      "12 posts",
      "14 days",
      TrendingUp,
    ],
    [
      "Engagement Boost",
      "Deepen connection with your audience",
      "10 posts",
      "10 days",
      MessageCircle,
    ],
  ] as const;
  const timelineRecords = campaignRecords.length > 0 ? campaignRecords : [];
  const campaignStatus = campaignPackage?.campaign.status;
  const packageObjectives = campaignPackage?.campaign.package?.objectives.map(
    (objective, index) => ({
      icon: [Target, Zap, TrendingUp][index % 3] ?? Target,
      label: objective.label,
      sub:
        index === 0
          ? "Package scope"
          : index === 1
            ? "Campaign window"
            : "Launch signal",
      value: objective.value,
    }),
  ) ?? [
    {
      icon: Target,
      label: "Reach Goal",
      sub: "Projected impressions",
      value: "125K",
    },
    {
      icon: Zap,
      label: "Engagement",
      sub: "Expected interactions",
      value: "12.5K",
    },
    {
      icon: TrendingUp,
      label: "Conversion",
      sub: "Estimated rate",
      value: "8.2%",
    },
  ];

  async function generateCampaignDrafts() {
    if (!session) {
      setCampaignMessage(
        "Sign in or complete onboarding first so MARKOS can save campaign drafts to a workspace.",
      );
      return;
    }

    const trimmedPrompt = campaignPrompt.trim();
    if (trimmedPrompt.length < 12) {
      setCampaignMessage(
        "Describe the campaign goal, audience, offer, and timing before generating.",
      );
      return;
    }

    setGeneratingCampaign(true);
    setCampaignMessage(
      "MARKOS is generating a Vault-grounded campaign package...",
    );

    try {
      const generated = await client.generateCampaignPackage({
        brief: {
          contentCount: 4,
          contentTypes: ["POST", "CAROUSEL", "REEL", "STORY"],
          durationDays: 7,
          objective: trimmedPrompt,
          tone: "premium, clear, bilingual, conversion-aware",
          ...catalogGenerationPayload(catalog),
        },
        name:
          trimmedPrompt.split(/[.!?\n]/)[0]?.slice(0, 120) ||
          "Campaign package",
      });
      setCampaignPackage(generated);
      setCampaignRecords(generated.contentItems);
      setSaved(false);
      setCampaignMessage(
        `${generated.contentItems.length} campaign assets generated, saved, and ready for package review.`,
      );
      setStep(2);
    } catch (error) {
      setCampaignMessage(contentStudioError(error));
    } finally {
      setGeneratingCampaign(false);
    }
  }

  function startEditingCampaignItem(record: ContentRecord) {
    if (!["DRAFT", "IN_REVIEW"].includes(record.status)) {
      setCampaignMessage(
        "Approved or scheduled campaign items are locked. Mark the item as needing rework before editing.",
      );
      return;
    }

    setEditingContentId(record.id);
    setCampaignEdits((current) => ({
      ...current,
      [record.id]: current[record.id] ?? campaignItemEditFromRecord(record),
    }));
  }

  function updateCampaignEdit(
    contentItemId: string,
    field: keyof CampaignItemEdit,
    value: string,
  ) {
    setCampaignEdits((current) => ({
      ...current,
      [contentItemId]: {
        ...(current[contentItemId] ?? {
          callToAction: "",
          caption: "",
          hashtags: "",
        }),
        [field]: value,
      },
    }));
  }

  async function saveCampaignItem(record: ContentRecord) {
    if (!session) {
      setCampaignMessage("Sign in again before saving campaign edits.");
      return;
    }

    const draft =
      campaignEdits[record.id] ?? campaignItemEditFromRecord(record);
    const caption = draft.caption.trim();

    if (caption.length < 4) {
      setCampaignMessage("Campaign item caption is too short to save.");
      return;
    }

    setSavingContentId(record.id);
    setCampaignMessage("Saving campaign item edits...");

    try {
      const updated = await client.updateContent(record.id, {
        callToAction: draft.callToAction.trim() || null,
        captionEn: caption,
        hashtags: parseHashtags(draft.hashtags),
      });
      setCampaignRecords((current) =>
        current.map((item) => (item.id === updated.id ? updated : item)),
      );
      setCampaignPackage((current) =>
        current
          ? {
              ...current,
              contentItems: current.contentItems.map((item) =>
                item.id === updated.id ? updated : item,
              ),
            }
          : current,
      );
      setEditingContentId(null);
      setCampaignMessage(
        "Campaign item edits saved. Review and approve the package when ready.",
      );
    } catch (error) {
      setCampaignMessage(contentStudioError(error));
    } finally {
      setSavingContentId(null);
    }
  }

  async function approveCampaign() {
    if (!session) {
      setCampaignMessage("Sign in again before approving campaign content.");
      return;
    }

    if (!campaignPackage) {
      setCampaignMessage("Generate a campaign package before approving it.");
      return;
    }

    setApprovingCampaign(true);
    setCampaignMessage("Approving package assets...");

    try {
      const approved = await client.approveCampaignPackage(
        campaignPackage.campaign.id,
      );
      setCampaignPackage(approved);
      setCampaignRecords(approved.contentItems);
      setCampaignMessage(
        `${approved.contentItems.length} campaign assets approved. You can now schedule the package.`,
      );
    } catch (error) {
      setCampaignMessage(contentStudioError(error));
    } finally {
      setApprovingCampaign(false);
    }
  }

  async function rejectCampaignItem(record: ContentRecord) {
    if (!session || !campaignPackage) {
      setCampaignMessage(
        "Generate a campaign package before sending item feedback.",
      );
      return;
    }

    setRejectingContentId(record.id);
    setCampaignMessage("Sending package feedback...");

    try {
      const updated = await client.rejectCampaignPackageItem(
        campaignPackage.campaign.id,
        record.id,
        `Needs rework from campaign review: ${recordTitle(record)}`,
      );
      setCampaignPackage(updated);
      setCampaignRecords(updated.contentItems);
      setCampaignMessage(
        "Feedback saved. This package is back in review until the replacement asset is approved.",
      );
    } catch (error) {
      setCampaignMessage(contentStudioError(error));
    } finally {
      setRejectingContentId(null);
    }
  }

  async function scheduleCampaign() {
    if (!session) {
      setCampaignMessage("Sign in again before scheduling campaign content.");
      return;
    }

    if (!campaignPackage) {
      setCampaignMessage(
        "Generate and approve a campaign package before scheduling.",
      );
      return;
    }

    setSchedulingCampaign(true);
    setCampaignMessage(
      "Moving approved campaign package into the publishing queue...",
    );

    try {
      const approved =
        campaignPackage.campaign.status === "APPROVED"
          ? campaignPackage
          : await client.approveCampaignPackage(campaignPackage.campaign.id);
      const scheduled = await client.scheduleCampaignPackage(
        approved.campaign.id,
        { time: "19:30" },
      );
      setCampaignPackage(scheduled);
      setCampaignRecords(scheduled.contentItems);
      setCampaignMessage(
        `${scheduled.contentItems.length} campaign items scheduled in the publishing queue.`,
      );
      setStep(3);
    } catch (error) {
      setCampaignMessage(contentStudioError(error));
    } finally {
      setSchedulingCampaign(false);
    }
  }

  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle
        icon={Sparkles}
        subtitle="I'll help you create a high-performing campaign in minutes, not days."
        title="AI Campaign Builder"
      >
        <div className="mt-8 grid gap-4 text-base md:grid-cols-[1fr_auto_1fr_auto_1fr] md:items-center xl:mt-10 xl:text-lg">
          {["Campaign Goal", "AI Generation", "Review & Launch"].map(
            (label, index) => (
              <div className="contents" key={label}>
                <button
                  className={
                    step === index + 1
                      ? "flex items-center gap-4 text-white"
                      : "flex items-center gap-4 text-[#6F7B8F]"
                  }
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
                {index < 2 ? (
                  <span className="hidden h-px bg-white/20 md:block" />
                ) : null}
              </div>
            ),
          )}
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
              {generatingCampaign ? (
                <span className="lux-thinking-dot" aria-hidden="true" />
              ) : (
                <Sparkles size={20} />
              )}
              {generatingCampaign
                ? "Generating campaign..."
                : "Generate Campaign Drafts"}
            </button>
          </article>
          <CatalogContextPicker catalog={catalog} />
          <SectionHeading title="Choose Your Campaign Type" />
          <section className="grid gap-5 lg:grid-cols-3 xl:gap-6">
            {templates.map(([title, body, posts, days, Icon]) => (
              <button
                className="lux-card-muted rounded-[1.5rem] p-5 text-left transition hover:border-[#81D8D0]/45 hover:bg-[#81D8D0]/8 xl:p-6"
                key={title}
                onClick={() => {
                  setCampaignPrompt(
                    `${title}: ${body}. Build a ${days.toLowerCase()} plan with ${posts.toLowerCase()} for our active workspace audience and offer.`,
                  );
                }}
                type="button"
              >
                <IconTile accentName="teal" icon={Icon} />
                <h3 className="mt-5 text-xl font-bold text-white xl:mt-6 xl:text-2xl">
                  {title}
                </h3>
                <p className="mt-4 text-base text-[#AAB5C7] xl:text-lg">
                  {body}
                </p>
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
                <h3 className="text-xl font-bold text-white xl:text-2xl">
                  {campaignPackage?.campaign.name ??
                    "Workspace Campaign Package"}
                </h3>
                <p className="mt-2 text-base text-[#D6DEEA] xl:text-lg">
                  {timelineRecords.length || 0} saved content pieces -{" "}
                  {campaignStatus === "APPROVED" ||
                  campaignStatus === "SCHEDULED"
                    ? statusLabel(campaignStatus)
                    : "approval required before scheduling"}
                </p>
              </div>
            </div>
            {timelineRecords.length > 0 ? (
              <div className="grid gap-4">
                {timelineRecords.map((record, index) => (
                  <article
                    className="lux-card-muted grid gap-4 rounded-[1.5rem] p-5 transition hover:border-[#81D8D0]/35 md:grid-cols-[80px_1fr_auto] xl:grid-cols-[90px_1fr_auto] xl:gap-5"
                    key={record.id}
                  >
                    <div className="border-r border-white/10 pr-5">
                      <p className="text-2xl font-bold text-white xl:text-3xl">
                        {index + 1}
                      </p>
                      <p className="text-[#9AA7BD]">Day</p>
                    </div>
                    <div>
                      {editingContentId === record.id ? (
                        <div className="space-y-3">
                          <label className="block">
                            <span className="text-sm font-bold uppercase tracking-[0.14em] text-[#9AA7BD]">
                              Caption
                            </span>
                            <textarea
                              className="mt-2 min-h-24 w-full resize-none rounded-[1rem] border border-[#81D8D0]/15 bg-white/[.045] p-4 text-base leading-relaxed text-white outline-none focus:border-[#81D8D0]/45"
                              onChange={(event) =>
                                updateCampaignEdit(
                                  record.id,
                                  "caption",
                                  event.target.value,
                                )
                              }
                              value={
                                (
                                  campaignEdits[record.id] ??
                                  campaignItemEditFromRecord(record)
                                ).caption
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm font-bold uppercase tracking-[0.14em] text-[#9AA7BD]">
                              Call to action
                            </span>
                            <input
                              className="mt-2 w-full rounded-full border border-[#81D8D0]/15 bg-white/[.045] px-4 py-3 text-base text-white outline-none focus:border-[#81D8D0]/45"
                              onChange={(event) =>
                                updateCampaignEdit(
                                  record.id,
                                  "callToAction",
                                  event.target.value,
                                )
                              }
                              value={
                                (
                                  campaignEdits[record.id] ??
                                  campaignItemEditFromRecord(record)
                                ).callToAction
                              }
                            />
                          </label>
                          <label className="block">
                            <span className="text-sm font-bold uppercase tracking-[0.14em] text-[#9AA7BD]">
                              Hashtags
                            </span>
                            <input
                              className="mt-2 w-full rounded-full border border-[#81D8D0]/15 bg-white/[.045] px-4 py-3 text-base text-white outline-none focus:border-[#81D8D0]/45"
                              onChange={(event) =>
                                updateCampaignEdit(
                                  record.id,
                                  "hashtags",
                                  event.target.value,
                                )
                              }
                              value={
                                (
                                  campaignEdits[record.id] ??
                                  campaignItemEditFromRecord(record)
                                ).hashtags
                              }
                            />
                          </label>
                        </div>
                      ) : (
                        <>
                          <p className="text-xl font-bold text-white">
                            {recordTitle(record)}
                          </p>
                          <p className="mt-2 text-lg text-[#9AA7BD]">
                            {record.scheduledAt
                              ? formatShortTime(record.scheduledAt)
                              : "7:30 PM"}{" "}
                            - {contentTypeLabel(record.contentType)}
                          </p>
                          {record.callToAction ? (
                            <p className="mt-2 text-sm font-bold text-[#81D8D0]">
                              {record.callToAction}
                            </p>
                          ) : null}
                        </>
                      )}
                    </div>
                    <div className="flex flex-wrap items-center gap-3 md:justify-end">
                      <span className="rounded-full bg-[#81D8D0]/12 px-4 py-2 font-bold text-[#81D8D0]">
                        {statusLabel(record.status)}
                      </span>
                      <a
                        className="rounded-full border border-[#81D8D0]/20 px-4 py-2 font-bold text-white transition hover:bg-[#81D8D0]/10"
                        href={`/${locale}/app/content-studio?item=${record.id}`}
                      >
                        Open
                      </a>
                      {editingContentId === record.id ? (
                        <>
                          <button
                            className="rounded-full border border-[#81D8D0]/25 px-4 py-2 font-bold text-[#81D8D0] transition hover:bg-[#81D8D0]/10 disabled:cursor-not-allowed disabled:opacity-50"
                            disabled={savingContentId === record.id}
                            onClick={() => void saveCampaignItem(record)}
                            type="button"
                          >
                            {savingContentId === record.id
                              ? "Saving..."
                              : "Save"}
                          </button>
                          <button
                            className="rounded-full border border-white/10 px-4 py-2 font-bold text-[#D6DEEA] transition hover:bg-white/8"
                            onClick={() => setEditingContentId(null)}
                            type="button"
                          >
                            Cancel
                          </button>
                        </>
                      ) : (
                        <button
                          className="rounded-full border border-[#81D8D0]/20 px-4 py-2 font-bold text-[#81D8D0] transition hover:bg-[#81D8D0]/10 disabled:cursor-not-allowed disabled:opacity-50"
                          disabled={
                            !["DRAFT", "IN_REVIEW"].includes(record.status) ||
                            campaignStatus === "SCHEDULED"
                          }
                          onClick={() => startEditingCampaignItem(record)}
                          type="button"
                        >
                          Edit
                        </button>
                      )}
                      <button
                        className="rounded-full border border-[#F4A460]/25 px-4 py-2 font-bold text-[#F4A460] transition hover:bg-[#F4A460]/10 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={
                          rejectingContentId === record.id ||
                          campaignStatus === "SCHEDULED"
                        }
                        onClick={() => void rejectCampaignItem(record)}
                        type="button"
                      >
                        {rejectingContentId === record.id
                          ? "Saving..."
                          : "Needs rework"}
                      </button>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <article className="lux-card-muted rounded-[1.25rem] p-6">
                <p className="text-lg font-bold text-white">
                  No campaign drafts generated yet.
                </p>
                <p className="mt-2 text-[#B8C4D8]">
                  Return to the brief step and generate a saved campaign batch
                  first.
                </p>
              </article>
            )}
          </article>

          <SectionHeading title="Campaign Objectives" />
          <section className="grid gap-4 sm:grid-cols-3 xl:gap-5">
            {packageObjectives.slice(0, 3).map((objective) => (
              <ObjectiveCard
                icon={objective.icon}
                key={objective.label}
                label={objective.label}
                sub={objective.sub}
                value={objective.value}
              />
            ))}
          </section>
          <div className="flex flex-wrap items-center justify-between gap-5">
            <div className="flex flex-wrap items-center gap-4">
              <button
                className="inline-flex items-center gap-3 rounded-full border border-[#81D8D0]/25 px-6 py-3 text-lg font-bold text-white transition hover:bg-[#81D8D0]/10 disabled:cursor-not-allowed disabled:opacity-50 xl:text-xl"
                disabled={
                  approvingCampaign ||
                  !campaignPackage ||
                  campaignStatus === "APPROVED" ||
                  campaignStatus === "SCHEDULED"
                }
                onClick={approveCampaign}
                type="button"
              >
                <CheckCircle2 size={23} />{" "}
                {approvingCampaign
                  ? "Approving..."
                  : campaignStatus === "APPROVED" ||
                      campaignStatus === "SCHEDULED"
                    ? "Package Approved"
                    : "Approve Package"}
              </button>
              <button
                className="inline-flex items-center gap-3 text-lg font-bold text-white disabled:cursor-not-allowed disabled:opacity-50 xl:text-xl"
                disabled={
                  schedulingCampaign ||
                  !campaignPackage ||
                  campaignStatus === "SCHEDULED"
                }
                onClick={scheduleCampaign}
                type="button"
              >
                <Calendar size={24} />{" "}
                {schedulingCampaign
                  ? "Scheduling..."
                  : campaignStatus === "SCHEDULED"
                    ? "Scheduled"
                    : "Schedule Campaign"}{" "}
                <ArrowRight size={24} />
              </button>
            </div>
            <button
              className="rounded-[1.5rem] bg-white/16 px-8 py-4 text-lg font-bold text-white transition hover:bg-[#81D8D0]/16 xl:px-10 xl:py-5 xl:text-xl"
              onClick={() => {
                setSaved(true);
                setCampaignMessage(
                  "Campaign package is already saved to the workspace.",
                );
              }}
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
  const client = useMarkosClient(session);
  const catalog = useCatalogPickerState(session, client);
  const [contentType, setContentType] = useState<StudioContentType>("POST");
  const [prompt, setPrompt] = useState("");
  const [records, setRecords] = useState<ContentRecord[]>([]);
  const [currentRecord, setCurrentRecord] = useState<ContentRecord | null>(
    null,
  );
  const [caption, setCaption] = useState("");
  const [hashtagsText, setHashtagsText] = useState("");
  const [callToAction, setCallToAction] = useState("");
  const [scheduleDate, setScheduleDate] = useState(initialScheduleDate);
  const [scheduleTime, setScheduleTime] = useState("19:30");
  const [visualPrompt, setVisualPrompt] = useState(
    "Create a premium Instagram visual that matches this draft and the selected catalog context.",
  );
  const [visualMode, setVisualMode] = useState<VisualMode>("PRODUCT_PHOTO");
  const [visualAspectRatio, setVisualAspectRatio] =
    useState<VisualAspectRatio>("4:5");
  const [sourceMediaAssets, setSourceMediaAssets] = useState<
    MediaAssetRecord[]
  >([]);
  const [selectedSourceMediaId, setSelectedSourceMediaId] = useState("");
  const [visualVariants, setVisualVariants] = useState<
    GeneratedMediaVariantRecord[]
  >([]);
  const [selectedVariantId, setSelectedVariantId] = useState("");
  const [visualBusy, setVisualBusy] = useState<
    "approve" | "attach" | "generate" | "platform" | "reject" | null
  >(null);
  const [visualMessage, setVisualMessage] = useState("");
  const [message, setMessage] = useState("");
  const [loadingRecords, setLoadingRecords] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [approving, setApproving] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const selectedTypeLabel =
    studioTypes.find(([value]) => value === contentType)?.[1] ?? "Post";
  const selectedVariant =
    visualVariants.find((variant) => variant.id === selectedVariantId) ??
    visualVariants[0] ??
    null;
  const canEdit =
    currentRecord?.status === "DRAFT" || currentRecord?.status === "IN_REVIEW";
  const canSchedule =
    currentRecord !== null &&
    currentRecord.status !== "SCHEDULED" &&
    currentRecord.status !== "PUBLISHED" &&
    currentRecord.status !== "FAILED";

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
        const [nextRecords, nextVariants, nextMediaAssets] = await Promise.all([
          client.contentItems(),
          client.visualStudioVariants({ limit: 8 }),
          client.mediaAssets(),
        ]);

        if (cancelled) {
          return;
        }

        setRecords(nextRecords);
        setVisualVariants(nextVariants);
        setSourceMediaAssets(
          nextMediaAssets
            .filter((asset) => asset.type !== "VIDEO")
            .slice(0, 20),
        );
        setSelectedVariantId((current) => current || nextVariants[0]?.id || "");
        const requestedItemId = params.get("item");
        const requestedRecord = requestedItemId
          ? nextRecords.find((item) => item.id === requestedItemId)
          : null;
        const latestEditable =
          nextRecords.find(
            (item) =>
              item.status === "DRAFT" ||
              item.status === "IN_REVIEW" ||
              item.status === "APPROVED",
          ) ??
          nextRecords[0] ??
          null;

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

  function upsertVariant(variant: GeneratedMediaVariantRecord) {
    setVisualVariants((current) => {
      const existingIndex = current.findIndex((item) => item.id === variant.id);
      if (existingIndex === -1) {
        return [variant, ...current];
      }

      const next = [...current];
      next[existingIndex] = variant;
      return next;
    });
    setSelectedVariantId(variant.id);
  }

  function upsertVariants(variants: GeneratedMediaVariantRecord[]) {
    if (variants.length === 0) {
      return;
    }

    setVisualVariants((current) => {
      const incomingIds = new Set(variants.map((variant) => variant.id));
      return [
        ...variants,
        ...current.filter((variant) => !incomingIds.has(variant.id)),
      ];
    });
    setSelectedVariantId(variants[0]?.id ?? "");
  }

  async function generate() {
    const trimmedPrompt = prompt.trim();

    if (!session) {
      setMessage(
        "Sign in or complete onboarding first so MARKOS can save generated work to a workspace.",
      );
      return;
    }

    if (trimmedPrompt.length < 8) {
      setMessage("Describe what MARKOS should create before generating.");
      return;
    }

    setGenerating(true);
    setMessage(
      "MARKOS is thinking through your Vault context and generating a saved draft...",
    );

    try {
      const drafts = await client.generateContent({
        contentType,
        count: 1,
        ...catalogGenerationPayload(catalog),
        topic: trimmedPrompt,
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

  async function generateVisualVariant() {
    const trimmedVisualPrompt =
      visualPrompt.trim() || caption.trim() || prompt.trim();

    if (!session) {
      setVisualMessage(
        "Sign in or complete onboarding first so MARKOS can save generated visuals to this workspace.",
      );
      return;
    }

    if (trimmedVisualPrompt.length < 8) {
      setVisualMessage(
        "Describe the visual MARKOS should create before generating.",
      );
      return;
    }

    setVisualBusy("generate");
    setVisualMessage(
      "MARKOS is generating a brand-safe visual variant for human review...",
    );

    try {
      const result = await client.generateVisualStudioVariants({
        aspectRatio: visualAspectRatio,
        count: 1,
        prompt: trimmedVisualPrompt,
        visualMode,
        ...catalogGenerationPayload(catalog),
        ...(currentRecord ? { contentItemId: currentRecord.id } : {}),
        ...(selectedSourceMediaId
          ? { sourceMediaAssetIds: [selectedSourceMediaId] }
          : {}),
      });
      const variant = result.variants[0];

      if (!variant) {
        throw new Error("The API returned no generated visual variant.");
      }

      upsertVariant(variant);
      setVisualMessage(
        "Visual generated. Review and approve it before attaching it to the draft.",
      );
    } catch (error) {
      setVisualMessage(visualStudioError(error));
    } finally {
      setVisualBusy(null);
    }
  }

  async function generatePlatformVariantSet() {
    const trimmedVisualPrompt =
      visualPrompt.trim() || caption.trim() || prompt.trim();
    const generated: GeneratedMediaVariantRecord[] = [];

    if (!session) {
      setVisualMessage(
        "Sign in or complete onboarding first so MARKOS can save generated visuals to this workspace.",
      );
      return;
    }

    if (trimmedVisualPrompt.length < 8) {
      setVisualMessage(
        "Describe the visual MARKOS should create before generating.",
      );
      return;
    }

    setVisualBusy("platform");
    setVisualMessage(
      "MARKOS is generating square, portrait, and story variants for review...",
    );

    try {
      for (const aspectRatio of visualAspectRatios) {
        const result = await client.generateVisualStudioVariants({
          aspectRatio,
          count: 1,
          prompt: `${trimmedVisualPrompt}\n\nCreate the ${aspectRatio} Instagram platform variant with consistent campaign concept, visual identity, and product truth.`,
          visualMode,
          ...catalogGenerationPayload(catalog),
          ...(currentRecord ? { contentItemId: currentRecord.id } : {}),
          ...(selectedSourceMediaId
            ? { sourceMediaAssetIds: [selectedSourceMediaId] }
            : {}),
        });
        generated.push(...result.variants);
      }

      upsertVariants(generated);
      setVisualMessage(
        `Generated ${generated.length} Instagram platform variants. Review and approve the one you want to use.`,
      );
    } catch (error) {
      upsertVariants(generated);
      setVisualMessage(
        generated.length > 0
          ? `${generated.length} variants were saved, but the full set did not finish. ${visualStudioError(error)}`
          : visualStudioError(error),
      );
    } finally {
      setVisualBusy(null);
    }
  }

  async function approveVisualVariant(variant: GeneratedMediaVariantRecord) {
    if (!session) {
      setVisualMessage("Sign in again before approving visuals.");
      return;
    }

    setVisualBusy("approve");
    setVisualMessage("");

    try {
      const approved = await client.approveGeneratedMediaVariant(variant.id);
      upsertVariant(approved);
      setVisualMessage(
        "Visual approved. It can now be attached to the current draft.",
      );
    } catch (error) {
      setVisualMessage(visualStudioError(error));
    } finally {
      setVisualBusy(null);
    }
  }

  async function rejectVisualVariant(variant: GeneratedMediaVariantRecord) {
    if (!session) {
      setVisualMessage("Sign in again before rejecting visuals.");
      return;
    }

    setVisualBusy("reject");
    setVisualMessage("");

    try {
      const rejected = await client.rejectGeneratedMediaVariant(
        variant.id,
        "Rejected from Visual Studio review.",
      );
      upsertVariant(rejected);
      setVisualMessage("Visual rejected and kept out of content attachment.");
    } catch (error) {
      setVisualMessage(visualStudioError(error));
    } finally {
      setVisualBusy(null);
    }
  }

  async function attachVisualVariant(variant: GeneratedMediaVariantRecord) {
    if (!session) {
      setVisualMessage("Sign in again before attaching visuals.");
      return;
    }

    if (!currentRecord) {
      setVisualMessage(
        "Generate or choose a draft before attaching an approved visual.",
      );
      return;
    }

    if (variant.status !== "APPROVED") {
      setVisualMessage("Approve this visual before attaching it to content.");
      return;
    }

    setVisualBusy("attach");
    setVisualMessage("");

    try {
      const updated = await client.attachGeneratedMediaVariantToContent(
        variant.id,
        currentRecord.id,
      );
      upsertRecord(updated);
      applyRecord(updated, "Approved visual attached to this draft.");
      setVisualMessage("Approved visual attached to this draft.");
    } catch (error) {
      setVisualMessage(visualStudioError(error));
    } finally {
      setVisualBusy(null);
    }
  }

  async function persistEditableDraft(
    showMessage = true,
  ): Promise<ContentRecord | null> {
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
        setMessage(
          `This item is ${statusLabel(currentRecord.status).toLowerCase()} and cannot be edited in this state.`,
        );
      }
      return currentRecord;
    }

    setSaving(true);

    try {
      const updated = await client.updateContent(currentRecord.id, {
        callToAction: callToAction.trim() || null,
        captionEn: caption.trim() || null,
        hashtags: parseHashtags(hashtagsText),
      });
      upsertRecord(updated);
      applyRecord(
        updated,
        showMessage ? "Edits saved to the workspace draft." : undefined,
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
    if (!session || !currentRecord) {
      setMessage("Generate or choose a workspace draft before approving.");
      return;
    }

    setApproving(true);

    try {
      const editableRecord = canEdit
        ? await persistEditableDraft(false)
        : currentRecord;
      if (!editableRecord) {
        return;
      }

      const approved = await approveContentRecord(client, editableRecord);
      upsertRecord(approved);
      applyRecord(
        approved,
        "Content approved. It is now eligible for scheduling.",
      );
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
        `This item is ${statusLabel(currentRecord.status).toLowerCase()} and cannot be scheduled from here.`,
      );
      return;
    }

    setScheduling(true);

    try {
      const scheduledAt = toScheduleIso(scheduleDate, scheduleTime);
      const editableRecord = canEdit
        ? await persistEditableDraft(false)
        : currentRecord;
      if (!editableRecord) {
        return;
      }

      const approved = await approveContentRecord(client, editableRecord);
      const scheduled = await client.scheduleContent(approved.id, scheduledAt);
      upsertRecord(scheduled);
      applyRecord(
        scheduled,
        `Scheduled for ${formatShortTime(scheduled.scheduledAt ?? scheduledAt)}.`,
      );
    } catch (error) {
      setMessage(contentStudioError(error));
    } finally {
      setScheduling(false);
    }
  }

  async function copyCaption() {
    const text = [caption, callToAction, hashtagsText]
      .filter(Boolean)
      .join("\n\n");

    if (!text.trim()) {
      setMessage("There is no generated content to copy yet.");
      return;
    }

    await navigator.clipboard.writeText(text);
    setMessage("Caption copied.");
  }

  async function shareCaption() {
    const text = [caption, callToAction, hashtagsText]
      .filter(Boolean)
      .join("\n\n");

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
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            AI Content Studio
          </h1>
          <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">
            Generate, edit, approve, and schedule workspace-backed content.
          </p>
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
              <button
                className={
                  contentType === value
                    ? "rounded-full border border-[#81D8D0] bg-[#81D8D0]/10 px-5 py-4 text-left font-bold text-white xl:px-6 xl:py-5"
                    : "rounded-full border border-[#81D8D0]/16 bg-[#81D8D0]/6 px-5 py-4 text-left font-bold text-[#D6DEEA] transition hover:border-[#81D8D0]/35 xl:px-6 xl:py-5"
                }
                key={value}
                onClick={() => setContentType(value)}
                type="button"
              >
                <span className="inline-flex items-center gap-4">
                  <Icon size={22} />
                  {label}
                </span>
              </button>
            ))}
          </div>
        </section>

        <article className="lux-card rounded-[1.75rem] p-5 xl:p-7">
          <h2 className="flex items-center gap-3 text-xl font-bold text-white">
            <Sparkles className="text-[#81D8D0]" /> AI Content Generator
          </h2>
          <textarea
            className="mt-5 min-h-32 w-full resize-none rounded-[1.25rem] border border-[#81D8D0]/10 bg-white/[.045] p-4 text-base leading-relaxed text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45 xl:min-h-36 xl:p-5 xl:text-lg"
            onChange={(event) => setPrompt(event.target.value)}
            placeholder="Describe the content you want MARKOS to create, including offer, audience, language, and objective."
            value={prompt}
          />
          <button
            className="mt-5 inline-flex w-full items-center justify-center gap-3 rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-6 py-3.5 text-base font-bold text-white transition hover:bg-[#81D8D0]/18 disabled:cursor-not-allowed disabled:opacity-60 xl:px-7 xl:py-4 xl:text-lg"
            disabled={generating}
            onClick={generate}
            type="button"
          >
            {generating ? (
              <span className="lux-thinking-dot" aria-hidden="true" />
            ) : (
              <Wand2 size={20} />
            )}
            {generating ? "MARKOS is generating..." : "Generate with AI"}
          </button>
        </article>

        <CatalogContextPicker catalog={catalog} compact />

        <article className="lux-card rounded-[1.75rem] p-5 xl:p-7">
          <div className="flex flex-wrap items-start justify-between gap-4">
            <div>
              <h2 className="flex items-center gap-3 text-xl font-bold text-white">
                <ImageIcon className="text-[#D4AF37]" /> AI Visual Studio
              </h2>
              <p className="mt-2 text-sm leading-relaxed text-[#9AA7BD] xl:text-base">
                Generate image variants from Vault memory, catalog context,
                source assets, and the active draft.
              </p>
            </div>
            <span className="rounded-full border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-4 py-2 text-sm font-bold text-[#D4AF37]">
              Review required
            </span>
          </div>

          {visualMessage ? (
            <div className="mt-5 rounded-[1rem] border border-[#81D8D0]/18 bg-[#81D8D0]/7 p-4 text-sm font-semibold text-[#D6DEEA]">
              {visualMessage}
            </div>
          ) : null}

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            {visualModes.map(([value, label, description, Icon]) => (
              <button
                className={
                  visualMode === value
                    ? "rounded-[1.25rem] border border-[#D4AF37]/55 bg-[#D4AF37]/13 p-4 text-left shadow-[0_0_28px_rgba(212,175,55,.12)]"
                    : "rounded-[1.25rem] border border-[#81D8D0]/12 bg-white/[.035] p-4 text-left transition hover:border-[#81D8D0]/35 hover:bg-[#81D8D0]/7"
                }
                key={value}
                onClick={() => setVisualMode(value)}
                type="button"
              >
                <span className="flex items-center gap-3 text-base font-bold text-white">
                  <Icon size={20} />
                  {label}
                </span>
                <span className="mt-2 block text-sm leading-relaxed text-[#9AA7BD]">
                  {description}
                </span>
              </button>
            ))}
          </div>

          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[.16em] text-[#9AA7BD]">
                Aspect
              </span>
              <select
                className="w-full rounded-full border border-[#81D8D0]/12 bg-[#111A20] px-4 py-3 text-white outline-none focus:border-[#81D8D0]/40"
                onChange={(event) =>
                  setVisualAspectRatio(event.target.value as VisualAspectRatio)
                }
                value={visualAspectRatio}
              >
                {visualAspectRatios.map((ratio) => (
                  <option key={ratio} value={ratio}>
                    {ratio}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-2 block text-xs font-bold uppercase tracking-[.16em] text-[#9AA7BD]">
                Source asset
              </span>
              <select
                className="w-full rounded-full border border-[#81D8D0]/12 bg-[#111A20] px-4 py-3 text-white outline-none focus:border-[#81D8D0]/40"
                onChange={(event) =>
                  setSelectedSourceMediaId(event.target.value)
                }
                value={selectedSourceMediaId}
              >
                <option value="">Vault + catalog only</option>
                {sourceMediaAssets.map((asset) => (
                  <option key={asset.id} value={asset.id}>
                    {asset.filename}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <textarea
            className="mt-5 min-h-28 w-full resize-none rounded-[1.25rem] border border-[#81D8D0]/10 bg-white/[.045] p-4 text-base leading-relaxed text-white outline-none placeholder:text-[#8B95A8] focus:border-[#81D8D0]/45"
            onChange={(event) => setVisualPrompt(event.target.value)}
            placeholder="Describe the visual direction, product focus, mood, and platform format."
            value={visualPrompt}
          />
          <div className="mt-5 grid gap-3 sm:grid-cols-2">
            <button
              className="inline-flex items-center justify-center gap-3 rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-6 py-3.5 text-base font-bold text-white transition hover:bg-[#D4AF37]/18 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={visualBusy !== null}
              onClick={generateVisualVariant}
              type="button"
            >
              {visualBusy === "generate" ? (
                <span className="lux-thinking-dot" aria-hidden="true" />
              ) : (
                <Sparkles size={20} />
              )}
              {visualBusy === "generate" ? "Generating..." : "Generate Visual"}
            </button>
            <button
              className="inline-flex items-center justify-center gap-3 rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-6 py-3.5 text-base font-bold text-[#81D8D0] transition hover:bg-[#81D8D0]/18 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={visualBusy !== null}
              onClick={generatePlatformVariantSet}
              type="button"
            >
              {visualBusy === "platform" ? (
                <span className="lux-thinking-dot" aria-hidden="true" />
              ) : (
                <ImageIcon size={20} />
              )}
              {visualBusy === "platform"
                ? "Generating set..."
                : "Generate IG Set"}
            </button>
          </div>

          <section className="mt-6">
            <div className="mb-3 flex items-center justify-between gap-3">
              <h3 className="text-sm font-bold uppercase tracking-[.16em] text-[#9AA7BD]">
                Generated variants
              </h3>
              {selectedVariant ? (
                <span className="text-sm font-semibold text-[#81D8D0]">
                  {visualModeLabel(selectedVariant.visualMode)}
                </span>
              ) : null}
            </div>
            {visualVariants.length > 0 ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {visualVariants.slice(0, 4).map((variant) => (
                  <article
                    className={
                      selectedVariant?.id === variant.id
                        ? "overflow-hidden rounded-[1.5rem] border border-[#81D8D0]/45 bg-[#101B21]"
                        : "overflow-hidden rounded-[1.5rem] border border-[#81D8D0]/14 bg-[#101B21]"
                    }
                    key={variant.id}
                  >
                    <button
                      className="block h-52 w-full bg-[#0C1217] text-left"
                      onClick={() => setSelectedVariantId(variant.id)}
                      type="button"
                    >
                      <span
                        aria-label={`${visualModeLabel(variant.visualMode)} generated visual`}
                        className="block h-full w-full bg-cover bg-center"
                        role="img"
                        style={{
                          backgroundImage: `url("${variant.mediaAsset.publicUrl}")`,
                        }}
                      />
                    </button>
                    <div className="space-y-4 p-4">
                      <div className="flex items-start justify-between gap-3">
                        <div>
                          <p className="font-bold text-white">
                            {visualModeLabel(variant.visualMode)}
                          </p>
                          <p className="mt-1 text-sm text-[#9AA7BD]">
                            {variant.aspectRatio} -{" "}
                            {generatedVariantStatusLabel(variant)}
                          </p>
                        </div>
                        <span
                          className={
                            variant.status === "APPROVED"
                              ? "rounded-full bg-[#81D8D0]/12 px-3 py-1 text-xs font-bold text-[#81D8D0]"
                              : variant.status === "REJECTED"
                                ? "rounded-full bg-[#F4A460]/12 px-3 py-1 text-xs font-bold text-[#F4A460]"
                                : "rounded-full bg-[#D4AF37]/12 px-3 py-1 text-xs font-bold text-[#D4AF37]"
                          }
                        >
                          {generatedVariantStatusLabel(variant)}
                        </span>
                      </div>
                      <div className="grid gap-2">
                        <button
                          className="rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-4 py-2.5 text-sm font-bold text-[#81D8D0] disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={
                            variant.status === "APPROVED" || visualBusy !== null
                          }
                          onClick={() => void approveVisualVariant(variant)}
                          type="button"
                        >
                          {visualBusy === "approve" &&
                          selectedVariant?.id === variant.id
                            ? "Approving..."
                            : "Approve"}
                        </button>
                        <button
                          className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-4 py-2.5 text-sm font-bold text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={
                            !currentRecord ||
                            variant.status !== "APPROVED" ||
                            visualBusy !== null
                          }
                          onClick={() => void attachVisualVariant(variant)}
                          type="button"
                        >
                          {visualBusy === "attach" &&
                          selectedVariant?.id === variant.id
                            ? "Attaching..."
                            : "Use in Draft"}
                        </button>
                        <button
                          className="rounded-full border border-[#F4A460]/20 bg-[#F4A460]/10 px-4 py-2.5 text-sm font-bold text-[#F4A460] disabled:cursor-not-allowed disabled:opacity-45"
                          disabled={
                            variant.status === "REJECTED" || visualBusy !== null
                          }
                          onClick={() => void rejectVisualVariant(variant)}
                          type="button"
                        >
                          {visualBusy === "reject" &&
                          selectedVariant?.id === variant.id
                            ? "Rejecting..."
                            : "Reject"}
                        </button>
                      </div>
                    </div>
                  </article>
                ))}
              </div>
            ) : (
              <div className="rounded-[1.5rem] border border-dashed border-[#81D8D0]/18 bg-[#81D8D0]/5 p-6 text-center text-[#9AA7BD]">
                Generated visuals will appear here with approval controls before
                they can be used.
              </div>
            )}
          </section>
        </article>

        <section>
          <h2 className="mb-4 text-sm font-bold uppercase tracking-[.16em] text-[#9AA7BD]">
            Quick Prompts
          </h2>
          <div className="flex flex-wrap gap-3">
            {[
              "Behind the scenes",
              "Product showcase",
              "Customer testimonial",
              "Limited offer",
              "Story time",
            ].map((prompt) => (
              <button
                className="rounded-full border border-[#81D8D0]/14 bg-[#81D8D0]/7 px-5 py-3 font-semibold text-[#D6DEEA] transition hover:border-[#81D8D0]/36 hover:text-white"
                key={prompt}
                onClick={() =>
                  setPrompt(
                    `Create a ${selectedTypeLabel.toLowerCase()} about ${prompt.toLowerCase()} for our current campaign. Use the Knowledge Vault for brand voice and audience context.`,
                  )
                }
                type="button"
              >
                {prompt}
              </button>
            ))}
          </div>
        </section>

        {loadingRecords ? (
          <article className="lux-card-muted rounded-[1.75rem] p-6 text-[#D6DEEA]">
            Loading workspace drafts...
          </article>
        ) : records.length > 0 ? (
          <section>
            <h2 className="mb-4 text-xl font-bold text-white">
              Workspace Drafts
            </h2>
            <div className="grid gap-3">
              {records.slice(0, 4).map((record) => (
                <button
                  className={
                    currentRecord?.id === record.id
                      ? "rounded-2xl border border-[#81D8D0]/40 bg-[#81D8D0]/10 px-5 py-4 text-left"
                      : "rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 px-5 py-4 text-left transition hover:border-[#81D8D0]/30"
                  }
                  key={record.id}
                  onClick={() => applyRecord(record, "Loaded workspace draft.")}
                  type="button"
                >
                  <span className="block font-bold text-white">
                    {recordTitle(record)}
                  </span>
                  <span className="mt-1 block text-sm text-[#9AA7BD]">
                    {contentTypeLabel(record.contentType)} -{" "}
                    {statusLabel(record.status)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        ) : null}

        <EditorBlock
          action="Save edits"
          busy={saving}
          disabled={!currentRecord || !canEdit}
          onAction={() => void persistEditableDraft()}
          title="Caption"
        >
          <textarea
            className="min-h-56 w-full resize-none border-0 bg-transparent text-lg leading-relaxed text-white outline-none placeholder:text-[#8B95A8] xl:min-h-72 xl:text-xl"
            disabled={!canEdit}
            onChange={(event) => setCaption(event.target.value)}
            placeholder="Generated caption will appear here after MARKOS creates a draft."
            value={caption}
          />
          <div className="mt-8 border-t border-white/10 pt-5 text-[#9AA7BD]">
            {caption.length} / 2,200 characters
          </div>
        </EditorBlock>

        <EditorBlock
          action="Save tags"
          busy={saving}
          disabled={!currentRecord || !canEdit}
          onAction={() => void persistEditableDraft()}
          title="Hashtags"
        >
          <textarea
            className="min-h-24 w-full resize-none border-0 bg-transparent text-base leading-relaxed text-white outline-none placeholder:text-[#8B95A8] xl:min-h-28 xl:text-lg"
            disabled={!canEdit}
            onChange={(event) => setHashtagsText(event.target.value)}
            placeholder="#Generated #Hashtags"
            value={hashtagsText}
          />
        </EditorBlock>

        <EditorBlock
          action="Schedule"
          busy={scheduling}
          disabled={!currentRecord || !canSchedule}
          onAction={() => void scheduleDraft()}
          title="Schedule"
        >
          <div className="grid gap-4 sm:grid-cols-2">
            <input
              className="rounded-full border border-[#81D8D0]/12 bg-white/[.055] px-4 py-3 text-lg text-white outline-none focus:border-[#81D8D0]/40 xl:px-5 xl:py-4 xl:text-xl"
              onChange={(event) => setScheduleDate(event.target.value)}
              type="date"
              value={scheduleDate}
            />
            <input
              className="rounded-full border border-[#81D8D0]/12 bg-white/[.055] px-4 py-3 text-lg text-white outline-none focus:border-[#81D8D0]/40 xl:px-5 xl:py-4 xl:text-xl"
              onChange={(event) => setScheduleTime(event.target.value)}
              type="time"
              value={scheduleTime}
            />
          </div>
          <p className="mt-4 text-[#9AA7BD]">
            Scheduling will save edits, approve the draft if needed, then create
            a scheduled content item.
          </p>
        </EditorBlock>

        <EditorBlock
          action="Copy"
          disabled={!currentRecord}
          onAction={() => void copyCaption()}
          title="Actions"
        >
          <div className="flex flex-wrap gap-3">
            <button
              className="rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-6 py-3 font-bold text-[#81D8D0] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!currentRecord || approving}
              onClick={acceptDraft}
              type="button"
            >
              {approving ? "Approving..." : "Accept & Approve"}
            </button>
            <button
              className="rounded-full border border-[#D4AF37]/20 bg-[#D4AF37]/10 px-6 py-3 font-bold text-[#D4AF37] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={generating || !prompt.trim()}
              onClick={generate}
              type="button"
            >
              Regenerate
            </button>
            <button
              className="rounded-full border border-[#F4A460]/20 bg-[#F4A460]/10 px-6 py-3 font-bold text-[#F4A460] disabled:cursor-not-allowed disabled:opacity-50"
              disabled={!currentRecord}
              onClick={() => void shareCaption()}
              type="button"
            >
              Share
            </button>
          </div>
        </EditorBlock>
      </div>

      <aside className="sticky top-6 hidden h-[calc(100vh-72px)] flex-col items-center justify-center xl:flex">
        <InstagramPreview
          brandName={session?.workspace.name ?? "yourbrand"}
          caption={caption}
          hashtags={parseHashtags(hashtagsText)}
          type={selectedTypeLabel}
        />
        <button
          className="mt-6 inline-flex items-center gap-3 text-xl font-bold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!currentRecord || scheduling}
          onClick={scheduleDraft}
          type="button"
        >
          {scheduling ? "Scheduling..." : "Schedule Post"}{" "}
          <ArrowRight size={24} />
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
          <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
            Analytics Command Center{" "}
            <span className="rounded-full border border-[#81D8D0]/22 px-3 py-1.5 text-base text-[#81D8D0]">
              Live
            </span>
          </h1>
          <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">
            AI-powered intelligence dashboard
          </p>
        </div>
        <div className="flex gap-3 xl:gap-4">
          <button
            className="rounded-full border border-[#81D8D0]/18 px-6 py-3 text-base font-bold text-white xl:px-8 xl:py-4 xl:text-lg"
            onClick={() =>
              setRange(range === "Last 7 days" ? "Last 30 days" : "Last 7 days")
            }
            type="button"
          >
            {range}
          </button>
          <button
            className="lux-button-primary rounded-full px-6 py-3 text-base font-bold xl:px-8 xl:py-4 xl:text-lg"
            onClick={() => setExported(true)}
            type="button"
          >
            {exported ? "Report Ready" : "Export Report"}
          </button>
        </div>
      </div>

      <section className="grid gap-4 sm:grid-cols-3 xl:gap-6">
        <MetricRingCard
          accentName="teal"
          icon={Users}
          label="Followers"
          sub="+12.5%"
          value="12,847"
        />
        <MetricRingCard
          accentName="gold"
          icon={Eye}
          label="Reach"
          sub="+18%"
          value="156K"
        />
        <MetricRingCard
          accentName="amber"
          icon={Heart}
          label="Engagement"
          sub="+0.3%"
          value="4.8%"
        />
      </section>

      <section className="grid gap-5 lg:grid-cols-[1fr_340px] xl:gap-6 xl:grid-cols-[1fr_380px]">
        <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
          <SectionLabel accentName="teal" label="Growth Intelligence" />
          <p className="mt-2 text-lg text-[#9AA7BD] xl:text-xl">
            Follower trajectory and engagement correlation
          </p>
          <div className="mt-7 h-[300px] rounded-[1.5rem] border border-[#81D8D0]/10 bg-[#81D8D0]/5 p-5 xl:mt-9 xl:h-[360px] xl:p-6">
            <svg
              className="h-full w-full"
              viewBox="0 0 760 300"
              preserveAspectRatio="none"
            >
              {[0, 1, 2, 3].map((i) => (
                <line
                  key={i}
                  x1="0"
                  x2="760"
                  y1={48 + i * 68}
                  y2={48 + i * 68}
                  stroke="rgba(129,216,208,.08)"
                  strokeDasharray="5 8"
                />
              ))}
              <path
                d="M0 220 C160 215 260 214 380 205 C520 195 620 170 760 145"
                fill="none"
                stroke="#81D8D0"
                strokeWidth="4"
              />
              <path
                d="M0 300 L0 220 C160 215 260 214 380 205 C520 195 620 170 760 145 L760 300 Z"
                fill="rgba(129,216,208,.15)"
              />
              <path d="M0 292 L760 292" stroke="#D4AF37" strokeWidth="4" />
            </svg>
          </div>
        </article>
        <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
          <SectionLabel accentName="gold" label="Audience Orbit" />
          <p className="mt-2 text-lg text-[#9AA7BD] xl:text-xl">
            Demographic distribution
          </p>
          <div className="mt-7 grid place-items-center xl:mt-9">
            <div
              className="grid h-48 w-48 place-items-center rounded-full xl:h-56 xl:w-56"
              style={{
                background:
                  "conic-gradient(#81D8D0 0 28%, #D4AF37 28% 70%, #F4A460 70% 90%, #5FC4BA 90% 100%)",
              }}
            >
              <div className="grid h-24 w-24 place-items-center rounded-full bg-[#0F1419] text-center text-[#D4AF37] xl:h-28 xl:w-28">
                <Users size={34} />
                <span className="text-sm text-[#9AA7BD]">Total</span>
              </div>
            </div>
          </div>
          <div className="mt-6 space-y-3 xl:mt-8 xl:space-y-4">
            {["18-24 28%", "25-34 42%", "35-44 20%", "45+ 10%"].map((row) => (
              <p className="text-lg font-bold text-white xl:text-xl" key={row}>
                {row}
              </p>
            ))}
          </div>
        </article>
      </section>

      <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
        <div className="flex items-center justify-between">
          <SectionLabel accentName="amber" label="Performance Instruments" />
          <a
            className="inline-flex items-center gap-2 text-lg font-bold text-[#81D8D0] xl:text-xl"
            href={`/${locale}/app/content-studio`}
          >
            View All <ArrowRight size={22} />
          </a>
        </div>
        <div className="mt-6 grid gap-4 xl:mt-8 xl:gap-5">
          {performanceRows.map(
            ({ comments, likes, roi, score, title, views }) => (
              <div
                className="lux-card-muted grid gap-4 rounded-[1.5rem] p-5 md:grid-cols-[100px_1fr_auto] xl:grid-cols-[120px_1fr_auto] xl:gap-5 xl:p-6"
                key={title}
              >
                <ScoreBadge score={score} />
                <div>
                  <p className="text-lg font-bold text-white xl:text-xl">
                    {title}
                  </p>
                  <p className="mt-3 text-base text-[#D6DEEA] xl:text-lg">
                    {views} views - {likes} likes - {comments} comments
                  </p>
                  <div className="mt-5 h-2 rounded-full bg-[#182436]">
                    <div className="h-full w-[78%] rounded-full bg-gradient-to-r from-[#81D8D0] to-[#D4AF37]" />
                  </div>
                </div>
                <p className="self-center text-center text-2xl font-bold text-[#81D8D0] xl:text-3xl">
                  {roi}
                  <span className="block text-xs text-[#9AA7BD]">ROI</span>
                </p>
              </div>
            ),
          )}
        </div>
      </article>
    </section>
  );
}

export function FinalVaultPanel() {
  const session = useMarkosSession();
  const client = useMarkosClient(session);
  const [url, setUrl] = useState("");
  const [draft, setDraft] = useState<VaultWebsiteIngestDraft | null>(null);
  const [ingestJob, setIngestJob] = useState<VaultWebsiteIngestJob | null>(
    null,
  );
  const [candidateDrafts, setCandidateDrafts] = useState<
    EditableIngestCandidate[]
  >([]);
  const [score, setScore] = useState<VaultCompletenessScore | null>(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [writeMode, setWriteMode] = useState<"MERGE" | "OVERWRITE">("MERGE");
  const [busyAction, setBusyAction] = useState<
    "approve" | "deep" | "preview" | "reject" | null
  >(null);

  useEffect(() => {
    let mounted = true;

    if (!session) {
      return;
    }

    client
      .vaultScore()
      .then((nextScore) => {
        if (mounted) {
          setScore(nextScore);
        }
      })
      .catch(() => {
        if (mounted) {
          setScore(null);
        }
      });

    return () => {
      mounted = false;
    };
  }, [client, session]);

  async function handlePreview(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();

    if (!session) {
      setError("Log in to ingest a website into your workspace Vault.");
      return;
    }

    setBusyAction("preview");
    setError("");
    setMessage("");

    try {
      const nextDraft = await client.previewVaultWebsiteIngest({ url });
      setDraft(nextDraft);
      setIngestJob(null);
      setCandidateDrafts(toEditableCandidates(nextDraft.candidates));
      setMessage(
        `MARKOS found ${nextDraft.candidates.length} reviewable facts. Approve only what belongs in business memory.`,
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Website ingest failed.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleDeepScan() {
    if (!session) {
      setError("Log in to ingest a website into your workspace Vault.");
      return;
    }

    setBusyAction("deep");
    setDraft(null);
    setCandidateDrafts([]);
    setError("");
    setMessage("Queueing a multi-page website analysis...");

    try {
      let job = await client.queueVaultWebsiteIngest({ url, maxPages: 5 });
      setIngestJob(job);
      setMessage(
        "Deep scan queued. MARKOS is crawling public pages and validating every extracted claim.",
      );

      for (let attempt = 0; attempt < 90; attempt += 1) {
        await waitFor(attempt === 0 ? 500 : 1_000);
        job = await client.vaultWebsiteIngestJob(job.id);
        setIngestJob(job);

        if (job.status === "FAILED") {
          throw new Error(job.error ?? "Deep website scan failed.");
        }

        if (job.status === "COMPLETED") {
          if (!job.draftId) {
            throw new Error(
              "Deep website scan completed without a review draft.",
            );
          }

          const nextDraft = await client.vaultWebsiteIngestDraft(job.draftId);
          setDraft(nextDraft);
          setCandidateDrafts(toEditableCandidates(nextDraft.candidates));
          setMessage(
            `Deep scan found ${nextDraft.candidates.length} source-supported facts across the website. Review them before saving.`,
          );
          return;
        }
      }

      throw new Error(
        "Deep website scan is still running. Its job remains queued and can be checked again shortly.",
      );
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : "Deep website scan failed.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleApprove() {
    if (!draft) {
      return;
    }

    const parsed = parseCandidateDrafts(candidateDrafts);
    setCandidateDrafts(parsed.nextDrafts);

    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    setBusyAction("approve");
    setError("");
    setMessage("");

    try {
      const approved = await client.approveVaultWebsiteIngest(draft.id, {
        candidates: parsed.candidates,
        writeMode,
      });
      setDraft(approved);
      setMessage(
        "Approved facts were saved to the Knowledge Vault and embedded for future MARKOS work.",
      );
      setScore(await client.vaultScore());
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not approve ingest draft.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  async function handleReject() {
    if (!draft) {
      return;
    }

    setBusyAction("reject");
    setError("");
    setMessage("");

    try {
      const rejected = await client.rejectVaultWebsiteIngest(draft.id, {
        reason: "Rejected from MARKOS web review",
      });
      setDraft(rejected);
      setMessage("Draft rejected. No website facts were saved to the Vault.");
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not reject ingest draft.",
      );
    } finally {
      setBusyAction(null);
    }
  }

  const selectedCandidates = candidateDrafts.filter((item) => item.selected);
  const missingSections = websiteIngestCoreSections.filter(
    (section) =>
      !selectedCandidates.some((item) => item.candidate.section === section),
  );
  const scorePercent = score?.score ?? 86;
  const completedSections = new Set(
    score?.completedSections ?? [
      "COMPANY",
      "STORY",
      "PRODUCTS",
      "AUDIENCE",
      "BRAND",
      "OBJECTIVES",
    ],
  );
  const draftLocked =
    draft?.status === "APPROVED" || draft?.status === "REJECTED";

  return (
    <section className="space-y-6 xl:space-y-8">
      <div>
        <h1 className="font-display text-3xl font-bold text-white sm:text-4xl">
          Knowledge Vault
        </h1>
        <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">
          The foundation of your AI-powered marketing strategy
        </p>
      </div>

      <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
        <div className="flex items-center justify-between">
          <div>
            <h2 className="text-xl font-bold text-white">Vault Completion</h2>
            <p className="mt-3 text-lg text-[#D6DEEA] xl:text-xl">
              {score
                ? `${score.completedSections.length} of ${score.requiredSections.length} sections complete`
                : "6 of 7 modules complete"}
            </p>
          </div>
          <p className="text-3xl font-bold text-[#F4A460] xl:text-4xl">
            {scorePercent}%
          </p>
        </div>
        <div className="mt-6 h-3 overflow-hidden rounded-full bg-white/12 xl:mt-7 xl:h-4">
          <div
            className="h-full rounded-full bg-gradient-to-r from-[#F4A460] to-[#D4AF37]"
            style={{ width: `${scorePercent}%` }}
          />
        </div>
        <p className="mt-5 text-base text-[#D6DEEA] xl:text-lg">
          Complete all modules to unlock advanced AI features and more accurate
          content recommendations.
        </p>
      </article>

      <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_auto] lg:items-start">
          <div>
            <SectionLabel accentName="teal" label="Vault Auto-Ingest" />
            <h2 className="mt-4 text-2xl font-bold text-white">
              Learn from a public website
            </h2>
            <p className="mt-3 max-w-4xl text-base leading-relaxed text-[#D6DEEA] xl:text-lg">
              MARKOS extracts reviewable business facts, shows source evidence,
              then saves only approved memory into the workspace Vault.
            </p>
          </div>
          <span className="rounded-full border border-[#81D8D0]/20 bg-[#81D8D0]/10 px-4 py-2 text-sm font-bold text-[#81D8D0]">
            Review required
          </span>
        </div>

        <form
          className="mt-6 grid gap-3 md:grid-cols-[1fr_auto_auto]"
          onSubmit={handlePreview}
        >
          <label className="sr-only" htmlFor="vault-website-url">
            Website URL
          </label>
          <input
            className="min-h-12 rounded-2xl border border-[#81D8D0]/16 bg-[#0F1419]/72 px-4 text-base text-white outline-none transition placeholder:text-[#6F7B8F] focus:border-[#81D8D0]/45"
            disabled={busyAction !== null}
            id="vault-website-url"
            onChange={(event) => setUrl(event.target.value)}
            placeholder="https://yourcompany.com"
            type="url"
            value={url}
            data-testid="vault-website-url"
          />
          <button
            className="lux-button-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-black disabled:cursor-not-allowed disabled:opacity-60"
            disabled={busyAction !== null || url.trim().length === 0}
            data-testid="vault-preview-facts"
            type="submit"
          >
            <Wand2 size={19} />
            {busyAction === "preview" ? "Scanning..." : "Preview Facts"}
          </button>
          <button
            className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#81D8D0]/28 bg-[#81D8D0]/8 px-5 text-base font-bold text-[#81D8D0] transition hover:bg-[#81D8D0]/13 disabled:cursor-not-allowed disabled:opacity-60"
            data-testid="vault-deep-scan"
            disabled={busyAction !== null || url.trim().length === 0}
            onClick={handleDeepScan}
            type="button"
          >
            <Sparkles size={19} />
            {busyAction === "deep" ? "Analyzing..." : "Deep Scan"}
          </button>
        </form>

        {error ? (
          <p className="mt-4 rounded-2xl border border-[#FF6B6B]/25 bg-[#FF6B6B]/10 px-4 py-3 text-sm font-semibold text-[#FFB4B4]">
            {error}
          </p>
        ) : null}
        {message ? (
          <p className="mt-4 rounded-2xl border border-[#81D8D0]/22 bg-[#81D8D0]/10 px-4 py-3 text-sm font-semibold text-[#81D8D0]">
            {message}
          </p>
        ) : null}
        {ingestJob ? (
          <div
            className="mt-4 flex flex-wrap items-center gap-2 text-sm font-semibold text-[#9AA7BD]"
            data-testid="vault-ingest-job-status"
          >
            <span className="rounded-full border border-white/10 bg-white/6 px-3 py-1.5">
              Job {ingestJob.status.toLowerCase()}
            </span>
            <span>
              {ingestJob.attempts} processing attempt
              {ingestJob.attempts === 1 ? "" : "s"}
            </span>
          </div>
        ) : null}

        {draft ? (
          <div className="mt-6 space-y-4" data-testid="vault-ingest-review">
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 px-4 py-3">
              <div>
                <p className="text-sm font-bold uppercase tracking-[.12em] text-[#9AA7BD]">
                  Source
                </p>
                <a
                  className="mt-1 inline-flex items-center gap-2 break-all text-base font-bold text-[#81D8D0]"
                  href={draft.sourceUrl}
                  rel="noreferrer"
                  target="_blank"
                >
                  <Link2 size={17} />
                  {draft.sourceTitle ?? draft.sourceUrl}
                </a>
              </div>
              <div className="flex flex-wrap items-center gap-2 text-sm font-bold">
                <span className="rounded-full bg-[#81D8D0]/12 px-3 py-1 text-[#81D8D0]">
                  {Math.round(draft.confidence * 100)}% confidence
                </span>
                <span className="rounded-full bg-white/8 px-3 py-1 text-[#D6DEEA]">
                  {draft.status}
                </span>
                <span className="rounded-full bg-white/8 px-3 py-1 text-[#9AA7BD]">
                  {formatVaultDate(draft.createdAt)}
                </span>
              </div>
            </div>

            {!draftLocked &&
            (candidateDrafts.length < 3 || missingSections.length > 0) ? (
              <div className="rounded-2xl border border-[#D4AF37]/25 bg-[#D4AF37]/10 px-4 py-3 text-sm leading-relaxed text-[#F5D772]">
                Sparse context warning: MARKOS found limited source evidence
                {missingSections.length > 0
                  ? ` and still needs ${missingSections.map(sectionName).join(", ")} context`
                  : ""}
                . Add missing details manually before relying on generated
                campaigns.
              </div>
            ) : null}

            <div className="grid gap-4">
              {candidateDrafts.map((item, index) => (
                <article
                  className={
                    item.selected
                      ? "lux-card-muted rounded-[1.35rem] border-[#81D8D0]/26 p-4"
                      : "lux-card-quiet rounded-[1.35rem] p-4 opacity-70"
                  }
                  key={`${item.candidate.section}-${item.candidate.key}-${index}`}
                >
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="text-xs font-bold uppercase tracking-[.14em] text-[#9AA7BD]">
                        {sectionName(item.candidate.section)}
                      </p>
                      <h3 className="mt-1 text-lg font-bold text-white">
                        {humanizeKey(item.candidate.key)}
                      </h3>
                      {item.candidate.sourceSnippet ? (
                        <p className="mt-2 max-w-4xl text-sm leading-relaxed text-[#9AA7BD]">
                          {item.candidate.sourceSnippet}
                        </p>
                      ) : null}
                    </div>
                    <label className="inline-flex cursor-pointer items-center gap-2 rounded-full border border-[#81D8D0]/18 bg-[#81D8D0]/7 px-3 py-2 text-sm font-bold text-[#D6DEEA]">
                      <input
                        checked={item.selected}
                        className="h-4 w-4 accent-[#81D8D0]"
                        disabled={draftLocked}
                        onChange={() =>
                          setCandidateDrafts((current) =>
                            current.map((candidate, candidateIndex) =>
                              candidateIndex === index
                                ? {
                                    ...candidate,
                                    selected: !candidate.selected,
                                    valueError: "",
                                  }
                                : candidate,
                            ),
                          )
                        }
                        type="checkbox"
                      />
                      Include
                    </label>
                  </div>
                  <textarea
                    className="mt-4 min-h-40 w-full resize-y rounded-2xl border border-[#81D8D0]/12 bg-[#0F1419]/70 p-4 font-mono text-sm leading-relaxed text-[#D6DEEA] outline-none transition focus:border-[#81D8D0]/45 disabled:opacity-70"
                    disabled={draftLocked || !item.selected}
                    onChange={(event) =>
                      setCandidateDrafts((current) =>
                        current.map((candidate, candidateIndex) =>
                          candidateIndex === index
                            ? {
                                ...candidate,
                                valueText: event.target.value,
                                valueError: "",
                              }
                            : candidate,
                        ),
                      )
                    }
                    spellCheck={false}
                    value={item.valueText}
                  />
                  {item.valueError ? (
                    <p className="mt-2 text-sm font-semibold text-[#FFB4B4]">
                      {item.valueError}
                    </p>
                  ) : null}
                </article>
              ))}
            </div>

            {!draftLocked ? (
              <div className="flex flex-wrap items-center gap-3">
                <div
                  className="inline-flex min-h-12 items-center rounded-2xl border border-white/10 bg-[#0F1419]/72 p-1"
                  aria-label="Existing Vault fact handling"
                >
                  <button
                    className={
                      writeMode === "MERGE"
                        ? "rounded-xl bg-[#81D8D0] px-4 py-2 font-bold text-[#091014]"
                        : "rounded-xl px-4 py-2 font-bold text-[#9AA7BD]"
                    }
                    data-testid="vault-write-merge"
                    onClick={() => setWriteMode("MERGE")}
                    type="button"
                  >
                    Merge
                  </button>
                  <button
                    className={
                      writeMode === "OVERWRITE"
                        ? "rounded-xl bg-[#F4A460] px-4 py-2 font-bold text-[#091014]"
                        : "rounded-xl px-4 py-2 font-bold text-[#9AA7BD]"
                    }
                    data-testid="vault-write-overwrite"
                    onClick={() => setWriteMode("OVERWRITE")}
                    type="button"
                  >
                    Overwrite
                  </button>
                </div>
                <button
                  className="lux-button-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-black disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    busyAction !== null || selectedCandidates.length === 0
                  }
                  data-testid="vault-approve-facts"
                  onClick={handleApprove}
                  type="button"
                >
                  <CheckCircle2 size={19} />
                  {busyAction === "approve"
                    ? "Saving..."
                    : `${writeMode === "MERGE" ? "Merge" : "Overwrite"} ${selectedCandidates.length} Facts`}
                </button>
                <button
                  className="inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl border border-[#FF6B6B]/28 bg-[#FF6B6B]/8 px-5 text-base font-bold text-[#FFB4B4] transition hover:bg-[#FF6B6B]/12 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={busyAction !== null}
                  onClick={handleReject}
                  type="button"
                >
                  Reject Draft
                </button>
              </div>
            ) : null}
          </div>
        ) : null}
      </article>

      <section className="grid gap-5 lg:grid-cols-2">
        {vaultModules.map((module) => {
          const complete = completedSections.has(module.section);
          const Icon = module.icon;
          return (
            <article
              className={
                !complete
                  ? "lux-card rounded-[1.75rem] border-[#F4A460]/35 p-5 xl:p-7"
                  : "lux-card-muted rounded-[1.75rem] p-5 xl:p-7"
              }
              key={module.section}
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex items-start gap-4 xl:gap-5">
                  <IconTile
                    accentName={!complete ? "amber" : "teal"}
                    icon={Icon}
                  />
                  <div>
                    <h3 className="text-xl font-bold text-white">
                      {module.title}
                    </h3>
                    <p className="mt-2 text-base text-[#9AA7BD] xl:text-lg">
                      {module.description}
                    </p>
                    <p className="mt-5 text-[#6F7B8F]">
                      {complete ? "Live memory available" : "Needs context"}
                    </p>
                  </div>
                </div>
                <span
                  className={!complete ? "text-[#F4A460]" : "text-[#00C9A7]"}
                >
                  {!complete ? "Complete" : <CheckCircle2 size={26} />}
                </span>
              </div>
            </article>
          );
        })}
      </section>

      <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
        <h2 className="text-2xl font-bold text-white">
          How the Knowledge Vault Works
        </h2>
        <div className="mt-6 grid gap-4 md:grid-cols-2 xl:mt-8 xl:grid-cols-3 xl:gap-6">
          {[
            "You provide context",
            "AI learns your brand",
            "Personalized content",
          ].map((title, index) => (
            <div
              className="lux-card-muted rounded-[1.5rem] p-5 xl:p-6"
              key={title}
            >
              <span className="grid h-12 w-12 place-items-center rounded-full bg-[#F4A460]/13 text-xl font-bold text-[#F4A460]">
                {index + 1}
              </span>
              <h3 className="mt-5 text-xl font-bold text-white">{title}</h3>
              <p className="mt-3 text-base leading-relaxed text-[#9AA7BD] xl:text-lg">
                MARKOS turns structured context into retrievable business memory
                for every agent.
              </p>
            </div>
          ))}
        </div>
      </article>
    </section>
  );
}

export function BrandKitPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(session);
  const [kit, setKit] = useState<BrandKit | null>(null);
  const [exports, setExports] = useState<BrandBookExportRecord[]>([]);
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    if (!session) {
      setKit(null);
      setExports([]);
      setError("");
      setLoading(false);
      return;
    }

    let cancelled = false;
    setLoading(true);
    setError("");

    Promise.all([client.brandKit(), client.brandBookExports({ limit: 5 })])
      .then(([nextKit, nextExports]) => {
        if (!cancelled) {
          setKit(nextKit);
          setExports(nextExports);
        }
      })
      .catch((caught) => {
        if (!cancelled) {
          setError(
            caught instanceof Error
              ? caught.message
              : "Could not load Brand Kit.",
          );
        }
      })
      .finally(() => {
        if (!cancelled) {
          setLoading(false);
        }
      });

    return () => {
      cancelled = true;
    };
  }, [client, session]);

  async function handleExport() {
    if (!session) {
      setError("Log in to export a Brand Book.");
      return;
    }

    setExporting(true);
    setError("");
    setMessage("");

    try {
      const created = await client.createBrandBookExport();
      setExports((current) =>
        [created, ...current.filter((item) => item.id !== created.id)].slice(
          0,
          5,
        ),
      );
      setKit(created.content);
      setMessage(
        `Brand Book v${created.version} was saved with ${created.sourceEntryIds.length} Vault sources.`,
      );
      downloadBrandBook(created);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : "Could not export Brand Book.",
      );
    } finally {
      setExporting(false);
    }
  }

  const confidence = kit === null ? 0 : Math.round(kit.confidence * 100);
  const sourceCount = kit?.sourceEntries.length ?? 0;
  const incomplete = (kit?.missingSections.length ?? 0) > 0;

  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle
        icon={BookOpen}
        subtitle="A live brand system built only from approved Knowledge Vault memory and brand assets."
        title="Brand Kit"
      >
        <div className="mt-6 grid gap-4 md:grid-cols-3">
          <MiniStat
            accentName="teal"
            icon={CheckCircle2}
            label="Confidence"
            value={loading ? "..." : `${confidence}%`}
          />
          <MiniStat
            accentName="gold"
            icon={Brain}
            label="Vault Score"
            value={kit ? `${kit.score.score}%` : "N/A"}
          />
          <MiniStat
            accentName="amber"
            icon={FileText}
            label="Sources"
            value={String(sourceCount)}
          />
        </div>
      </HeroTitle>

      {error ? (
        <p className="rounded-2xl border border-[#FF6B6B]/25 bg-[#FF6B6B]/10 px-4 py-3 text-sm font-semibold text-[#FFB4B4]">
          {error}
        </p>
      ) : null}
      {message ? (
        <p className="rounded-2xl border border-[#81D8D0]/22 bg-[#81D8D0]/10 px-4 py-3 text-sm font-semibold text-[#81D8D0]">
          {message}
        </p>
      ) : null}

      {loading ? (
        <article className="lux-card rounded-[1.5rem] p-6">
          <span className="lux-ai-core" />
          <p className="mt-5 text-lg font-bold text-white">
            Building Brand Kit from Vault memory...
          </p>
        </article>
      ) : null}

      {kit ? (
        <>
          {incomplete ? (
            <article className="lux-card rounded-[1.5rem] border-[#D4AF37]/35 p-5 xl:p-6">
              <div className="flex items-start gap-4">
                <IconTile accentName="gold" icon={AlertTriangle} />
                <div>
                  <h2 className="text-xl font-bold text-white">
                    Incomplete Vault Warning
                  </h2>
                  <p className="mt-2 text-base leading-relaxed text-[#D6DEEA] xl:text-lg">
                    Missing {kit.missingSections.map(sectionName).join(", ")}.
                    MARKOS will keep exports source-grounded and mark these gaps
                    instead of inventing brand claims.
                  </p>
                  <a
                    className="mt-3 inline-flex items-center gap-2 text-sm font-bold text-[#81D8D0]"
                    href={`/${locale}/app/knowledge`}
                  >
                    Complete Knowledge Vault <ArrowRight size={16} />
                  </a>
                </div>
              </div>
            </article>
          ) : null}

          <section className="grid gap-5 lg:grid-cols-2">
            <BrandRuleGroup
              title="Company Profile"
              empty="Add company basics to the Vault."
              rules={kit.companyProfile}
            />
            <BrandRuleGroup
              title="Tone Rules"
              empty="Add voice and tone guidance to the Vault."
              rules={kit.toneRules}
            />
            <BrandRuleGroup
              title="Messaging Pillars"
              empty="Add story, audience, products, or objectives."
              rules={kit.messagingPillars}
            />
            <BrandRuleGroup
              title="Visual Rules"
              empty="Add colors, fonts, aesthetics, and brand assets."
              rules={kit.visualRules}
            />
          </section>

          <section className="grid gap-5 lg:grid-cols-[1fr_360px]">
            <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <SectionLabel accentName="teal" label="Brand Book Export" />
                <button
                  className="lux-button-primary inline-flex min-h-12 items-center justify-center gap-2 rounded-2xl px-5 text-base font-black disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={exporting || sourceCount === 0}
                  onClick={handleExport}
                  type="button"
                >
                  <Download size={19} />
                  {exporting ? "Exporting..." : "Export Brand Book"}
                </button>
              </div>
              <p className="mt-4 text-base leading-relaxed text-[#D6DEEA] xl:text-lg">
                Every export stores a versioned copy of this Brand Kit, the
                Vault source IDs used, confidence, and missing-data notes.
              </p>
              <div className="mt-6 grid gap-3">
                {exports.length === 0 ? (
                  <p className="rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 p-4 text-sm font-semibold text-[#9AA7BD]">
                    No Brand Book exports yet.
                  </p>
                ) : (
                  exports.map((record) => (
                    <button
                      className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 p-4 text-left transition hover:border-[#81D8D0]/32"
                      key={record.id}
                      onClick={() => downloadBrandBook(record)}
                      type="button"
                    >
                      <span>
                        <span className="block text-base font-bold text-white">
                          {record.title}
                        </span>
                        <span className="mt-1 block text-sm text-[#9AA7BD]">
                          {record.exportedAt
                            ? formatVaultDate(record.exportedAt)
                            : formatVaultDate(record.createdAt)}
                        </span>
                      </span>
                      <span className="rounded-full bg-[#81D8D0]/12 px-3 py-1 text-sm font-bold text-[#81D8D0]">
                        {Math.round(record.confidence * 100)}%
                      </span>
                    </button>
                  ))
                )}
              </div>
            </article>

            <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
              <SectionLabel accentName="gold" label="Approved Assets" />
              <div className="mt-5 grid gap-3">
                {kit.assets.length === 0 ? (
                  <p className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/8 p-4 text-sm font-semibold text-[#F5D772]">
                    No brand assets approved yet.
                  </p>
                ) : (
                  kit.assets.map((asset) => (
                    <a
                      className="rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 p-4 transition hover:border-[#81D8D0]/32"
                      href={asset.publicUrl}
                      key={asset.id}
                      rel="noreferrer"
                      target="_blank"
                    >
                      <span className="block text-base font-bold text-white">
                        {asset.filename}
                      </span>
                      <span className="mt-1 block text-sm text-[#9AA7BD]">
                        {asset.mimeType}
                      </span>
                    </a>
                  ))
                )}
              </div>
            </article>
          </section>

          <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
            <SectionLabel accentName="amber" label="Source Trace" />
            <div className="mt-5 grid gap-3">
              {kit.sourceEntries.slice(0, 12).map((entry) => (
                <div
                  className="rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 p-4"
                  key={entry.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-bold uppercase tracking-[.12em] text-[#9AA7BD]">
                      {sectionName(entry.section)} / {humanizeKey(entry.key)}
                    </p>
                    <span className="rounded-full bg-white/8 px-3 py-1 text-xs font-bold text-[#9AA7BD]">
                      v{entry.version}
                    </span>
                  </div>
                  <p className="mt-3 line-clamp-2 text-sm leading-relaxed text-[#D6DEEA]">
                    {previewRecord(entry.value)}
                  </p>
                </div>
              ))}
            </div>
          </article>
        </>
      ) : null}
    </section>
  );
}

function BrandRuleGroup({
  empty,
  rules,
  title,
}: {
  empty: string;
  rules: BrandKit["toneRules"];
  title: string;
}) {
  return (
    <article className="lux-card rounded-[1.5rem] p-5 xl:p-6">
      <h2 className="text-xl font-bold text-white">{title}</h2>
      <div className="mt-5 grid gap-3">
        {rules.length === 0 ? (
          <p className="rounded-2xl border border-[#D4AF37]/20 bg-[#D4AF37]/8 p-4 text-sm font-semibold text-[#F5D772]">
            {empty}
          </p>
        ) : (
          rules.map((rule) => (
            <div
              className="rounded-2xl border border-[#81D8D0]/12 bg-[#81D8D0]/5 p-4"
              key={`${rule.label}-${rule.guidance}`}
            >
              <p className="text-base font-bold text-white">{rule.label}</p>
              <p className="mt-2 text-sm leading-relaxed text-[#D6DEEA]">
                {rule.guidance}
              </p>
              <p className="mt-3 text-xs font-bold uppercase tracking-[.12em] text-[#6F7B8F]">
                {rule.sourceEntryIds.length} source
                {rule.sourceEntryIds.length === 1 ? "" : "s"}
              </p>
            </div>
          ))
        )}
      </div>
    </article>
  );
}

function toEditableCandidates(
  candidates: VaultWebsiteIngestCandidate[],
): EditableIngestCandidate[] {
  return candidates.map((candidate) => ({
    candidate,
    selected: true,
    valueError: "",
    valueText: JSON.stringify(candidate.value, null, 2),
  }));
}

function parseCandidateDrafts(items: EditableIngestCandidate[]): {
  candidates: VaultWebsiteIngestCandidate[];
  error: string;
  nextDrafts: EditableIngestCandidate[];
} {
  const candidates: VaultWebsiteIngestCandidate[] = [];
  let error = "";

  const nextDrafts = items.map((item) => {
    if (!item.selected) {
      return { ...item, valueError: "" };
    }

    try {
      const parsed = JSON.parse(item.valueText) as unknown;

      if (!isRecord(parsed)) {
        error = "Each selected fact must be a JSON object.";
        return { ...item, valueError: "Value must be a JSON object." };
      }

      candidates.push({
        ...item.candidate,
        value: parsed,
      });
      return { ...item, valueError: "" };
    } catch {
      error = "Fix invalid JSON before approving website facts.";
      return { ...item, valueError: "Invalid JSON." };
    }
  });

  if (candidates.length === 0 && error.length === 0) {
    error = "Select at least one website fact before approving.";
  }

  return { candidates, error, nextDrafts };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function sectionName(section: VaultSection): string {
  return section
    .toLowerCase()
    .split("_")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function humanizeKey(key: string): string {
  return key
    .split("-")
    .map((part) => `${part[0]?.toUpperCase() ?? ""}${part.slice(1)}`)
    .join(" ");
}

function formatVaultDate(value: string): string {
  return new Intl.DateTimeFormat("en", {
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    month: "short",
  }).format(new Date(value));
}

function previewRecord(value: Record<string, unknown>): string {
  const text = JSON.stringify(value);
  return text.length > 220 ? `${text.slice(0, 220)}...` : text;
}

function downloadBrandBook(record: BrandBookExportRecord): void {
  const blob = new Blob([JSON.stringify(record, null, 2)], {
    type: "application/json",
  });
  const url = window.URL.createObjectURL(blob);
  const link = document.createElement("a");

  link.href = url;
  link.download = `markos-brand-book-v${record.version}.json`;
  link.click();
  window.URL.revokeObjectURL(url);
}

export function FinalSettingsPanel() {
  const [managed, setManaged] = useState<string | null>(null);
  return (
    <section className="space-y-6 xl:space-y-8">
      <HeroTitle
        icon={Settings}
        subtitle="Workspace, billing, language, channels, and security controls."
        title="Settings"
      />
      <section className="grid gap-5 lg:grid-cols-2 xl:gap-6">
        {[
          "Workspace Profile",
          "Language & Region",
          "Instagram Connection",
          "Billing & Usage",
          "Team Access",
          "Security",
        ].map((title, index) => (
          <article
            className="lux-card-muted rounded-[1.75rem] p-5 xl:p-7"
            key={title}
          >
            <IconTile
              accentName={
                index % 3 === 0 ? "teal" : index % 3 === 1 ? "gold" : "amber"
              }
              icon={index % 2 === 0 ? Settings : Users}
            />
            <h2 className="mt-5 text-xl font-bold text-white">{title}</h2>
            <p className="mt-3 text-base leading-relaxed text-[#9AA7BD] xl:text-lg">
              Production controls stay visible without breaking the
              command-center visual system.
            </p>
            <button
              className="mt-6 inline-flex items-center gap-2 text-base font-bold text-[#81D8D0] xl:text-lg"
              onClick={() => setManaged(title)}
              type="button"
            >
              {managed === title ? "Opened" : "Manage"} <ArrowRight size={18} />
            </button>
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
    {
      href: `/${locale}/app/settings#profile`,
      icon: User,
      label: "My Profile",
    },
    {
      href: `/${locale}/app/settings#business`,
      icon: Building2,
      label: "Business Settings",
    },
    {
      href: `/${locale}/app/settings#accounts`,
      icon: Link2,
      label: "Connected Accounts",
    },
    {
      href: `/${locale}/app/settings#billing`,
      icon: CreditCard,
      label: "Subscription & Billing",
    },
    {
      href: `/${locale}/app/settings#notifications`,
      icon: Bell,
      label: "Notifications",
    },
    {
      href: `/${locale}/app/settings#help`,
      icon: CircleHelp,
      label: "Help Center",
    },
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
        {open ? (
          <ChevronUp size={18} className="text-[#9AA7BD]" />
        ) : (
          <ChevronDown size={18} className="text-[#9AA7BD]" />
        )}
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
                window.localStorage.removeItem(sessionKey);
                setLogoutQueued(true);
                window.location.href = `/${locale}/login`;
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

function HeroTitle({
  children,
  icon,
  subtitle,
  title,
}: {
  children?: ReactNode;
  icon: IconType;
  subtitle: string;
  title: string;
}) {
  const Icon = icon;
  return (
    <section className="lux-card min-w-0 rounded-[1.5rem] p-5 sm:p-6 xl:p-8">
      <div className="flex flex-col gap-5 sm:flex-row sm:items-center">
        <IconTile accentName="teal" icon={Icon} size="lg" />
        <div>
          <h1 className="min-w-0 font-display text-3xl font-bold tracking-normal text-white sm:text-4xl">
            {title}
          </h1>
          <p className="mt-3 min-w-0 max-w-5xl text-base leading-relaxed text-[#D6DEEA] sm:text-lg xl:text-xl">
            {subtitle}
          </p>
        </div>
      </div>
      {children}
    </section>
  );
}

function SectionHeading({ title }: { title: string }) {
  return (
    <h2 className="font-display text-2xl font-bold text-white xl:text-3xl">
      {title}
    </h2>
  );
}

function SectionLabel({
  accentName,
  label,
}: {
  accentName: Accent;
  label: string;
}) {
  return (
    <h2 className="flex items-center gap-3 text-sm font-bold uppercase tracking-[.14em] text-[#9AA7BD]">
      <span
        className="h-2.5 w-2.5 rounded-full"
        style={{ backgroundColor: accent[accentName].hex }}
      />
      {label}
    </h2>
  );
}

function IconTile({
  accentName,
  icon,
  size = "md",
}: {
  accentName: Accent;
  icon: IconType;
  size?: "lg" | "md";
}) {
  const Icon = icon;
  return (
    <div
      className={
        size === "lg"
          ? "grid h-16 w-16 shrink-0 place-items-center rounded-full border"
          : "grid h-12 w-12 shrink-0 place-items-center rounded-xl border"
      }
      style={{
        background: accent[accentName].bg,
        borderColor: accent[accentName].border,
      }}
    >
      <Icon
        className={accent[accentName].className}
        size={size === "lg" ? 30 : 22}
        strokeWidth={1.8}
      />
    </div>
  );
}

function MetricRingCard({
  accentName,
  icon,
  label,
  sub,
  value,
}: {
  accentName: Accent;
  icon: IconType;
  label: string;
  sub: string;
  value: string;
}) {
  const color = accent[accentName].hex;
  const Icon = icon;
  return (
    <article className="lux-card-muted rounded-[1.5rem] p-5 text-center xl:p-6">
      <div
        className="mx-auto grid h-28 w-28 place-items-center rounded-full xl:h-32 xl:w-32"
        style={{
          background: `conic-gradient(${color} 0 82%, rgba(255,255,255,.08) 82% 100%)`,
          filter: `drop-shadow(0 0 16px ${color}44)`,
        }}
      >
        <div className="grid h-20 w-20 place-items-center rounded-full bg-[#111920] xl:h-24 xl:w-24">
          <Icon className={accent[accentName].className} size={32} />
        </div>
      </div>
      <p className="mt-4 text-sm text-[#9AA7BD] xl:mt-5 xl:text-base">
        {label}
      </p>
      <p className="mt-2 font-display text-3xl font-bold text-white xl:text-4xl">
        {value}
      </p>
      <p
        className={`mt-3 text-sm font-bold xl:mt-4 xl:text-base ${accent[accentName].className}`}
      >
        {sub} <ArrowRight className="inline" size={15} />
      </p>
    </article>
  );
}

function MiniStat({
  accentName,
  icon,
  label,
  value,
}: {
  accentName: Accent;
  icon: IconType;
  label: string;
  value: string;
}) {
  const Icon = icon;
  return (
    <div className="flex items-center gap-3">
      <Icon className={accent[accentName].className} size={20} />
      <div>
        <p className="text-[#9AA7BD]">{label}</p>
        <p className={`text-xl font-bold ${accent[accentName].className}`}>
          {value}
        </p>
      </div>
    </div>
  );
}

function ContentReadyCard({
  accent: accentName,
  cta,
  href,
  label,
  locale,
  status,
  subtitle,
  title,
}: ContentReadyCardModel & { locale: Locale }) {
  const cardHref =
    href ??
    (cta === "Schedule Post"
      ? `/${locale}/app/campaign-builder`
      : `/${locale}/app/content-studio`);
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
            <p className="font-display text-2xl font-bold text-white">
              {title}
            </p>
            <p className="mt-2 text-sm font-semibold text-[#81D8D0]">
              {subtitle}
            </p>
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
              <span
                className={
                  index === 0
                    ? "h-0.5 flex-1 rounded-full bg-[#F4A460]"
                    : "h-0.5 flex-1 rounded-full bg-[#F4A460]/35"
                }
                key={index}
              />
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
    <article
      className="group overflow-hidden rounded-[1.5rem] border bg-[#111920]/82 transition hover:bg-[#132129]"
      style={{ borderColor }}
    >
      <div
        className="relative aspect-square overflow-hidden"
        style={{ background: previewBackground }}
      >
        <div className="absolute inset-0 bg-[#0F1419]/14 transition group-hover:bg-transparent" />
        {previewArtwork()}
      </div>
      <div className="bg-[#111920]/92 p-4">
        <div className="mb-3 flex items-center justify-between gap-4">
          <p className="text-base font-bold text-white">{label}</p>
          <span
            className="rounded-full border px-3 py-1 text-xs font-bold"
            style={{ background: accent[accentName].bg, borderColor, color }}
          >
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

function PerformanceCard({
  accent: accentName,
  icon,
  label,
  meta,
  sub,
  value,
}: (typeof performanceHighlights)[number]) {
  return (
    <article className="lux-card-muted rounded-[1.75rem] p-5 xl:p-7">
      <div className="flex items-center gap-4 xl:gap-6">
        <IconTile accentName={accentName} icon={icon} />
        <div>
          <p className="font-display text-2xl font-bold text-white xl:text-3xl">
            {value}
          </p>
          <p className="text-base text-white xl:text-lg">{label}</p>
        </div>
      </div>
      <div className="mt-5 flex justify-between text-base xl:mt-7 xl:text-lg">
        <span className="text-[#9AA7BD]">{meta}</span>
        <span className={`font-bold ${accent[accentName].className}`}>
          {sub}
        </span>
      </div>
      <div className="mt-5 h-2 rounded-full bg-[#182436]">
        <div
          className="h-full w-[78%] rounded-full"
          style={{ background: accent[accentName].hex }}
        />
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
  why,
}: (typeof opportunityCards)[number] & { locale: Locale }) {
  return (
    <article
      className="lux-card rounded-[1.5rem] p-5 xl:p-6"
      style={{ borderColor: accent[accentName].border }}
    >
      <div className="flex flex-col gap-6 xl:flex-row xl:items-start xl:justify-between">
        <div>
          <p className="text-base font-bold text-[#D6DEEA] xl:text-lg">
            {theme}
          </p>
          <h2 className="mt-4 font-display text-2xl font-bold text-white xl:text-3xl">
            {title}
          </h2>
          <p className="mt-4 max-w-5xl text-base leading-relaxed text-[#B8C4D8] xl:text-lg">
            Your audience is showing strong interest in this content angle.
            MARKOS can convert it into a campaign or a content batch
            immediately.
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-3xl font-bold text-white xl:text-4xl">
            {confidence}
          </p>
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
          <h3 className="text-lg font-bold text-white">
            Suggested Content Pieces
          </h3>
          <div className="mt-4 flex flex-wrap gap-3">
            {pieces.map((piece) => (
              <span
                className="rounded-full bg-white/10 px-4 py-2 font-semibold text-[#D6DEEA]"
                key={piece}
              >
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
        <a
          className="rounded-full border border-[#81D8D0]/18 px-6 py-3 text-base font-bold text-white xl:px-7 xl:py-3.5"
          href={`/${locale}/app/analytics`}
        >
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

function GlassStat({
  icon,
  label,
  value,
}: {
  icon: IconType;
  label: string;
  value: string;
}) {
  const Icon = icon;
  return (
    <div className="lux-card-quiet rounded-[1.35rem] p-4 xl:p-5">
      <p className="flex items-center gap-3 text-[#9AA7BD]">
        <Icon size={18} />
        {label}
      </p>
      <p className="mt-4 font-display text-2xl font-bold text-white xl:text-3xl">
        {value}
      </p>
    </div>
  );
}

function ObjectiveCard({
  icon,
  label,
  sub,
  value,
}: {
  icon: IconType;
  label: string;
  sub: string;
  value: string;
}) {
  const Icon = icon;
  return (
    <article className="lux-card-muted rounded-[1.5rem] p-5 xl:p-7">
      <p className="flex items-center gap-3 text-lg font-bold text-white xl:gap-4 xl:text-xl">
        <Icon size={24} /> {label}
      </p>
      <p className="mt-5 font-display text-3xl font-bold text-white xl:mt-6 xl:text-4xl">
        {value}
      </p>
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
  title,
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
        <button
          className="font-bold text-white disabled:cursor-not-allowed disabled:opacity-45"
          disabled={disabled || busy}
          onClick={handleAction}
          type="button"
        >
          {busy ? "Working..." : applied ? "Applied" : action}
        </button>
      </div>
      <article className="lux-card-muted rounded-[1.75rem] p-5 xl:p-6">
        {children}
      </article>
    </section>
  );
}

function InstagramPreview({
  brandName,
  caption,
  hashtags,
  type,
}: {
  brandName: string;
  caption: string;
  hashtags: string[];
  type: string;
}) {
  const cleanBrand =
    brandName
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "") || "yourbrand";
  const previewCaption =
    caption.trim() ||
    "Generated caption preview will appear here after MARKOS creates a workspace draft.";
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
          <p className="mt-4 text-lg font-bold text-white xl:mt-5 xl:text-xl">
            {type} preview
          </p>
        </div>
        <div className="space-y-3 p-4 xl:p-5">
          <div className="flex justify-between text-xl xl:text-2xl">
            <span>Like Comment Share</span>
            <span>Save</span>
          </div>
          <p className="font-bold">2,847 likes</p>
          <p>
            <span className="font-bold">{cleanBrand}</span> {previewCaption}
          </p>
          {previewTags ? (
            <p className="text-sm text-black/65">{previewTags}</p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ScoreBadge({ score }: { score: string }) {
  return (
    <div
      className="grid h-28 w-28 place-items-center rounded-full"
      style={{
        background:
          "conic-gradient(#81D8D0 0 78%, rgba(255,255,255,.08) 78% 100%)",
      }}
    >
      <div className="grid h-20 w-20 place-items-center rounded-full bg-[#111920] text-center">
        <span className="text-2xl font-bold text-[#81D8D0]">{score}</span>
        <span className="text-xs uppercase text-[#9AA7BD]">Score</span>
      </div>
    </div>
  );
}

function waitFor(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
