"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeft,
  ArrowRight,
  CalendarDays,
  ChevronRight,
  Clapperboard,
  Image as ImageIcon,
  Images,
  RectangleVertical,
  RefreshCcw,
  Target,
  X
} from "lucide-react";
import type { CampaignRecord, CampaignReviewRecord, CampaignSummary, ContentRecord, Locale, MediaAssetRecord } from "@markos/shared-types";
import { ContentStatusBadge } from "./content-status-badge";
import { useModalDialog } from "./use-modal-dialog";
import {
  campaignDate,
  campaignMonths,
  campaignPostCounts,
  campaignPosts,
  reviewCount,
  reviewDate,
  reviewNumber,
  reviewRange,
  suggestionKey,
  type ReviewPost,
  type ReviewSelection,
  type ReviewZoom
} from "./campaign-review-model";
import styles from "./campaign-review.module.css";

const formats = { POST: ImageIcon, CAROUSEL: Images, REEL: Clapperboard, STORY: RectangleVertical };
const words = {
  close: ["Close campaign", "إغلاق الحملة"],
  refresh: ["Refresh", "تحديث"],
  overview: ["Overview", "نظرة عامة"],
  week: ["Week", "أسبوع"],
  month: ["Month", "شهر"],
  objective: ["Campaign objective", "هدف الحملة"],
  plan: ["The plan", "الخطة"],
  previous: ["Previous", "السابق"],
  next: ["Next", "التالي"],
  previousWeek: ["Previous week", "الأسبوع السابق"],
  nextWeek: ["Next week", "الأسبوع التالي"],
  previousMonth: ["Previous month", "الشهر السابق"],
  nextMonth: ["Next month", "الشهر التالي"],
  previousPost: ["Previous post", "المنشور السابق"],
  nextPost: ["Next post", "المنشور التالي"],
  back: ["Back to plan", "العودة للخطة"],
  returnPost: ["Return to post", "العودة للمنشور"],
  idea: ["Idea", "فكرة"],
  draft: ["Draft", "مسودة"],
  inReview: ["In review", "قيد المراجعة"],
  ready: ["Ready", "جاهز"],
  scheduled: ["Scheduled", "مجدول"],
  published: ["Published", "منشور"],
  failed: ["Failed", "تعذّر النشر"],
  total: ["Planned posts", "منشورات مخططة"],
  ideas: ["Ideas", "أفكار"],
  brief: ["Brief", "الفكرة"],
  goal: ["Goal", "الهدف"],
  pillar: ["Content pillar", "ركيزة المحتوى"],
  caption: ["Caption", "التعليق"],
  noCaption: ["No caption yet.", "لم يُكتب تعليق بعد."],
  noMedia: ["No media yet", "لا توجد وسائط بعد"],
  mediaFailed: ["Media could not be loaded.", "تعذر تحميل الوسائط."],
  createDraft: ["Create draft", "إنشاء مسودة"],
  creating: ["Creating draft…", "جارٍ إنشاء المسودة…"],
  openDraft: ["Open draft", "فتح المسودة"],
  openCreate: ["Open in Create", "فتح في الإنشاء"],
  newDraftHint: ["Creates a planning draft. Copy and media can be added in Create.", "ينشئ مسودة مخططة. يمكن إضافة التعليق والوسائط في الإنشاء."],
  loading: ["Loading campaign…", "جارٍ تحميل الحملة…"],
  retry: ["Try again", "حاول مجددًا"],
  loadFailed: ["Campaign could not be loaded.", "تعذر تحميل الحملة."],
  emptyPlan: ["No daily ideas in this campaign", "لا توجد أفكار يومية في هذه الحملة"],
  emptyHint: ["You can still read its objectives and supporting details in Overview.", "يمكنك قراءة أهدافها وتفاصيلها في النظرة العامة."],
  pillars: ["Content pillars", "ركائز المحتوى"],
  kpis: ["Success measures", "مؤشرات النجاح"],
  risks: ["Risks", "المخاطر"],
  nextActions: ["Priority actions", "الخطوات التالية"],
  POST: ["Post", "منشور"],
  CAROUSEL: ["Carousel", "منشور متعدد"],
  REEL: ["Reel", "ريل"],
  STORY: ["Story", "قصة"],
  day: ["Day", "اليوم"]
};
type Word = keyof typeof words;
const label = (locale: Locale, key: Word) => words[key][locale === "ar" ? 1 : 0]!;
const tones = { idea: "idea", draft: "draft", inReview: "review", ready: "ready", scheduled: "scheduled", published: "published", failed: "failed" };

