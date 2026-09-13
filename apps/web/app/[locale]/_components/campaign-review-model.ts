import type { CampaignPostSuggestion, CampaignRecord, CampaignSummary, ContentRecord, Locale } from "@markos/shared-types";

export type ReviewZoom = "overview" | "week" | "month";
export type ReviewSelection = { zoom: ReviewZoom; day: number; postKey: string | null; screen: "plan" | "post" };
export type ReviewPost = CampaignPostSuggestion & { key: string; week: number; actionIndex: number; day: number };
export type ReviewMonth = { key: string; first: number; last: number; days: number[] };

export const suggestionKey = (week?: number, actionIndex?: number) => `${week ?? "none"}:${actionIndex ?? "none"}`;

export function campaignPosts(campaign: CampaignRecord): ReviewPost[] {
  return campaign.content.weeklyCadence.flatMap((week) => {
    let actionIndex = 0;
    return (week.days ?? []).flatMap((day) =>
      day.posts.map((post) => ({ ...post, day: day.day, week: week.week, actionIndex: actionIndex, key: suggestionKey(week.week, actionIndex++) }))
    );
  });
}

export function campaignDays(campaign: CampaignRecord): number[] {
  return [...new Set(campaign.content.weeklyCadence.flatMap((week) => (week.days ?? []).map((day) => day.day)))].sort((a, b) => a - b);
}

export function campaignDate(startsAt: string, day: number): Date {
  const date = new Date(startsAt);
  date.setUTCDate(date.getUTCDate() + day - 1);
  return date;
}

export function reviewDate(locale: Locale, date: Date | string, options: Intl.DateTimeFormatOptions = { day: "numeric", month: "short" }): string {
  return new Intl.DateTimeFormat(locale === "ar" ? "ar-BH" : "en-GB", { ...options, timeZone: "UTC" }).format(new Date(date));
}

export function reviewRange(locale: Locale, startsAt: string, endsAt: string): string {
  return `${reviewDate(locale, startsAt)} – ${reviewDate(locale, endsAt)}`;
}

export function reviewNumber(locale: Locale, value: number): string {
  return new Intl.NumberFormat(locale === "ar" ? "ar-BH" : "en-GB").format(value);
}

export function reviewCount(locale: Locale, value: number, noun: "days" | "posts"): string {
  if (locale !== "ar") return `${reviewNumber(locale, value)} ${noun === "days" ? (value === 1 ? "day" : "days") : value === 1 ? "post" : "posts"}`;
  const forms =
    noun === "days"
      ? { zero: "أيام", one: "يوم واحد", two: "يومان", few: "أيام", many: "يومًا", other: "يوم" }
      : { zero: "منشورات", one: "منشور واحد", two: "منشوران", few: "منشورات", many: "منشورًا", other: "منشور" };
  const category = new Intl.PluralRules("ar").select(value);
  return category === "one" || category === "two" ? forms[category] : `${reviewNumber(locale, value)} ${forms[category]}`;
}

export function campaignMonths(campaign: CampaignRecord): ReviewMonth[] {
  const months: ReviewMonth[] = [];
  for (const day of campaignDays(campaign)) {
    const date = campaignDate(campaign.startsAt, day);
    const key = `${date.getUTCFullYear()}-${date.getUTCMonth()}`;
    let month = months.find((entry) => entry.key === key);
    if (!month) {
      month = { key, first: day, last: day, days: [] };
      months.push(month);
    }
    month.last = day;
    month.days.push(day);
  }
  return months;
}

export function initialReviewSelection(campaign: CampaignRecord): ReviewSelection {
  return { zoom: campaign.durationDays <= 14 ? "week" : "overview", day: campaignDays(campaign)[0] ?? 1, postKey: null, screen: "plan" };
}

export function validReviewSelection(campaign: CampaignRecord, selection: ReviewSelection): ReviewSelection {
  const days = campaignDays(campaign);
  const posts = campaignPosts(campaign);
  const post = posts.find((item) => item.key === selection.postKey);
  return {
    ...selection,
    day: days.includes(selection.day) ? selection.day : (days[0] ?? 1),
    postKey: post?.key ?? null,
    screen: selection.screen === "post" && post ? "post" : "plan"
  };
}

export function campaignPostCounts(posts: ReviewPost[], items: ContentRecord[]): CampaignSummary["postCounts"] {
  const counts = { total: posts.length, idea: 0, draft: 0, inReview: 0, ready: 0, scheduled: 0, published: 0, failed: 0 };
  const records = new Map(items.map((item) => [suggestionKey(item.campaignWeek, item.campaignActionIndex), item]));
  for (const post of posts) {
    const status = records.get(post.key)?.status;
    if (!status) counts.idea++;
    else if (status === "DRAFT") counts.draft++;
    else if (status === "IN_REVIEW") counts.inReview++;
    else if (status === "APPROVED") counts.ready++;
    else if (status === "SCHEDULED") counts.scheduled++;
    else if (status === "PUBLISHED") counts.published++;
    else if (status === "FAILED") counts.failed++;
  }
  return counts;
}
