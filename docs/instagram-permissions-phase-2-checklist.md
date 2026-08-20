# Instagram Permissions Phase 2 Working Checklist

Status date: 2026-08-19.

Decision status: all five Milestone A decisions are locked. The boundary, temporary operator path, and live Meta dashboard gate were locked on 2026-08-16; the completion target was updated to Wednesday for Thursday's showcase, and Sarah confirmed the private Railway Bucket plus just-in-time presigned-GET design on 2026-08-17.

This is a working checklist for `instagram_business_content_publish` and `instagram_business_manage_insights`. It separates Khalid's application and Meta work from Sarah's Railway, database, storage, deployment, and operational work. The implementation boundary is locked; unchecked items still require their stated repository, dashboard, Railway, or live-provider evidence.

Locked target: complete Milestone A by Wednesday, 2026-08-19, for the Thursday, 2026-08-20 showcase. Milestone A is a controlled Standard Access proof against an Instagram professional account owned or managed by the app team. It is not Advanced Access, App Review approval, or general-client production readiness.

Application status: the second application pass and the 2026-08-18 Content Studio stabilization pass are implemented in commit `df937b5`, pushed, and deployed to staging with green CI and terminal-success Railway service states. The stabilization pass addresses the browser preview failure, Instagram feed-image preflight, approval-safe editing, confirmed cancellation/deletion, and follower-view preview. Deployment closes the reviewed-code handoff, but it does not close the remaining external media-fetch, reconnect, live-publish, live-insights, or rollback evidence gates.

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
9. The locked publishing design is to store the durable object key and generate a fresh presigned GET URL immediately before container creation. It must not persist, return to ordinary clients, or log the signed URL. `SIGNED_URL_TTL` defaults to 3,600 seconds and is constrained to 300–86,400 seconds so the controlled value can cover Meta's fetch and processing window without becoming an unbounded URL.
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

The JPEG-plus-insights boundary and private Railway Bucket design are locked. The local/S3 application contract and just-in-time signing path are implemented in the working tree; Railway provisioning, variable references, external fetch validation, deployment, reconnect, and live-provider proof remain separate gates.

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

The Milestone A operator path now performs one immediate container-status check followed by five one-minute checks, covering the provider's five-minute guidance for the controlled JPEG proof. It still runs inside one synchronous request, does not persist the container lifecycle, and staging has no worker service. That is not a reliable video-processing design. A JPEG publish is sufficient to exercise `instagram_business_content_publish`; moving Reel proof to Milestone B prevents a temporary operator wait loop from becoming the final scheduler architecture.

## Repository corrections required for Milestone A

| Area | Baseline before the Milestone A implementation | Milestone A correction | Owner |
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

- [x] **K-A01** In the live MarkOS App Dashboard, capture whether the exact requestable identifiers are `instagram_business_content_publish` and `instagram_business_manage_insights`. Record the UI result without exposing app IDs or account data. User-confirmed complete on 2026-08-17; no identifiers or account data are reproduced here.
- [x] **K-A02** Confirm the test professional account is owned/managed by an app role that is eligible for Standard Access. Do not use a client account for Milestone A. User-confirmed complete on 2026-08-17.
- [x] **K-A03** Lock one version contract: `INSTAGRAM_GRAPH_VERSION=v25.0`; versioned Instagram Login calls use `graph.instagram.com`.
- [x] **K-A04** Replace the exact-basic environment literal with a canonical allowlisted scope parser for basic, publish, and insights. Reject duplicates, unknown scopes, missing basic, and old Facebook Login names.
- [x] **K-A05** Update OAuth, credential persistence, status/readiness output, and tests to consume the same requested-scope set. Do not populate `providerConfirmedScopes` from the request alone.

### Storage and publishing