export function CampaignCounts({ counts, locale, total = false }: { counts: CampaignSummary["postCounts"]; locale: Locale; total?: boolean }) {
  return (
    <div className={styles.counts} aria-label={label(locale, "total")}>
      {total && (
        <span>
          <strong>{reviewNumber(locale, counts.total)}</strong> {label(locale, "total")}
        </span>
      )}
      {(Object.keys(tones) as Array<keyof typeof tones>)
        .filter((key) => key === "idea" || key === "draft" || key === "ready" || counts[key] > 0)
        .map((key) => (
          <span className={styles.count} data-tone={tones[key]} key={key}>
            <strong>{reviewNumber(locale, counts[key])}</strong> {label(locale, key === "idea" ? "ideas" : key)}
          </span>
        ))}
    </div>
  );
}

export function CampaignReview({
  locale,
  data,
  selection,
  loading,
  error,
  actionError,
  pendingKey,
  notice,
  onSelection,
  onClose,
  onRefresh,
  onCreateDraft,
  onOpenCreate
}: {
  locale: Locale;
  data: CampaignReviewRecord | undefined;
  selection: ReviewSelection;
  loading: boolean;
  error: string;
  actionError: string;
  pendingKey: string | undefined;
  notice: string;
  onSelection: (value: ReviewSelection) => void;
  onClose: () => void;
  onRefresh: () => void;
  onCreateDraft: (post: ReviewPost) => void;
  onOpenCreate: (item: ContentRecord) => void;
}) {
  const closeRef = useRef<HTMLButtonElement>(null);
  const workRef = useRef<HTMLDivElement>(null);
  const dayRef = useRef<HTMLElement>(null);
  const revealDay = useRef(false);
  const { dialogRef, onCancel, onKeyDown } = useModalDialog({ onClose, closeDisabled: Boolean(pendingKey), initialFocusRef: closeRef });
  const campaign = data?.campaign;
  const posts = useMemo(() => (campaign ? campaignPosts(campaign) : []), [campaign]);
  const months = useMemo(() => (campaign ? campaignMonths(campaign) : []), [campaign]);
  const items = data?.items ?? [];
  const records = new Map(items.map((item) => [suggestionKey(item.campaignWeek, item.campaignActionIndex), item]));
  const currentPost = posts.find((post) => post.key === selection.postKey);
  const weekIndex = campaign?.content.weeklyCadence.findIndex((week) => week.days?.some((day) => day.day === selection.day)) ?? 0;
  const week = campaign?.content.weeklyCadence[Math.max(weekIndex, 0)];
  const monthIndex = months.findIndex((month) => month.days.includes(selection.day));
  const month = months[Math.max(monthIndex, 0)];
  const postIndex = posts.findIndex((post) => post.key === currentPost?.key);
  const inPost = selection.screen === "post" && currentPost;
  const previousDay = selection.zoom === "month" ? months[monthIndex - 1]?.first : campaign?.content.weeklyCadence[weekIndex - 1]?.days[0]?.day;
  const nextDay = selection.zoom === "month" ? months[monthIndex + 1]?.first : campaign?.content.weeklyCadence[weekIndex + 1]?.days[0]?.day;

  useEffect(() => {
    if (!revealDay.current) return;
    revealDay.current = false;
    dayRef.current?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
    dayRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
  }, [selection.day, selection.zoom]);

  function navigate(next: ReviewSelection) {
    onSelection(next);
    workRef.current?.scrollTo({ top: 0, behavior: "instant" });
  }
  function openPost(post: ReviewPost) {
    navigate({ ...selection, day: post.day, postKey: post.key, screen: "post" });
  }
  function chooseDay(day: number) {
    revealDay.current = selection.zoom === "month";
    onSelection({ ...selection, day, screen: "plan" });
    if (day === selection.day && selection.zoom === "month") {
      dayRef.current?.querySelector<HTMLElement>("h3")?.focus({ preventScroll: true });
      dayRef.current?.scrollIntoView({ block: "nearest", behavior: "instant" });
    }
  }
  function move(direction: -1 | 1) {
    if (inPost) {
      const post = posts[postIndex + direction];
      if (post) openPost(post);
    } else {
      const day = direction === -1 ? previousDay : nextDay;
      if (day !== undefined) navigate({ ...selection, day, screen: "plan" });
    }
  }
  const previousLabel = inPost ? "previousPost" : selection.zoom === "month" ? "previousMonth" : "previousWeek";
  const nextLabel = inPost ? "nextPost" : selection.zoom === "month" ? "nextMonth" : "nextWeek";
  const PreviousIcon = locale === "ar" ? ArrowRight : ArrowLeft;
  const NextIcon = locale === "ar" ? ArrowLeft : ArrowRight;

  return (
    <dialog
      ref={dialogRef}
      onCancel={onCancel}
      onKeyDown={onKeyDown}
      aria-labelledby="campaign-review-title"
      className={`sunlit-modal-shell ${styles.dialog}`}
      dir={locale === "ar" ? "rtl" : "ltr"}
    >
      <header className={styles.reviewHeader}>
        <div>
          <h1 id="campaign-review-title">{campaign?.title ?? label(locale, "loading")}</h1>
          {campaign && (
            <p>
              {reviewRange(locale, campaign.startsAt, campaign.endsAt)} <span>· {reviewCount(locale, campaign.durationDays, "days")}</span>
            </p>
          )}
        </div>
        <div className={styles.headerActions}>
          <button type="button" className={styles.button} disabled={loading || Boolean(pendingKey)} onClick={onRefresh}>
            <RefreshCcw aria-hidden="true" size={18} className={loading ? "animate-spin" : ""} />
            {label(locale, "refresh")}
          </button>
          <button type="button" ref={closeRef} className={styles.button} disabled={Boolean(pendingKey)} onClick={onClose}>
            <X aria-hidden="true" size={18} />
            {label(locale, "close")}
          </button>
        </div>
      </header>
      {!campaign ? (
        <div className={styles.empty} aria-busy={loading}>
          <CalendarDays aria-hidden="true" size={32} />
          <h2>{loading ? label(locale, "loading") : label(locale, "loadFailed")}</h2>
          {error && <p role="alert">{error}</p>}
          {!loading && (
            <button type="button" className={styles.button} onClick={onRefresh}>
              {label(locale, "retry")}
            </button>
          )}
        </div>
      ) : (
        <>
          <div className={styles.reviewBody}>
            <aside className={styles.rail} aria-label={label(locale, "plan")}>
              <button
                type="button"
                className={styles.railButton}
                aria-current={selection.zoom === "overview" && !inPost ? "true" : undefined}
                onClick={() => navigate({ ...selection, zoom: "overview", screen: "plan" })}
              >
                <Target aria-hidden="true" size={19} />
                {label(locale, "overview")}
              </button>
              {campaign.durationDays > 14
                ? months.map((entry) => (
                    <button
                      type="button"
                      key={entry.key}
                      className={styles.railButton}
                      aria-current={selection.zoom !== "overview" && entry.days.includes(selection.day) ? "true" : undefined}
                      onClick={() => navigate({ ...selection, day: entry.first, zoom: "month", screen: "plan" })}
                    >
                      <span>{reviewDate(locale, campaignDate(campaign.startsAt, entry.first), { month: "long", year: "numeric" })}</span>
                      <small>{reviewCount(locale, entry.days.length, "days")}</small>
                    </button>
                  ))
                : campaign.content.weeklyCadence.map((entry) => (
                    <button
                      type="button"
                      key={entry.week}
                      className={styles.railButton}
                      aria-current={selection.zoom !== "overview" && entry.week === week?.week ? "true" : undefined}
                      onClick={() => navigate({ ...selection, day: entry.days?.[0]?.day ?? 1, zoom: "week", screen: "plan" })}
                    >
                      <span>
                        {label(locale, "week")} {reviewNumber(locale, entry.week)}
                      </span>
                      <small>
                        {entry.days?.length
                          ? `${reviewDate(locale, campaignDate(campaign.startsAt, entry.days[0]!.day))} – ${reviewDate(locale, campaignDate(campaign.startsAt, entry.days.at(-1)!.day))}`
                          : entry.focus}
                      </small>
                    </button>
                  ))}
              {currentPost && !inPost && (
                <button type="button" className={styles.railButton} onClick={() => openPost(currentPost)}>
                  {label(locale, "returnPost")}
                </button>
              )}
            </aside>
            <div className={styles.workspace}>
              <nav className={styles.toolbar} aria-label={label(locale, "plan")}>
                {inPost ? (
                  <button type="button" className={styles.button} onClick={() => navigate({ ...selection, screen: "plan" })}>
                    <PreviousIcon aria-hidden="true" size={18} />
                    {label(locale, "back")}
                  </button>
                ) : (
                  <span />
                )}
                <div className={styles.zoom} aria-label={label(locale, "plan")}>
                  {(["overview", "week", "month"] as ReviewZoom[]).map((zoom) => (
                    <button
                      type="button"
                      key={zoom}
                      aria-pressed={selection.zoom === zoom && !inPost}
                      onClick={() => navigate({ ...selection, zoom, screen: "plan" })}
                    >
                      {label(locale, zoom)}
                    </button>
                  ))}
                </div>
              </nav>
              <div className={styles.workScroll} ref={workRef} aria-busy={loading}>
                {error && (
                  <p className={styles.error} role="alert">
                    {error}
                  </p>
                )}
                {actionError && (
                  <p className={styles.error} role="alert">
                    {actionError}
                  </p>
                )}
                {notice && (
                  <p className={styles.notice} role="status">
                    {notice}
                  </p>
                )}
                {inPost ? (
                  <PostDetail
                    post={currentPost}
                    campaign={campaign}
                    item={records.get(currentPost.key)}
                    media={data?.mediaAssets ?? []}
                    locale={locale}
                    pendingKey={pendingKey}
                    disabled={loading || Boolean(error)}
                    onCreate={() => onCreateDraft(currentPost)}
                    onOpen={onOpenCreate}
                  />
                ) : selection.zoom === "overview" ? (
                  <Overview
                    campaign={campaign}
                    posts={posts}
                    items={items}
                    locale={locale}
                    onPeriod={(day, zoom) => navigate({ ...selection, day, zoom, screen: "plan" })}
                  />
                ) : !posts.length ? (
                  <div className={styles.empty}>
                    <h2>{label(locale, "emptyPlan")}</h2>
                    <p>{label(locale, "emptyHint")}</p>
                  </div>
                ) : selection.zoom === "week" && week ? (
                  <>
                    <div className={styles.periodHeading}>
                      <h2>
                        {label(locale, "week")} {reviewNumber(locale, week.week)} · {week.focus}
                      </h2>
                      <p>
                        {reviewDate(locale, campaignDate(campaign.startsAt, week.days[0]!.day))} –{" "}
                        {reviewDate(locale, campaignDate(campaign.startsAt, week.days.at(-1)!.day))}
                      </p>
                    </div>
                    <div className={styles.weekList}>
                      {week.days.map((day) => (
                        <section className={styles.daySection} data-selected={day.day === selection.day} key={day.day}>
                          <button type="button" className={styles.dayHeading} aria-expanded={day.day === selection.day} onClick={() => chooseDay(day.day)}>
                            <span>
                              <strong>
                                {reviewDate(locale, campaignDate(campaign.startsAt, day.day), { weekday: "long", day: "numeric", month: "short" })}
                              </strong>
                              <small>
                                {label(locale, "day")} {reviewNumber(locale, day.day)}
                              </small>
                            </span>
                            <span>
                              {reviewCount(locale, day.posts.length, "posts")}
                              <ChevronRight className="rtl:rotate-180" size={18} aria-hidden="true" />
                            </span>
                          </button>
                          {day.day === selection.day && (
                            <div className={styles.postList}>
                              {posts
                                .filter((post) => post.day === day.day)
                                .map((post) => (
                                  <PostRow
                                    key={post.key}
                                    post={post}
                                    item={records.get(post.key)}
                                    locale={locale}
                                    selected={post.key === selection.postKey}
                                    onOpen={() => openPost(post)}
                                  />
                                ))}
                            </div>
                          )}
                        </section>
                      ))}
                    </div>
                  </>
                ) : selection.zoom === "month" && month ? (
                  <>
                    <div className={styles.periodHeading}>
                      <h2>{reviewDate(locale, campaignDate(campaign.startsAt, month.first), { month: "long", year: "numeric" })}</h2>
                    </div>
                    <MonthGrid campaign={campaign} days={month.days} selectedDay={selection.day} posts={posts} locale={locale} onDay={chooseDay} />
                    <section className={styles.monthDay} ref={dayRef}>
                      <div className={styles.sectionHeading}>
                        <h3 tabIndex={-1}>
                          {reviewDate(locale, campaignDate(campaign.startsAt, selection.day), { weekday: "long", day: "numeric", month: "short" })}
                        </h3>
                        <span>{reviewCount(locale, posts.filter((post) => post.day === selection.day).length, "posts")}</span>
                      </div>
                      <div className={styles.postList}>
                        {posts
                          .filter((post) => post.day === selection.day)
                          .map((post) => (
                            <PostRow
                              key={post.key}
                              post={post}
                              item={records.get(post.key)}
                              locale={locale}
                              selected={post.key === selection.postKey}
                              onOpen={() => openPost(post)}
                            />
                          ))}
                      </div>
                    </section>
                  </>
                ) : null}
              </div>
            </div>
          </div>
          <footer className={styles.reviewFooter}>
            <CampaignCounts counts={campaignPostCounts(posts, items)} locale={locale} />
            <div className={styles.navigation}>
              <button
                type="button"
                className={styles.button}
                aria-label={label(locale, previousLabel)}
                disabled={loading || (inPost ? postIndex <= 0 : selection.zoom === "overview" || previousDay === undefined)}
                onClick={() => move(-1)}
              >
                <PreviousIcon aria-hidden="true" size={18} />
                {label(locale, "previous")}
              </button>
              <span>
                {inPost
                  ? `${reviewNumber(locale, postIndex + 1)} / ${reviewNumber(locale, posts.length)}`
                  : selection.zoom === "week"
                    ? `${reviewNumber(locale, weekIndex + 1)} / ${reviewNumber(locale, campaign.content.weeklyCadence.length)}`
                    : selection.zoom === "month"
                      ? `${reviewNumber(locale, monthIndex + 1)} / ${reviewNumber(locale, months.length)}`
                      : ""}
              </span>
              <button
                type="button"
                className={styles.button}
                aria-label={label(locale, nextLabel)}
                disabled={loading || (inPost ? postIndex >= posts.length - 1 : selection.zoom === "overview" || nextDay === undefined)}
                onClick={() => move(1)}
              >
                {label(locale, "next")}
                <NextIcon aria-hidden="true" size={18} />
              </button>
            </div>
          </footer>
        </>
      )}
    </dialog>
  );
}

