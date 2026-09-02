"use client";

import Link from "next/link";
import { useEffect, useState, type ReactNode } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  FileText,
  LayoutDashboard,
  ListChecks,
  Plus,
  RefreshCcw,
  Sparkles,
  Target,
  X,
  Zap
} from "lucide-react";
import {
  campaignDurations,
  campaignGenerationDurations,
  type CampaignGenerationDurationDays,
  type CampaignRecord,
  type CampaignWeek,
  type ContentRecord,
  type ContentType,
  type Locale
} from "@markos/shared-types";
import { quotaBlockedMessage, quotaErrorMessage, useMeteredActionState } from "./metered-action";
import { useVaultGroundingState, vaultGapMessage } from "./vault-grounding";
import { useMarkosClient, useMarkosSession } from "./browser-session";

export function CampaignPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const client = useMarkosClient(locale);
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [objective, setObjective] = useState(t(locale, "defaultObjective"));
  const [durationDays, setDurationDays] = useState<CampaignGenerationDurationDays>(14);
  const [publishesPerDay, setPublishesPerDay] = useState(1);
  const [startsAt, setStartsAt] = useState(todayForDateInput);
  const [activeCampaignId, setActiveCampaignId] = useState<string>();
  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<"overview" | "week">("week");
  const [showComposer, setShowComposer] = useState(false);
  const [collapsedDays, setCollapsedDays] = useState<Set<number>>(() => new Set());
  const [message, setMessage] = useState("");
  const [campaignDrafts, setCampaignDrafts] = useState<ContentRecord[]>([]);
  const [approvingSuggestion, setApprovingSuggestion] = useState<string>();
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const vaultGrounding = useVaultGroundingState({ area: "campaigns", locale });
  const campaignUsage = useMeteredActionState({ fallbackTotal: 3, fallbackUsed: 1, label: t(locale, "title"), metric: "CAMPAIGN" });
  const selectedCampaignId = activeCampaignId ?? campaigns[0]?.id;

  useEffect(() => {
    if (session) void refreshCampaigns();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session]);

  useEffect(() => {
    if (!session || !selectedCampaignId) {
      setCampaignDrafts([]);
      return;
    }
    let cancelled = false;
    setCampaignDrafts([]);
    setSuggestionMessage("");
    void client
      .campaignDrafts(selectedCampaignId)
      .then((drafts) => {
        if (!cancelled) setCampaignDrafts(drafts);
      })
      .catch(() => {
        if (!cancelled) setSuggestionMessage(t(locale, "suggestionLoadFailed"));
      });
    return () => {
      cancelled = true;
    };
  }, [client, locale, selectedCampaignId, session]);

  async function refreshCampaigns() {
    if (!session) return setCampaigns([]);
    setIsBusy(true);
    setMessage("");
    try {
      const next = await client.campaigns();
      setCampaigns(next);
      setActiveCampaignId((current) => (next.some((campaign) => campaign.id === current) ? current : next[0]?.id));
      if (next.length === 0) setShowComposer(true);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function generate() {
    if (vaultGrounding.blocked) return setMessage(vaultGapMessage(locale));
    if (campaignUsage.blocked) return setMessage(quotaBlockedMessage(locale));
    if (!session) return setMessage(t(locale, "sessionRequired"));
    setIsBusy(true);
    setMessage("");
    try {
      const base = { durationDays, locale, publishesPerDay, startsAt: new Date(`${startsAt}T00:00:00.000Z`).toISOString() };
      const campaign = await client.generateCampaign(objective.trim() ? { ...base, objective: objective.trim() } : base);
      setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
      setActiveCampaignId(campaign.id);
      setActiveWeekIndex(0);
      setReviewMode("week");
      setCollapsedDays(new Set());
      setShowComposer(false);
      setCampaignDrafts([]);
    } catch (error) {
      setMessage(quotaErrorMessage(locale, error) ?? (error instanceof Error ? error.message : t(locale, "failed")));
    } finally {
      setIsBusy(false);
    }
  }

  const active = campaigns.find((campaign) => campaign.id === activeCampaignId) ?? campaigns[0];
  const detailed = active ? isDetailedCampaign(active) : false;
  const activeWeek = active && detailed ? active.content.weeklyCadence[activeWeekIndex] : undefined;

  function selectCampaign(id: string) {
    setActiveCampaignId(id);
    setActiveWeekIndex(0);
    setReviewMode("week");
    setCollapsedDays(new Set());
    setCampaignDrafts([]);
    setSuggestionMessage("");
  }

  function changeWeek(index: number) {
    setActiveWeekIndex(index);
    setCollapsedDays(new Set());
  }

  function toggleDay(day: number) {
    setCollapsedDays((current) => {
      const next = new Set(current);
      if (next.has(day)) next.delete(day);
      else next.add(day);
      return next;
    });
  }

  async function approveSuggestion(campaign: CampaignRecord, week: number, actionIndex: number) {
    const key = suggestionKey(week, actionIndex);
    if (approvingSuggestion || campaignDrafts.some((draft) => suggestionKey(draft.campaignWeek, draft.campaignActionIndex) === key)) return;
    setApprovingSuggestion(key);
    setSuggestionMessage("");
    try {
      const draft = await client.approveCampaignSuggestion(campaign.id, { week, actionIndex });
      setCampaignDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    } catch {
      setSuggestionMessage(t(locale, "suggestionApprovalFailed"));
    } finally {
      setApprovingSuggestion(undefined);
    }
  }

  return (
    <section className="flex min-w-0 flex-col gap-4 xl:h-[calc(100dvh-4.5rem)] xl:min-h-[690px] xl:overflow-hidden">
      <CampaignHeader
        count={campaigns.length}
        isBusy={isBusy}
        locale={locale}
        onNew={() => setShowComposer(true)}
        onRefresh={() => void refreshCampaigns()}
        session={Boolean(session)}
      />
      <section className="grid min-h-0 flex-1 gap-4 xl:grid-cols-[300px_minmax(0,1fr)]">
        <CampaignLibrary active={active} campaigns={campaigns} locale={locale} onNew={() => setShowComposer(true)} onSelect={selectCampaign} />
        <article className="sunlit-panel min-h-0 min-w-0 overflow-hidden rounded-[1.6rem]">
          {active ? (
            <div className="flex h-full min-h-0 flex-col">
              <CampaignHero campaign={active} locale={locale} />
              {detailed ? (
                <>
                  <div className="shrink-0 px-5 pt-3 sm:px-6">
                    <div className="inline-flex rounded-xl bg-[var(--sunlit-paper)] p-1" role="tablist">
                      <ReviewTab
                        active={reviewMode === "overview"}
                        icon={<LayoutDashboard size={15} />}
                        label={t(locale, "overview")}
                        onClick={() => setReviewMode("overview")}
                      />
                      <ReviewTab
                        active={reviewMode === "week"}
                        icon={<ListChecks size={15} />}
                        label={t(locale, "weekReview")}
                        onClick={() => setReviewMode("week")}
                      />
                    </div>
                  </div>
                  <div className="min-h-0 flex-1 overflow-y-auto px-5 pb-5 pt-3 [scrollbar-color:rgb(33_191_174_/_42%)_transparent] [scrollbar-width:thin] sm:px-6 sm:pb-6">
                    {reviewMode === "overview" ? (
                      <CampaignOverview
                        campaign={active}
                        locale={locale}
                        onReviewWeek={(index) => {
                          changeWeek(index);
                          setReviewMode("week");
                        }}
                      />
                    ) : activeWeek ? (
                      <WeeklyReview
                        activeWeek={activeWeek}
                        activeWeekIndex={activeWeekIndex}
                        approvingSuggestion={approvingSuggestion}
                        campaign={active}
                        campaignDrafts={campaignDrafts}
                        collapsedDays={collapsedDays}
                        locale={locale}
                        onApprove={approveSuggestion}
                        onChangeWeek={changeWeek}
                        onToggleDay={toggleDay}
                        suggestionMessage={suggestionMessage}
                      />
                    ) : null}
                    <CampaignRationale campaign={active} locale={locale} />
                  </div>
                </>
              ) : (
                <LegacyNotice locale={locale} onNew={() => setShowComposer(true)} />
              )}
            </div>
          ) : (
            <CampaignEmpty locale={locale} onNew={() => setShowComposer(true)} />
          )}
        </article>
      </section>
      {showComposer ? (
        <CampaignComposer
          canClose={campaigns.length > 0}
          durationDays={durationDays}
          isBusy={isBusy}
          locale={locale}
          message={message}
          objective={objective}
          onClose={() => campaigns.length > 0 && setShowComposer(false)}
          onDuration={setDurationDays}
          onGenerate={() => void generate()}
          onIntensity={setPublishesPerDay}
          onObjective={setObjective}
          onStart={setStartsAt}
          publishesPerDay={publishesPerDay}
          startsAt={startsAt}
        />
      ) : null}
    </section>
  );
}

function CampaignHeader({
  count,
  isBusy,
  locale,
  onNew,
  onRefresh,
  session
}: {
  count: number;
  isBusy: boolean;
  locale: Locale;
  onNew: () => void;
  onRefresh: () => void;
  session: boolean;
}) {
  return (
    <header className="sunlit-panel flex shrink-0 flex-col gap-4 rounded-[1.5rem] px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2.5">
          <h1 className="font-display text-2xl font-bold tracking-[-.035em] text-[var(--sunlit-ink)] sm:text-[2rem]">{t(locale, "title")}</h1>
          <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(33_191_174_/_24%)] bg-[var(--sunlit-aqua-soft)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--sunlit-aqua-dark)]">
            <Target size={13} />
            {session ? t(locale, "businessInformed") : t(locale, "previewMode")}
          </span>
          <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--sunlit-ink-soft)]">
            {count} {count === 1 ? t(locale, "campaign") : t(locale, "campaigns")}
          </span>
        </div>
        <p className="mt-1 text-sm text-[var(--sunlit-muted)]">{t(locale, "subtitle")}</p>
      </div>
      <div className="flex shrink-0 gap-2">
        <button
          className="sunlit-secondary inline-flex h-10 items-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
          disabled={isBusy}
          onClick={onRefresh}
          type="button"
        >
          <RefreshCcw className={isBusy ? "animate-spin" : ""} size={15} />
          {t(locale, "refresh")}
        </button>
        <button className="sunlit-primary inline-flex h-10 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" onClick={onNew} type="button">
          <Plus size={16} />
          {t(locale, "newCampaign")}
        </button>
      </div>
    </header>
  );
}