- [x] **K-A06** Implement a storage-driver interface with local and S3-compatible implementations. Use workspace-prefixed, non-overwritable object keys and explicit content types.
- [x] **K-A07** Add conditional environment validation for the chosen bucket variable contract. Keep real credentials out of `.env.example`; document names and fake placeholders only.
- [x] **K-A08** Generate a fresh presigned GET URL from `MediaAsset.s3Key` immediately before container creation. Never persist, return to ordinary clients, or log the signed URL.
- [x] **K-A09** Validate publish media separately from generic media upload. The A fixture must be a real JPEG no larger than 8,000,000 bytes, 320–1,440 pixels wide, and between 4:5 and 1.91:1. Derive uploaded JPEG dimensions from its bytes, reject renamed/non-JPEG data, and repeat the metadata contract before calling Meta.
- [x] **K-A10** Move publishing to the Instagram Login client/transport and test the exact image-container, status, publish, quota, error, timeout, and token-redaction behavior with mocked responses.
- [x] **K-A11** Prevent a duplicate manual publish within the controlled run using an application-level guard. Record the need for a durable lease/attempt model in B rather than pretending A solves multi-worker idempotency.

### Insights

- [x] **K-A12** Replace the account-profile substitute with a real account `/insights` request using the minimal confirmed day metrics for the controlled call.
- [x] **K-A13** Query media `/insights` for the newly published image using media-compatible confirmed metrics. Keep account and media metric sets separate.
- [x] **K-A14** Preserve missing/empty provider data as unavailable. Do not coerce an absent metric to zero, and do not require a non-zero result to call a successful provider response successful.
- [x] **K-A15** Persist the controlled snapshots through the existing workspace-scoped `InstagramAnalytics` path and verify another workspace cannot read or overwrite them.

### UI, tests, and evidence

- [x] **K-A16** Decide whether A uses a minimal Sunlit reconnect control or an operator-only route. If operator-only, label it temporary and keep the App Review UI gate open.
- [x] **K-A17** Update unit/integration tests for the exact host, version, scope set, storage driver, signed-URL redaction, publish result, insight response variants, and workspace isolation.
- [x] **K-A18** Run repository verification only against a disposable test database, never staging or production.
- [x] **K-A19** After Sarah deploys the expanded-scope build, disconnect/reconnect the test Instagram account so the new access token is issued for the expanded request. Completed on 2026-08-19; the stored connection recorded the canonical basic, publishing, and insights request set, and the reconnect consent screen exposed the two added capabilities.
- [ ] **K-A20** Conduct the approved live window: one JPEG publish, one account-insights call, and one media-insights call. Save sanitized timestamps, request IDs if safe, statuses, published-media evidence, and persistence evidence.
- [ ] **K-A21** Confirm modes return to `dry_run` and that no signed URL, token, provider ID, or customer data entered logs or committed artifacts.

### Second application pass — Content Studio

- [x] **K-A22** Mount the authenticated Content Studio flow at `/{locale}/app/content-studio`: generate through the existing AI text contract, edit English and Arabic captions independently while the item is `DRAFT`/`IN_REVIEW`, preserve the correct field and RTL direction, and save drafts repeatedly without discarding edits after a failed action. An explicit **Edit post** action now invalidates `APPROVED` and returns the item to `DRAFT` before any content or media changes.
- [x] **K-A23** Add authenticated browser-to-API JPEG upload with MIME/extension checks, a conservative 8,000,000-byte ceiling, browser preflight, server-inspected dimensions, workspace-scoped storage, and attachment to the active content item. Direct browser-to-Bucket upload is not part of A.
- [x] **K-A24** Show selected real media without a forced crop, provide compact media thumbnails plus truthful filename/dimension/size details, add expand/open-original controls, allow detaching media without deleting the underlying asset, and remove fabricated engagement metrics from the follower preview.
- [x] **K-A25** Mount aspect-ratio-aware image-concept generation for the draft while explicitly identifying the result as deterministic application artwork. This is useful showcase scaffolding, not evidence of a live provider-backed image-generation integration; that production integration moves to B.
- [x] **K-A26** Enforce explicit approval before scheduling, stop the UI from silently auto-approving a draft, and make a separately confirmed schedule cancellation return the item to `APPROVED` without deleting its content or media.
- [x] **K-A27** Add workspace-scoped media-asset deletion to the API and both local/S3 storage drivers, refuse deletion while an active content item references the asset, soft-delete the database record, and decrement metered storage bytes.
- [x] **K-A28** Cover the rendered generate → bilingual edit/save → JPEG upload → image concept → approval → scheduling → confirmed cancellation → reopen → confirmed draft deletion journey and the storage deletion boundary with browser, API, and driver tests.

