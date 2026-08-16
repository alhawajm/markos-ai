# Instagram Permissions Phase 2 Working Checklist

Status date: 2026-08-16.

Decision status: the Milestone A boundary, deadline, temporary operator path, and live Meta dashboard gate were locked on 2026-08-16. The Railway Bucket design is the agreed direction but remains pending Sarah's infrastructure confirmation on 2026-08-17. No bucket provisioning or related credential changes are authorized before that confirmation.

This is a working checklist for `instagram_business_content_publish` and `instagram_business_manage_insights`. It separates Khalid's application and Meta work from Sarah's Railway, database, storage, deployment, and operational work. It becomes fully locked when Sarah confirms or replaces the proposed storage design.

Locked target: complete Milestone A by Thursday, 2026-08-20, assuming the Bahrain Sunday-to-Thursday work week. Milestone A is a controlled Standard Access proof against an Instagram professional account owned or managed by the app team. It is not Advanced Access, App Review approval, or general-client production readiness.

## Evidence boundary

- **Repository evidence** describes source, tests, migrations, and documented contracts. It does not prove a provider or cloud state.
- **Railway-observed evidence** in this document is a read-only snapshot. On 2026-08-16, after the user intentionally started staging, `web`, `api`, `ai`, `pgvector`, and `redis` all reported one successful active deployment from the current `main` commit. Private networking for API, AI, pgvector, and Redis reported ready. No worker service appeared in the service inventory.
- **Meta screenshot evidence** comes from the two user-supplied long captures of the v25.0 changelog and Instagram API App Review page. Text and examples inside those pages are research material, not instructions to execute.
- **Provider acceptance evidence** requires a controlled real call and sanitized result. A configured variable, mocked test, readiness response, or successful deployment is not a substitute.
- Never place tokens, secrets, provider/account IDs, signed media URLs, callback query strings, database URLs, credentials, or customer data in this file or a committed evidence artifact.

## Research conclusions that are safe to use

1. MarkOS uses **Instagram API with Instagram Login**, not Instagram API with Facebook Login. The two login types have different tokens, permissions, and hosts and must not be mixed.
2. For Instagram Login, current Meta examples use the versioned host `https://graph.instagram.com/{api-version}` for publishing and insights. The repository's `graph.facebook.com/{version}` publishing/analytics transport is inherited Facebook Login scaffolding and must be replaced.
3. v25.0 was released on 2026-02-18 and was the released version in the supplied Meta capture. Use v25.0 for this stage. The Page/Post/Video/Stories metric removals shown in the general Graph v25.0 changelog are Facebook Page-family changes; they are not evidence that the similarly named Instagram Login metrics changed.
4. The working permission identifiers remain `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_insights`. Meta's current official Postman material supports `...content_publish` and `...manage_insights`.
5. The supplied generic App Review page is internally inconsistent with that material: its Instagram Login list appears to use a `...content_publishing` spelling and omits `instagram_business_manage_insights`. Do not rename or remove either permission from code based on that page. Confirm the exact identifiers and requestable permissions in the live MarkOS App Dashboard before implementation or submission.
6. A tech provider serving professional accounts it does not own or manage needs Advanced Access and App Review. Standard Access can be used for the controlled app-team account proof in Milestone A.
7. The App Review page requires an externally loadable app, a visible Instagram login entry point, clear step-by-step use descriptions, permission-specific end-to-end screencasts, reviewer access instructions/credentials when applicable, and at least one successful call for permissions where the dashboard requests it. Dependencies must be included in the same submission.
8. Railway Buckets are private S3-compatible storage. Railway does not currently support public buckets. A file can be fetched directly through a time-limited presigned URL or proxied through the API; presigned URLs can live for up to 90 days.
9. The provisionally selected publishing design is to store the durable object key and generate a fresh presigned GET URL immediately before container creation. It must not persist or log the signed URL. Its lifetime must cover Meta's entire fetch, processing, and retry window. This design becomes locked only after Sarah confirms it on 2026-08-17.
10. Meta's current Instagram Login examples use `POST /{ig-user-id}/media`, a container-status read, and `POST /{ig-user-id}/media_publish`. The media URL must be publicly fetchable. The first controlled fixture should be a supported JPEG image.
11. Current Instagram Login insights examples use `GET /{ig-user-id}/insights?metric=reach,profile_views&period=day` and `GET /{ig-media-id}/insights?metric=shares,comments`. Account user metrics are retained by Meta for up to 90 days. Some account metrics are unavailable below 100 followers, and unavailable data may be returned as an empty data set rather than zero.

