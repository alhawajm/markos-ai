import type { InstagramLearningEvidence, InstagramLearningPost } from "@markos/shared-types";
import { InstagramGraphClient, InstagramGraphRequestError } from "../workspace/instagram-graph-client";
import { normalizeInsights } from "../analytics/instagram-analytics-provider";

// A first exploration is bounded independently of the reporting/Insights crawl.
export const LEARNING_HISTORY_LIMIT = 50;
const METRICS = ["likes", "comments", "saved", "shares", "reach", "views"];
export type LearningVisual = { id: string; url: string };
const record = (value: unknown): value is Record<string, unknown> => typeof value === "object" && value !== null && !Array.isArray(value);
const number = (value: unknown): value is number => typeof value === "number" && Number.isFinite(value) && value >= 0;
const text = (value: unknown, limit = 2200) => (typeof value === "string" ? value.slice(0, limit) : "");

export function instagramMediaUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  try {
    const url = new URL(value);
    if (
      url.protocol === "https:" &&
      !url.username &&
      !url.password &&
      (!url.port || url.port === "443") &&
      ["cdninstagram.com", "fbcdn.net"].some((host) => url.hostname === host || url.hostname.endsWith(`.${host}`))
    )
      return url.toString();
  } catch {
    /* Not a valid provider media URL. */
  }
  return undefined;
}
function permalink(value: unknown): string | undefined {
  try {
    const url = new URL(String(value));
    if (url.protocol === "https:" && ["www.instagram.com", "instagram.com"].includes(url.hostname) && !url.username && !url.password) return url.toString();
  } catch {
    /* Missing links are optional. */
  }
  return undefined;
}

export function selectLearningPosts(posts: InstagramLearningPost[]): InstagramLearningPost[] {
  const unique = [...new Map(posts.map((post) => [post.id, post])).values()];
  const latest = [...unique].sort((a, b) => b.timestamp.localeCompare(a.timestamp)).slice(0, 5);
  const ids = new Set(latest.map((post) => post.id));
  const score = (post: InstagramLearningPost) => ["likes", "comments", "saves", "shares"].reduce((sum, key) => sum + (post.metrics[key] ?? 0), 0);
  const strongest = unique
    .filter((post) => !ids.has(post.id) && ["likes", "comments", "saves", "shares"].some((key) => post.metrics[key] !== undefined))
    .sort((a, b) => score(b) - score(a) || b.timestamp.localeCompare(a.timestamp))
    .slice(0, 5);
  // On a small account every post is useful, even if historical metrics are unavailable.
  const remainder = unique.length <= 10 ? unique.filter((post) => !ids.has(post.id) && !strongest.some((item) => item.id === post.id)) : [];
  return [
    ...latest.map((post) => ({ ...post, selection: "LATEST" as const })),
    ...strongest.map((post) => ({ ...post, selection: "STRONGEST" as const })),
    ...remainder
  ];
}