function PostRow({
  post,
  item,
  locale,
  selected,
  onOpen
}: {
  post: ReviewPost;
  item: ContentRecord | undefined;
  locale: Locale;
  selected: boolean;
  onOpen: () => void;
}) {
  const Icon = formats[item?.contentType ?? post.contentType];
  return (
    <button type="button" className={styles.postRow} data-selected={selected} onClick={onOpen}>
      <span className={styles.formatIcon} data-format={item?.contentType ?? post.contentType}>
        <Icon aria-hidden="true" size={21} />
      </span>
      <span>
        <strong>{post.title}</strong>
        <small>
          {label(locale, item?.contentType ?? post.contentType)} · {item?.contentPillar ?? post.contentPillar}
        </small>
      </span>
      {item ? <ContentStatusBadge status={item.status} locale={locale} /> : <span className={styles.idea}>{label(locale, "idea")}</span>}
    </button>
  );
}

function Overview({
  campaign,
  posts,
  items,
  locale,
  onPeriod
}: {
  campaign: CampaignRecord;
  posts: ReviewPost[];
  items: ContentRecord[];
  locale: Locale;
  onPeriod: (day: number, zoom: ReviewZoom) => void;
}) {
  const periods =
    campaign.durationDays > 14
      ? campaignMonths(campaign).map((month) => ({
          key: month.key,
          day: month.first,
          title: reviewDate(locale, campaignDate(campaign.startsAt, month.first), { month: "long" }),
          focus: "",
          days: month.days,
          zoom: "month" as const
        }))
      : campaign.content.weeklyCadence.map((week) => ({
          key: String(week.week),
          day: week.days?.[0]?.day ?? 1,
          title: `${label(locale, "week")} ${reviewNumber(locale, week.week)}`,
          focus: week.focus,
          days: (week.days ?? []).map((day) => day.day),
          zoom: "week" as const
        }));
  return (
    <>
      <section className={styles.overviewIntro}>
        <h2>{label(locale, "objective")}</h2>
        <p>{campaign.objective || campaign.content.summary}</p>
        {campaign.content.objectives.length > 0 && (
          <ul>
            {campaign.content.objectives.map((objective, index) => (
              <li key={index}>{objective}</li>
            ))}
          </ul>
        )}
        <div className={styles.pillars}>
          {campaign.content.pillars.map((pillar, index) => (
            <span key={index}>{pillar.name}</span>
          ))}
        </div>
      </section>
      <div className={styles.sectionHeading}>
        <h2>{label(locale, "plan")}</h2>
        <span>{reviewCount(locale, posts.length, "posts")}</span>
      </div>
      <div className={styles.overviewGrid}>
        {periods.map((period) => (
          <button type="button" key={period.key} className={styles.overviewPeriod} onClick={() => onPeriod(period.day, period.zoom)}>
            <span>{period.title}</span>
            <h3>{period.focus || reviewCount(locale, period.days.length, "days")}</h3>
            <p>
              {period.days.length
                ? `${reviewDate(locale, campaignDate(campaign.startsAt, period.days[0]!))} – ${reviewDate(locale, campaignDate(campaign.startsAt, period.days.at(-1)!))}`
                : ""}
            </p>
            <CampaignCounts
              counts={campaignPostCounts(
                posts.filter((post) => period.days.includes(post.day)),
                items
              )}
              locale={locale}
            />
          </button>
        ))}
      </div>
      <div className={styles.rationale}>
        <details>
          <summary>{label(locale, "pillars")}</summary>
          {campaign.content.pillars.map((pillar, index) => (
            <section key={index}>
              <h3>{pillar.name}</h3>
              <p>{pillar.rationale}</p>
              {pillar.contentAngles.length > 0 && (
                <ul>
                  {pillar.contentAngles.map((angle, i) => (
                    <li key={i}>{angle}</li>
                  ))}
                </ul>
              )}
            </section>
          ))}
        </details>
        <details>
          <summary>{label(locale, "kpis")}</summary>
          <ul>
            {campaign.content.kpis.map((kpi, i) => (
              <li key={i}>
                {kpi.name}: {kpi.target}
              </li>
            ))}
          </ul>
        </details>
        <details>
          <summary>{label(locale, "risks")}</summary>
          <ul>
            {campaign.content.risks.map((risk, i) => (
              <li key={i}>{risk}</li>
            ))}
          </ul>
        </details>
        <details>
          <summary>{label(locale, "nextActions")}</summary>
          <ul>
            {campaign.content.nextActions.map((action, i) => (
              <li key={i}>{action}</li>
            ))}
          </ul>
        </details>
      </div>
    </>
  );
}