function CampaignLibrary({
  active,
  campaigns,
  locale,
  onNew,
  onSelect
}: {
  active: CampaignRecord | undefined;
  campaigns: CampaignRecord[];
  locale: Locale;
  onNew: () => void;
  onSelect: (id: string) => void;
}) {
  return (
    <aside className="sunlit-panel flex min-h-[360px] flex-col overflow-hidden rounded-[1.6rem] p-4 xl:min-h-0">
      <div className="shrink-0 px-1 pb-3">
        <p className="sunlit-eyebrow">{t(locale, "campaignLibrary")}</p>
        <div className="mt-1 flex items-center justify-between gap-3">
          <h2 className="text-lg font-extrabold text-[var(--sunlit-ink)]">{t(locale, "yourCampaigns")}</h2>
          <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-2.5 py-1 text-xs font-extrabold">{campaigns.length}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1 space-y-2 overflow-y-auto pe-1 [scrollbar-color:rgb(33_191_174_/_40%)_transparent] [scrollbar-width:thin]">
        {campaigns.map((campaign) => {
          const selected = campaign.id === active?.id;
          return (
            <button
              aria-pressed={selected}
              className={`w-full rounded-2xl border p-4 text-start transition ${selected ? "border-[rgb(33_191_174_/_52%)] bg-[linear-gradient(145deg,var(--sunlit-aqua-soft),rgb(255_250_244_/_86%))] shadow-[0_9px_24px_rgb(33_191_174_/_10%)]" : "border-[var(--sunlit-line)] bg-white hover:border-[rgb(33_191_174_/_35%)]"}`}
              key={campaign.id}
              onClick={() => onSelect(campaign.id)}
              type="button"
            >
              <span className="flex items-center justify-between gap-3">
                <span className="text-[10px] font-extrabold uppercase tracking-[.09em] text-[var(--sunlit-aqua-dark)]">
                  ● {statusLabel(locale, campaign.status)}
                </span>
                <span className="text-[11px] font-bold text-[var(--sunlit-muted)]">
                  {campaign.durationDays} {t(locale, "days")}
                </span>
              </span>
              <span className="mt-2 block text-[15px] font-extrabold leading-5 text-[var(--sunlit-ink)]">{campaign.title}</span>
              <span className="mt-2 block text-xs leading-5 text-[var(--sunlit-muted)]">{formatDateRange(locale, campaign.startsAt, campaign.endsAt)}</span>
            </button>
          );
        })}
      </div>
      <button
        className="mt-3 inline-flex min-h-12 shrink-0 items-center justify-center gap-2 rounded-xl border border-dashed border-[var(--sunlit-line-strong)] text-sm font-extrabold text-[var(--sunlit-ink-soft)] hover:border-[var(--sunlit-coral)]"
        onClick={onNew}
        type="button"
      >
        <Plus size={15} />
        {t(locale, "addAnother")}
      </button>
    </aside>
  );
}