### Third application pass — live-test stabilization

- [x] **K-A29** Keep media workspace-owned and workspace-prefixed. Override the public media proxy's cross-origin resource policy only on the media-file route so staging web origins can render the stable API URL without weakening global response headers.
- [x] **K-A30** Reject incompatible feed images before storage by inspecting JPEG structure and dimensions server-side; expose the same width, aspect-ratio, type, and size boundaries in Content Studio. Preserve framing in the preview and state truthfully that Instagram may recompress files and convert non-sRGB color to sRGB.
- [x] **K-A31** Add workspace-scoped soft deletion for a whole post draft. A scheduled item must be cancelled first; published Instagram content is not treated as a deletable draft. Cancellation and deletion each have a separate accessible confirmation, and deleting a draft does not delete workspace media assets.
- [x] **K-A32** Replace the schematic preview with a follower-style post card using the real workspace name, real media, real caption/hashtags, RTL direction when applicable, actual scheduled date only when present, familiar action icons, and no invented likes, counts, dates, categories, carousel controls, or owner-only Insights/Boost actions.
- [x] **K-A33** Verify the stabilization path with focused API integration tests on disposable seeded PostgreSQL/Redis and a rendered real-Chrome journey. Treat staging redeployment and provider fetch/publish results as separate unchecked evidence.

Pass 2 established the controlled browser workflow; the live staging check then exposed a cross-origin preview defect and lifecycle/presentation gaps that the third pass closed and redeployed in `df937b5`. On 2026-08-20, Khalid reported the first successful automated scheduled publish from the Railway worker and supplied follower-visible Instagram screenshots of the resulting JPEG post. This closes the basic publish result, but it does not establish durable attempt/lease/restart recovery. Provider-backed image generation, complete Queue/retry/failure behavior, permanent media cleanup, normalization/derivatives, Reels, and carousels remain Milestone B work.

Analytics was also reported as apparently running, with little or no engagement available yet. Zero is a valid provider value and does not itself indicate failure; K-A20/J-A06 remain open until one account-insights result and one published-media-insights result are confirmed in workspace-scoped persistence or equivalent sanitized request evidence.

Repository verification on 2026-08-18 used isolated loopback PostgreSQL and Redis containers only. After the complete Milestone A application, storage, and Content Studio stabilization change, `corepack pnpm verify` passed all 32 tasks: 46 API test files/290 tests (271 passed, 19 provider-gated skips), 5 web test files/20 tests, and 19 AI tests. The same run passed formatting, TypeScript/Python type checks, lint, and the 10-check Arabic/RTL gate. The rendered presentation and Content Studio journey also passed 5/5 browser tests against an isolated local Next server using the installed local Chrome. This is repository evidence, not Railway or live-provider evidence.

`corepack pnpm build` also passed all 9 build tasks. The separate registry-backed `corepack pnpm security:audit` gate is not green: it reported 36 advisories (28 high, 8 moderate), including 22 production-path advisories (16 high, 6 moderate) across existing toolchain, framework, infrastructure, and transitive packages. The report did not identify either newly added `@aws-sdk` package. Dependency remediation remains a separate reviewed change and must not be hidden before the showcase or a release.

## Showcase priority overlay — Wednesday, 2026-08-19

This overlay controls the remaining implementation order for the Thursday-noon showcase without changing the Milestone A acceptance boundary or reclassifying Milestone B work as complete.

