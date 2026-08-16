# Instagram Live Publish Verification

This runbook closes the M3 gates for real image post and reel publishing against a test Instagram Business account.

Status on 2026-08-16: **not externally verified**. The successful 2026-08-03 production business-basic connection proves that MARKOS connected one real professional account; it does not prove publish permission, durable public media, container creation/polling, media publication, failure recovery, or App Review. The active OAuth request still omits `instagram_business_content_publish`.

Keep `INSTAGRAM_PUBLISH_MODE=dry_run` until every prerequisite below is complete. Switch to `live` only for the verification window or a production-like environment with Meta App Review permissions.

## Prerequisites

- Meta app has Instagram Login configured.
- Meta app has `instagram_business_basic` and `instagram_business_content_publish` available for the test user.
- The active OAuth client has been intentionally changed and tested to request the publishing permission. The current source requests exactly `instagram_business_basic`; changing `INSTAGRAM_OAUTH_SCOPES` alone does not expand it.
- Test Instagram account is a Business or Creator account connected to the Meta app test user.
- MARKOS workspace is connected through the Instagram OAuth flow.
- API can reach Meta Graph API from the running environment.
- Media URLs used for publishing are durable public `https://` URLs reachable by Meta for the entire container/publish window. Current Railway/local filesystem serving is not an accepted durable media design.
- MARKOS plan quota allows at least two `POST_PUBLISH` events.
- Formal App Review and the controlled test-account conditions required by Meta are confirmed in the current dashboard.

## Required Environment

The publishing provider uses the Graph base URL and version below; the readiness service also checks the listed app and redirect settings. The connected credential comes from the separately configured `INSTAGRAM_*` OAuth variables. Supply names through the deployment secret manager; never put real values in this file or a command transcript.

```bash
INSTAGRAM_PUBLISH_MODE=live
META_APP_ID=<secret-manager-reference>
META_APP_SECRET=<secret-manager-reference>
META_REDIRECT_URI=<deployed-oauth-callback>
META_WEBHOOK_VERIFY_TOKEN=<secret-manager-reference>
META_GRAPH_BASE_URL=https://graph.facebook.com
# Provisional; confirm during the permission/API research phase before live activation.
META_GRAPH_VERSION=v25.0
```

Then restart the API and worker.

The live-readiness endpoint currently checks configuration presence and connection state; it cannot prove the granted provider permission, App Review state, media fetchability, or a successful publish. Treat `ready: true` as a preflight result, not acceptance evidence.

## Readiness Check

After signing in to MARKOS and connecting Instagram, call:

```bash
curl -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  http://localhost:4000/v1/publishing/live-readiness
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
    }
  }
}
```

If `ready` is false, resolve every reason before attempting a live publish.

## Image Post Verification

1. Register or upload one public `https://` image media asset.
2. Create or generate a `POST` content item with bilingual caption and hashtags.
3. Attach the public image media asset.
4. Approve and schedule the item for the current time.
5. Run the due publishing worker or `POST /v1/publishing/run-due` through an authorized operator flow. The complete Sunlit Queue page is not currently mounted.
6. Confirm the attempt returns `status: "PUBLISHED"` with an `instagramPostId`.
7. Confirm the content item is marked `PUBLISHED`.
8. Confirm the post appears on the test Instagram Business account.

Evidence to save:

- API response with `instagramPostId`.
- Screenshot or link showing the post on Instagram.
- Audit/log entry for the publish run.

Redact tokens, provider-account IDs, workspace/user IDs, callback data, headers, raw provider bodies, and customer data before sharing evidence. Store real evidence outside Git unless the repository evidence policy explicitly permits a sanitized artifact.

## Reel Verification

1. Register or upload one public `https://` MP4 video media asset accepted by Instagram Reels.
2. Create or generate a `REEL` content item with bilingual caption and hashtags.
3. Attach the public video media asset.
4. Approve and schedule the item for the current time.
5. Run the due publishing worker or `POST /v1/publishing/run-due` through an authorized operator flow. The complete Sunlit Queue page is not currently mounted.
6. Confirm the attempt returns `status: "PUBLISHED"` with an `instagramPostId`.
7. Confirm the content item is marked `PUBLISHED`.
8. Confirm the reel appears on the test Instagram Business account.

Evidence to save:

- API response with `instagramPostId`.
- Screenshot or link showing the reel on Instagram.
- Audit/log entry for the publish run.

## Failure Drill

1. Schedule a publishable item with a deliberately invalid or blocked public media URL.
2. Run the due queue in live mode.
3. Confirm the content item moves to `FAILED`.
4. Confirm `failureReason` is returned/persisted safely. The M3 UI gate remains open until the restored Sunlit Queue exposes it.
5. Reschedule the failed item with corrected media.
6. Confirm `failureReason` clears and the item returns to `SCHEDULED`.

## Rollback

After verification, return non-production environments to:

```bash
INSTAGRAM_PUBLISH_MODE=dry_run
```

Restart the API and worker, then confirm `/v1/publishing/live-readiness` reports `INSTAGRAM_PUBLISH_MODE_NOT_LIVE`.
