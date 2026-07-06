# Instagram Live Publish Verification

This runbook closes the M3 gates for real image post and reel publishing against a test Instagram Business account.

Keep `INSTAGRAM_PUBLISH_MODE=dry_run` until every prerequisite below is complete. Switch to `live` only for the verification window or a production-like environment with Meta App Review permissions.

## Prerequisites

- Meta app has Instagram Business Login configured.
- Meta app has `instagram_business_basic` and `instagram_business_content_publish` available for the test user.
- Test Instagram account is a Business or Creator account connected to the Meta app test user.
- MARKOS workspace is connected through the Instagram OAuth flow.
- API can reach Meta Graph API from the running environment.
- Media URLs used for publishing are public `https://` URLs reachable by Meta.
- MARKOS plan quota allows at least two `POST_PUBLISH` events.

## Required Environment

Set these in the API and worker environment:

```bash
INSTAGRAM_PUBLISH_MODE=live
META_APP_ID=...
META_APP_SECRET=...
META_REDIRECT_URI=https://<public-api-host>/v1/workspace/instagram/oauth/callback
META_WEBHOOK_VERIFY_TOKEN=...
META_GRAPH_BASE_URL=https://graph.facebook.com
META_GRAPH_VERSION=v24.0
```

Then restart the API and worker.

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
      "accountId": "178..."
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
5. In Schedule, run the due queue.
6. Confirm the attempt returns `status: "PUBLISHED"` with an `instagramPostId`.
7. Confirm the content item is marked `PUBLISHED`.
8. Confirm the post appears on the test Instagram Business account.

Evidence to save:

- API response with `instagramPostId`.
- Screenshot or link showing the post on Instagram.
- Audit/log entry for the publish run.

## Reel Verification

1. Register or upload one public `https://` MP4 video media asset accepted by Instagram Reels.
2. Create or generate a `REEL` content item with bilingual caption and hashtags.
3. Attach the public video media asset.
4. Approve and schedule the item for the current time.
5. In Schedule, run the due queue.
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
4. Confirm `failureReason` is visible in the Schedule failed queue.
5. Reschedule the failed item with corrected media.
6. Confirm `failureReason` clears and the item returns to `SCHEDULED`.

## Rollback

After verification, return non-production environments to:

```bash
INSTAGRAM_PUBLISH_MODE=dry_run
```

Restart the API and worker, then confirm `/v1/publishing/live-readiness` reports `INSTAGRAM_PUBLISH_MODE_NOT_LIVE`.
