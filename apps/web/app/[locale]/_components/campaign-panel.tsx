"use client";

import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronRight, Plus, RefreshCcw, Search, Sparkles, X, Zap } from "lucide-react";
import {
  campaignDurations,
  campaignGenerationDurations,
  type CampaignGenerationDurationDays,
  type CampaignRecord,
  type CampaignReviewRecord,
  type CampaignSummary,
  type ContentRecord,
  type Locale
} from "@markos/shared-types";
import { useVaultGroundingState, vaultGapMessage } from "./vault-grounding";
import { useMarkosClient, useMarkosSession } from "./browser-session";
import { useModalDialog } from "./use-modal-dialog";
import { CampaignCounts, CampaignReview } from "./campaign-review";
import {
  campaignPostCounts,
  campaignPosts,
  initialReviewSelection,
  reviewCount,
  reviewRange,
  validReviewSelection,
  type ReviewPost,
  type ReviewSelection
} from "./campaign-review-model";
import styles from "./campaign-review.module.css";

export function CampaignPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  return <CampaignWorkspacePanel key={session?.workspace.id ?? "signed-out"} locale={locale} />;
}

function CampaignWorkspacePanel({ locale }: { locale: Locale }) {
  const router = useRouter();
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const vaultGrounding = useVaultGroundingState({ area: "campaigns", locale });
  const [campaigns, setCampaigns] = useState<CampaignSummary[]>([]);
  const [cursor, setCursor] = useState<string | null>(null);
  const [listLoaded, setListLoaded] = useState(false);
  const [listBusy, setListBusy] = useState(false);
  const [listError, setListError] = useState("");
  const [query, setQuery] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [objective, setObjective] = useState(t(locale, "defaultObjective"));
  const [durationDays, setDurationDays] = useState<CampaignGenerationDurationDays>(14);
  const [publishesPerDay, setPublishesPerDay] = useState(1);
  const [startsAt, setStartsAt] = useState(todayForDateInput);
  const [showComposer, setShowComposer] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [generationError, setGenerationError] = useState("");
  const [activeId, setActiveId] = useState<string>();
  const [lastId, setLastId] = useState<string>();
  const [review, setReview] = useState<CampaignReviewRecord>();
  const [reviewBusy, setReviewBusy] = useState(false);
  const [reviewError, setReviewError] = useState("");
  const [actionError, setActionError] = useState("");
  const [notice, setNotice] = useState("");
  const [pendingKey, setPendingKey] = useState<string>();
  const [selections, setSelections] = useState<Record<string, ReviewSelection>>({});
  const listRequest = useRef(0);
  const reviewRequest = useRef(0);
  const actionPending = useRef(false);
  const generationPending = useRef(false);
  const openedInitial = useRef<string | undefined>(undefined);
  const workspaceLifetime = useRef(0);

  useEffect(() => {
    const lifetime = workspaceLifetime;
    return () => {
      lifetime.current++;
    };
  }, []);

  useEffect(() => {
    const timer = window.setTimeout(() => setSearchQuery(query.trim()), 250);
    return () => window.clearTimeout(timer);
  }, [query]);
  useEffect(() => {
    if (!notice) return;
    const timer = window.setTimeout(() => setNotice(""), 4500);
    return () => window.clearTimeout(timer);
  }, [notice]);

  const refreshCampaigns = useCallback(
    async (nextCursor?: string) => {
      if (!session) return;
      const request = ++listRequest.current;
      setListBusy(true);
      setListError("");
      try {
        const page = await client.campaignSummaries({
          limit: 20,
          ...(nextCursor ? { cursor: nextCursor } : {}),
          ...(searchQuery ? { query: searchQuery } : {})
        });
        if (request !== listRequest.current) return;
        setCampaigns((current) => (nextCursor ? [...current, ...page.items.filter((item) => !current.some((entry) => entry.id === item.id))] : page.items));
        setCursor(page.nextCursor);
        setListLoaded(true);
      } catch (error) {
        if (request === listRequest.current) setListError(error instanceof Error ? error.message : t(locale, "failed"));
      } finally {
        if (request === listRequest.current) setListBusy(false);
      }
    },
    [client, locale, searchQuery, session]
  );

  useEffect(() => {
    const requests = listRequest;
    if (session) void refreshCampaigns();
    return () => {
      requests.current++;
    };
  }, [session, refreshCampaigns]);
  useEffect(() => {
    if (!session || openedInitial.current === session.workspace.id) return;
    openedInitial.current = session.workspace.id;
    const requestedId = new URLSearchParams(window.location.search).get("campaign");
    if (requestedId) {
      setActiveId(requestedId);
      setLastId(requestedId);
    }
  }, [session]);

  const loadReview = useCallback(
    async (id: string) => {
      const request = ++reviewRequest.current;
      setReviewBusy(true);
      setReviewError("");
      setActionError("");
      try {
        const result = await client.campaignReview(id);
        if (request !== reviewRequest.current) return;
        setReview(result);
        setSelections((current) => ({ ...current, [id]: validReviewSelection(result.campaign, current[id] ?? selectionFromUrl(result.campaign)) }));
        setCampaigns((current) => current.map((entry) => (entry.id === id ? summaryFromReview(result) : entry)));
      } catch (error) {
        if (request === reviewRequest.current) setReviewError(error instanceof Error ? error.message : t(locale, "failed"));
      } finally {
        if (request === reviewRequest.current) setReviewBusy(false);
      }
    },
    [client, locale]
  );

  useEffect(() => {
    const requests = reviewRequest;
    if (!activeId || !session) return;
    void loadReview(activeId);
    return () => {
      requests.current++;
    };
  }, [activeId, loadReview, session]);

  function openCampaign(id: string) {
    setReview(undefined);
    setReviewError("");
    setActionError("");
    setNotice("");
    setActiveId(id);
    setLastId(id);
    updateCampaignUrl(id, selections[id]);
  }
  function closeCampaign() {
    if (actionPending.current) return;
    setActiveId(undefined);
    setReview(undefined);
    setNotice("");
    updateCampaignUrl();
  }
  function selectReview(next: ReviewSelection) {
    if (!activeId) return;
    setSelections((current) => ({ ...current, [activeId]: next }));
    updateCampaignUrl(activeId, next);
  }
  async function generate() {
    if (generationPending.current) return;
    if (vaultGrounding.blocked) return setGenerationError(vaultGapMessage(locale));
    if (!session) return setGenerationError(t(locale, "sessionRequired"));
    generationPending.current = true;
    const lifetime = workspaceLifetime.current;
    setGenerating(true);
    setGenerationError("");
    try {
      const base = { durationDays, locale, publishesPerDay, startsAt: new Date(`${startsAt}T00:00:00.000Z`).toISOString() };
      const campaign = await client.generateCampaign(objective.trim() ? { ...base, objective: objective.trim() } : base);
      if (lifetime !== workspaceLifetime.current) return;
      const result = { campaign, items: [], mediaAssets: [] };
      setCampaigns((current) => [summaryFromReview(result), ...current.filter((item) => item.id !== campaign.id)]);
      setQuery("");
      setSearchQuery("");
      setShowComposer(false);
      setReview(result);
      setSelections((current) => ({ ...current, [campaign.id]: initialReviewSelection(campaign) }));
      setActiveId(campaign.id);
      setLastId(campaign.id);
      setReviewError("");
      setActionError("");
      updateCampaignUrl(campaign.id, initialReviewSelection(campaign));
    } catch (error) {
      if (lifetime === workspaceLifetime.current) setGenerationError(error instanceof Error ? error.message : t(locale, "failed"));
    } finally {
      generationPending.current = false;
      if (lifetime === workspaceLifetime.current) setGenerating(false);
    }
  }
  async function createDraft(post: ReviewPost) {
    if (!activeId || actionPending.current) return;
    actionPending.current = true;
    const lifetime = workspaceLifetime.current;
    setPendingKey(post.key);
    setActionError("");
    setNotice("");
    try {
      const draft = await client.approveCampaignSuggestion(activeId, { week: post.week, actionIndex: post.actionIndex });
      if (lifetime !== workspaceLifetime.current) return;
      setReview((current) => {
        if (!current || current.campaign.id !== activeId) return current;
        return { ...current, items: [draft, ...current.items.filter((item) => item.id !== draft.id)] };
      });
      // The review selection is already in the current history entry; Back restores it.
      openDraftInCreate(draft);
    } catch (error) {
      if (lifetime === workspaceLifetime.current) setActionError(error instanceof Error ? error.message : t(locale, "suggestionApprovalFailed"));
    } finally {
      actionPending.current = false;
      if (lifetime === workspaceLifetime.current) setPendingKey(undefined);
    }
  }
  // Keep index counts synchronized with the actual reviewer result, including an explicit new draft.
  useEffect(() => {
    if (review) setCampaigns((current) => current.map((entry) => (entry.id === review.campaign.id ? summaryFromReview(review) : entry)));
  }, [review]);
  function openDraftInCreate(draft: ContentRecord) {
    router.push(`/${locale}/app/content-studio?item=${draft.id}&source=campaign`);
  }

  return (
    <section className={styles.page}>
      <header className="flex shrink-0 flex-wrap items-center justify-between gap-4">
        <h1 className="font-display text-[2rem] font-semibold">{t(locale, "title")}</h1>
        <div className="flex gap-2">
          <button className={styles.button} disabled={listBusy} onClick={() => void refreshCampaigns()} type="button">
            <RefreshCcw aria-hidden="true" size={18} className={listBusy ? "animate-spin" : ""} />
            {t(locale, "refresh")}
          </button>
          <button
            className={`${styles.button} ${styles.primaryButton}`}
            onClick={() => {
              setGenerationError("");
              setShowComposer(true);
            }}
            type="button"
          >
            <Plus aria-hidden="true" size={18} />
            {t(locale, "newCampaign")}
          </button>
        </div>
      </header>
      <div className={styles.indexTools}>
        <label className={styles.search}>
          <Search aria-hidden="true" size={19} />
          <input
            aria-label={locale === "ar" ? "ابحث عن حملة" : "Find a campaign"}
            placeholder={locale === "ar" ? "ابحث عن حملة" : "Find a campaign"}
            maxLength={120}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
        </label>
      </div>
      <div className={styles.indexScroll} aria-busy={listBusy}>
        {listError && (
          <p className={styles.error} role="alert">
            {listError}
          </p>
        )}
        {!listLoaded && listBusy ? (
          <div className={styles.empty} role="status">
            {locale === "ar" ? "جارٍ تحميل الحملات…" : "Loading campaigns…"}
          </div>
        ) : campaigns.length ? (
          <div className={styles.cardList}>
            {campaigns.map((campaign) => (
              <article className={styles.card} data-selected={campaign.id === lastId} key={campaign.id}>
                <div className={styles.cardHeader}>
                  <div>
                    <h2>{campaign.title}</h2>
                    <div className={styles.dates}>
                      <span>
                        <CalendarDays aria-hidden="true" size={17} />
                        {reviewRange(locale, campaign.startsAt, campaign.endsAt)}
                      </span>
                      <span>{reviewCount(locale, campaign.durationDays, "days")}</span>
                    </div>
                  </div>
                </div>
                {campaign.objective && <p className={styles.objective}>{campaign.objective}</p>}
                <div className={styles.cardFooter}>
                  <CampaignCounts counts={campaign.postCounts} locale={locale} total />
                  <button
                    type="button"
                    className={styles.button}
                    onClick={() => openCampaign(campaign.id)}
                    aria-label={`${locale === "ar" ? "فتح الحملة" : "Open campaign"}: ${campaign.title}`}
                  >
                    {locale === "ar" ? "فتح الحملة" : "Open campaign"}
                    <ChevronRight aria-hidden="true" size={18} className="rtl:rotate-180" />
                  </button>
                </div>
              </article>
            ))}
          </div>
        ) : listLoaded && !listError ? (
          searchQuery ? (
            <div className={styles.empty}>
              <h2>{locale === "ar" ? "لا توجد حملات مطابقة" : "No matching campaigns"}</h2>
            </div>
          ) : (
            <CampaignEmpty locale={locale} onNew={() => setShowComposer(true)} />
          )
        ) : null}
        {cursor && (
          <div className={styles.loadMore}>
            <button type="button" className={styles.button} disabled={listBusy} onClick={() => void refreshCampaigns(cursor)}>
              {listBusy ? (locale === "ar" ? "جارٍ التحميل…" : "Loading…") : locale === "ar" ? "تحميل المزيد" : "Load more"}
            </button>
          </div>
        )}
      </div>
      {activeId && (
        <CampaignReview
          key={activeId}
          locale={locale}
          data={review}
          selection={selections[activeId] ?? { zoom: "week", day: 1, postKey: null, screen: "plan" }}
          loading={reviewBusy}
          error={reviewError}
          actionError={actionError}
          notice={notice}
          pendingKey={pendingKey}
          onSelection={selectReview}
          onClose={closeCampaign}
          onRefresh={() => void loadReview(activeId)}
          onCreateDraft={(post) => void createDraft(post)}
          onOpenCreate={openDraftInCreate}
        />
      )}
      {showComposer && (
        <CampaignComposer
          durationDays={durationDays}
          isBusy={generating}
          locale={locale}
          message={generationError}
          objective={objective}
          onClose={() => {
            if (!generating) setShowComposer(false);
          }}
          onDuration={setDurationDays}
          onGenerate={() => void generate()}
          onIntensity={setPublishesPerDay}
          onObjective={setObjective}
          onStart={setStartsAt}
          publishesPerDay={publishesPerDay}
          startsAt={startsAt}
        />
      )}
    </section>
  );
}

