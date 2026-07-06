# Instagram Analytics Live Verification

This runbook closes the M4 analytics sync worker gate after Meta App Review grants insights access for a test Instagram Business account.

Keep `INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run` until every prerequisite below is complete. Switch to `live` only for a controlled verification window or production-like environment.

## Prerequisites

- Meta app has Instagram Business Login configured.
- Meta app has these permissions available to the test user:
  - `instagram_business_basic`
  - `instagram_business_manage_insights`
- Test Instagram account is a Business or Creator account connected to the Meta app test user.
- MARKOS workspace is connected through the Instagram OAuth flow after the insights scope is configured.
- At least one MARKOS content item is `PUBLISHED` with a real `instagramPostId`.
- API and worker can reach Meta Graph API from the running environment.

## Required Environment

Set these in the API and worker environment:

```bash
INSTAGRAM_ANALYTICS_SYNC_MODE=live
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
META_APP_ID=...
META_APP_SECRET=...
META_GRAPH_BASE_URL=https://graph.facebook.com
META_GRAPH_VERSION=v24.0
WORKER_ANALYTICS_SYNC_INTERVAL_MS=21600000
```

Then restart the API and worker.

## Readiness Check

After signing in to MARKOS and connecting Instagram, call:

```bash
curl -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  http://localhost:4000/v1/analytics/live-readiness
```

Expected ready response:

```json
{
  "data": {
    "mode": "live",
    "ready": true,
    "reasons": [],
    "connection": {
      "connected": true,
      "accountId": "178..."
    },
    "requiredScopes": [
      "instagram_business_basic",
      "instagram_business_manage_insights"
    ]
  }
}
```

If `ready` is false, resolve every reason before attempting live analytics sync.

## Manual Sync Verification

1. Publish one image post or reel to the test Instagram Business account.
2. Confirm the MARKOS `content_items.instagramPostId` is populated for that item.
3. In Analytics, click `Sync analytics`, or call:

```bash
curl -X POST \
  -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  -H "Content-Type: application/json" \
  -d '{"days":30}' \
  http://localhost:4000/v1/analytics/sync
```

4. Confirm the response has `mode: "live"` and includes `ACCOUNT` plus media-level `POST` or `REEL` records.
5. Open Analytics and confirm AN-01 through AN-06 render real metrics.
6. Confirm the sync writes an `ANALYTICS_PERFORMANCE_LEARNING` entry into the Vault.

Evidence to save:

- `/v1/analytics/live-readiness` response with `ready: true`.
- `/v1/analytics/sync` response with `mode: "live"` and non-zero records.
- Screenshot of AN-01 overview showing real metrics.
- Screenshot of AN-06 Vault learning evidence.
- Database row or API response showing the workspace-scoped `instagram_analytics` records.

## Worker Verification

1. Keep the worker running with `INSTAGRAM_ANALYTICS_SYNC_MODE=live`.
2. Ensure the workspace has a non-expired Instagram token.
3. Wait for `WORKER_ANALYTICS_SYNC_INTERVAL_MS`, or temporarily lower it in a verification environment.
4. Confirm the worker creates or updates `instagram_analytics` rows for the workspace.
5. Confirm rows from another workspace are not visible in the active workspace's Analytics screen.

## Rollback

After verification, return non-production environments to:

```bash
INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run
```

Restart API and worker, then confirm `/v1/analytics/live-readiness` reports `INSTAGRAM_ANALYTICS_SYNC_MODE_NOT_LIVE`.