function MonthGrid({
  campaign,
  days,
  selectedDay,
  posts,
  locale,
  onDay
}: {
  campaign: CampaignRecord;
  days: number[];
  selectedDay: number;
  posts: ReviewPost[];
  locale: Locale;
  onDay: (day: number) => void;
}) {
  const first = campaignDate(campaign.startsAt, days[0]!);
  const year = first.getUTCFullYear(),
    month = first.getUTCMonth();
  const offset = new Date(Date.UTC(year, month, 1)).getUTCDay();
  const dateCount = new Date(Date.UTC(year, month + 1, 0)).getUTCDate();
  const dateToDay = new Map(days.map((day) => [campaignDate(campaign.startsAt, day).getUTCDate(), day]));
  return (
    <div className={styles.monthGrid}>
      {Array.from({ length: 7 }, (_, i) => (
        <span className={styles.weekday} key={`heading-${i}`}>
          {reviewDate(locale, new Date(Date.UTC(2026, 0, 4 + i)), { weekday: "short" })}
        </span>
      ))}
      {Array.from({ length: offset }, (_, i) => (
        <span className={styles.outsideDay} key={`space-${i}`} />
      ))}
      {Array.from({ length: dateCount }, (_, i) => {
        const day = dateToDay.get(i + 1);
        const count = posts.filter((post) => post.day === day).length;
        return day !== undefined ? (
          <button
            type="button"
            key={i}
            className={styles.monthCell}
            aria-pressed={selectedDay === day}
            aria-label={`${reviewDate(locale, campaignDate(campaign.startsAt, day), { day: "numeric", month: "long" })}, ${reviewCount(locale, count, "posts")}`}
            onClick={() => onDay(day)}
          >
            <strong>{reviewNumber(locale, i + 1)}</strong>
            <span>{reviewCount(locale, count, "posts")}</span>
          </button>
        ) : (
          <span className={styles.outsideDay} key={i}>
            {reviewNumber(locale, i + 1)}
          </span>
        );
      })}
    </div>
  );
}