function CampaignHero({ campaign, locale }: { campaign: CampaignRecord; locale: Locale }) {
  return (
    <header className="shrink-0 border-b border-[var(--sunlit-line)] px-5 pb-3 pt-5 sm:px-6">
      <div className="flex flex-wrap items-center gap-2">
        <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sunlit-aqua-soft)] px-2.5 py-1 text-[11px] font-extrabold text-[var(--sunlit-aqua-dark)]">
          <CheckCircle2 size={13} />
          {statusLabel(locale, campaign.status)}
        </span>
        <span className="text-xs font-bold text-[var(--sunlit-muted)]">{formatDateRange(locale, campaign.startsAt, campaign.endsAt)}</span>
      </div>
      <h2 className="mt-2 font-display text-2xl font-bold tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-[1.8rem]">{campaign.title}</h2>
      <p className="mt-1 line-clamp-2 max-w-5xl text-sm leading-5 text-[var(--sunlit-muted)]">{campaign.content.summary}</p>
      <div className="mt-3 flex flex-wrap gap-x-5 gap-y-2 border-t border-[var(--sunlit-line)] pt-3">
        <HeroStat color="#21BFAE" label={t(locale, "duration")} value={`${campaign.durationDays} ${t(locale, "days")}`} />
        <HeroStat color="#F6C453" label={t(locale, "weeks")} value={campaign.content.weeklyCadence.length.toString()} />
        <HeroStat color="#FF665A" label={t(locale, "intensity")} value={`${campaign.publishesPerDay} ${t(locale, "perDay")}`} />
        <HeroStat color="#8B86F8" label={t(locale, "totalSlots")} value={(campaign.durationDays * campaign.publishesPerDay).toString()} />
      </div>
    </header>
  );
}

