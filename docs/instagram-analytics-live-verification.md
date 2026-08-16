# Instagram Analytics Live Verification

This runbook closes the M4 analytics sync worker gate after Meta App Review grants insights access for a test Instagram Business account.

Status on 2026-08-16: **not externally verified and not activatable by configuration alone**. The active OAuth client requests exactly `instagram_business_basic`, and environment validation accepts that exact value. The analytics provider, worker, summary UI, PDF, Vault-learning path, and readiness endpoint exist, but a production business-basic connection does not grant or prove `instagram_business_manage_insights` access.

Keep `INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run` until every prerequisite below is complete. Switch to `live` only for a controlled verification window or production-like environment.

## Prerequisites

- Meta app has Instagram Login configured.
- Meta app has these permissions available to the test user:
  - `instagram_business_basic`
  - `instagram_business_manage_insights`
- The active OAuth request, environment schema, reconnect flow, tests, and App Review evidence have been intentionally updated for the insights permission. The current source does not satisfy this prerequisite.
- Test Instagram account is a Business or Creator account connected to the Meta app test user.
- MARKOS workspace is connected through the Instagram OAuth flow after the insights scope is configured.
- At least one MARKOS content item is `PUBLISHED` with a real `instagramPostId`.
- API and worker can reach Meta Graph API from the running environment.

## Future activation contract

Do not run the old instruction to set `INSTAGRAM_OAUTH_SCOPES` to a comma-separated permission list: current environment validation rejects it, and the active OAuth client ignores it when constructing authorization. Permission expansion requires an application change and a fresh authorized connection.

After that coordinated implementation and App Review work is merged, reconcile the final reviewed variable contract. The live analytics adapter currently uses these environment names:

```bash
INSTAGRAM_ANALYTICS_SYNC_MODE=live
META_APP_ID=<secret-manager-reference>
META_APP_SECRET=<secret-manager-reference>
META_GRAPH_BASE_URL=https://graph.facebook.com
# Provisional; confirm during the permission/API research phase before live activation.
META_GRAPH_VERSION=v25.0
WORKER_ANALYTICS_SYNC_INTERVAL_MS=21600000
```

Do not switch the mode to `live` until the readiness code can verify the newly requested scope contract and the connected credential was issued after that change. Configuration presence is not proof of a granted permission.

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
      "accountId": "<provider-account-id>"
    },
    "requiredScopes": [
      "instagram_business_basic",
      "instagram_business_manage_insights"
    ]
  }
}
```

If `ready` is false, resolve every reason before attempting live analytics sync.

Even when `ready` becomes true, treat it as preflight only. It does not prove provider permission, non-zero metrics, worker scheduling, or workspace-isolated persistence until the controlled verification below passes.

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
5. Open the current Insights summary and confirm it renders the real synced range. Keep the full `AN-01` through `AN-06` UI gate open until those Sunlit views exist.
6. Confirm the sync writes an `ANALYTICS_PERFORMANCE_LEARNING` entry into the Vault.

Evidence to save:

- `/v1/analytics/live-readiness` response with `ready: true`.
- `/v1/analytics/sync` response with `mode: "live"` and non-zero records.
- Screenshot of the mounted Insights summary showing real metrics.
- API/database evidence of the workspace-scoped Vault learning entry.
- Database row or API response showing the workspace-scoped `instagram_analytics` records.

Redact provider-account IDs, user/workspace IDs, access tokens, callback data, raw provider responses, headers, and customer data before sharing evidence.

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