1. **P0 — close the real Instagram loop:** complete the external signed-media gate, fresh reconnect, one JPEG publish, account insights, media insights, and sanitized evidence. The unreleased staging environment may retain the explicitly chosen live modes while active development/testing continues; record the actual mode rather than imposing an automatic dry-run rollback.
2. **P0 — real AI copy creation:** replace deterministic content-copy scaffolding with configured provider-backed bilingual caption, hashtag, and CTA generation through the existing retrieval, quota, persistence, and usage-accounting boundaries. Provider-backed image generation remains K-B04.
3. **P1 — scheduled-content visibility:** add a trustworthy draft/scheduled list or lightweight calendar using existing content and queue contracts. This is visibility and management only; durable timed execution remains K-B01/K-B05/S-B02/J-B01/J-B02.
4. **P1 — analytics visibility:** expose the existing sync/readiness boundary and honest empty/unavailable states after the first real sync. Do not expand this into the complete M4 Analytics Consultant surface before the showcase.
5. **P2 — targeted journey fixes:** prioritize draft discovery/selection, then small upload or contextual-guidance improvements only when they remove friction from the showcase path. Freeze broad onboarding and major visual redesign work until after the showcase.

Feature implementation freezes Wednesday evening. Thursday morning is reserved for exact-deployment verification, smoke tests, demo-data and fallback-evidence checks, and presentation-script rehearsal.

### Showcase execution checks

- [x] **K-S01 — Provider-backed AI copy source:** route content-copy generation through the configured text provider with a strict bilingual structured contract, grounded prompt inputs, exact content-type/count validation, provider token usage, and the existing local fallback. During the current quality-tuning phase, `OPENAI_STORE_RESPONSES=true` intentionally retains provider requests/responses for OpenAI API dashboard review; this must be revisited at the production privacy/retention gate. Focused local evidence on 2026-08-19 passed AI lint, AI typecheck, all 23 AI tests, and the 13 Content API integration tests. At Khalid's request, the broader Docker-backed verification run was stopped and is not claimed here.
- [ ] **K-S02 — Staging AI copy proof:** deploy K-S01, generate one real bilingual content draft from the browser with `AI_TEXT_PROVIDER=openai`, inspect the stored response in the correct OpenAI project dashboard, and confirm the saved draft, configured model, latency, and metered token usage without recording customer data or secrets in repository evidence. Local mocks and a configured environment do not prove this provider call.
- [x] **K-S03 — Draft and schedule visibility:** replace the four-record draft snippet with a bilingual, filterable workspace content pipeline covering all loaded records across Drafts, Ready, Scheduled, and Published stages. Show Bahrain-time schedule/update labels and state explicitly that a saved status is not proof of Instagram publication. Focused evidence passed web lint, web typecheck, and the one rendered create → schedule → Scheduled-filter → cancel browser scenario; the other four tests in that file were deliberately skipped.
- [ ] **K-S04 — Staging content-pipeline smoke:** after Railway service resumes and the branch is deployed, confirm the correct workspace's existing drafts and scheduled records appear under the expected filters and open the selected editor record. This does not close the durable publishing worker or complete-calendar work in K-B05/K-B06.
- [x] **K-S05 — Calendar MVP:** add Calendar as a bilingual/RTL primary destination with a week-first planner, compact month overview, next-action summary, unscheduled Draft/Review/Ready queue, Bahrain-time labels, media/status detail, editor handoff, scheduling, atomic scheduled/failed-item rescheduling, and separately confirmed cancellation. Keep saved MARKOS state distinct from provider-confirmed publication. Focused evidence on 2026-08-19 passed the one rendered Calendar scenario in desktop English and mobile Arabic/RTL; the other five presentation scenarios were deliberately skipped.
- [x] **K-S06 — Calendar schedule contract:** add workspace-scoped `POST /v1/content/:contentItemId/reschedule` for scheduled or failed content, clear a bounded prior failure on recovery, and move the monthly calendar index atomically without a schema migration. Cover the scheduled, failed, cross-workspace, and month-change boundaries in the focused Content API test.
- [ ] **K-S07 — Staging Calendar and AI smoke:** deploy the branch, confirm Calendar loads the correct workspace records and completes schedule → reschedule → confirmed cancellation, then generate one real bilingual content draft with `AI_TEXT_PROVIDER=openai`. Inspect the stored response in the correct OpenAI project. Required AI review: `AI_CONTENT_TIMEOUT_SECONDS`, `OPENAI_STORE_RESPONSES`, and `LLM_PRIMARY_MODEL`; Calendar itself adds no variable, migration, or service.

