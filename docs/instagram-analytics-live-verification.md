# Instagram Analytics Live Verification

This runbook verifies the Milestone A analytics proof: one account-insights call and one media-insights call for the newly published JPEG, persisted through the existing workspace-scoped analytics path.

Status on 2026-08-17: **application implementation in progress; no live insights evidence yet**. The repository now requests the three Milestone A scopes, uses `graph.instagram.com/v25.0`, separates account and media metric sets, and preserves unavailable data separately from explicit zero. A successful business-basic connection, a dry-run provider, or a mocked response does not prove insights access.

Keep `INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run` except during the approved live window. The worker, scheduled backfills, broader metric mapping, and App Review remain later gates.

## Preconditions

- In the current Meta App Dashboard, confirm `instagram_business_manage_insights` is requestable for the MarkOS app.
- Confirm the test professional account is owned or managed by an eligible app role.
- Deploy the reviewed application commit in dry-run and reconnect the account after the expanded OAuth request is active.
- Complete the Milestone A JPEG publish first so one workspace-owned content item has a real `instagramPostId`.
- Use a verified, authorized operator session. Do not require a non-zero metric result: Meta may return an empty dataset when data is unavailable.

## Application environment contract

Supply values through the deployment secret manager and never expose them in evidence.

```bash
INSTAGRAM_APP_ID=<secret-manager-reference>
INSTAGRAM_APP_SECRET=<secret-manager-reference>
INSTAGRAM_OAUTH_REDIRECT_URI=<deployed-oauth-callback>
INSTAGRAM_OAUTH_STATE_SECRET=<secret-manager-reference>
INSTAGRAM_TOKEN_ENCRYPTION_KEY=<secret-manager-reference>
INSTAGRAM_GRAPH_VERSION=v25.0
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
INSTAGRAM_GRAPH_REQUEST_TIMEOUT_MS=15000
INSTAGRAM_GRAPH_MAX_RESPONSE_BYTES=262144
INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run
```

The application fixes versioned insights calls to `graph.instagram.com/v25.0`. The retired `META_APP_ID`, `META_APP_SECRET`, `META_GRAPH_BASE_URL`, and `META_GRAPH_VERSION` names do not configure this adapter.

## Dry-run preflight

Call:

```bash
curl -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  https://<api-host>/v1/analytics/live-readiness
```

The response must report `graphVersion: "v25.0"`, the exact three `requiredScopes`, a connected post-reconnect credential, and `INSTAGRAM_ANALYTICS_SYNC_MODE_NOT_LIVE` while safely in dry-run. This does not prove provider-granted permission or a successful call.

## Controlled live window

Sarah switches only `INSTAGRAM_ANALYTICS_SYNC_MODE` to `live` and confirms the API restart/deployment is healthy. The worker is not required for Milestone A.

Call the authorized manual sync route:

```bash
curl -X POST \
  -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  -H "Content-Type: application/json" \
  -d '{"days":30}' \
  https://<api-host>/v1/analytics/sync
```

Expected provider behavior:

1. Account request: `GET /v25.0/<ig-user-id>/insights?metric=reach,profile_views&period=day`.
2. Media request: `GET /v25.0/<ig-media-id>/insights?metric=shares,comments`.
3. The access token is sent as a bearer header, never in either URL.
4. An empty provider `data` array is persisted as an empty metric object and displayed as unavailable; an explicit numeric `0` remains zero.
5. The media snapshot may attach only to a published content item selected from the active workspace. A foreign content identifier aborts the sync before writes.
6. The response reports `mode: "live"` and includes an `ACCOUNT` record plus the image's `POST` record, even if one metric set is empty.
7. The existing Vault-learning write remains workspace-scoped and must not include another workspace's content or metrics.

Do not interpret absent data as zero, and do not require non-zero data to declare the provider request successful.

## Persistence and isolation evidence

Using sanitized output, confirm:

- the active workspace has the new account and media `InstagramAnalytics` rows;
- the media row refers to the active workspace's published content item;
- another workspace cannot read or overwrite either row;
- the Insights response/UI renders unavailable values as an em dash rather than `0`;
- the Vault learning records “unavailable” when a metric is absent.

Never commit or share tokens, provider/account/media IDs, workspace/user IDs, raw provider bodies, headers, callback data, signed URLs, or customer content.

## Rollback

Immediately restore:

```bash
INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run
```

After the API restarts, confirm `/v1/analytics/live-readiness` reports `INSTAGRAM_ANALYTICS_SYNC_MODE_NOT_LIVE`, both provider modes are dry-run, staging is healthy, and sanitized logs contain no sensitive values.

## Deferred to Milestone B/C

Worker scheduling, pagination, 90-day backfill behavior, broader metric compatibility by media/account type, uniqueness under overlapping syncs, complete Sunlit Insights states, Advanced Access, and App Review are not closed by this proof.