function ReviewTab({ active, icon, label, onClick }: { active: boolean; icon: ReactNode; label: string; onClick: () => void }) {
  return (
    <button
      aria-selected={active}
      className={`inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold ${active ? "bg-white text-[var(--sunlit-ink)] shadow-sm" : "text-[var(--sunlit-muted)]"}`}
      onClick={onClick}
      role="tab"
      type="button"
    >
      {icon}
      {label}
    </button>
  );
}

function CampaignOverview({ campaign, locale, onReviewWeek }: { campaign: CampaignRecord; locale: Locale; onReviewWeek: (index: number) => void }) {
  return (
    <div className="grid gap-4" role="tabpanel">
      <section className="grid gap-3 lg:grid-cols-2">
        <CompactList items={campaign.content.objectives} label={t(locale, "objectives")} />
        <div className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4">
          <h3 className="text-sm font-extrabold">{t(locale, "campaignMap")}</h3>
          <div className="mt-3 grid gap-2">
            {campaign.content.weeklyCadence.map((week, index) => (
              <button
                className="flex items-center gap-3 rounded-xl bg-white p-3 text-start hover:bg-[var(--sunlit-aqua-soft)]"
                key={week.week}
                onClick={() => onReviewWeek(index)}
                type="button"
              >
                <span className="grid h-8 w-8 place-items-center rounded-lg bg-[var(--sunlit-ink)] text-xs font-extrabold text-white">{week.week}</span>
                <span className="min-w-0">
                  <span className="block text-[10px] font-extrabold uppercase text-[var(--sunlit-muted)]">
                    {t(locale, "week")} {week.week}
                  </span>
                  <span className="block truncate text-sm font-extrabold">{week.focus}</span>
                </span>
              </button>
            ))}
          </div>
        </div>
      </section>
      <section className="grid gap-3 md:grid-cols-2">
        <CompactList items={campaign.content.kpis.map((kpi) => `${kpi.name}: ${kpi.target}`)} label={t(locale, "kpis")} />
        <CompactList items={campaign.content.nextActions} label={t(locale, "nextActions")} />
      </section>
    </div>
  );
}