### Locked Create redesign — Thursday, 2026-08-20

- [x] **K-S08 — Create information architecture:** lock the two-state Create experience: a compact action hub when no item is selected, followed by one focused Draft Editor after a draft is created or opened. Keep manual creation and upload first-class; AI remains optional assistance.
- [x] **K-S09 — Manual blank draft:** add the workspace-scoped blank `POST /v1/content` path and **Start a blank post** action without Vault retrieval, an AI request, or AI quota/token usage.
- [x] **K-S10 — Create Home:** implement **Draft with MARKOS AI**, **Explore content ideas**, **Continue a draft**, and **Open Calendar** alongside the manual action. Suggestions stay ephemeral until selected, and supporting account/performance cards show only real data or honest empty states.
- [x] **K-S11 — Focused Draft Editor:** move the existing editable bilingual fields, hashtags, CTA, media, follower preview, lifecycle controls, and contextual AI assistance behind the selected-draft state without losing confirmed saves.
- [ ] **K-S12 — Real AI image path:** complete K-B04/J-B03 through the configured provider interface, quota/metering, moderation/error handling, durable workspace media, and the supported Instagram JPEG contract. Deterministic SVG concepts remain non-publishable scaffolding until replaced.
- [x] **K-S13 — Paid-plan quota range:** promote usage-counter values and limits to PostgreSQL `BIGINT` through a forward migration so the existing Premium and Enterprise storage allowances can be represented without lowering the plan catalog. Preserve JSON portability in the PDPL export and update affected counter assertions. Railway must apply the migration before reseeding/restoring the full plan limits; this adds no environment variable or service.

K-S09 through K-S11 passed focused API/web typechecks, changed-file web lint, the migration contract test, and formatting checks on 2026-08-20. The PostgreSQL-backed Content integration test and rendered browser journey remain delegated to CI for this pass, following the repository's focused-testing rule and the explicit request to avoid unnecessary local Docker work.

### Sarah's parallel zero-code journey review

This is product research and ideation, not Milestone A infrastructure work, implementation authorization, or a Thursday-showcase dependency.

- [ ] **S-R01 — Current journey map:** describe the owner journey from signup and verification through onboarding, Vault/profile approval, Strategy, content creation, scheduling, publishing, and insights. Identify avoidable steps, repeated questions, unclear transitions, likely abandonment points, and places where MARKOS asks for information before the user understands its value.
- [ ] **S-R02 — Progressive onboarding proposal:** propose a shorter first-run path that still captures the minimum trustworthy grounding needed for a useful first Strategy/content result. Separate **required now**, **helpful later**, and **learn progressively from use**, and explain how deferred information returns to the Vault without surprising the user.
- [ ] **S-R03 — Subsidiary feature ideas:** suggest supporting features that would materially save users time, increase confidence, or help them keep a weekly marketing habit. Rank ideas by user value, urgency, implementation effort/dependency, and whether they belong in onboarding, daily use, or a later milestone.
- [ ] **S-R04 — Review package:** return a concise current-versus-proposed journey, the five highest-value recommendations, assumptions/open questions, and any risks to grounding, privacy, workspace ownership, Arabic/RTL usability, or user trust. Use plain language and include no code, cloud configuration, schema proposal, or unapproved delivery promise.