export async function collectInstagramEvidence(input: { accountId: string; username: string; accessToken: string }, client = new InstagramGraphClient()) {
  const warnings = new Set<string>();
  const profile: InstagramLearningEvidence["profile"] = {};
  const deadline = Date.now() + 75_000;
  let requests = 0;
  const get = (id: string, edge: "media" | "insights" | undefined, query: Record<string, string>) => {
    if (++requests > 100 || Date.now() > deadline) {
      warnings.add("EXPLORATION_BUDGET_REACHED");
      throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_TIMEOUT");
    }
    return client.get(id, edge, input.accessToken, query);
  };
  // Optional profile fields are isolated: an unavailable field cannot discard media discovery.
  for (const field of ["name", "biography", "website", "followers_count", "media_count", "account_type"]) {
    try {
      const body = await get(input.accountId, undefined, { fields: field });
      if (typeof body[field] === "string") profile[field] = text(body[field], 2000);
      else if (number(body[field])) profile[field] = body[field];
      else warnings.add(`PROFILE_UNAVAILABLE:${field}`);
    } catch (e) {
      if (!(e instanceof InstagramGraphRequestError) || String(e.diagnostic.errorCode) !== "100") throw e;
      warnings.add(`PROFILE_UNAVAILABLE:${field}`);
    }
  }
  const posts: InstagramLearningPost[] = [];
  const visuals = new Map<string, string>();
  let after: string | undefined;
  let historyComplete = false;
  const cursors = new Set<string>();
  for (let page = 0; page < 5 && posts.length < LEARNING_HISTORY_LIMIT; page += 1) {
    const body = await get(input.accountId, "media", {
      fields: "id,caption,media_type,media_product_type,media_url,thumbnail_url,permalink,timestamp,like_count,comments_count",
      limit: String(LEARNING_HISTORY_LIMIT - posts.length),
      ...(after ? { after } : {})
    });
    if (!Array.isArray(body.data)) throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_INVALID");
    for (const item of body.data) {
      if (!record(item) || typeof item.id !== "string" || posts.some((post) => post.id === item.id)) continue;
      if (!text(item.timestamp) || !Number.isFinite(Date.parse(String(item.timestamp)))) {
        warnings.add("MEDIA_TIMESTAMP_UNAVAILABLE");
        continue;
      }
      const metrics: Record<string, number> = {};
      if (number(item.like_count)) metrics.likes = item.like_count;
      if (number(item.comments_count)) metrics.comments = item.comments_count;
      const link = permalink(item.permalink);
      posts.push({
        id: item.id,
        caption: text(item.caption),
        mediaType: text(item.media_product_type === "REELS" ? "REELS" : item.media_type, 40),
        timestamp: new Date(String(item.timestamp)).toISOString(),
        metrics,
        selection: "LATEST",
        ...(link ? { permalink: link } : {})
      });
      const visual = instagramMediaUrl(item.media_type === "VIDEO" ? item.thumbnail_url : item.media_url);
      if (visual) visuals.set(item.id, visual);
      if (posts.length === LEARNING_HISTORY_LIMIT) break;
    }
    const paging = record(body.paging) ? body.paging : {};
    const cursor = record(paging.cursors) ? paging.cursors.after : undefined;
    if (!paging.next) {
      historyComplete = true;
      break;
    }
    if (typeof cursor !== "string" || cursors.has(cursor)) {
      warnings.add("PAGINATION_INCOMPLETE");
      break;
    }
    cursors.add(cursor);
    after = cursor;
  }
  // Small bounded concurrency protects both Meta and the other active workspaces.
  let next = 0;
  let providerFailures = 0;
  let stopInsights = false;
  function stopForProviderLimit(error: unknown) {
    if (
      error instanceof InstagramGraphRequestError &&
      ([401, 429].includes(error.diagnostic.httpStatus ?? 0) || ["4", "17", "32", "190", "613"].includes(String(error.diagnostic.errorCode)))
    ) {
      stopInsights = true;
      warnings.add("INSIGHTS_PARTIAL");
    }
  }
  await Promise.all(
    Array.from({ length: 3 }, async () => {
      while (next < posts.length && !stopInsights) {
        if (requests >= 100 || Date.now() > deadline) {
          warnings.add("EXPLORATION_BUDGET_REACHED");
          break;
        }
        const post = posts[next++];
        if (!post) break;
        try {
          const body = await get(post.id, "insights", { metric: METRICS.join(",") });
          if (!Array.isArray(body.data)) throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_INVALID");
          Object.assign(post.metrics, normalizeInsights(body.data));
        } catch (error) {
          stopForProviderLimit(error);
          if (error instanceof InstagramGraphRequestError && String(error.diagnostic.errorCode) === "100") {
            // Keep metadata/counts; query individual metrics so one unavailable metric cannot discard all others.
            for (const metric of METRICS) {
              if (stopInsights) break;
              if (requests >= 100 || Date.now() > deadline) {
                warnings.add("EXPLORATION_BUDGET_REACHED");
                break;
              }
              try {
                const body = await get(post.id, "insights", { metric });
                if (!Array.isArray(body.data)) throw new InstagramGraphRequestError("INSTAGRAM_PROVIDER_RESPONSE_INVALID");
                Object.assign(post.metrics, normalizeInsights(body.data));
              } catch (e) {
                stopForProviderLimit(e);
                if (!(e instanceof InstagramGraphRequestError) || String(e.diagnostic.errorCode) !== "100") providerFailures++;
                warnings.add(`METRIC_UNAVAILABLE:${metric}`);
              }
            }
          } else {
            providerFailures++;
            warnings.add("INSIGHTS_PARTIAL");
          }
        }
      }
    })
  );
  if (providerFailures) warnings.add("INSIGHTS_PARTIAL");
  if (!historyComplete) warnings.add("BOUNDED_HISTORY");
  if (posts.some((post) => ["likes", "comments", "saves", "shares"].some((metric) => post.metrics[metric] === undefined)))
    warnings.add("INTERACTION_COVERAGE_VARIES");
  if (posts.length < 10) warnings.add("LIMITED_POST_HISTORY");
  const selected = selectLearningPosts(posts);
  const evidence: InstagramLearningEvidence = {
    accountId: input.accountId,
    username: input.username,
    profile,
    discovered: posts.length,
    historyComplete,
    metricsCovered: posts.filter((post) => Object.keys(post.metrics).length > 0).length,
    warnings: [...warnings],
    posts: selected
  };
  return {
    evidence,
    visuals: selected.flatMap((post) => {
      const url = visuals.get(post.id);
      return url ? [{ id: post.id, url }] : [];
    })
  };
}
