"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  Check,
  CheckCircle2,
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
import { campaignDurations, type CampaignDurationDays, type CampaignRecord, type ContentRecord, type Locale } from "@markos/shared-types";
import { quotaBlockedMessage, quotaErrorMessage, useMeteredActionState } from "./metered-action";
import { useVaultGroundingState, vaultGapMessage } from "./vault-grounding";
import { useMarkosClient, useMarkosSession } from "./browser-session";

export function CampaignPanel({ locale }: { locale: Locale }) {
  const session = useMarkosSession();
  const [campaigns, setCampaigns] = useState<CampaignRecord[]>([]);
  const [objective, setObjective] = useState(text(locale, "defaultObjective"));
  const [durationDays, setDurationDays] = useState<CampaignDurationDays>(30);
  const [publishesPerDay, setPublishesPerDay] = useState(1);
  const [startsAt, setStartsAt] = useState(todayForDateInput);
  const [activeCampaignId, setActiveCampaignId] = useState<string>();
  const [activeWeekIndex, setActiveWeekIndex] = useState(0);
  const [reviewMode, setReviewMode] = useState<"overview" | "week">("overview");
  const [showComposer, setShowComposer] = useState(false);
  const [message, setMessage] = useState("");
  const [campaignDrafts, setCampaignDrafts] = useState<ContentRecord[]>([]);
  const [approvingSuggestion, setApprovingSuggestion] = useState<string>();
  const [suggestionMessage, setSuggestionMessage] = useState("");
  const [isBusy, setIsBusy] = useState(false);
  const vaultGrounding = useVaultGroundingState({ area: "campaigns", locale });
  const campaignUsage = useMeteredActionState({
    fallbackTotal: 3,
    fallbackUsed: 1,
    label: locale === "ar" ? "الحملات" : "Campaigns",
    metric: "CAMPAIGN"
  });

  const client = useMarkosClient(locale);
  const selectedCampaignId = activeCampaignId ?? campaigns[0]?.id;

  useEffect(() => {
    if (!session) {
      return;
    }

    void refreshCampaigns();
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
        if (!cancelled) setSuggestionMessage(text(locale, "suggestionLoadFailed"));
      });

    return () => {
      cancelled = true;
    };
  }, [client, locale, selectedCampaignId, session]);

  async function refreshCampaigns() {
    if (!session) {
      setCampaigns([]);
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const nextCampaigns = await client.campaigns();
      setCampaigns(nextCampaigns);
      setActiveCampaignId((current) => (nextCampaigns.some((campaign) => campaign.id === current) ? current : nextCampaigns[0]?.id));
      setShowComposer(nextCampaigns.length === 0);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : text(locale, "failed"));
    } finally {
      setIsBusy(false);
    }
  }

  async function generate() {
    if (vaultGrounding.blocked) {
      setMessage(vaultGapMessage(locale));
      return;
    }

    if (campaignUsage.blocked) {
      setMessage(quotaBlockedMessage(locale));
      return;
    }

    if (!session) {
      setMessage(text(locale, "sessionRequired"));
      return;
    }

    setIsBusy(true);
    setMessage("");

    try {
      const campaign = await client.generateCampaign(
        objective.trim()
          ? {
              durationDays,
              locale,
              objective: objective.trim(),
              publishesPerDay,
              startsAt: new Date(`${startsAt}T00:00:00.000Z`).toISOString()
            }
          : {
              durationDays,
              locale,
              publishesPerDay,
              startsAt: new Date(`${startsAt}T00:00:00.000Z`).toISOString()
            }
      );
      setCampaigns((current) => [campaign, ...current.filter((item) => item.id !== campaign.id)]);
      setActiveCampaignId(campaign.id);
      setActiveWeekIndex(0);
      setReviewMode("overview");
      setShowComposer(false);
      setCampaignDrafts([]);
      setMessage(text(locale, "generated"));
    } catch (error) {
      setMessage(quotaErrorMessage(locale, error) ?? (error instanceof Error ? error.message : text(locale, "failed")));
    } finally {
      setIsBusy(false);
    }
  }

  const active = campaigns.find((campaign) => campaign.id === activeCampaignId) ?? campaigns[0];
  const activeWeek = active?.content.weeklyCadence[activeWeekIndex];

  function selectCampaign(campaignId: string) {
    setActiveCampaignId(campaignId);
    setActiveWeekIndex(0);
    setReviewMode("overview");
    setShowComposer(false);
    setCampaignDrafts([]);
    setSuggestionMessage("");
    setMessage("");
  }

  function reviewWeek(index: number) {
    setActiveWeekIndex(index);
    setReviewMode("week");
  }

  async function approveSuggestion(campaign: CampaignRecord, week: number, actionIndex: number) {
    const key = campaignSuggestionKey(week, actionIndex);
    if (approvingSuggestion || campaignDrafts.some((draft) => campaignSuggestionKey(draft.campaignWeek, draft.campaignActionIndex) === key)) return;

    setApprovingSuggestion(key);
    setSuggestionMessage("");

    try {
      const draft = await client.approveCampaignSuggestion(campaign.id, { week, actionIndex });
      setCampaignDrafts((current) => [draft, ...current.filter((item) => item.id !== draft.id)]);
    } catch {
      setSuggestionMessage(text(locale, "suggestionApprovalFailed"));
    } finally {
      setApprovingSuggestion(undefined);
    }
  }

  return (
    <section className="grid gap-6">
      <section className="sunlit-panel rounded-[1.75rem] p-5 sm:p-6">
        <div className="flex flex-col gap-5 lg:flex-row lg:items-center lg:justify-between">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-3">
              <h2 className="font-display text-2xl font-bold leading-tight tracking-[-.03em] text-[var(--sunlit-ink)] sm:text-3xl">{text(locale, "title")}</h2>
              <span className="inline-flex items-center gap-1.5 rounded-full border border-[rgb(33_191_174_/_24%)] bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-aqua-dark)]">
                <Target size={14} />
                {session ? text(locale, "businessInformed") : text(locale, "previewMode")}
              </span>
              {campaigns.length > 0 ? (
                <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                  {campaigns.length} {campaigns.length === 1 ? text(locale, "campaign") : text(locale, "campaigns")}
                </span>
              ) : null}
            </div>
            <p className="mt-2 max-w-3xl text-sm leading-6 text-[var(--sunlit-muted)]">{text(locale, "subtitle")}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              aria-label={text(locale, "refresh")}
              className="sunlit-secondary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
              disabled={isBusy}
              onClick={refreshCampaigns}
              type="button"
            >
              <RefreshCcw size={15} />
              <span className="hidden sm:inline">{text(locale, "refresh")}</span>
            </button>
            <button
              className="sunlit-primary inline-flex min-h-11 items-center justify-center gap-2 rounded-xl px-5 text-sm font-extrabold"
              onClick={() => setShowComposer(true)}
              type="button"
            >
              <Plus size={17} />
              {text(locale, "newCampaign")}
            </button>
          </div>
        </div>
      </section>

      <section className="grid min-w-0 gap-5 xl:grid-cols-[320px_minmax(0,1fr)]">
        <aside className="sunlit-panel self-start rounded-[1.75rem] p-5">
          {showComposer ? (
            <div aria-label={text(locale, "campaignComposer")} role="region">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="flex h-11 w-11 items-center justify-center rounded-2xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
                    <Sparkles size={20} />
                  </div>
                  <div>
                    <h3 className="font-extrabold text-[var(--sunlit-ink)]">{text(locale, "generate")}</h3>
                    <p className="text-sm text-[var(--sunlit-muted)]">{text(locale, "generateSub")}</p>
                  </div>
                </div>
                {campaigns.length > 0 ? (
                  <button
                    aria-label={text(locale, "closeComposer")}
                    className="sunlit-secondary inline-flex h-10 w-10 items-center justify-center rounded-xl"
                    onClick={() => setShowComposer(false)}
                    type="button"
                  >
                    <X size={17} />
                  </button>
                ) : null}
              </div>

              <label className="mt-5 block">
                <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-ink-soft)]">{text(locale, "objective")}</span>
                <input
                  className="sunlit-field mt-2 h-12 rounded-xl px-4 text-[15px] outline-none"
                  onChange={(event) => setObjective(event.target.value)}
                  type="text"
                  value={objective}
                />
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-ink-soft)]">{text(locale, "duration")}</span>
                <select
                  className="sunlit-field mt-2 h-12 rounded-xl px-3 text-sm font-extrabold outline-none"
                  onChange={(event) => setDurationDays(Number(event.target.value) as CampaignDurationDays)}
                  value={durationDays}
                >
                  {campaignDurations.map((days) => (
                    <option key={days} value={days}>
                      {days} {text(locale, "days")}
                    </option>
                  ))}
                </select>
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-ink-soft)]">{text(locale, "startDate")}</span>
                <input
                  className="sunlit-field mt-2 h-12 rounded-xl px-3 text-sm font-bold outline-none"
                  min={todayForDateInput()}
                  onChange={(event) => setStartsAt(event.target.value)}
                  type="date"
                  value={startsAt}
                />
              </label>

              <label className="mt-4 block">
                <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-ink-soft)]">{text(locale, "intensity")}</span>
                <select
                  className="sunlit-field mt-2 h-12 rounded-xl px-3 text-sm font-extrabold outline-none"
                  onChange={(event) => setPublishesPerDay(Number(event.target.value))}
                  value={publishesPerDay}
                >
                  {[1, 2, 3, 4, 5].map((count) => (
                    <option key={count} value={count}>
                      {count} {text(locale, "perDay")}
                    </option>
                  ))}
                </select>
              </label>

              <button
                className="sunlit-primary mt-5 inline-flex h-12 w-full items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold disabled:opacity-50"
                disabled={isBusy}
                onClick={generate}
                type="button"
              >
                <Zap size={16} />
                {text(locale, "generateCta")}
              </button>
              <p aria-live="polite" className="mt-3 min-h-5 text-sm leading-6 text-[var(--sunlit-muted)]">
                {message}
              </p>
            </div>
          ) : (
            <div aria-label={text(locale, "campaignLibrary")} role="region">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="sunlit-eyebrow">{text(locale, "campaignLibrary")}</p>
                  <h3 className="mt-1 text-lg font-extrabold text-[var(--sunlit-ink)]">{text(locale, "yourCampaigns")}</h3>
                </div>
                <span className="rounded-full bg-[var(--sunlit-paper-deep)] px-3 py-1 text-xs font-extrabold text-[var(--sunlit-ink-soft)]">
                  {campaigns.length}
                </span>
              </div>
              <div className="mt-4 grid gap-2">
                {campaigns.map((campaign) => {
                  const selected = campaign.id === active?.id;
                  return (
                    <button
                      aria-pressed={selected}
                      className={`w-full rounded-2xl border p-4 text-start transition ${
                        selected
                          ? "border-[rgb(33_191_174_/_55%)] bg-[var(--sunlit-aqua-soft)] shadow-[0_10px_26px_rgb(33_191_174_/_12%)]"
                          : "border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] hover:border-[rgb(33_191_174_/_35%)]"
                      }`}
                      key={campaign.id}
                      onClick={() => selectCampaign(campaign.id)}
                      type="button"
                    >
                      <span className="flex items-center justify-between gap-3">
                        <span className="text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-aqua-dark)]">
                          {statusLabel(locale, campaign.status)}
                        </span>
                        <span className="text-xs font-bold text-[var(--sunlit-muted)]">
                          {campaign.durationDays} {text(locale, "days")}
                        </span>
                      </span>
                      <span className="mt-2 block text-[15px] font-extrabold leading-5 text-[var(--sunlit-ink)]">{campaign.title}</span>
                      <span className="mt-2 block text-xs leading-5 text-[var(--sunlit-muted)]">
                        {formatDateRange(locale, campaign.startsAt, campaign.endsAt)}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </aside>

        <article className="sunlit-panel min-w-0 rounded-[1.75rem] p-5 sm:p-7">
          {active ? (
            <>
              <header>
                <div className="flex flex-wrap items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs font-extrabold text-[var(--sunlit-aqua-dark)]">
                    <CheckCircle2 size={14} />
                    {statusLabel(locale, active.status)}
                  </span>
                  <span className="text-xs font-bold text-[var(--sunlit-muted)]">{formatDateRange(locale, active.startsAt, active.endsAt)}</span>
                </div>
                <h3 className="mt-3 font-display text-3xl font-bold tracking-tight text-[var(--sunlit-ink)] sm:text-4xl">{active.title}</h3>
                <p className="mt-3 max-w-4xl text-base leading-7 text-[var(--sunlit-muted)]">{active.content.summary}</p>
                <div className="mt-5 flex flex-wrap gap-x-6 gap-y-3 border-y border-[var(--sunlit-line)] py-4">
                  <HeroStat color="#21BFAE" label={text(locale, "duration")} value={`${active.durationDays} ${text(locale, "days")}`} />
                  <HeroStat color="#F6C453" label={text(locale, "weeks")} value={active.content.weeklyCadence.length.toString()} />
                  <HeroStat color="#FF665A" label={text(locale, "intensity")} value={`${active.publishesPerDay} ${text(locale, "perDay")}`} />
                </div>
              </header>

              <div className="mt-6 inline-flex w-full rounded-2xl bg-[var(--sunlit-paper)] p-1 sm:w-auto" role="tablist">
                <button
                  aria-selected={reviewMode === "overview"}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition sm:flex-none ${
                    reviewMode === "overview" ? "bg-white text-[var(--sunlit-ink)] shadow-sm" : "text-[var(--sunlit-muted)]"
                  }`}
                  onClick={() => setReviewMode("overview")}
                  role="tab"
                  type="button"
                >
                  <LayoutDashboard size={16} />
                  {text(locale, "overview")}
                </button>
                <button
                  aria-selected={reviewMode === "week"}
                  className={`inline-flex min-h-11 flex-1 items-center justify-center gap-2 rounded-xl px-4 text-sm font-extrabold transition sm:flex-none ${
                    reviewMode === "week" ? "bg-white text-[var(--sunlit-ink)] shadow-sm" : "text-[var(--sunlit-muted)]"
                  }`}
                  onClick={() => setReviewMode("week")}
                  role="tab"
                  type="button"
                >
                  <ListChecks size={16} />
                  {text(locale, "weekReview")}
                </button>
              </div>

              {reviewMode === "overview" ? (
                <div aria-label={text(locale, "campaignOverview")} className="mt-6 grid gap-6" role="tabpanel">
                  <section>
                    <h4 className="text-lg font-extrabold text-[var(--sunlit-ink)]">{text(locale, "objectives")}</h4>
                    <div className="mt-3 flex flex-wrap gap-2">
                      {active.content.objectives.map((campaignObjective) => (
                        <span
                          className="rounded-full border border-[var(--sunlit-line)] bg-white px-3 py-2 text-sm font-bold text-[var(--sunlit-ink-soft)]"
                          key={campaignObjective}
                        >
                          {campaignObjective}
                        </span>
                      ))}
                    </div>
                  </section>

                  <section>
                    <div className="flex items-end justify-between gap-4">
                      <div>
                        <h4 className="text-lg font-extrabold text-[var(--sunlit-ink)]">{text(locale, "campaignMap")}</h4>
                        <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">{text(locale, "campaignMapSub")}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 sm:grid-cols-2">
                      {active.content.weeklyCadence.map((week, index) => (
                        <button
                          className="group flex min-h-24 items-start gap-3 rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4 text-start transition hover:border-[rgb(33_191_174_/_45%)] hover:bg-[var(--sunlit-aqua-soft)]"
                          key={week.week}
                          onClick={() => reviewWeek(index)}
                          type="button"
                        >
                          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-white text-sm font-extrabold text-[var(--sunlit-pink)] shadow-sm">
                            {week.week}
                          </span>
                          <span>
                            <span className="block text-xs font-extrabold uppercase tracking-[.08em] text-[var(--sunlit-muted)]">
                              {text(locale, "week")} {week.week}
                            </span>
                            <span className="mt-1 block text-sm font-extrabold leading-6 text-[var(--sunlit-ink)]">{week.focus}</span>
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>

                  <section className="border-t border-[var(--sunlit-line)] pt-6">
                    <div className="flex items-center gap-3">
                      <span className="flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
                        <FileText size={18} />
                      </span>
                      <div>
                        <h4 className="font-extrabold text-[var(--sunlit-ink)]">{text(locale, "nextActions")}</h4>
                        <p className="text-sm text-[var(--sunlit-muted)]">{text(locale, "nextActionsSub")}</p>
                      </div>
                    </div>
                    <div className="mt-4 grid gap-3 md:grid-cols-3">
                      {active.content.nextActions.slice(0, 3).map((action, index) => (
                        <div
                          className="flex items-start gap-3 rounded-xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-4"
                          key={`${index}-${action}`}
                        >
                          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-[var(--sunlit-ink)] text-xs font-extrabold text-white">
                            {index + 1}
                          </span>
                          <p className="text-sm font-bold leading-6 text-[var(--sunlit-ink)]">{action}</p>
                        </div>
                      ))}
                    </div>
                  </section>
                </div>
              ) : (
                <div aria-label={text(locale, "weeklyReview")} className="mt-6" role="tabpanel">
                  {activeWeek ? (
                    <>
                      <div className="flex items-center gap-2 overflow-x-auto pb-2 [scrollbar-color:rgb(33_191_174_/_45%)_transparent] [scrollbar-width:thin]">
                        {active.content.weeklyCadence.map((week, index) => (
                          <button
                            aria-current={index === activeWeekIndex ? "step" : undefined}
                            className={`min-h-10 shrink-0 rounded-xl px-4 text-sm font-extrabold transition ${
                              index === activeWeekIndex
                                ? "bg-[var(--sunlit-ink)] text-white"
                                : "border border-[var(--sunlit-line)] bg-white text-[var(--sunlit-muted)] hover:text-[var(--sunlit-ink)]"
                            }`}
                            key={week.week}
                            onClick={() => setActiveWeekIndex(index)}
                            type="button"
                          >
                            {text(locale, "week")} {week.week}
                          </button>
                        ))}
                      </div>

                      <section className="mt-4 rounded-[1.5rem] border border-[rgb(33_191_174_/_28%)] bg-[linear-gradient(145deg,rgb(239_253_250_/_88%),rgb(255_250_244_/_92%))] p-5 sm:p-6">
                        <div className="flex flex-col gap-4 sm:flex-row sm:items-start sm:justify-between">
                          <div>
                            <p className="sunlit-eyebrow">
                              {text(locale, "week")} {activeWeek.week} · {text(locale, "of")} {active.content.weeklyCadence.length}
                            </p>
                            <h4 className="mt-2 font-display text-2xl font-bold tracking-tight text-[var(--sunlit-ink)]">{activeWeek.focus}</h4>
                          </div>
                          <div className="flex gap-2">
                            <button
                              aria-label={text(locale, "previousWeek")}
                              className="sunlit-secondary inline-flex h-10 w-10 items-center justify-center rounded-xl disabled:opacity-35"
                              disabled={activeWeekIndex === 0}
                              onClick={() => setActiveWeekIndex((current) => Math.max(0, current - 1))}
                              type="button"
                            >
                              {locale === "ar" ? <ArrowRight size={17} /> : <ArrowLeft size={17} />}
                            </button>
                            <button
                              aria-label={text(locale, "nextWeek")}
                              className="sunlit-secondary inline-flex h-10 w-10 items-center justify-center rounded-xl disabled:opacity-35"
                              disabled={activeWeekIndex === active.content.weeklyCadence.length - 1}
                              onClick={() => setActiveWeekIndex((current) => Math.min(active.content.weeklyCadence.length - 1, current + 1))}
                              type="button"
                            >
                              {locale === "ar" ? <ArrowLeft size={17} /> : <ArrowRight size={17} />}
                            </button>
                          </div>
                        </div>

                        <div className="mt-6 grid gap-3">
                          {activeWeek.actions.map((action, index) => {
                            const suggestionKey = campaignSuggestionKey(activeWeek.week, index);
                            const linkedDraft = campaignDrafts.find(
                              (draft) => campaignSuggestionKey(draft.campaignWeek, draft.campaignActionIndex) === suggestionKey
                            );
                            const isApproving = approvingSuggestion === suggestionKey;

                            return (
                              <div
                                className="flex items-start gap-3 rounded-2xl border border-white/80 bg-white/80 p-4 shadow-[0_8px_22px_rgb(53_38_31_/_6%)]"
                                key={`${activeWeek.week}-${action}`}
                              >
                                <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-xl bg-[var(--sunlit-pink)] text-xs font-extrabold text-white">
                                  {index + 1}
                                </span>
                                <div className="min-w-0 flex-1">
                                  <p className="pt-1 text-[15px] font-bold leading-6 text-[var(--sunlit-ink)]">{action}</p>
                                  <p className="mt-1 text-xs font-semibold text-[var(--sunlit-muted)]">
                                    {text(locale, "goal")}: {activeWeek.focus}
                                  </p>
                                </div>
                                {linkedDraft ? (
                                  <div className="flex shrink-0 items-center gap-2">
                                    <span
                                      className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[var(--sunlit-aqua-soft)] text-[var(--sunlit-aqua-dark)]"
                                      title={text(locale, "draftAdded")}
                                    >
                                      <CheckCircle2 size={18} />
                                    </span>
                                    <Link
                                      aria-label={`${text(locale, "openInCreate")}: ${action}`}
                                      className="sunlit-secondary inline-flex h-10 items-center justify-center rounded-xl px-3 text-xs font-extrabold"
                                      href={`/${locale}/app/content-studio?item=${linkedDraft.id}`}
                                    >
                                      {text(locale, "create")}
                                    </Link>
                                  </div>
                                ) : (
                                  <button
                                    aria-label={`${text(locale, "approveSuggestion")}: ${action}`}
                                    className="sunlit-secondary inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-xl text-[var(--sunlit-aqua-dark)] disabled:cursor-wait disabled:opacity-50"
                                    disabled={Boolean(approvingSuggestion)}
                                    onClick={() => void approveSuggestion(active, activeWeek.week, index)}
                                    title={text(locale, "approveSuggestion")}
                                    type="button"
                                  >
                                    {isApproving ? <RefreshCcw className="animate-spin" size={17} /> : <Check size={18} />}
                                  </button>
                                )}
                              </div>
                            );
                          })}
                        </div>
                        <p aria-live="polite" className="mt-3 min-h-5 text-sm font-semibold text-[var(--sunlit-pink)]">
                          {suggestionMessage}
                        </p>
                      </section>
                    </>
                  ) : (
                    <p className="rounded-2xl bg-[var(--sunlit-paper)] p-5 text-sm text-[var(--sunlit-muted)]">{text(locale, "noWeeklyPlan")}</p>
                  )}
                </div>
              )}

              <div className="mt-7 grid gap-3 border-t border-[var(--sunlit-line)] pt-6 lg:grid-cols-2">
                <details className="group rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-[var(--sunlit-ink)]">
                    <span>{text(locale, "contentPillars")}</span>
                    <span className="rounded-full bg-white px-3 py-1.5 text-xs text-[var(--sunlit-pink)]">{active.content.pillars.length}</span>
                  </summary>
                  <p className="mt-2 text-sm text-[var(--sunlit-muted)]">{text(locale, "pillarsSub")}</p>
                  <div className="mt-4 grid gap-3">
                    {active.content.pillars.map((pillar) => (
                      <div className="rounded-xl bg-white p-4" key={pillar.name}>
                        <h4 className="font-extrabold text-[var(--sunlit-ink)]">{pillar.name}</h4>
                        <p className="mt-1 text-sm leading-6 text-[var(--sunlit-muted)]">{pillar.rationale}</p>
                      </div>
                    ))}
                  </div>
                </details>

                <details className="group rounded-2xl border border-[var(--sunlit-line)] bg-[var(--sunlit-paper)] p-5">
                  <summary className="flex cursor-pointer list-none items-center justify-between gap-4 font-extrabold text-[var(--sunlit-ink)]">
                    <span>{text(locale, "whyTitle")}</span>
                    <span className="rounded-full bg-[var(--sunlit-aqua-soft)] px-3 py-1.5 text-xs text-[var(--sunlit-aqua-dark)]">
                      {text(locale, "viewDetails")}
                    </span>
                  </summary>
                  <p className="mt-3 text-sm leading-6 text-[var(--sunlit-muted)]">{text(locale, "whyBody")}</p>
                  <div className="mt-4 flex flex-wrap gap-2">
                    {[text(locale, "profileSource"), text(locale, "audienceSource"), text(locale, "brandSource")].map((source) => (
                      <span className="rounded-full bg-white px-3 py-1.5 text-xs font-bold text-[var(--sunlit-muted)]" key={source}>
                        {source}
                      </span>
                    ))}
                  </div>
                </details>
              </div>
            </>
          ) : (
            <div className="flex min-h-[420px] flex-col items-center justify-center px-4 text-center">
              <span className="flex h-16 w-16 items-center justify-center rounded-[1.4rem] bg-[var(--sunlit-paper-deep)] text-[var(--sunlit-pink)]">
                <CalendarDays size={28} />
              </span>
              <h3 className="mt-5 font-display text-2xl font-bold text-[var(--sunlit-ink)]">{text(locale, "emptyTitle")}</h3>
              <p className="mt-2 max-w-lg text-sm leading-6 text-[var(--sunlit-muted)]">{text(locale, "emptyBody")}</p>
            </div>
          )}
        </article>
      </section>
    </section>
  );
}

function HeroStat({ color, label, value }: { color: string; label: string; value: string }) {
  return (
    <div className="flex items-center gap-2">
      <span className="h-2 w-2 rounded-full shadow-[0_0_7px_currentColor]" style={{ backgroundColor: color, color }} />
      <span className="text-[13px] text-[var(--sunlit-muted)]">{label}:</span>
      <span className="text-[13px] font-bold text-[var(--sunlit-ink)]">{value}</span>
    </div>
  );
}

function text(locale: Locale, key: string): string {
  const dictionary: Record<Locale, Record<string, string>> = {
    ar: {
      audienceSource: "الجمهور والسوق",
      approveSuggestion: "اعتماد الفكرة وإنشاء مسودة",
      brandSource: "صوت العلامة والأهداف",
      businessInformed: "مبنية على ملف النشاط",
      campaign: "حملة",
      campaignComposer: "إنشاء حملة",
      campaignLibrary: "مكتبة الحملات",
      campaignMap: "خريطة الحملة",
      campaignMapSub: "راجع مسار الحملة كاملاً، ثم افتح أسبوعاً واحداً للعمل عليه.",
      campaignOverview: "نظرة عامة على الحملة",
      campaigns: "حملات",
      create: "إنشاء",
      cadence: "خطتك الأسبوعية",
      cadenceSub: "خطة عملية توضح ما يجب التركيز عليه كل أسبوع.",
      closeComposer: "إغلاق إنشاء الحملة",
      contentPillars: "ركائز المحتوى",
      days: "يوم",
      defaultObjective: "زيادة الاستفسارات المؤهلة من إنستغرام خلال 30 يوماً",
      duration: "المدة",
      draftAdded: "أُضيفت المسودة إلى الإنشاء والتقويم",
      emptyBody: "حدد هدفاً ومدة وتاريخ بداية، ثم أنشئ أول حملة لنشاطك.",
      emptyTitle: "لم يتم إنشاء حملة بعد",
      failed: "فشل الطلب",
      generate: "إنشاء حملة",
      generateCta: "إنشاء الحملة",
      generateSub: "مبنية على ملف النشاط المعتمد",
      generated: "تم إنشاء الحملة",
      goal: "الهدف",
      intensity: "كثافة النشر",
      latest: "أحدث حملة",
      newCampaign: "حملة جديدة",
      nextActions: "أهم الخطوات",
      nextActionsSub: "ابدأ بهذه الخطوات الثلاث",
      nextWeek: "الأسبوع التالي",
      noWeeklyPlan: "لا تحتوي هذه الحملة على خطة أسبوعية بعد.",
      objectives: "أهداف الحملة",
      of: "من",
      openInCreate: "فتح المسودة في الإنشاء",
      overview: "نظرة عامة",
      pillarsSub: "رسائل قابلة للتنفيذ",
      previousWeek: "الأسبوع السابق",
      previewMode: "معاينة",
      priorityActions: "الخطوات الرئيسية",
      profileSource: "ملف النشاط المعتمد",
      perDay: "منشور يومياً",
      refresh: "تحديث",
      sessionRequired: "سجّل الدخول قبل إنشاء حملة.",
      startDate: "تاريخ البداية",
      subtitle: "حوّل ما يعرفه MARKOS عن نشاطك إلى حملة واضحة ومحددة المدة.",
      suggestionApprovalFailed: "تعذر إنشاء المسودة. حاول مرة أخرى.",
      suggestionLoadFailed: "تعذر تحميل مسودات هذه الحملة.",
      title: "الحملات",
      week: "الأسبوع",
      weeks: "الأسابيع",
      whyBody: "استخدم MARKOS ملف نشاطك المعتمد، وجمهورك، وعروضك، وصوت علامتك، والهدف الذي حددته لبناء هذه الخطة.",
      whyTitle: "لماذا أوصى MARKOS بهذه الخطة؟",
      viewDetails: "عرض التفاصيل",
      weekReview: "مراجعة أسبوعية",
      weeklyReview: "مراجعة الخطة أسبوعاً بأسبوع",
      yourCampaigns: "حملات نشاطك",
      objective: "الهدف"
    },
    en: {
      audienceSource: "Audience and market",
      approveSuggestion: "Approve idea and create draft",
      brandSource: "Brand voice and goals",
      businessInformed: "Business-informed",
      campaign: "campaign",
      campaignComposer: "Campaign composer",
      campaignLibrary: "Campaign library",
      campaignMap: "Campaign map",
      campaignMapSub: "Scan the complete arc, then open one week when you are ready to work through it.",
      campaignOverview: "Campaign overview",
      campaigns: "campaigns",
      create: "Create",
      cadence: "Your weekly plan",
      cadenceSub: "A practical sequence showing what to focus on each week.",
      closeComposer: "Close campaign composer",
      contentPillars: "Content Pillars",
      days: "days",
      defaultObjective: "Increase qualified Instagram inquiries over the next 30 days",
      duration: "Duration",
      draftAdded: "Draft added to Create and Calendar",
      emptyBody: "Set an objective, duration, and start date, then create your first campaign.",
      emptyTitle: "No campaign created yet",
      failed: "Request failed",
      generate: "Create a campaign",
      generateCta: "Create Campaign",
      generateSub: "Based on your approved Business Profile",
      generated: "Campaign created",
      goal: "Goal",
      intensity: "Publishing intensity",
      latest: "Latest Campaign",
      newCampaign: "New campaign",
      nextActions: "Priority actions",
      nextActionsSub: "Start with these three moves",
      nextWeek: "Next week",
      noWeeklyPlan: "This campaign does not have a weekly plan yet.",
      objectives: "Campaign objectives",
      of: "of",
      openInCreate: "Open draft in Create",
      overview: "Overview",
      pillarsSub: "Actionable message territories",
      previousWeek: "Previous week",
      previewMode: "Preview mode",
      priorityActions: "Priority actions",
      profileSource: "Approved Business Profile",
      perDay: "per day",
      refresh: "Refresh",
      sessionRequired: "Sign in before creating a campaign.",
      startDate: "Start date",
      subtitle: "Turn what MARKOS knows about your business into a clear, time-bound campaign.",
      suggestionApprovalFailed: "MARKOS could not create the draft. Try again.",
      suggestionLoadFailed: "MARKOS could not load this Campaign's drafts.",
      title: "Campaigns",
      week: "Week",
      weeks: "Weeks",
      whyBody: "MARKOS used your approved Business Profile, audience, offers, brand voice, and stated goal to build this plan.",
      whyTitle: "Why MARKOS recommended this",
      viewDetails: "View details",
      weekReview: "Week-by-week review",
      weeklyReview: "Week-by-week plan review",
      yourCampaigns: "Your campaigns",
      objective: "Objective"
    }
  };

  return dictionary[locale][key] ?? key;
}

function campaignSuggestionKey(week: number | undefined, actionIndex: number | undefined): string {
  return `${week ?? "none"}:${actionIndex ?? "none"}`;
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
  const formatter = new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric"
  });
  return `${formatter.format(new Date(startsAt))} – ${formatter.format(new Date(endsAt))}`;
}

function todayForDateInput(): string {
  return new Date().toISOString().slice(0, 10);
}