## Sarah's Milestone A checklist

### Railway storage

- [x] **S-A01** D-02 was confirmed on 2026-08-17. Sarah reported that the staging Bucket is provisioned with its region selected.
- [x] **S-A02** Sarah confirmed that the Railway Bucket is private.
- [x] **S-A03** Sarah confirmed that the five Bucket credentials are connected to the API under the agreed application names and that the application-owned `AWS_S3_URL_STYLE=virtual` setting is present. No values are recorded here. The worker receives them later only when B deploys it.
- [ ] **S-A04** Confirm the API can upload/read/delete a disposable test object and that an unauthenticated external GET succeeds only through a short-lived presigned URL. Remove the disposable object after the check.
- [ ] **S-A05** Confirm bucket environment isolation and document the retention/lifecycle choice. Do not configure browser-upload CORS for A because the controlled upload can pass through the API.

Sarah first reported that a test image was visible in the Bucket. On 2026-08-18, Khalid then observed a successful staging browser-to-API upload and a working stable public API-proxy URL after the environment-name corrections. Commit `df937b5` subsequently redeployed the media-proxy header correction. That is useful upload/read/preview evidence, but it does not prove application-path object deletion or the provider-only presigned Bucket GET used immediately before Meta container creation, so S-A04 remains open.

### Database and environment safety

- [ ] **S-A06** Confirm the staging pgvector volume has a usable backup before the live window and record whether daily/weekly/monthly backup schedules are enabled. No restore is required.
- [ ] **S-A07** Confirm the deployed database's migration history, required extensions/roles, and application-role RLS without applying the clean baseline. Milestone A is expected to need no migration.
- [ ] **S-A08** If Khalid unexpectedly needs a schema change, review a forward migration and its workspace policy, take a pre-change backup, apply it through the approved pre-deploy path, and verify migration status. Never use `prisma db push` on the shared database.
- [ ] **S-A09** Update only in-scope Instagram/storage variables. Leave unrelated deferred variables such as Benefit and Google secrets untouched.
- [ ] **S-A10** Replace or remove legacy `META_GRAPH_BASE_URL`, `META_GRAPH_VERSION`, `META_APP_ID`, `META_APP_SECRET`, and `META_REDIRECT_URI` only after Khalid's corrected code no longer consumes them. Do not remove webhook-specific variables that still have a separate active consumer.

### Deployment and live window

- [x] **S-A11** Deploy the reviewed commit to staging with publish and analytics modes still set to `dry_run`; record the deployed commit and confirm web/API/AI/pgvector/Redis health. Commit `df937b5` was observed deployed with terminal-success service states on 2026-08-18; this does not substitute for S-A12 reachability/network validation.
- [ ] **S-A12** Confirm public web/API HTTPS reachability and private API-to-pgvector/Redis/AI networking. Keep real domains and connection strings out of committed evidence.
- [ ] **S-A13** Confirm outbound access from the API to `graph.instagram.com` and bucket storage without logging authorization headers or signed URLs.
- [ ] **S-A14** During the agreed controlled window, switch only the two provider modes needed for the test, restart the consuming service if required, and keep a rollback path ready.
- [ ] **S-A15** Watch deployment/application logs for sanitized stage, status, timeout, and request-correlation evidence. Stop the test if secrets, signed URLs, raw provider bodies, or customer data appear.
- [ ] **S-A16** Immediately return both modes to `dry_run` after the agreed evidence is captured and confirm the rollback deployment is healthy.

Sarah first reported that the pre-stabilization API deployed successfully after correcting two mistyped environment-variable names, with all listed services online and both provider modes still `dry_run`. The subsequent staging deployment was matched to `df937b5`, closing S-A11. S-A12 remains open until the public and private reachability checks are recorded explicitly.

## Joint handoffs and completion gates

