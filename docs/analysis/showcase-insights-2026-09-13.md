# Showcase Insights diagnosis — 2026-09-13

## Confirmed causes

- The live analytics provider queried only `ContentItem` records already marked `PUBLISHED` with an Instagram media ID. It never discovered account media or paginated Instagram's media/stories edges. Production `the.snacklab` currently has no such linked published records, so all ten Instagram media items were skipped.
- Account insight requests omitted `since`/`until` and requested only `reach,profile_views` without the required aggregate mode for profile visits. Normalization kept only the last daily value and assigned it to the sync date. The selected reporting window was not represented accurately.
- Media requests used only comments and shares regardless of format. One failed request aborted the provider result, while worker-level provider failures were swallowed without a reported failure count.
- Aggregation could combine account totals with lifetime post metrics, sum follower snapshots, and treat lifetime values as daily activity. Unlinked media had no stable persistence identity or UI path.

## Changes

Use the existing constrained Instagram Login Graph transport and existing analytics table. Discover `/media` and `/stories`, follow cursors with bounded pagination, and query a type-appropriate metric set. Retry a rejected metric batch as individual metrics so supported results survive. Keep safe diagnostics with complete/partial/failed status and discovered/synced/linked counts; surface incomplete synchronization in Insights and worker logs.

Persist Instagram media identity and metric period metadata inside the existing analytics JSON. Serialize persistence per workspace, update repeated snapshots, and permit later linking without creating a duplicate analytics record. Do not create MarkOS drafts for external posts. Keep lifetime content results separate from exact account period totals and provider daily reach. The worker's normal 30-day sync supplies both the 30-day and default 7-day account totals. Missing values remain unavailable; measured zero remains zero.

External posts contribute to content performance and link to their Instagram permalink. Their lifetime totals are filtered by publication date and identified as such. Account metrics already include activity on content created outside MarkOS. No Insights layout redesign or new Intelligence workflow is included.

## Read-only production evidence

The configured `the.snacklab` connection is connected, its existing token is unexpired, and the required scope set is recorded. Existing credentials were used only within the production API process. No token values were output, credentials changed, posts published, or production database records written.

The corrected provider was executed as a temporary diagnostic module, removed immediately afterward. It returned **COMPLETE**, with **10 discovered, 10 successfully fetched, 0 linked, no warnings**, and 29 daily reach points (the current provider day was not yet complete).

| Surface | Confirmed result |
| --- | --- |
| 30 days: August 15–September 13 | 87 views, 2 unique accounts reached, 17 profile visits, 9 likes, 0 comments, 1 share, 0 saves, 11 total interactions |
| 7 days: September 7–13 | All returned account activity metrics measured zero |
| Current account | 1 follower |
| Media inventory | 8 single-image posts, 1 carousel, 1 Reel; no active Stories |
| Content publication windows | 4 posts in 30 days; none in 7 days |
| Post, carousel, Reel metrics | Reach, views, likes, comments, shares, saved, total interactions all returned successfully |
| Story metrics | Reach, views, shares, replies, total interactions implemented with isolated fallback; no active Story was available for direct proof |

The zero linked count is explained by the current MarkOS database, not a failure to match returned IDs: the production workspace's content records are drafts with no saved publication IDs. The older Reel returned lifetime reach 125 and views 138, which must not be added to this month's account reach/views.

The latest post is September 3, so no content in the seven-day view is expected. Impressions and audience demographics are not fetched by this increment; modern view counts are used instead of inventing impression values. A daily series is fetched only for reach; period totals must not be substituted as daily views or engagement. Unsupported, delayed, and unavailable metrics remain absent with safe diagnostics.

## Verification boundary

Focused provider, analytics persistence, worker, and scheduler suites passed (32 tests). Coverage includes cursor pagination, type-specific requests, unsupported metric isolation, zero versus missing values, partial/failed syncs, date translation, exact period totals, lifetime separation, repeated persistence, and later local linking. Full `pnpm verify` passed all 32 tasks, including 408 API tests, 43 web unit tests, 63 Python tests, lint, type checking, formatting and RTL checks. `pnpm build` passed all 9 tasks. Three focused Create browser tests also passed; no visual audit was performed.

The live provider check proves discovery and retrieval; production persistence/deployment is intentionally pending the normal PR rollout. Persistence and aggregation were tested only against the disposable local test database. No real publication was performed during this task.

## Production worker interval

The source default was already one minute, but the production worker explicitly overrode `WORKER_PUBLISHING_INTERVAL_MS` to `300000`. Changed that one service variable to `60000` using the existing schedule. Deployment `eec11f21-c520-40b9-b7c2-ed397a7c80f3` succeeded and logged `Maintenance worker started { publishingIntervalMs: 60000 }`. It runs the merged PR #26 publishing/Create checkpoint; the Insights changes described above remain local pending rollout. No second polling loop was added. A busy worker skips overlapping ticks, so this interval is a check cadence rather than a guaranteed maximum publication delay.