Primary references:

- [Meta Instagram Login collection](https://www.postman.com/meta/instagram/folder/23987686-98bfade9-3736-4738-8b4a-f56d6534f6de)
- [Meta image-container request](https://www.postman.com/meta/instagram/request/23987686-f4b5a72d-a125-4080-8968-93de1a549e68)
- [Meta publish-container request](https://www.postman.com/meta/instagram/request/23987686-299b176b-90aa-4d8a-b6cf-e6028fc69de5)
- [Meta Instagram Login insights guide](https://www.postman.com/meta/instagram/folder/23987686-f659d7d1-d74c-44e4-9192-9b1e8694c511)
- [Meta account-insights request](https://www.postman.com/meta/instagram/request/23987686-26e7999c-fc7e-44c8-8f71-ab2de8d35c32)
- [Meta media-insights request](https://www.postman.com/meta/instagram/request/23987686-0089d9e0-6141-4f69-a967-9d4c1c277ec9)
- [Meta App Review for Instagram API](https://developers.facebook.com/docs/instagram-platform/app-review/), supplemented by the user-supplied 2026-06-30 page capture because Meta returned HTTP 429 to the research client
- [Railway Storage Buckets](https://docs.railway.com/storage-buckets)
- [Railway Uploading and Serving Files](https://docs.railway.com/storage-buckets/uploading-serving)
- [Railway PostgreSQL](https://docs.railway.com/databases/postgresql)
- [Railway volume backups](https://docs.railway.com/volumes/backups)
- [Railway private networking](https://docs.railway.com/networking/private-networking)
- [Railway pre-deploy commands](https://docs.railway.com/deployments/pre-deploy-command)

## Recommended milestone boundary

### Milestone A — controlled permission proof

Milestone A proves both permissions with Standard Access and an app-team professional account:

- one fresh OAuth connection requests exactly the three release scopes;
- all versioned Instagram account, publishing, and insights calls use `graph.instagram.com/v25.0`;
- one JPEG stored in durable object storage is published through MarkOS using container create, status, and publish;
- one account-insights call and one media-insights call complete successfully and are persisted workspace-scoped;
- empty or zero insight values are handled truthfully rather than converted into false success or fabricated zeros;
- the test is performed manually through an authorized operator path, so no Railway worker service or publish-attempt migration is required yet;
- sanitized evidence is captured, and both live modes are returned to `dry_run` after the verification window.

Completion of Milestone A does **not** mean Advanced Access, App Review approval, automated scheduling, Reel reliability, or external-client readiness.

The JPEG-plus-insights boundary is locked. Its private Railway Bucket implementation is pending Sarah's confirmation; application work that does not provision or change Railway storage may proceed meanwhile.

### Milestone B — durable product behavior

- Add Reel and carousel publishing after introducing a durable container lifecycle, retry policy, and idempotency boundary.
- Deploy and validate the worker service for scheduled publishing, token refresh, and analytics sync.
- Persist publish attempts/leases and enforce an analytics uniqueness contract through reviewed forward migrations if the implementation requires them.
- Map supported metrics by media/account type, periods, ranges, aggregation type, and breakdown; add pagination and 90-day backfill behavior.
- Complete the Sunlit Queue, failure/retry, and Insights states rather than depending on operator-only routes.
- Add storage cleanup, direct-upload/CORS if selected, object lifecycle, cost, recovery, and orphan reconciliation.

### Milestone C — Advanced Access and App Review

- Make the complete browser-visible review journey available in English, with bilingual captions/tooltips where useful.
- Prepare separate use-case text and screencast evidence for each permission, even if both are selected in one review request.
- Complete App Settings, reviewer verification details, test credentials, privacy/data-deletion material, and external availability.
- Submit each requestable permission without making one permission's implementation wait for the other. If the live dashboard omits insights, preserve the publishing submission path and escalate the dashboard/docs inconsistency separately.
- Record submission and approval evidence before enabling external-client production use.

## Why Reel proof moves out of Milestone A

The skeleton currently polls only five times at one-second intervals inside the synchronous publish call, and staging has no worker service. That is not a reliable video-processing design. A JPEG publish is sufficient to exercise `instagram_business_content_publish`; moving Reel proof to Milestone B prevents a short-term HTTP wait loop from becoming the final scheduler architecture.

## Repository corrections required for Milestone A

| Area | Current repository state | Milestone A correction | Owner |
| --- | --- | --- | --- |
| OAuth scopes | `INSTAGRAM_REQUESTED_SCOPES` is hard-coded to basic; `INSTAGRAM_OAUTH_SCOPES` accepts only basic and does not control the request. | Parse and validate only the approved three-scope allowlist, require basic, use a canonical order, and make the OAuth request/store/tests consume the same value. | Khalid |
| Provider transport | Basic account calls use `graph.instagram.com`, while publishing and analytics use `META_GRAPH_BASE_URL=https://graph.facebook.com` and a separate `META_GRAPH_VERSION`. | Use the constrained Instagram Login host and one `INSTAGRAM_GRAPH_VERSION=v25.0`; keep test-only client injection without permitting arbitrary production hosts. Retire the in-scope legacy Meta Graph transport variables after deployment is verified. | Khalid + Sarah handoff |
| Publishing readiness | Readiness requires `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI`, which are not the active Instagram Login credential contract. | Check the actual Instagram Login configuration, requested-scope generation, connection issuance time, mode, media readiness, and provider-call prerequisites. Do not claim provider-granted scopes without a successful call. | Khalid |
| Publishing client | The container flow exists, but it consumes stored `cdnUrl`, uses legacy transport, and may apply a guessed quota fallback. | Resolve a fresh signed URL from the object key, validate a JPEG fixture, use Instagram Login endpoints, consume live quota fields without presenting a fallback as provider truth, and sanitize errors. | Khalid |
| Insights client | Account data reads `followers_count,media_count` from the account object; media insights request one broad fixed metric list; both use legacy transport. | Make an actual account `/insights` request plus a media `/insights` request using a minimal confirmed metric set. Treat response shape, empty data, and metric availability explicitly. | Khalid |
| Storage | `storage-service.ts` writes to API-local disk; `MediaAsset` already has `s3Key` and `cdnUrl`. | Add an S3-compatible driver, retain local storage for local development, store stable object keys, and mint signed provider-fetch URLs just in time. No schema change is expected for A. | Khalid builds; Sarah provisions |
| Database | Existing schema stores requested/confirmed-scope arrays, object keys, published media IDs, and JSON analytics with RLS. | Reuse the existing schema for the single manual proof. Do not rewrite the clean baseline. Any discovered schema need becomes a reviewed forward migration with a workspace-isolation test. | Khalid authors; Sarah applies |
| Browser path | The functional `SettingsPanel` exists, but `AppShell` does not render a Settings panel. | Add a minimal Sunlit connection/reconnection surface or explicitly approve an operator-only A path. A visible final UI is mandatory before App Review even if A remains operator-driven. | Khalid |
| Runtime worker | Worker source and Dockerfile exist; no Railway worker service is present in the current staging service list. | Use the authorized manual run/sync path for A. Provision the worker in B rather than creating it as an accidental deadline dependency. | Khalid + Sarah in B |

## Khalid's Milestone A checklist

### Contract and dashboard

- [ ] **K-A01** In the live MarkOS App Dashboard, capture whether the exact requestable identifiers are `instagram_business_content_publish` and `instagram_business_manage_insights`. Record the UI result without exposing app IDs or account data.
- [ ] **K-A02** Confirm the test professional account is owned/managed by an app role that is eligible for Standard Access. Do not use a client account for Milestone A.
- [ ] **K-A03** Lock one version contract: `INSTAGRAM_GRAPH_VERSION=v25.0`; versioned Instagram Login calls use `graph.instagram.com`.
- [ ] **K-A04** Replace the exact-basic environment literal with a canonical allowlisted scope parser for basic, publish, and insights. Reject duplicates, unknown scopes, missing basic, and old Facebook Login names.
- [ ] **K-A05** Update OAuth, credential persistence, status/readiness output, and tests to consume the same requested-scope set. Do not populate `providerConfirmedScopes` from the request alone.

### Storage and publishing

- [ ] **K-A06** Implement a storage-driver interface with local and S3-compatible implementations. Use workspace-prefixed, non-overwritable object keys and explicit content types.
- [ ] **K-A07** Add conditional environment validation for the chosen bucket variable contract. Keep real credentials out of `.env.example`; document names and fake placeholders only.
- [ ] **K-A08** Generate a fresh presigned GET URL from `MediaAsset.s3Key` immediately before container creation. Never persist, return to ordinary clients, or log the signed URL.
- [ ] **K-A09** Validate publish media separately from generic media upload. The A fixture must be a provider-compatible JPEG with known dimensions/size; reject SVG and an arbitrary MIME label before calling Meta.
- [ ] **K-A10** Move publishing to the Instagram Login client/transport and test the exact image-container, status, publish, quota, error, timeout, and token-redaction behavior with mocked responses.
- [ ] **K-A11** Prevent a duplicate manual publish within the controlled run using an application-level guard. Record the need for a durable lease/attempt model in B rather than pretending A solves multi-worker idempotency.

### Insights

- [ ] **K-A12** Replace the account-profile substitute with a real account `/insights` request using the minimal confirmed day metrics for the controlled call.
- [ ] **K-A13** Query media `/insights` for the newly published image using media-compatible confirmed metrics. Keep account and media metric sets separate.
- [ ] **K-A14** Preserve missing/empty provider data as unavailable. Do not coerce an absent metric to zero, and do not require a non-zero result to call a successful provider response successful.
- [ ] **K-A15** Persist the controlled snapshots through the existing workspace-scoped `InstagramAnalytics` path and verify another workspace cannot read or overwrite them.

### UI, tests, and evidence

- [ ] **K-A16** Decide whether A uses a minimal Sunlit reconnect control or an operator-only route. If operator-only, label it temporary and keep the App Review UI gate open.
- [ ] **K-A17** Update unit/integration tests for the exact host, version, scope set, storage driver, signed-URL redaction, publish result, insight response variants, and workspace isolation.
- [ ] **K-A18** Run repository verification only against a disposable test database, never staging or production.
- [ ] **K-A19** After Sarah deploys the dry-run build, disconnect/reconnect the test Instagram account so the new access token is issued for the expanded request.
- [ ] **K-A20** Conduct the approved live window: one JPEG publish, one account-insights call, and one media-insights call. Save sanitized timestamps, request IDs if safe, statuses, published-media evidence, and persistence evidence.
- [ ] **K-A21** Confirm modes return to `dry_run` and that no signed URL, token, provider ID, or customer data entered logs or committed artifacts.

## Sarah's Milestone A checklist

### Railway storage

- [ ] **S-A01** On 2026-08-17, confirm or replace the proposed private Railway Bucket plus just-in-time presigned-URL design. Do not provision storage or change credentials before this decision. If confirmed, check whether a staging bucket already exists; if not, choose the region before creating one because Railway states that a bucket's region cannot be changed after creation.
- [ ] **S-A02** Keep the bucket private. Do not attempt to make it public; Railway currently supports presigned URLs or backend proxying, not public buckets.
- [ ] **S-A03** Add bucket credentials to the API through Railway variable references using the agreed application names. Do not paste values into Git, chat, logs, or screenshots. The worker receives them later only when B deploys it.
- [ ] **S-A04** Confirm the API can upload/read/delete a disposable test object and that an unauthenticated external GET succeeds only through a short-lived presigned URL. Remove the disposable object after the check.
- [ ] **S-A05** Confirm bucket environment isolation and document the retention/lifecycle choice. Do not configure browser-upload CORS for A because the controlled upload can pass through the API.

### Database and environment safety

- [ ] **S-A06** Confirm the staging pgvector volume has a usable backup before the live window and record whether daily/weekly/monthly backup schedules are enabled. No restore is required.
- [ ] **S-A07** Confirm the deployed database's migration history, required extensions/roles, and application-role RLS without applying the clean baseline. Milestone A is expected to need no migration.
- [ ] **S-A08** If Khalid unexpectedly needs a schema change, review a forward migration and its workspace policy, take a pre-change backup, apply it through the approved pre-deploy path, and verify migration status. Never use `prisma db push` on the shared database.
- [ ] **S-A09** Update only in-scope Instagram/storage variables. Leave unrelated deferred variables such as Benefit and Google secrets untouched.
- [ ] **S-A10** Replace or remove legacy `META_GRAPH_BASE_URL`, `META_GRAPH_VERSION`, `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI` only after Khalid's corrected code no longer consumes them. Do not remove webhook-specific variables that still have a separate active consumer.

### Deployment and live window

- [ ] **S-A11** Deploy the reviewed commit to staging with publish and analytics modes still set to `dry_run`; record the deployed commit and confirm web/API/AI/pgvector/Redis health.
- [ ] **S-A12** Confirm public web/API HTTPS reachability and private API-to-pgvector/Redis/AI networking. Keep real domains and connection strings out of committed evidence.
- [ ] **S-A13** Confirm outbound access from the API to `graph.instagram.com` and bucket storage without logging authorization headers or signed URLs.
- [ ] **S-A14** During the agreed controlled window, switch only the two provider modes needed for the test, restart the consuming service if required, and keep a rollback path ready.
- [ ] **S-A15** Watch deployment/application logs for sanitized stage, status, timeout, and request-correlation evidence. Stop the test if secrets, signed URLs, raw provider bodies, or customer data appear.
- [ ] **S-A16** Immediately return both modes to `dry_run` after the agreed evidence is captured and confirm the rollback deployment is healthy.

## Joint handoffs and completion gates

- [ ] **J-A01 — Variable contract:** Khalid supplies the exact new/retired variable-name matrix and conditional validation; Sarah confirms Railway references and consumers without sharing values.
- [ ] **J-A02 — Dry-run handoff:** Khalid supplies the verified commit and expected health/readiness output; Sarah deploys it; both confirm the deployed commit before any Meta reconnection.
- [ ] **J-A03 — Media-fetch gate:** Khalid supplies one disposable JPEG/object key; Sarah confirms durable storage and external signed fetch; Khalid confirms logs and API responses do not expose the signed URL.
- [ ] **J-A04 — Reconnect gate:** Khalid verifies the live dashboard identifiers, reconnects the owned/managed test account, and confirms the credential records the three requested scopes without claiming provider confirmation.
- [ ] **J-A05 — Publish gate:** MarkOS creates an image container, observes an acceptable container state, publishes it once, persists the returned media ID, and the post is visible on the test account.
- [ ] **J-A06 — Insights gate:** MarkOS completes one account-insights and one published-media-insights request. Persisted data is workspace-scoped; empty/zero values are represented truthfully.
- [ ] **J-A07 — Safety gate:** modes are back to `dry_run`, the test object/evidence is handled according to policy, staging is healthy, and no sensitive value is in Git or shared evidence.

Milestone A is complete only when J-A01 through J-A07 are checked. Deployment success by itself is not completion.

## Proposed work sequence for the current week

| Target | Khalid | Sarah | Joint gate |
| --- | --- | --- | --- |
| Sun 2026-08-16 | Lock the A boundary, deadline, operator path, and dashboard gate. | Staging was intentionally started and confirmed healthy; storage work remains paused. | Record the locked decisions and pending storage confirmation. |
| Mon 2026-08-17 | Correct host/version/scopes/readiness; start the storage adapter only after Sarah confirms its contract. | Confirm or replace the Bucket design, then provision/reference it if approved; confirm database safety. | Lock the storage decision and review the environment-name diff. |
| Tue 2026-08-18 | Finish publish/insights adapters and focused tests. | Validate bucket access and prepare dry-run deployment. | External presigned-fetch gate. |
| Wed 2026-08-19 | Complete disposable-DB verification and hand off the commit. | Deploy in dry-run and verify health/networking. | Confirm deployed commit; reconnect test account. |
| Thu 2026-08-20 | Run the controlled publish and insights calls; sanitize evidence. | Operate the live window, observe logs, and roll back modes. | J-A01 through J-A07 sign-off. |

This schedule assumes no Meta dashboard identifier/access surprise. A missing `instagram_business_manage_insights` request option is a provider/dashboard blocker for that permission, not a reason to switch the app to Facebook Login or keep the legacy `graph.facebook.com` transport.

## Milestone B database and worker handoff

These are explicitly not required to close A, but they are the next database/runtime work after the controlled proof:

- [ ] **K-B01** Design a workspace-owned publish-attempt/container model with idempotency key, provider container ID, state, bounded error code, attempt count, next-attempt time, lease owner/expiry, and timestamps.
- [ ] **K-B02** Add a database uniqueness contract for analytics snapshot identity so overlapping worker/manual syncs cannot create duplicates.
- [ ] **K-B03** Add RLS policies and cross-workspace tests for every new workspace-owned table.
- [ ] **S-B01** Review the forward migration against deployed history, take a backup, apply through pre-deploy, and verify application-role RLS.
- [ ] **S-B02** Create the Railway worker service from `apps/api/worker.Dockerfile`, inject only variables consumed by enabled tasks, and keep one publishing replica until the lease/idempotency proof passes.
- [ ] **J-B01** Prove restart/retry behavior: stop the worker after container creation, restart it, and confirm exactly one final Instagram post.

## App Review preparation split

### Khalid

- [ ] Complete the visible Sunlit connect/reconnect, publish, and Insights journeys before recording.
- [ ] Prepare permission-specific allowed-use descriptions and exact reviewer steps.
- [ ] Record English-language screencasts or add captions/tooltips; explain non-obvious controls.
- [ ] Show the Instagram login entry point, the permission-specific action, and the resulting provider-backed state without exposing sensitive data.
- [ ] Complete the 1024x1024 app icon, category, business email, privacy-policy URL, reviewer platform instructions, and credentials/test data where applicable.
- [ ] Include `instagram_business_basic` as a dependency and request no comments/messages/ads permission.

### Sarah

- [ ] Keep the review environment and public web/API routes available for the agreed reviewer window.
- [ ] Ensure reviewer actions use isolated test data, durable media, healthy database/storage, and sanitized observability.
- [ ] Keep secrets in Railway and provide only the application credentials explicitly needed by reviewers through the approved Meta review field, not Git or ordinary documentation.
- [ ] Maintain a rollback and incident contact path during the review window.

## Decision record and remaining confirmation

| ID | Decision | Status |
| --- | --- | --- |
| D-01 | Milestone A proves one JPEG publish plus account and media insights; Reel moves to B. | **Locked 2026-08-16.** |
| D-02 | Use a private Railway Bucket plus just-in-time presigned URLs as the Milestone A storage design. | **Pending Sarah, 2026-08-17.** Khalid approved the direction; no provisioning or credential changes occur before Sarah confirms it. |
| D-03 | Complete Milestone A by Thursday, 2026-08-20. | **Locked 2026-08-16.** |
| D-04 | An operator-only publish/sync path is acceptable for A; the minimal Sunlit reconnect surface and complete visible review journey remain mandatory before C. | **Locked 2026-08-16.** |
| D-05 | Inspect the live Meta dashboard and resolve the generic App Review page's permission-name/list inconsistency before changing code constants or submitting permissions. | **Locked 2026-08-16.** This is an execution gate, not an open design choice. |

Non-storage implementation preparation may proceed under D-01, D-03, D-04, and D-05. The plan becomes fully locked when D-02 is confirmed or replaced. If Sarah confirms the proposed design, record the confirmation date here before starting S-A02 through S-A05; if she replaces it, update the storage-dependent Khalid, Sarah, and joint tasks before implementation.