function WeeklyReview({
  activeWeek,
  activeWeekIndex,
  approvingSuggestion,
  campaign,
  campaignDrafts,
  collapsedDays,
  locale,
  onApprove,
  onChangeWeek,
  onToggleDay,
  suggestionMessage
}: {
  activeWeek: CampaignWeek;
  activeWeekIndex: number;
  approvingSuggestion: string | undefined;
  campaign: CampaignRecord;
  campaignDrafts: ContentRecord[];
  collapsedDays: Set<number>;
  locale: Locale;
  onApprove: (campaign: CampaignRecord, week: number, actionIndex: number) => Promise<void>;
  onChangeWeek: (index: number) => void;
  onToggleDay: (day: number) => void;
  suggestionMessage: string;
}) {
  const allCollapsed = activeWeek.days.every((day) => collapsedDays.has(day.day));
  return (
    <div role="tabpanel">
      <div className="flex gap-2 overflow-x-auto pb-2">
        {campaign.content.weeklyCadence.map((week, index) => (
          <button
            aria-current={index === activeWeekIndex ? "step" : undefined}
            className={`h-9 shrink-0 rounded-lg px-4 text-xs font-extrabold ${index === activeWeekIndex ? "bg-[var(--sunlit-ink)] text-white" : "border border-[var(--sunlit-line)] bg-white text-[var(--sunlit-muted)]"}`}
            key={week.week}
            onClick={() => onChangeWeek(index)}
            type="button"
          >
            {t(locale, "week")} {week.week}
          </button>
        ))}
      </div>
      <section className="rounded-[1.35rem] border border-[rgb(33_191_174_/_30%)] bg-[linear-gradient(145deg,rgb(239_253_250_/_82%),rgb(255_250_244_/_88%))] p-3 sm:p-4">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[rgb(33_191_174_/_18%)] pb-3">
          <div>
            <p className="sunlit-eyebrow">
              {t(locale, "week")} {activeWeek.week} · {formatCampaignWeekRange(locale, campaign.startsAt, activeWeek)}
            </p>
            <h3 className="mt-1 text-base font-extrabold">{activeWeek.focus}</h3>
          </div>
          <div className="flex items-center gap-2">
            <ContentLegend locale={locale} />
            <button
              className="sunlit-secondary inline-flex h-9 items-center gap-1.5 rounded-lg px-3 text-[11px] font-extrabold"
              onClick={() => {
                if (allCollapsed) activeWeek.days.forEach((day) => onToggleDay(day.day));
                else activeWeek.days.filter((day) => !collapsedDays.has(day.day)).forEach((day) => onToggleDay(day.day));
              }}
              type="button"
            >
              {allCollapsed ? t(locale, "expandAll") : t(locale, "collapseAll")}
              {allCollapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
            </button>
          </div>
        </div>
        <div className="mt-3 space-y-2">
          {activeWeek.days.map((day, dayIndex) => {
            const collapsed = collapsedDays.has(day.day);
            return (
              <section className="overflow-hidden rounded-xl border border-[var(--sunlit-line)] bg-white/90" key={day.day}>
                <button
                  className="flex h-9 w-full items-center gap-2 border-b border-[var(--sunlit-line)] px-3 text-start text-[11px] font-extrabold uppercase tracking-[.06em]"
                  onClick={() => onToggleDay(day.day)}
                  type="button"
                >
                  {collapsed ? <ChevronDown size={14} /> : <ChevronUp size={14} />}
                  {t(locale, "day")} {day.day} · {formatCampaignDay(locale, campaign.startsAt, day.day)}
                </button>
                {!collapsed ? (
                  <div className="divide-y divide-[var(--sunlit-line)]">
                    {day.posts.map((post, postIndex) => {
                      const actionIndex = weekPostIndex(activeWeek, dayIndex, postIndex);
                      const key = suggestionKey(activeWeek.week, actionIndex);
                      const linkedDraft = campaignDrafts.find((draft) => suggestionKey(draft.campaignWeek, draft.campaignActionIndex) === key);
                      return (
                        <div
                          className="grid min-w-0 grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-3 py-2"
                          key={`${day.day}-${postIndex}-${post.title}`}
                        >
                          <ContentTypeBadge locale={locale} type={post.contentType} />
                          <div className="min-w-0">
                            <p className="truncate text-[13px] font-extrabold">{post.title}</p>
                            <p className="truncate text-[11px] text-[var(--sunlit-muted)]">{post.description}</p>
                          </div>
                          {linkedDraft ? (
                            <div className="flex items-center gap-1.5">
                              <span
                                className="grid h-8 w-8 place-items-center rounded-full bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
                                title={t(locale, "draftAdded")}
                              >
                                <CheckCircle2 size={17} />
                              </span>
                              <Link
                                className="sunlit-secondary inline-flex h-8 items-center rounded-lg px-2.5 text-[11px] font-extrabold"
                                href={`/${locale}/app/content-studio?item=${linkedDraft.id}`}
                              >
                                {t(locale, "create")}
                              </Link>
                            </div>
                          ) : (
                            <button
                              aria-label={`${t(locale, "approveSuggestion")}: ${post.title}`}
                              className="sunlit-secondary grid h-8 w-8 place-items-center rounded-full text-[var(--sunlit-aqua-dark)] disabled:opacity-50"
                              disabled={Boolean(approvingSuggestion)}
                              onClick={() => void onApprove(campaign, activeWeek.week, actionIndex)}
                              type="button"
                            >
                              {approvingSuggestion === key ? <RefreshCcw className="animate-spin" size={15} /> : <Check size={16} />}
                            </button>
                          )}
                        </div>
                      );
                    })}
                  </div>
                ) : null}
              </section>
            );
          })}
        </div>
        <p aria-live="polite" className="mt-2 min-h-4 text-xs font-semibold text-[var(--sunlit-pink)]">
          {suggestionMessage}
        </p>
      </section>
      <div className="mt-3 flex justify-between gap-2">
        <button
          className="sunlit-secondary inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold disabled:opacity-35"
          disabled={activeWeekIndex === 0}
          onClick={() => onChangeWeek(activeWeekIndex - 1)}
          type="button"
        >
          {locale === "ar" ? <ArrowRight size={15} /> : <ArrowLeft size={15} />}
          {t(locale, "previousWeek")}
        </button>
        <button
          className="sunlit-secondary inline-flex h-9 items-center gap-2 rounded-lg px-3 text-xs font-extrabold disabled:opacity-35"
          disabled={activeWeekIndex === campaign.content.weeklyCadence.length - 1}
          onClick={() => onChangeWeek(activeWeekIndex + 1)}
          type="button"
        >
          {t(locale, "nextWeek")}
          {locale === "ar" ? <ArrowLeft size={15} /> : <ArrowRight size={15} />}
        </button>
      </div>
    </div>
  );
}

function CampaignRationale({ campaign, locale }: { campaign: CampaignRecord; locale: Locale }) {
  return (
    <div className="mt-4 grid gap-3 border-t border-[var(--sunlit-line)] pt-4 lg:grid-cols-2">
      <details className="rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4">
        <summary className="flex cursor-pointer list-none justify-between text-sm font-extrabold">
          <span>{t(locale, "contentPillars")}</span>
          <span className="rounded-full bg-white px-2.5 py-1 text-[11px] text-[var(--sunlit-pink)]">{campaign.content.pillars.length}</span>
        </summary>
        <div className="mt-3 grid gap-2">
          {campaign.content.pillars.map((pillar) => (
            <div className="rounded-lg bg-white p-3" key={pillar.name}>
              <p className="text-xs font-extrabold">{pillar.name}</p>
              <p className="mt-1 text-xs leading-5 text-[var(--sunlit-muted)]">{pillar.rationale}</p>
            </div>
          ))}
        </div>
      </details>
      <details className="rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4">
        <summary className="flex cursor-pointer list-none justify-between text-sm font-extrabold">
          <span>{t(locale, "whyTitle")}</span>
          <span className="rounded-full bg-[var(--sunlit-aqua-soft)] px-2.5 py-1 text-[11px] text-[var(--sunlit-aqua-dark)]">{t(locale, "viewDetails")}</span>
        </summary>
        <p className="mt-3 text-xs leading-5 text-[var(--sunlit-muted)]">{t(locale, "whyBody")}</p>
      </details>
    </div>
  );
}

function CampaignComposer({
  canClose,
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
  canClose: boolean;
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
  return (
    <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-[rgb(32_33_43_/_32%)] p-4 backdrop-blur-sm">
      <section
        aria-modal="true"
        className="sunlit-panel relative w-full max-w-2xl rounded-[1.75rem] p-5 shadow-[0_28px_90px_rgb(32_33_43_/_24%)] sm:p-7"
        role="dialog"
      >
        {canClose ? (
          <button
            aria-label={t(locale, "closeComposer")}
            className="sunlit-secondary absolute end-5 top-5 grid h-10 w-10 place-items-center rounded-xl"
            onClick={onClose}
            type="button"
          >
            <X size={17} />
          </button>
        ) : null}
        <div className="flex items-center gap-3 pe-12">
          <span className="grid h-11 w-11 place-items-center rounded-2xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
            <Sparkles size={20} />
          </span>
          <div>
            <h2 className="font-display text-2xl font-bold">{t(locale, "generate")}</h2>
            <p className="text-sm text-[var(--sunlit-muted)]">{t(locale, "generateSub")}</p>
          </div>
        </div>
        <label className="mt-5 block">
          <span className="text-xs font-extrabold uppercase tracking-[.08em]">{t(locale, "objective")}</span>
          <input
            className="sunlit-field mt-2 h-12 rounded-xl px-4 text-[15px] outline-none"
            onChange={(event) => onObjective(event.target.value)}
            value={objective}
          />
        </label>
        <fieldset className="mt-4">
          <legend className="text-xs font-extrabold uppercase tracking-[.08em]">{t(locale, "duration")}</legend>
          <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
            {campaignDurations.map((days) => {
              const supported = campaignGenerationDurations.includes(days as CampaignGenerationDurationDays);
              const selected = supported && durationDays === days;
              return (
                <button
                  aria-pressed={selected}
                  className={`relative min-h-16 rounded-xl border p-2 ${selected ? "border-[var(--sunlit-coral)] bg-[var(--sunlit-paper-deep)] shadow-[0_6px_18px_rgb(255_102_90_/_12%)]" : supported ? "border-[var(--sunlit-line)] bg-white hover:border-[var(--sunlit-coral)]" : "cursor-not-allowed border-dashed border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] text-[var(--sunlit-muted)] opacity-70"}`}
                  disabled={!supported}
                  key={days}
                  onClick={() => supported && onDuration(days as CampaignGenerationDurationDays)}
                  type="button"
                >
                  <span className="block text-lg font-extrabold">{days}</span>
                  <span className="block text-[10px] font-bold uppercase">{t(locale, "days")}</span>
                  {!supported ? (
                    <span className="absolute -top-1 end-1 rounded-full bg-[var(--sunlit-ink)] px-1.5 py-0.5 text-[8px] font-extrabold uppercase text-white">
                      {t(locale, "soon")}
                    </span>
                  ) : null}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-[var(--sunlit-muted)]">{t(locale, "futureDurations")}</p>
        </fieldset>
        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <label>
            <span className="text-xs font-extrabold uppercase tracking-[.08em]">{t(locale, "startDate")}</span>
            <input
              className="sunlit-field mt-2 h-12 rounded-xl px-3 text-sm font-bold outline-none"
              min={todayForDateInput()}
              onChange={(event) => onStart(event.target.value)}
              type="date"
              value={startsAt}
            />
          </label>
          <fieldset>
            <legend className="text-xs font-extrabold uppercase tracking-[.08em]">{t(locale, "intensity")}</legend>
            <div className="mt-2 grid h-12 grid-cols-3 gap-2">
              {[1, 2, 3].map((count) => (
                <button
                  aria-pressed={publishesPerDay === count}
                  className={`rounded-xl border text-sm font-extrabold ${publishesPerDay === count ? "border-[var(--sunlit-aqua)] bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]" : "border-[var(--sunlit-line)] bg-white text-[var(--sunlit-muted)]"}`}
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
        <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:items-center sm:justify-between">
          <p aria-live="polite" className="min-h-5 text-sm text-[var(--sunlit-pink)]">
            {message}
          </p>
          <button
            className="sunlit-primary inline-flex h-12 shrink-0 items-center gap-2 rounded-xl px-6 text-sm font-extrabold disabled:opacity-50"
            disabled={isBusy}
            onClick={onGenerate}
            type="button"
          >
            {isBusy ? <RefreshCcw className="animate-spin" size={16} /> : <Zap size={16} />}
            {isBusy ? t(locale, "generating") : t(locale, "generateCta")}
          </button>
        </div>
      </section>
    </div>
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
      <button className="sunlit-primary mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" onClick={onNew} type="button">
        <Plus size={16} />
        {t(locale, "newCampaign")}
      </button>
    </div>
  );
}

function LegacyNotice({ locale, onNew }: { locale: Locale; onNew: () => void }) {
  return (
    <div className="m-auto flex max-w-lg flex-col items-center px-6 py-10 text-center">
      <span className="grid h-14 w-14 place-items-center rounded-2xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
        <FileText size={24} />
      </span>
      <h3 className="mt-4 text-xl font-extrabold">{t(locale, "legacyTitle")}</h3>
      <p className="mt-2 text-sm leading-6 text-[var(--sunlit-muted)]">{t(locale, "legacyBody")}</p>
      <button className="sunlit-primary mt-5 inline-flex h-11 items-center gap-2 rounded-xl px-5 text-sm font-extrabold" onClick={onNew} type="button">
        <Sparkles size={16} />
        {t(locale, "generateDetailed")}
      </button>
    </div>
  );
}

function CompactList({ items, label }: { items: string[]; label: string }) {
  return (
    <div className="rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4">
      <h3 className="text-sm font-extrabold">{label}</h3>
      <ul className="mt-3 space-y-2">
        {items.slice(0, 5).map((item) => (
          <li className="flex gap-2 text-xs leading-5 text-[var(--sunlit-muted)]" key={item}>
            <Check className="mt-0.5 shrink-0 text-[var(--sunlit-aqua-dark)]" size={14} />
            {item}
          </li>
        ))}
      </ul>
    </div>
  );
}

function ContentLegend({ locale }: { locale: Locale }) {
  return (
    <div className="hidden items-center gap-1.5 2xl:flex">
      {(["REEL", "CAROUSEL", "POST", "STORY"] as ContentType[]).map((type) => (
        <ContentTypeBadge compact key={type} locale={locale} type={type} />
      ))}
    </div>
  );
}

function ContentTypeBadge({ compact = false, locale, type }: { compact?: boolean; locale: Locale; type: ContentType }) {
  const styles: Record<ContentType, string> = {
    CAROUSEL: "bg-[#FFF1E5] text-[#C76520]",
    POST: "bg-[#E9F0FF] text-[#4267B2]",
    REEL: "bg-[#FFE8F0] text-[#D93D78]",
    STORY: "bg-[#EAF7E7] text-[#4E8B3B]"
  };
  const labels: Record<ContentType, Record<Locale, string>> = {
    CAROUSEL: { ar: "كاروسيل", en: "Carousel" },
    POST: { ar: "منشور", en: "Post" },
    REEL: { ar: "ريل", en: "Reel" },
    STORY: { ar: "قصة", en: "Story" }
  };
  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-md font-extrabold ${styles[type]} ${compact ? "h-6 px-2 text-[9px]" : "h-7 min-w-[76px] justify-center px-2 text-[10px]"}`}
    >
      {labels[type][locale]}
    </span>
  );
}

function HeroStat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full" style={{ backgroundColor: color }} />
      <span className="text-xs text-[var(--sunlit-muted)]">{label}:</span>
      <span className="text-xs font-bold">{value}</span>
    </div>
  );
}

function isDetailedCampaign(campaign: CampaignRecord): boolean {
  return campaign.content.weeklyCadence.length > 0 && campaign.content.weeklyCadence.every((week) => Array.isArray((week as CampaignWeek).days));
}

function weekPostIndex(week: CampaignWeek, dayIndex: number, postIndex: number): number {
  return week.days.slice(0, dayIndex).reduce((total, day) => total + day.posts.length, 0) + postIndex;
}

function suggestionKey(week?: number, actionIndex?: number): string {
  return `${week ?? "none"}:${actionIndex ?? "none"}`;
}

function formatCampaignWeekRange(locale: Locale, startsAt: string, week: CampaignWeek): string {
  const first = week.days[0]?.day ?? 1;
  const last = week.days.at(-1)?.day ?? first;
  return formatDateRange(locale, dateForCampaignDay(startsAt, first), dateForCampaignDay(startsAt, last));
}

function formatCampaignDay(locale: Locale, startsAt: string, day: number): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-GB", { weekday: "short", day: "numeric", month: "short" }).format(
    new Date(dateForCampaignDay(startsAt, day))
  );
}

function dateForCampaignDay(startsAt: string, day: number): string {
  const date = new Date(startsAt);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date.toISOString();
}

function statusLabel(locale: Locale, status: CampaignRecord["status"]): string {
  const labels: Record<CampaignRecord["status"], Record<Locale, string>> = {
    ACTIVE: { ar: "نشطة", en: "Active" },
    APPROVED: { ar: "معتمدة", en: "Approved" },
    ARCHIVED: { ar: "مؤرشفة", en: "Archived" },
    COMPLETED: { ar: "مكتملة", en: "Completed" },
    REVIEW: { ar: "للمراجعة", en: "In review" }
  };
  return labels[status][locale];
}

function formatDateRange(locale: Locale, startsAt: string, endsAt: string): string {
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-GB", { day: "numeric", month: "short", year: "numeric" });
  return `${formatter.format(new Date(startsAt))} – ${formatter.format(new Date(endsAt))}`;
}

function todayForDateInput(): string {
  return new Date().toISOString().slice(0, 10);
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
      day: "اليوم",
      dayShort: "يوم",
      days: "يوم",
      defaultObjective: "زيادة الاستفسارات المؤهلة عبر إنستغرام",
      draftAdded: "أُضيفت المسودة إلى الإنشاء والتقويم",
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
      day: "Day",
      dayShort: "day",
      days: "days",
      defaultObjective: "Increase qualified Instagram inquiries",
      draftAdded: "Draft added to Create and Calendar",
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