function PostDetail({
  post,
  campaign,
  item,
  media,
  locale,
  pendingKey,
  disabled,
  onCreate,
  onOpen
}: {
  post: ReviewPost;
  campaign: CampaignRecord;
  item: ContentRecord | undefined;
  media: MediaAssetRecord[];
  locale: Locale;
  pendingKey: string | undefined;
  disabled: boolean;
  onCreate: () => void;
  onOpen: (item: ContentRecord) => void;
}) {
  const assets = item?.mediaIds.map((id) => media.find((asset) => asset.id === id)).filter((asset): asset is MediaAssetRecord => Boolean(asset)) ?? [];
  const Icon = formats[item?.contentType ?? post.contentType];
  return (
    <article className={styles.postDetail}>
      <div className={styles.postTitle}>
        <p>
          {reviewDate(locale, campaignDate(campaign.startsAt, post.day), { weekday: "long", day: "numeric", month: "long" })} · {label(locale, "week")}{" "}
          {reviewNumber(locale, post.week)}
        </p>
        <h2>{post.title}</h2>
        <div className={styles.postTags}>
          <span className={styles.formatIcon} data-format={item?.contentType ?? post.contentType}>
            <Icon aria-hidden="true" size={19} />
            {label(locale, item?.contentType ?? post.contentType)}
          </span>
          {item ? <ContentStatusBadge status={item.status} locale={locale} /> : <span className={styles.idea}>{label(locale, "idea")}</span>}
        </div>
      </div>
      <div className={styles.postColumns}>
        <div className={styles.postCopy}>
          <section>
            <h3>{label(locale, "brief")}</h3>
            <p>{item?.brief || post.description}</p>
          </section>
          <div className={styles.factGrid}>
            <section>
              <h3>{label(locale, "goal")}</h3>
              <p>{item?.campaignGoal || post.goal}</p>
            </section>
            <section>
              <h3>{label(locale, "pillar")}</h3>
              <p>{item?.contentPillar || post.contentPillar}</p>
            </section>
          </div>
          {item && (
            <section>
              <h3>{label(locale, "caption")}</h3>
              <p className={styles.caption} dir="auto">
                {item.caption || label(locale, "noCaption")}
              </p>
            </section>
          )}
          {item?.failureReason && <p className={styles.error}>{item.failureReason}</p>}
          <div className={styles.draftAction}>
            <button
              type="button"
              className={`${styles.button} ${styles.primaryButton}`}
              disabled={disabled || Boolean(pendingKey)}
              onClick={() => (item ? onOpen(item) : onCreate())}
              aria-label={`${label(locale, item ? (item.status === "DRAFT" ? "openDraft" : "openCreate") : "createDraft")}: ${post.title}`}
            >
              {pendingKey === post.key && <RefreshCcw aria-hidden="true" size={18} className="animate-spin" />}
              {label(locale, pendingKey === post.key ? "creating" : item ? (item.status === "DRAFT" ? "openDraft" : "openCreate") : "createDraft")}
            </button>
            {!item && <p>{label(locale, "newDraftHint")}</p>}
          </div>
        </div>
        <div className={styles.mediaColumn}>
          {assets.length ? (
            assets.map((asset) => <ReviewMedia key={asset.id} asset={asset} locale={locale} />)
          ) : (
            <div className={styles.noMedia}>
              <ImageIcon aria-hidden="true" size={36} />
              <p>{item?.mediaIds.length ? label(locale, "mediaFailed") : label(locale, "noMedia")}</p>
            </div>
          )}
        </div>
      </div>
    </article>
  );
}

function ReviewMedia({ asset, locale }: { asset: MediaAssetRecord; locale: Locale }) {
  const [failed, setFailed] = useState(false);
  if (failed)
    return (
      <div className={styles.noMedia}>
        <p>{label(locale, "mediaFailed")}</p>
        <button type="button" className={styles.button} onClick={() => setFailed(false)}>
          {label(locale, "retry")}
        </button>
      </div>
    );
  return (
    <figure className={styles.media}>
      {asset.type === "VIDEO" || asset.mimeType.startsWith("video/") ? (
        <video src={asset.publicUrl} controls playsInline preload="metadata" aria-label={asset.filename} onError={() => setFailed(true)} />
      ) : (
        // Native media keeps the workspace's current signed URL and normal browser recovery behavior.
        // eslint-disable-next-line @next/next/no-img-element
        <img src={asset.publicUrl} alt={asset.filename} onError={() => setFailed(true)} />
      )}
      <figcaption>{asset.filename}</figcaption>
    </figure>
  );
}