- [x] **J-A01 — Variable contract:** Khalid supplied the exact new/retired variable-name matrix and conditional validation; Sarah confirmed the Railway references, API consumer, `AWS_S3_URL_STYLE=virtual`, exact Instagram version/scopes, and both dry-run modes without sharing values on 2026-08-17.
- [x] **J-A02 — Dry-run handoff:** Khalid supplied verified commit `df937b5`; it was pushed and matched to the staging deployment with both provider modes kept in `dry_run` before Meta reconnection.
- [ ] **J-A03 — Media-fetch gate:** Khalid supplies one disposable JPEG/object key; Sarah confirms durable storage and external signed fetch; Khalid confirms logs and API responses do not expose the signed URL.
- [x] **J-A04 — Reconnect gate:** Khalid reconnected the owned/managed test account and confirmed that the credential records the canonical three requested scopes. The consent screen showed publishing and insights options; this functional evidence does not replace later App Review/Advanced Access proof for external client accounts.
- [x] **J-A05 — Publish gate:** On 2026-08-20 the automated worker processed the due scheduled JPEG through the live publish path; the application path persists the returned media ID together with the `PUBLISHED` transition, and Khalid supplied follower-visible Instagram screenshots of the resulting post.
- [ ] **J-A06 — Insights gate:** MarkOS completes one account-insights and one published-media-insights request. Persisted data is workspace-scoped; empty/zero values are represented truthfully.
- [ ] **J-A07 — Safety gate:** the explicitly selected provider modes are recorded, staging is healthy, test evidence is handled according to policy, and no sensitive value is in Git or shared evidence. Live mode is permitted in this unreleased test environment while the team is deliberately exercising the automated pipeline.

Milestone A is complete only when J-A01 through J-A07 are checked. Deployment success by itself is not completion.

## Proposed work sequence for the current week

| Target | Khalid | Sarah | Joint gate |
| --- | --- | --- | --- |
| Sun 2026-08-16 | Lock the A boundary, deadline, operator path, and dashboard gate. | Staging was intentionally started and confirmed healthy; storage work remains paused. | Record the locked decisions and pending storage confirmation. |
| Mon 2026-08-17 | Correct host/version/scopes/readiness; start the storage adapter only after Sarah confirms its contract. | Confirm or replace the Bucket design, then provision/reference it if approved; confirm database safety. | Lock the storage decision and review the environment-name diff. |
| Tue 2026-08-18 | Hand off the verified application change and one disposable JPEG. | Validate bucket access, deploy in dry-run, and verify health/networking. | Environment matrix and external presigned-fetch gate. |
| Wed 2026-08-19 | Confirm the deployed commit, reconnect the test account, run the controlled publish/insights calls, and sanitize evidence. | Operate the live window, observe logs, and roll both modes back to dry-run. | J-A01 through J-A07 sign-off. |
| Thu 2026-08-20 | Present the already-verified browser journey and sanitized Milestone A evidence; keep provider modes in dry-run unless a separate live action is explicitly authorized. | Keep the showcase deployment healthy and retain the rollback target. | Showcase; no new acceptance work should be required. |

This schedule assumes no Meta dashboard identifier/access surprise. A missing `instagram_business_manage_insights` request option is a provider/dashboard blocker for that permission, not a reason to switch the app to Facebook Login or keep the legacy `graph.facebook.com` transport.

## Milestone B product, database, storage, and worker handoff

These are explicitly not required to close A, but they are the next database/runtime work after the controlled proof:

- [ ] **K-B01** Design a workspace-owned publish-attempt/container model with idempotency key, provider container ID, state, bounded error code, attempt count, next-attempt time, lease owner/expiry, and timestamps.
- [ ] **K-B02** Add a database uniqueness contract for analytics snapshot identity so overlapping worker/manual syncs cannot create duplicates.
- [ ] **K-B03** Add RLS policies and cross-workspace tests for every new workspace-owned table.
- [ ] **K-B04** Replace deterministic image-concept artwork with a configured provider-backed image-generation adapter. Meter usage, enforce plan quotas, validate output, handle moderation/provider failures, and keep honest fallback states.
- [ ] **K-B05** Connect approved schedules and cancellations to durable worker execution with timezone-safe dispatch and a cancellation boundary that prevents a canceled item from publishing during a worker race.
- [ ] **K-B06** Complete the Sunlit Queue and content-state surfaces for scheduled, publishing, retrying, failed, canceled, and published work instead of depending on one active editor record.
- [ ] **K-B07** Add product-facing permanent media-library deletion plus orphan reconciliation while preserving attachment/reference safety. Keep **Remove from draft** as detach-only, and decide separately whether direct browser-to-Bucket upload is worth its CORS and security surface.
- [ ] **K-B08** Add provider-compatible Reel and carousel creation, processing, validation, retry, preview, and cancellation behavior after the durable container lifecycle exists.
- [ ] **K-B09** Add an image-normalization/derivative pipeline if product evidence justifies it: validated decode/re-encode, metadata policy, color-space conversion, quality policy, source/derivative relationship, quota accounting, and deterministic cleanup. Do not silently transform source uploads in A.
- [ ] **K-B10** Calibrate preview fidelity against controlled published results across supported aspect ratios, compression-sensitive artwork, light/dark Instagram presentation, and Arabic/RTL captions. Add carousel navigation only when carousel publishing itself is supported.
- [ ] **S-B01** Review the forward migration against deployed history, take a backup, apply through pre-deploy, and verify application-role RLS.
- [x] **S-B02** Create the Railway worker service by following [`railway-worker-setup.md`](railway-worker-setup.md): deploy `apps/api/worker.Dockerfile` as one persistent replica, use only the documented PostgreSQL/Instagram/Bucket references, and complete the scheduled-publish smoke. Sarah reported successful deployment and periodic maintenance ticks; the first automated scheduled JPEG became follower-visible on 2026-08-20. OpenSearch is explicitly not required for the showcase because current source uses it only in the optional API deep-health report.
- [ ] **S-B03** Configure and validate the Bucket's retention/lifecycle, recovery, cost, and orphan-cleanup policy; configure direct-upload CORS only if K-B07 selects that design.
- [ ] **J-B01** Prove restart/retry behavior: stop the worker after container creation, restart it, and confirm exactly one final Instagram post.
- [ ] **J-B02** Prove one future approved item publishes at the intended time and one canceled item does not publish, including a cancellation close to the worker claim boundary.
- [ ] **J-B03** Prove one provider-backed generated image can be previewed, approved, stored durably, scheduled, published, and metered without exposing provider credentials or temporary media URLs.

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
| D-02 | Use a private Railway Bucket plus just-in-time presigned URLs as the Milestone A storage design. | **Locked 2026-08-17.** Sarah confirmed provisioning, privacy, API credential references, `AWS_S3_URL_STYLE=virtual`, and a test image in the Bucket; application-path operations and external presigned validation remain open. |
| D-03 | Complete Milestone A by Wednesday, 2026-08-19, for the Thursday showcase. | **Updated and locked 2026-08-17.** |
| D-04 | An operator-only publish/sync path is acceptable for A; the minimal Sunlit reconnect surface and complete visible review journey remain mandatory before C. | **Locked 2026-08-16.** |
| D-05 | Inspect the live Meta dashboard and resolve the generic App Review page's permission-name/list inconsistency before changing code constants or submitting permissions. | **Locked 2026-08-16.** This is an execution gate, not an open design choice. |
| D-06 | Create opens as an action hub, offers a first-class manual blank draft, and enters a focused editor only after a draft is created or selected; AI copy/image assistance stays optional. | **Locked 2026-08-20.** Implementation is tracked in K-S09 through K-S12. |

All Milestone A design decisions are locked. Continue with the unchecked Sarah, Khalid, and joint execution gates; do not treat repository implementation or variable presence as bucket, deployment, permission-grant, or live-provider proof.