function summaryFromReview({ campaign, items }: CampaignReviewRecord): CampaignSummary {
  return {
    id: campaign.id,
    workspaceId: campaign.workspaceId,
    title: campaign.title,
    ...(campaign.objective === undefined ? {} : { objective: campaign.objective }),
    status: campaign.status,
    startsAt: campaign.startsAt,
    endsAt: campaign.endsAt,
    durationDays: campaign.durationDays,
    publishesPerDay: campaign.publishesPerDay,
    version: campaign.version,
    createdAt: campaign.createdAt,
    updatedAt: campaign.updatedAt,
    postCounts: campaignPostCounts(campaignPosts(campaign), items)
  };
}
function selectionFromUrl(campaign: CampaignRecord): ReviewSelection {
  const initial = initialReviewSelection(campaign);
  const params = new URLSearchParams(window.location.search);
  if (params.get("campaign") !== campaign.id) return initial;
  const zoom = params.get("view");
  const day = Number(params.get("day"));
  const postKey = params.get("post");
  return {
    zoom: zoom === "overview" || zoom === "month" || zoom === "week" ? zoom : initial.zoom,
    day: Number.isInteger(day) && day > 0 ? day : initial.day,
    postKey,
    screen: postKey ? "post" : "plan"
  };
}
function updateCampaignUrl(id?: string, selection?: ReviewSelection) {
  const url = new URL(window.location.href);
  for (const key of ["campaign", "view", "day", "post"]) url.searchParams.delete(key);
  if (id) url.searchParams.set("campaign", id);
  if (id && selection) {
    url.searchParams.set("view", selection.zoom);
    url.searchParams.set("day", String(selection.day));
    if (selection.screen === "post" && selection.postKey) url.searchParams.set("post", selection.postKey);
  }
  window.history.replaceState(window.history.state, "", `${url.pathname}${url.search}${url.hash}`);
}
function todayForDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}
function CampaignComposer({
  durationDays,
  isBusy,
  locale,
  message,
  objective,
  onClose,
  onDuration,
  onGenerate,
  onIntensity,
  onObjective,
  onStart,
  publishesPerDay,
  startsAt
}: {
  durationDays: CampaignGenerationDurationDays;
  isBusy: boolean;
  locale: Locale;
  message: string;
  objective: string;
  onClose: () => void;
  onDuration: (value: CampaignGenerationDurationDays) => void;
  onGenerate: () => void;
  onIntensity: (value: number) => void;
  onObjective: (value: string) => void;
  onStart: (value: string) => void;
  publishesPerDay: number;
  startsAt: string;
}) {
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose, closeDisabled: isBusy });
  return (
    <dialog
      aria-label={t(locale, "generate")}
      className="sunlit-modal-shell m-auto h-fit w-[min(42rem,calc(100vw-2rem))] max-h-[90dvh] overflow-y-auto rounded-2xl border border-[var(--border)] bg-[var(--surface)] p-5 text-[var(--text)] shadow-2xl backdrop:bg-[var(--overlay)] sm:p-7"
      ref={dialogRef}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
    >
      <button
        aria-label={t(locale, "closeComposer")}
        className="sunlit-secondary absolute end-5 top-5 grid min-h-11 w-10 place-items-center rounded-xl"
        disabled={isBusy}
        onClick={onClose}
        type="button"
      >
        <X size={17} />
      </button>
      <div className="flex items-center gap-3 pe-12">
        <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
          <Sparkles size={20} />
        </span>
        <div>
          <h2 className="font-display text-2xl font-bold">{t(locale, "generate")}</h2>
          <p className="text-sm text-[var(--sunlit-muted)]">{t(locale, "generateSub")}</p>
        </div>
      </div>
      <fieldset className="min-w-0" disabled={isBusy}>
        <label className="mt-5 block">
          <span className="text-sm font-semibold">{t(locale, "objective")}</span>
          <input
            className="sunlit-field mt-2 h-12 rounded-xl px-4 text-base outline-none"
            onChange={(event) => onObjective(event.target.value)}
            value={objective}
          />
        </label>
        <fieldset className="mt-4">
          <legend className="text-sm font-semibold">{t(locale, "duration")}</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {campaignDurations.map((days) => {
              const supported = campaignGenerationDurations.includes(days as CampaignGenerationDurationDays);
              const selected = supported && durationDays === days;
              return (
                <button
                  aria-pressed={selected}
                  className={`relative min-h-16 rounded-xl border p-2 ${selected ? "border-[var(--sunlit-coral)] bg-[var(--sunlit-paper-deep)] shadow-[0_6px_18px_color-mix(in_srgb,var(--primary)_12%,transparent)]" : supported ? "border-[var(--sunlit-line)] bg-[var(--surface)] hover:border-[var(--sunlit-coral)]" : "cursor-not-allowed border-dashed border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] text-[var(--sunlit-muted)] opacity-70"}`}
                  disabled={!supported}
                  key={days}
                  onClick={() => supported && onDuration(days as CampaignGenerationDurationDays)}
                  type="button"
                >
                  <span className="block text-lg font-semibold">{days}</span>
                  <span className="block text-xs font-medium">{t(locale, "days")}</span>
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-sm text-[var(--sunlit-muted)]">{t(locale, "futureDurations")}</p>
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-sm font-semibold">{t(locale, "startDate")}</span>
            <input
              className="sunlit-field mt-2 h-12 rounded-xl px-3 text-sm font-bold outline-none"
              min={todayForDateInput()}
              onChange={(event) => onStart(event.target.value)}
              type="date"
              value={startsAt}
            />
          </label>
          <fieldset>
            <legend className="text-sm font-semibold">{t(locale, "intensity")}</legend>
            <div className="mt-2 grid h-12 grid-cols-3 gap-2">
              {[1, 2, 3].map((count) => (
                <button
                  aria-pressed={publishesPerDay === count}
                  className={`rounded-xl border text-sm font-semibold ${publishesPerDay === count ? "border-[var(--sunlit-aqua)] bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]" : "border-[var(--sunlit-line)] bg-[var(--surface)] text-[var(--sunlit-muted)]"}`}
                  key={count}
                  onClick={() => onIntensity(count)}
                  type="button"
                >
                  {count}/{t(locale, "dayShort")}
                </button>
              ))}
            </div>
          </fieldset>
        </div>
      </fieldset>
      <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
        <p role={message ? "alert" : "status"} className="min-h-5 text-sm text-[var(--danger)]">
          {message}
        </p>
        <button
          className="sunlit-primary inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-6 text-sm font-semibold disabled:opacity-50"
          disabled={isBusy}
          onClick={onGenerate}
          type="button"
        >
          {isBusy ? <RefreshCcw className="animate-spin" size={16} /> : <Zap size={16} />}
          {isBusy ? t(locale, "generating") : t(locale, "generateCta")}
        </button>
      </div>
    </dialog>
  );
}

function CampaignEmpty({ locale, onNew }: { locale: Locale; onNew: () => void }) {
  return (
    <div className="flex h-full min-h-[420px] flex-col items-center justify-center px-6 text-center">
      <span className="grid h-16 w-16 place-items-center rounded-[1.4rem] bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
        <CalendarDays size={28} />
      </span>
      <h2 className="mt-5 font-display text-2xl font-bold">{t(locale, "emptyTitle")}</h2>
      <p className="mt-2 max-w-md text-sm leading-6 text-[var(--sunlit-muted)]">{t(locale, "emptyBody")}</p>
      <button className="sunlit-primary mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-semibold" onClick={onNew} type="button">
        <Plus size={16} />
        {t(locale, "newCampaign")}
      </button>
    </div>
  );
}

function t(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      addAnother: "إضافة حملة أخرى",
      approveSuggestion: "اعتماد الفكرة وإنشاء مسودة",
      businessInformed: "مبنية على ملف النشاط",
      campaign: "حملة",
      campaignLibrary: "مكتبة الحملات",
      campaignMap: "خريطة الحملة",
      campaigns: "حملات",
      closeComposer: "إغلاق إنشاء الحملة",
      collapseAll: "طي الكل",
      contentPillars: "ركائز المحتوى",
      create: "فتح",
      dailyPlan: "الخطة اليومية",
      day: "اليوم",
      dayShort: "يوم",
      days: "يوم",
      defaultObjective: "زيادة الاستفسارات المؤهلة عبر إنستغرام",
      draftAdded: "أُضيفت المسودة إلى الإنشاء والتقويم",
      draftRegistered: "تمت إضافة الفكرة كمسودة. يمكنك فتحها في الإنشاء الآن.",
      duration: "المدة",
      emptyBody: "حدد هدفاً ومدة وتاريخ بداية، ثم أنشئ أول حملة لنشاطك.",
      emptyTitle: "ابدأ حملتك الأولى",
      expandAll: "فتح الكل",
      failed: "فشل الطلب",
      futureDurations: "حملات 30 و60 و90 يوماً قادمة قريباً.",
      generate: "إنشاء حملة",
      generateCta: "إنشاء الحملة",
      generateDetailed: "إنشاء حملة مفصلة",
      generateSub: "حوّل معرفة MARKOS بنشاطك إلى خطة قابلة للتنفيذ.",
      generating: "جارٍ إنشاء الخطة...",
      intensity: "كثافة النشر",
      kpis: "مؤشرات النجاح",
      legacyBody: "تم إنشاء هذه الحملة قبل إضافة الخطة اليومية المفصلة. أنشئ حملة جديدة لمراجعة الأفكار واعتمادها واحدة تلو الأخرى.",
      legacyTitle: "هذه حملة من الإصدار السابق",
      newCampaign: "حملة جديدة",
      nextActions: "الخطوات التالية",
      nextWeek: "الأسبوع التالي",
      objective: "هدف الحملة",
      objectives: "أهداف الحملة",
      openDraftInCreate: "فتح المسودة في الإنشاء",
      overview: "نظرة عامة",
      perDay: "منشور يومياً",
      previewMode: "معاينة",
      previousWeek: "الأسبوع السابق",
      refresh: "تحديث",
      sessionRequired: "سجّل الدخول قبل إنشاء حملة.",
      soon: "قريباً",
      startDate: "تاريخ البداية",
      subtitle: "حوّل ما يعرفه MARKOS عن نشاطك إلى حملة واضحة ومحددة المدة.",
      suggestionApprovalFailed: "تعذر إنشاء المسودة. حاول مرة أخرى.",
      suggestionLoadFailed: "تعذر تحميل مسودات هذه الحملة.",
      title: "الحملات",
      totalSlots: "إجمالي الأفكار",
      viewDetails: "عرض التفاصيل",
      week: "الأسبوع",
      weekReview: "مراجعة أسبوعية",
      weeks: "الأسابيع",
      whyBody: "استخدم MARKOS ملف نشاطك المعتمد، وجمهورك، وعروضك، وصوت علامتك، والهدف الذي حددته لبناء هذه الخطة.",
      whyTitle: "لماذا أوصى MARKOS بهذه الخطة؟",
      yourCampaigns: "حملاتك"
    },
    en: {
      addAnother: "Add another campaign",
      approveSuggestion: "Approve idea and create draft",
      businessInformed: "Business-informed",
      campaign: "campaign",
      campaignLibrary: "Campaign library",
      campaignMap: "Campaign map",
      campaigns: "campaigns",
      closeComposer: "Close campaign composer",
      collapseAll: "Collapse all",
      contentPillars: "Content Pillars",
      create: "Create",
      dailyPlan: "Daily plan",
      day: "Day",
      dayShort: "day",
      days: "days",
      defaultObjective: "Increase qualified Instagram inquiries",
      draftAdded: "Draft added to Create and Calendar",
      draftRegistered: "Idea registered as a draft. You can open it in Create now.",
      duration: "Duration",
      emptyBody: "Set an objective, duration, and start date, then create your first business-informed campaign.",
      emptyTitle: "Start your first campaign",
      expandAll: "Expand all",
      failed: "Request failed",
      futureDurations: "30-, 60-, and 90-day campaigns are coming next.",
      generate: "Create a campaign",
      generateCta: "Create campaign",
      generateDetailed: "Create detailed campaign",
      generateSub: "Turn what MARKOS knows about your business into an executable plan.",
      generating: "Building the plan...",
      intensity: "Publishing intensity",
      kpis: "Success measures",
      legacyBody: "This campaign was generated before detailed daily planning was added. Create a new campaign to review and approve each content idea.",
      legacyTitle: "Earlier campaign format",
      newCampaign: "New campaign",
      nextActions: "Priority actions",
      nextWeek: "Next week",
      objective: "Campaign objective",
      objectives: "Campaign objectives",
      openDraftInCreate: "Open draft in Create",
      overview: "Overview",
      perDay: "per day",
      previewMode: "Preview mode",
      previousWeek: "Previous week",
      refresh: "Refresh",
      sessionRequired: "Sign in before creating a campaign.",
      soon: "Soon",
      startDate: "Start date",
      subtitle: "Turn what MARKOS knows about your business into a clear, time-bound campaign.",
      suggestionApprovalFailed: "MARKOS could not create the draft. Try again.",
      suggestionLoadFailed: "MARKOS could not load this campaign's drafts.",
      title: "Campaigns",
      totalSlots: "Total ideas",
      viewDetails: "View details",
      week: "Week",
      weekReview: "Week-by-week review",
      weeks: "Weeks",
      whyBody: "MARKOS used your approved Business Profile, audience, offers, brand voice, and stated goal to build this plan.",
      whyTitle: "Why MARKOS recommended this",
      yourCampaigns: "Your campaigns"
    }
  };
  return dictionary[locale][key] ?? key;
}
