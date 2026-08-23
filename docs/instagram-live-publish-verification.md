# Instagram Live Publish Verification

This runbook verifies the Milestone A publishing proof: one approved JPEG is published once to an app-team Instagram professional account through the temporary operator route.

Status on 2026-08-17: **application implementation and local verification are complete for the current uncommitted pass; reviewed-code deployment and live proof remain open**. The repository now constrains publishing calls to Instagram Login on `graph.instagram.com/v25.0`, requests the three Milestone A scopes, validates one JPEG, provides an item-specific operator route, writes through local/S3 storage drivers, and signs an S3 GET immediately before container creation. Sarah reports that the private Railway Bucket is provisioned and wired to the API, `AWS_S3_URL_STYLE=virtual` is set, a test image is visible in the Bucket, the exact version/scopes and dry-run modes are configured, and the baseline API deployment is healthy. Application-path upload/read/delete, external presigned GET, deployment of the reviewed commit, reconnect, and one real publish remain open. A successful 2026-08-03 business-basic connection does not prove publishing.

Keep `INSTAGRAM_PUBLISH_MODE=dry_run` except during the approved live window. Milestone A does not verify Reels, carousels, scheduled-worker behavior, Advanced Access, or App Review.

## Preconditions

- In the current Meta App Dashboard, confirm the requestable identifier is `instagram_business_content_publish`.
- Confirm the test professional account is owned or managed by an eligible app role; do not use a client account.
- Deploy the reviewed application commit while both provider modes remain `dry_run`.
- Disconnect and reconnect after deployment so the stored credential records the exact requested-scope set.
- Complete the confirmed private Railway Bucket gate: provision or select the staging bucket, reference its generated variables from the API, and prove a disposable external presigned GET. The URL must remain valid for Meta's fetch and processing window and must never be logged, persisted, or returned to ordinary clients.
- Prepare exactly one `POST` content item whose status is `SCHEDULED` and whose `scheduledAt` is at or before the current API time. Scheduling follows approval, but `APPROVED` by itself is not publishable. Link the item to one supported JPEG whose MIME type, extension, dimensions, size, and durable object key are known. The Calendar accepts future times, so schedule the proof item in advance and wait until it is due; do not edit shared database state manually.
- Confirm the workspace plan has at least one `POST_PUBLISH` unit available.

## Application environment contract

Supply values through the deployment secret manager. Never paste real values into Git, chat, commands, screenshots, or evidence.

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
INSTAGRAM_PUBLISH_MODE=dry_run
INSTAGRAM_CONTAINER_POLL_ATTEMPTS=6
INSTAGRAM_CONTAINER_POLL_DELAY_MS=60000
MEDIA_STORAGE_DRIVER=s3
AWS_ENDPOINT_URL=<railway-bucket-variable-reference>
AWS_ACCESS_KEY_ID=<railway-bucket-variable-reference>
AWS_SECRET_ACCESS_KEY=<railway-bucket-variable-reference>
AWS_S3_BUCKET_NAME=<railway-bucket-variable-reference>
AWS_DEFAULT_REGION=<railway-bucket-variable-reference>
AWS_S3_URL_STYLE=virtual
SIGNED_URL_TTL=3600
```

`graph.instagram.com/v25.0` is fixed by the application. The retired `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_BASE_URL`, and `META_GRAPH_VERSION` names do not configure this adapter. `META_WEBHOOK_VERIFY_TOKEN` remains a separate webhook setting.

The first five `AWS_*` names must reference the private Bucket's generated Railway credentials; do not copy their values. `AWS_S3_URL_STYLE=virtual` is an application-owned API setting because the Railway dashboard does not expose a corresponding service-reference variable. `MEDIA_PUBLIC_BASE_URL` is optional and should remain unset when the existing `API_BASE_URL` is the canonical public HTTPS API origin. The API validates the complete S3 contract conditionally, accepts `SIGNED_URL_TTL` only from 300 through 86,400 seconds, and keeps signed URLs provider-only. Do not add these variables to web, AI, PostgreSQL, or Redis. The worker receives them only in Milestone B.

The polling defaults perform one immediate container-status read and then wait one minute between five further reads, covering a five-minute processing window without querying more than once per minute after the initial read. If Railway already defines either polling variable explicitly, update the API service to the values above or remove the override so the safe application defaults apply. The signed URL's 3,600-second starting TTL covers this bounded window.

## Dry-run preflight

With a verified operator session that has `publishing:run`, call:

```bash
curl -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  https://<api-host>/v1/publishing/live-readiness
```

The response must report:

- `graphVersion: "v25.0"`;
- the exact three `requiredScopes`;
- a connected credential issued after the expanded scope request;
- `INSTAGRAM_PUBLISH_MODE_NOT_LIVE` while safely in dry-run;
- no storage-configuration reason other than the expected dry-run mode; in particular, it must not report `MEDIA_STORAGE_DRIVER_NOT_S3`.

Readiness is a preflight only. It does not prove provider-granted permission, Meta dashboard state, media fetchability, storage signing, or a successful publish.

Exercise the existing item-specific dry-run route first:

```bash
curl -X POST \
  -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://<api-host>/v1/publishing/content/<content-item-id>/dry-run
```

The result must be `DRY_RUN`, must contain `mediaCount: 1`, and must not contain a media URL or signed query string.

## Controlled live window

Sarah switches only `INSTAGRAM_PUBLISH_MODE` to `live` and confirms the API restart/deployment is healthy. Do not start the worker and do not use the multi-item `run-due` route for this proof.

With a verified operator session, `publishing:run`, and a recent MFA step-up, call exactly once:

```bash
curl -X POST \
  -H "Authorization: Bearer <mfa-stepped-up-access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  -H "Content-Type: application/json" \
  -d '{}' \
  https://<api-host>/v1/publishing/content/<content-item-id>/publish
```

Expected behavior:

1. The application obtains a fresh provider-fetch URL from the durable object key immediately before container creation.
2. It checks the live publishing-limit response without inventing fallback quota values.
3. It creates one image container, checks its status immediately, then checks no more than once per minute for up to five minutes before publishing it once.
4. The response reports `status: "PUBLISHED"`, `dryRun: false`, and `mediaCount: 1`, without returning the signed URL.
5. The content item is `PUBLISHED`, has a persisted provider media ID, and the image is visible on the test Instagram account.
6. A simultaneous duplicate request is blocked in this process. Durable multi-worker idempotency remains Milestone B work.

Stop on any unknown container state, timeout, provider error, duplicate uncertainty, or sensitive log output. A timeout requires operator review and must not trigger a second publish request or an automatic fresh-container attempt. First confirm that no media ID was persisted and no post appeared; durable container persistence and reconciliation remain Milestone B work. Error responses and persisted failure reasons must use bounded application codes rather than raw provider messages.

## Evidence and rollback

Capture only sanitized timestamps, application request IDs when safe, high-level container/publish statuses, confirmation that a non-empty media ID was persisted, and a redacted screenshot showing the test post. Never commit or share access tokens, signed URLs, account/workspace/user IDs, raw provider bodies, callback data, headers, or customer content.

Immediately restore:

```bash
INSTAGRAM_PUBLISH_MODE=dry_run
```

After the API restarts, confirm `/v1/publishing/live-readiness` again reports `INSTAGRAM_PUBLISH_MODE_NOT_LIVE`. Confirm logs and committed artifacts contain no signed URL, token, provider ID, or customer data.

## Deferred to Milestone B

Reel/carousel publishing, worker-driven scheduling, durable publish leases/attempts, restart recovery, retry policy, and a complete Sunlit Queue/failure UI are not Milestone A acceptance criteria.
