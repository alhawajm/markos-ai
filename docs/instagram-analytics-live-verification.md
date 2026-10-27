# Instagram analytics: live verification

## Observed on 27 October 2026

Railway's API and worker use live Instagram analytics. One stored professional-account connection is CONNECTED and its token is not expired. Its requested scope set contains instagram_business_basic, instagram_business_content_publish and instagram_business_manage_insights. Stored provider-confirmed scopes are empty; requested scopes alone are not evidence of a provider grant.

Three controlled read-only Meta requests using the encrypted credential boundary returned HTTP 200 and the corresponding metric name for reach, views and profile_views. Keep profile_views in the adapter: it is supported for this actual account/version. A third-party deprecation summary is not sufficient evidence to remove it. No token, account identifier, metric values or raw provider errors were recorded in the check.

The production database contains saved analytics records. The connected workspace's account-total snapshot was updated at 08:39:45 UTC with reach, views, profile views, likes, comments, shares, saves and engagement fields. These checks establish live account-insights access and persistence; they do not establish App Review approval, correctness of every media insight or a successful publish.

## Current application path

Use the authorized GET /v1/analytics/live-readiness and POST /v1/analytics/sync routes in the active workspace. The worker also performs scheduled synchronization. Connection credentials remain encrypted at rest and are passed only as bearer headers to the provider. Do not put them in URLs or evidence.

Account metrics use exact range totals plus daily reach and current followers. Media discovery includes posts, Reels and Stories; each format uses its appropriate metric list. Unsupported metrics are isolated so supported values survive. Unavailable data remains distinct from a numeric zero. Unique reach must not be summed across days, and lifetime media values must not be presented as daily measurements.

For controlled acceptance, choose the owner's review account, inspect diagnostics and compare the application against Instagram for the same date range. Check seven-day and thirty-day summaries, discovered media, date boundaries, unavailable metrics, PDF export and workspace isolation. Publishing requires separately selected, reviewed content; analytics checks do not publish anything.

## Remaining external evidence

- Confirm the current Meta dashboard review/permission state and reviewer walkthrough.
- Compare displayed totals, daily buckets and media metrics to Instagram for identical windows.
- Record a reviewed live publish per supported format separately from analytics.
- Verify reconnect, expiry and partial-provider failures on the intended review account.

## Application summary after rollout

The main release's application summary returned live account totals, daily buckets and top content after the new worker synchronized. The result remains PARTIAL for three media items. Controlled provider requests returned error code 100/subcode 2108006 with the pre-professional-conversion restriction. Account insights and newer media remain available. This is a provider data limit; do not fill those older metrics with zeros or claim a complete sync. No customer metric values, tokens or media IDs were recorded here.
