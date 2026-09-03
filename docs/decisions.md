# Decisions

## 2026-06-10: Canonical Documents

At that time, the project treated `MARKOS_BUILD_SPEC. 2.pdf` and `MARKOS_AGENTS. 2.0.pdf` as canonical over the other planning files. The agent PDF is now retired; this text records the historical rule rather than the current source contract.

> Superseded on 2026-08-16. The historical decision is retained for chronology; the current source contract is recorded below.

## 2026-06-10: Payments Precedence

The implementation plan references Stripe as primary, but the newer build spec supersedes it. Build Bahrain-first payment adapters for CrediMax and BENEFIT, with Stripe as international fallback.

## 2026-06-10: Model Names

Do not hardcode model names in code. Use environment variables and provider interfaces. The named models in source documents are planning examples, not code constants.

## 2026-06-10: Tailwind Major

Use Tailwind CSS 3.4.x for the initial Next.js 14 scaffold because the spec expects a conventional Tailwind config and token mapping. Revisit Tailwind 4 only if it removes friction without changing product behavior.

## 2026-06-10: Next Config Extension

Use `next.config.mjs` instead of the spec example `next.config.ts` because Next.js 14.2 rejects TypeScript config files in this environment.

## 2026-06-10: Brand Onboarding Writes Tone

The spec defines 7 onboarding modules but the Vault has 8 sections, including `TONE`. Treat the Brand module as the source for both `BRAND` and `TONE` when tone words or voice notes are supplied, so onboarding can complete the full Vault readiness score without adding an eighth wizard step.

## 2026-06-10: Public Media Registration Before Storage

Before building S3/CDN upload infrastructure, support workspace-scoped registration of external HTTPS media URLs and attach those media assets to content items. Publish readiness must verify attached media belongs to the same workspace and has an HTTPS public URL. Treat this as scaffolding for Instagram container readiness, not as final storage or publishing.

## 2026-06-10: Local Media Storage Adapter

Use a local filesystem media adapter for development uploads before wiring S3/CDN credentials. Store files under `MEDIA_STORAGE_DIR`, expose them through `/media-files/:workspaceId/:storedFilename`, and keep publish readiness requiring HTTPS public URLs so local HTTP uploads do not masquerade as Instagram-publishable assets.

## 2026-06-11: Instagram Publishing Starts As Dry Run

Build the publishing worker boundary as a dry-run adapter before enabling Meta Graph API writes. The dry-run path validates due time, workspace-scoped media, Instagram connection metadata, and payload shape, but does not mutate scheduled content to `PUBLISHED` or call Meta until OAuth, App Review, and the container -> poll -> publish adapter are implemented.

## 2026-06-11: Meta Graph Adapter Behind Live Flag

Implement the Meta Graph container -> poll -> publish adapter behind `INSTAGRAM_PUBLISH_MODE=live`, while keeping `dry_run` as the default. Live mode can mark content `PUBLISHED` only after Meta returns a published media ID, and records Meta adapter errors as `FAILED` content with a failure reason.

## 2026-06-11: Instagram OAuth Callback Lives In API

Use the API as the Instagram OAuth redirect target at `/v1/workspace/instagram/oauth/callback`, then redirect back to the localized web settings page. Keep manual token entry as a local-development fallback until production App Review credentials are available.

## 2026-06-11: Meta Dashboard Callback URLs

Expose API callback URLs for Instagram webhook verification, deauthorization, and data deletion so the Meta app can be configured during App Review. Verify webhook payload bytes with `X-Hub-Signature-256` and the Instagram App Secret before processing. Deauthorization and data deletion callbacks accept only a valid Meta `signed_request`; untrusted direct account identifiers cannot disconnect credentials.

## 2026-06-11: Instagram Token Refresh Starts Manual

Implement long-lived Instagram token refresh as an explicit workspace API action and settings control before adding a background scheduler. Meta callbacks disconnect workspace Instagram credentials only when the callback includes an account identifier that matches `instagramAccountId`; broader app-scoped user mapping requires a future schema field.

## 2026-06-11: Maintenance Worker Starts As Interval Polling

Run due publishing and Instagram token refresh from a small API-owned maintenance worker with configurable intervals. Defer a durable Redis queue until concurrency, retries, and volume require it; the worker still calls workspace-scoped services so tenant isolation remains enforced.

## 2026-06-11: Meta Callback Events Are Audited

Persist sanitized `AuditLog` entries for Instagram webhooks, deauthorization callbacks, and data deletion callbacks. Redact tokens and signed requests, and write workspace-scoped rows when callback account identifiers match stored workspace Instagram connections.

## 2026-06-11: Standalone Web Typecheck Uses Its Own Config

Use `apps/web/tsconfig.typecheck.json` for standalone web `tsc --noEmit` so typecheck does not depend on generated `.next` artifacts. Keep Next's main `tsconfig.json` compatible with `next lint` and `next build`; `next build` remains responsible for validating generated Next route types.

## 2026-06-11: AI Usage Quotas Reserve Before Generation

Reserve monthly `UsageCounter` quota before strategy and content generation calls, and refund the reservation if downstream generation or persistence fails. In M0, workspace quota limits come from the workspace owner's active plan JSON limits.

## 2026-06-11: Email Verification Starts With Local Token Delivery

Store email verification tokens hashed in Redis and expose the raw token only outside production so the M0 register -> verify -> login flow is testable before choosing a transactional email provider. Production responses omit the token.

## 2026-06-11: RLS Uses The Dedicated App Role First

Enable PostgreSQL RLS policies for workspace-scoped tables against the `markos_app` role, using `app.current_workspace` as the fail-closed tenant selector. Keep migrations and owner-level maintenance on the `markos` role, which bypasses RLS, and use transaction-local workspace context helpers when app-role RLS enforcement is needed.

## 2026-06-11: RBAC Starts With Workspace Route Permissions

Define named permissions in shared types and enforce them in the workspace middleware after resolving the current database membership role. Owners and workspace admins can manage the full workspace surface, editors can create and schedule operational content, viewers stay read-only, and admin support roles get read/audit access until the admin portal introduces narrower global scopes.

## 2026-06-11: Google Login Uses Backend ID Token Exchange

Implement Google login as an API endpoint that accepts a Google ID token, verifies it against Google's issuer, audience, and JWKS, then creates or links a verified workspace user. This completes the M0 backend auth contract while leaving provider button UX and Google client loading to the web layer.

## 2026-06-11: Sensitive Roles Require TOTP-Verified Sessions

Use built-in TOTP generation and verification for sensitive workspace/admin roles. Users enroll while authenticated, sensitive-role login requires a valid six-digit TOTP code once enabled, and refresh tokens carry an `mfaVerified` claim so pre-MFA sessions cannot refresh into admin or finance access.

## 2026-06-11: CI Boots Local Infrastructure With Docker Compose

Run GitHub Actions CI on Ubuntu with Node 22, Python 3.11, pnpm 11.5.2, and Docker Compose services for Postgres/pgvector, Redis, and OpenSearch. Apply Prisma migrations and seed plans before running `corepack pnpm verify` and `corepack pnpm build`.

## 2026-06-11: Observability Uses Sentry SDKs Disabled by Default

Wire Sentry SDK initialization into the Next.js web app, Fastify API, maintenance worker, and FastAPI AI service, controlled by DSN environment variables. Keep DSNs empty in local/test/CI so telemetry is disabled by default, and defer source-map upload/release artifact publishing until staging credentials exist.

## 2026-06-11: Usage Quotas Use Monthly Periods Except Storage

Track AI generations, AI images, strategies, and MARKOS post publishes in calendar-month usage periods. Track storage bytes in one lifetime period because storage is an active allocation rather than a monthly-reset consumption metric.

## 2026-06-11: Paid Usage Requires Active Billing State

Allow usage reservations only for `TRIAL` users with an unexpired trial and `ACTIVE` users. Block `PAST_DUE`, `SUSPENDED`, `CANCELLED`, and expired `TRIAL` states before counters move, returning explicit billing status errors for API calls and blocked publish attempts for workers.

## 2026-06-11: Usage Resets Run in the Maintenance Worker

Run automated usage reset preparation from the API maintenance worker on a configurable interval. The worker idempotently creates current-month counters at zero for monthly metrics and leaves `STORAGE_BYTES` on its lifetime period because storage is an active allocation, not a monthly consumption reset.

## 2026-06-11: Staging Deploy Starts With GHCR Images and Optional ECS Rollout

Build production-shaped containers for the web, API, worker, and AI services on every merge to `main`, publish them to GitHub Container Registry, and roll ECS services only when the GitHub `staging` environment has AWS deployment variables configured. Keep the M0 live-staging acceptance item open until a real cloud target and credentials prove the rollout.

## 2026-06-11: Strategy PDF Export Follows Existing API Naming

Expose strategy PDF downloads at `GET /v1/strategy/:strategyId/pdf` instead of the spec shorthand `/strategies/:id/pdf` so the export route stays consistent with the existing singular `/v1/strategy` and `/v1/strategy/generate` resource naming.

## 2026-06-14: Billing Checkout Starts With Dry-Run Bahrain Gateway Adapters

Implement CrediMax, BENEFIT, and Stripe as typed payment adapter boundaries that create dry-run checkout references while persisting real invoice and payment rows. Keep live merchant credentials, certification, and hosted-payment callbacks open until the Bahrain payment accounts are available.

## 2026-06-14: Bahrain VAT Rounds To Nearest Fil

Calculate BHD billing amounts in integer fils only. For exclusive VAT, add 10 percent VAT to the plan net amount; for inclusive VAT, derive net from gross using nearest-fil integer rounding and store the VAT residual so `netMinor + vatMinor = grossMinor`.

## 2026-06-14: Checkout Capture Activates The Subscription Atomically

Create a `TRIALING` subscription at checkout time and link the draft invoice to it, then capture dry-run payments in one transaction by marking payment `CAPTURED`, invoice `PAID`, subscription `ACTIVE`, and the owner user plan status `ACTIVE`. Treat repeated capture calls as idempotent so payment callbacks can be safely retried.

## 2026-06-14: Metered Usage Uses The Same Hard Quota Guard As Reservations

Enforce plan limits for both pre-reserved usage and post-response metered usage. AI token counters now atomically check the active plan limit before incrementing; if output tokens exceed quota, the generated artifact and AI interaction are rolled back and the pre-reserved generation count is refunded.

## 2026-06-14: Prisma Seed Loads API Env Defaults

Import the API environment bootstrap in `apps/api/prisma/seed.ts` so local and CI seed runs receive the same default `DATABASE_URL` behavior as the Fastify app.

## 2026-06-14: Prorated Upgrades Preserve The Current Billing Period

Charge upgrades only for the remaining-period price difference in integer BHD fils. A prorated upgrade creates a pending target subscription through the current subscription period end; payment capture cancels the previous active subscription, activates the target subscription, and preserves the billing period boundary. Downgrades are rejected until an explicit downgrade or cancellation flow is designed.

## 2026-06-14: Platform Admin Permissions Are Separate From Workspace Ownership

Keep global admin operations behind `admin:read` and `admin:manage` instead of granting them to ordinary workspace owners. `SUPER_ADMIN` and `PRODUCT_ADMIN` can edit global plan limits; support, finance, and readonly admin roles can read admin surfaces without mutating plan configuration.

## 2026-06-14: Admin Plan And Prompt Mutations Are Audited

Write audit log rows for plan-limit edits and prompt template create/update operations in the same database transaction as the mutation. Plan limit edits preserve the existing plan price, currency, and active state, and only merge validated non-negative integer limit keys into `plans.limits`.

## 2026-06-14: Admin Gateway Readiness Starts Read-Only

Expose gateway readiness in the admin portal before allowing gateway credential mutation. Gateway readiness reports missing credential and callback-secret environment keys; live gateway credential storage remains external until merchant accounts and certification details are available.

## 2026-06-14: VAT Invoice Downloads Use Workspace-Scoped PDFs

Expose VAT invoice downloads at `GET /v1/billing/invoices/:invoiceId/pdf` behind `billing:read`. The generated PDF renders the stored invoice amounts in BHD fils, the VAT rate and pricing mode, payment evidence when available, and current tax-profile gaps as explicit notes until seller VAT number and reverse-charge customer VAT ID fields are added.

## 2026-06-14: VAT Compliance Verification Is Code-Backed Per Invoice

Expose `GET /v1/billing/invoices/:invoiceId/vat-compliance` behind `billing:read` so each workspace-scoped invoice can be checked against the supported Bahrain VAT rules before launch. Keep seller VAT registration number, customer VAT ID, reverse-charge handling, and live gateway receipt attachment as operational launch caveats until those external inputs are available.

## 2026-06-14: Bahrain Plan Launch Requires A Local Gateway

Treat Starter and Growth as Bahrain-live only when their BHD plan catalog is active and at least one local gateway, CrediMax or BENEFIT, is configured with credentials and webhook secret. Stripe can remain an international fallback, but it does not close the Bahrain local launch gate by itself.

## 2026-06-14: Model Settings Are Global Admin Configuration

Store editable model slots in a global `model_settings` table keyed by approved environment-style names such as `LLM_PRIMARY_MODEL` and `IMAGE_MODEL_PRIMARY`. Runtime AI gateway calls resolve the database value first and fall back to environment defaults, so admins can change active models without deploy. Model setting updates require `admin:manage` and write `MODEL_SETTING_UPDATED` audit logs with previous and next values.

## 2026-06-14: PDPL Data Rights Are Workspace-Scoped

Implement Bahrain PDPL export and erasure as workspace-scoped owner/admin actions. Export returns active workspace data plus audit evidence. Erasure soft-deletes workspace-owned records that support `deletedAt`, hard-deletes workspace-owned tables without `deletedAt` such as usage counters and Vault history, clears Instagram credentials, preserves audit logs, and anonymizes the owner user only when no active memberships remain.

## 2026-06-17: Health Checks Fail Fast By Dependency Class

Use separate deep-health timeouts for database, Redis, and HTTP dependencies. Internal dependencies get enough time to avoid false negatives during cold local checks, while OpenSearch/AI HTTP checks fail fast so unavailable optional services do not stall `/v1/health/deep` or readiness performance evidence.

## 2026-06-17: OpenTelemetry Core Is Patched By Workspace Override

Pin `@opentelemetry/core` to `2.8.0` through `pnpm-workspace.yaml` overrides because Sentry 10.57.0 resolves a vulnerable `2.7.1` transitive version and the Sentry/OpenTelemetry peer range accepts the patched 2.x package. Keep the override until Sentry resolves to a patched OpenTelemetry version without pinning.

# Instagram OAuth security foundation (2026-07-29)

- At this foundation milestone, Instagram Login requested only `instagram_business_basic`; Facebook Login and Page discovery were intentionally excluded. The provider separation remains active, while the requested-scope subset is superseded by the 2026-08-17 Milestone A contract below.
- Access tokens use randomized AES-256-GCM envelopes. OAuth state uses a short-lived HMAC-protected payload plus an atomic, persisted nonce consumption record so it remains single-use across API instances.
- Requested scopes and provider-confirmed scopes are stored separately because consent requested by MarkOS is not evidence of what the provider actually granted.

## 2026-07-29: Instagram basic connection lifecycle

The active Settings connection uses the persisted encrypted credential record as its only source of truth. Provider profile reads are capped at six owned media items, provider-confirmed scopes remain empty unless Instagram explicitly returns confirmation, and external account IDs are unique across workspaces. Legacy workspace credential columns remain for compatibility but the new OAuth path never writes them.

## 2026-07-29: Instagram identity and ownership release hardening

Instagram Login's stable professional-account identity is the documented `user_id`, paired with `username`; `id` is not treated as interchangeable. Active `(provider, providerAccountId)` ownership remains globally unique, while disconnect deletes the credential record and releases that identity for a later authorized connection. New Instagram tables use the repository-standard `app_current_workspace_id()` RLS context and explicit `markos_app` grants.

## 2026-07-29: Instagram callbacks use transaction binding

The web app and API use bearer tokens stored by the browser client rather than an API-origin server session, and Instagram returns to a public API callback. The callback therefore uses transaction binding, not independent returning-browser authentication: only an authenticated member with `instagram:manage` can create the signed, expiring state and persisted nonce; atomic nonce consumption maps the callback back to that initiating user and workspace before any provider exchange. A different browser session cannot redirect the result to its own workspace because the callback accepts no workspace input and persistence uses only the integrity-protected transaction binding. Callback query values are stripped from application URLs and error telemetry. A future server-session design may add returning-browser binding, but this slice does not claim it.

The business-basic implementation at this date consumed `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `INSTAGRAM_GRAPH_VERSION`, `INSTAGRAM_TOKEN_ENCRYPTION_KEY`, and `INSTAGRAM_OAUTH_STATE_SECRET`. Its authorization, short-token, long-token, refresh, and Graph hosts were constrained in code, and its permission subset was exactly `instagram_business_basic`. The scope subset is superseded by the 2026-08-17 Milestone A contract; the host and security boundaries remain.

At this date, `INSTAGRAM_OAUTH_SCOPES` was an inert compatibility input for the connection flow. The 2026-08-17 Milestone A contract supersedes that behavior: it now drives a constrained allowlisted authorization request and requested-scope persistence. `INSTAGRAM_OAUTH_AUTHORIZE_URL`, `INSTAGRAM_OAUTH_TOKEN_URL`, `INSTAGRAM_LONG_LIVED_TOKEN_URL`, and `INSTAGRAM_REFRESH_TOKEN_URL` remain inert compatibility inputs; active clients constrain their hosts in code. Secure refresh still delegates to `InstagramBasicClient`, whose refresh endpoint is constrained in code.

## 2026-07-30 — Encrypted Instagram credentials are the only active credential source

Publishing, analytics, readiness, scheduled refresh, Meta deauthorization, and workspace erasure resolve Instagram connections through `instagram_connection_credentials`. Provider adapters may receive a transient workspace-shaped value only at the authorized provider-call boundary; no active consumer reads or writes legacy plaintext workspace token columns. The legacy columns remain nullable for migration compatibility and are cleared during disconnect/erasure. CI uses a disposable `markos_ci_test` database and test-only encryption/OAuth values so encrypted integration suites execute without Meta access.

## 2026-08-02: Local API Environment Loading Is Explicit

Load an optional repository-root `.env` from the API environment module for local API, worker, and seed entry points, while preserving already-injected process variables. Keep Prisma CLI migrations, Next.js environment files, Docker build arguments, GitHub Actions variables, and Railway runtime variables as separate explicit contracts. Treat an empty optional `MEDIA_PUBLIC_BASE_URL` as absent and fall back to the public API media route for the business-basic connection milestone.

## 2026-08-03: Instagram Login professional identity comes from the token-authenticated profile

For Instagram Login, retain the authorization-code exchange `user_id` only as a required response field from the exchange contract. Retrieve `/me` with the access token derived from that validated callback, request the documented `user_id` and `username` fields, and persist `/me.user_id` as the professional account `providerAccountId`. Do not request `/me.id` or compare identifiers across the exchange and profile responses: Meta documents the exchange value as an Instagram-scoped user ID and `/me.user_id` as the Instagram professional account ID, but does not explicitly guarantee equality between either value and `/me.id`. Production has also shown that the previously required exchange `user_id === /me.id` equality rejects a legitimate authorization. No client-supplied account ID needs comparison because the profile is obtained directly from Meta with the exchanged token. Facebook Login for Business uses a different discovery contract (Facebook User token -> Pages -> `instagram_business_account.id`) and is not interchangeable with this flow.

Official contract references:

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
- https://developers.facebook.com/docs/instagram-platform/reference/me

## 2026-08-03: Instagram OAuth diagnostics terminate at route boundaries

Use one typed, low-cardinality diagnostic taxonomy across Instagram OAuth start, callback security, provider exchange/validation, atomic credential persistence, secured post-write reads, redirect completion, and connection status. Lower layers annotate and rethrow without logging; the owning request boundary emits exactly one sanitized terminal failure. Emit only start and fully completed callback success lifecycle events. Allowlist provider status/type/numeric codes and recognized Prisma codes, never raw errors, metadata, queries, URLs, secrets, state, tokens, or identities. Preserve the existing transaction and security controls while tracking the active inner persistence operation so rollback does not erase the diagnostic stage.

## 2026-08-03: Instagram credential keys use one canonical contract

`INSTAGRAM_TOKEN_ENCRYPTION_KEY` must be canonical Base64 that decodes to exactly 32 bytes. Environment parsing checks the decoded length when the optional value is present; the credential boundary additionally round-trips the value to enforce canonical Base64 before AES-256-GCM encryption or decryption. A variable being present is not configuration readiness. Missing or invalid configuration must remain a non-retryable sanitized OAuth diagnostic and must never print the key, decoded bytes, ciphertext, IV, or authentication tag.

The production incident that established this operational lesson was classified only as `credential_configuration` / `encryption_key_invalid` / `retryable: false`. Replacing the invalid value through the external secret manager allowed a fresh connection to succeed. No credential value or derivative belongs in repository documentation or evidence.

## 2026-08-03: A production connection does not activate adjacent Instagram scope

Treat the 2026-08-03 production business-basic OAuth success as completion of the first real professional-account connection milestone only. It proves the connection path for that attempt; it does not activate or verify publishing, insights, App Review, full-lifecycle refresh, provider-side revocation, or launch readiness. At that date the client requested exactly `instagram_business_basic`. The coordinated 2026-08-17 Milestone A code, dashboard, environment, and test change supersedes the requested-scope behavior, but deployment, reconnect, and external provider evidence remain required.

## 2026-08-03: Railway is the early-stage operating platform

Use Railway as the current early-stage deployment direction, with an approximate planning horizon through the first 50 users while capacity, reliability, and security are observed. This does not approve or schedule a migration at a numeric threshold. AWS remains a possible later expansion or migration direction.

## 2026-08-04: Instagram disconnect does not depend on provider confirmation

Instagram Login with `instagram_business_basic` has no documented server-side permission-revocation operation equivalent to the Facebook Login revoke flow. A controlled live call to the previously assumed versioned `graph.instagram.com` `/me/permissions` edge was rejected with HTTP 400, provider type `IGApiException`, code 100, and subcode 33. Do not retry that unsupported operation or describe it as pending provider propagation.

When a workspace disconnects Instagram, atomically delete the local encrypted credential, legacy credential fields, and bounded recent-media cache, record the sanitized outcome in the disconnect audit, and return `ACTION_REQUIRED` with Instagram's Apps and websites URL. The UI must tell the user to select **Remove** next to MarkOS AI-IG. A controlled Railway test on 2026-08-05 verified that this manual action moved MarkOS AI-IG from Instagram's Active list to Removed and caused Meta to call the configured deauthorization endpoint.

That live callback reached MARKOS but failed signed-request verification with HTTP 403. Successful deauthorization callback verification, correlated audit completion, former-token invalidation, and live data-deletion delivery are therefore deferred follow-up work rather than part of this disconnect task's completion claim.

Disconnect is not workspace-data erasure. Preserve generated/imported content, publishing history, analytics, and Knowledge Vault learning until the user invokes the separate workspace erasure controls. OAuth authorization URLs disable Facebook Login and force Instagram authentication so a connect or reconnect attempt can use a different professional account. Successful signed callback verification, data-deletion delivery, and former-token invalidation remain controlled live-provider verification gates; local and mocked tests cannot close them.

The existing GHCR image pipeline, optional ECS rollout, placeholder CDK stack, and build specification's AWS target remain useful future references, but they are not evidence that AWS is the current runtime. Exact Railway project, environment, service, networking, and variable state remains externally managed and must be inventoried in Railway before it is described as current fact.

## 2026-08-05: Instagram disconnect logs each external-operation stage

Emit sanitized, structured lifecycle records for the workspace Instagram disconnect request, credential lookup, required provider-removal action, local cleanup, and terminal completion. Log the inbound Meta callback request, content-type category, payload parsing, signature verification, credential lookup, local cleanup, audit persistence, and terminal completion under its API request ID. Retain only low-cardinality allowlisted outcomes; never log tokens, encrypted credentials, raw provider bodies, URLs, account or workspace identities, signed requests, raw headers, or raw errors. Logging failure must not alter disconnect or callback behavior.

## 2026-08-05: Deauthorization accepts strict raw and multipart signed-request envelopes

Sanitized Railway evidence from the controlled removal showed two adjacent Meta requests: a form-encoded data-deletion callback completed HMAC verification and returned HTTP 200, while the deauthorization callback used a non-form content type and failed signed-request verification with HTTP 403. Because both paths use the same base64url/HMAC implementation and `INSTAGRAM_APP_SECRET`, treat the deauthorization failure as a request-envelope parsing/encoding incompatibility rather than weakening cryptographic verification or adding a second secret.

For Meta callback media types handled as raw text, normalize only an exact two-segment base64url value into the existing `signed_request` field shape. Continue accepting the existing JSON and form shapes, and continue rejecting missing, malformed, or tampered signatures with HTTP 403 before any credential lookup or cleanup. Emit only an allowlisted verification-failure category so a controlled retry can distinguish envelope, configuration, signature, payload, and identity failures without recording secrets, signed requests, bodies, headers, or account identities. Data-deletion product behavior and live completion remain separate follow-up work.

The first live retry after adding the raw-envelope fallback still produced HTTP 403 with `signed_request_missing`; sanitized telemetry showed that Meta used a media type outside URL-encoded form, JSON, plain text, and a raw two-segment token. Accept the remaining standard form envelope, `multipart/form-data`, only when a valid boundary contains exactly one non-empty field named `signed_request`. Keep the same HMAC verification and add allowlisted `multipart` and `octet_stream` media categories.

A subsequent controlled Railway retry confirmed that Meta delivered multipart form data. MARKOS completed signature verification, matched the stored credential, completed local cleanup and audit persistence, returned HTTP 200, and refreshed Settings to Disconnected without any rejected callback stage. This verifies signed deauthorization handling in the Railway test environment; it does not verify former-token invalidation or end-to-end data-deletion behavior.

## 2026-08-04: Browser sessions use cookie-backed silent renewal

Keep refresh tokens in a path-scoped `httpOnly` cookie and keep access tokens only in the browser's in-memory Zustand session store, as required by the build specification. Persist token-free user, workspace, and role identity metadata only so the app can distinguish a returning expired session from a visitor. Authenticated API requests renew only after the precise `INVALID_TOKEN` response, retry once, and preserve the session on temporary network or server failures. Serialize refresh requests with the browser Web Locks API so tabs sharing the rotating cookie do not reuse a token concurrently. A terminal refresh failure clears the browser identity and sends the user to localized login; successful forced reauthentication lands on `/{locale}/app/settings#profile`.

## 2026-08-05: Strategy is the first provider-backed AI vertical slice

Use the existing Strategy flow for the first real provider integration because it already joins workspace-scoped Vault retrieval, prompt selection, quota reservation, artifact persistence, AI interaction records, and token metering. Keep the other generation routes deterministic until each receives its own typed provider contract and focused acceptance criteria.

Call OpenAI through a narrow Python adapter using the Responses API and strict Structured Outputs. Select the provider with `AI_TEXT_PROVIDER`, keep `local` as the safe development default, resolve the long-form model through configuration, disable provider-side response storage, and record the provider-returned model and token usage. Treat Vault chunks and optional database prompt templates as data, not instructions, and do not send the workspace identifier in provider prompt text.

Generate Strategy content in the explicitly requested `ar` or `en` locale within the existing single-language Strategy schema. Do not expand the product contract to duplicate every field bilingually without a separate product decision. Enforce the shared internal bearer token on all non-health AI routes, bound both API-to-AI and provider calls with timeouts, and expose only sanitized typed errors.

The adapter and fake-client tests are implementation evidence, not live-provider evidence. The first real-key smoke test must use synthetic non-client context, run only after the code path is green, and avoid printing the credential or raw provider payload. `costMinor` remains zero until model pricing and currency conversion have a reviewed implementation; actual token metering does not by itself complete cost governance.

## 2026-08-06: TOTP enrollment QR codes render locally

Treat the authenticated API's `otpauthUri` response as the sole input for the MFA enrollment QR code. Render that value as an SVG inside the browser instead of sending the URI or TOTP secret to an external QR service. Keep the manual setup key visible and copyable during enrollment as an accessibility and recovery fallback, and remove both the QR code and secret from the Settings surface after successful enablement.

Accept exactly six numeric verification digits in a high-contrast, one-time-code input before calling the existing enable endpoint. This presentation decision does not change the role-based MFA policy, enrollment secret lifecycle, login challenge, or backend verification contract.

## 2026-08-06: Onboarding persists only disclosed business answers

Use the seven canonical onboarding modules in the experience flow—Company, Products, Story, Audience, Competitors, Brand, and Objectives—followed by a non-generative review screen. Products appears second because it is the other essential input for the first profile; the module names and persistence contract do not otherwise change. Prefill only the authenticated workspace name. Choices, examples, placeholders, color palettes, and option lists may guide the user, but they must not become stored business facts until the user selects or enters them.

Retire the fixture-backed `markos.onboarding.draft` browser key and begin with the versioned `markos.onboarding.draft.v2` key. This intentionally discards old Zain-based drafts. Remove the simulated social connection screen, generated-content counts, readiness percentage, and hidden payload values. A validation or API failure keeps the draft locally and blocks forward navigation; completing onboarding clears the versioned draft only after the API confirms completion.

## 2026-08-06: Workflow notifications appear at the top

Use an accessible fixed top notification for Settings and onboarding workflow feedback instead of appending low-visibility messages after page content. Success and informational notifications dismiss automatically after six seconds and remain manually closable; errors and warnings remain until dismissed so consequential failures or required third-party actions are not lost. Preserve an inline action when the workflow requires the user to continue on an external provider page.

## 2026-08-06: Onboarding completion requires an approved resolved profile

Supersede the earlier non-generative final review with one narrow onboarding orchestration step. After all seven canonical modules reach 100% Vault completeness, a verified user may ask MARKOS to resolve those raw answers into a bilingual draft business profile. This is an internal onboarding profile resolver, not a ninth public agent; the eight-agent product taxonomy remains unchanged.

Keep the raw onboarding entries as the source record. Store each generated draft and its token usage in the workspace-scoped AI interaction history, allow the owner to edit both Arabic and English, and write only the approved version to `COMPANY/business-profile`. Mark onboarding `COMPLETE` only after approval. Editing a canonical onboarding module invalidates the current resolved profile and returns the workspace to `IN_PROGRESS`, while preserving prior generated and approved interactions as history.

Use the configured long-form model through the protected API-to-AI boundary, strict Responses API JSON Schema output, provider-returned token metering, and the existing `AI_GENERATION` quota. Disable provider-side response storage and emit only sanitized lifecycle diagnostics: schema name, model, terminal category, status code, cause type, request-ID presence, and token counts. Never log prompts, Vault values, provider bodies, credentials, raw errors, or workspace identities.

## 2026-08-11: Sunlit Social Studio Is The Active UI Direction

Adopt the bright, warm "Sunlit Social Studio" direction in `docs/ui-design-foundation.md` for future MARKOS UI work. It replaces the dark "AI Marketing Command Center" export as the active visual reference, but does not replace the authoritative product behavior in the build spec or experience flows.

## 2026-08-12: Sunlit UI Uses Only Canonical Product Routes

Mount the adopted Sunlit marketing, authentication, verification, and legal surfaces directly at the localized canonical routes. Remove the `/design-preview` route family, duplicate dark public/authentication components, preview-only Settings surface, and preview terminology rather than maintaining a fallback UI or compatibility redirects.

Preserve application behavior during the cutover: email/password signup and login call the typed API client, refresh tokens remain in the existing HTTP-only cookie flow, unverified users are sent to verification, successful token verification renews the session and resumes onboarding, and MFA login reveals the six-digit challenge when required. Keep Google, Apple, forgot-password, and reset-password controls honest and unavailable until their complete provider or API contracts are implemented; visual presence is not evidence that those capabilities are live.

## 2026-08-12: Sensitive settings use a fixed 15-minute MFA step-up

Represent recent MFA assurance with an absolute `mfaVerifiedUntil` Unix timestamp in the access token, refresh token, and browser session contract. A successful TOTP challenge creates a 15-minute window. Refresh-token rotation carries the original deadline without changing it, so returning from Instagram OAuth does not force a second challenge and repeated refreshes cannot turn the window into a sliding session.

Keep role-required login assurance separate from recent-action assurance. Roles that require MFA may continue refreshing an authenticated session after the action window expires, but endpoints marked `mfaRequired` check the unexpired absolute deadline and require a new TOTP step-up for sensitive Instagram changes.

## 2026-08-12: Settings is standalone and app pages are task-first

Render `/{locale}/app/settings` outside the main application shell. Use one internal settings menu, keep the locale control in the page header, and return to the last recorded main application route or Overview. Group account and workspace identity, connected accounts, security, billing, and data/activity by user task; show one compact Instagram account preview instead of reproducing its media feed.

Use compact page introductions throughout the primary app and prioritize live state, decisions, and controls in the first viewport. Oversized static hero panels are a marketing pattern and should not consume the working area of Overview, Strategy, Create, Insights, or Business Profile.

## 2026-08-16: Active sources replace the original planning set

Use the root `AGENTS.md`, `docs/source/MARKOS_BUILD_SPEC. 2.pdf`, and `docs/source/MARKOS_EXPERIENCE_FLOWS.md` as the active instruction, structural, and behavioral source set. Use `docs/project-status.md` as the dated implementation/evidence overlay; it does not change target behavior by itself.

The original PRD, implementation plan, cost model, Figma design document, and PDF copy of the old agent instructions were compared with the active sources before retirement. Preserve them under `docs/archive/source/` as non-normative history. Do not copy their time-sensitive pricing, model, AWS, Facebook-Page, permission, or provider-limit assumptions into current work without renewed research. The build specification's PRD reference map, the active experience flows, the Sunlit product-surface inventory, and the Bahrain operational runbooks retain the requirements that still govern the final system.

## 2026-08-16: Sunlit cutover does not reduce final product scope

PR #19 intentionally replaced the previous public and authenticated presentation with Sunlit Social Studio and retired the temporary `/design-preview` route family. Deleting the old dark panels during that cutover did not remove their underlying capabilities from the build-spec target.

Treat the missing full operational surfaces recorded in `docs/ui-design-foundation.md` as deferred Sunlit restoration or reimplementation work, not as intentionally removed product scope. Do not blindly restore deleted components from Git history: use their behavior only as evidence, then implement the current API, session, workspace, accessibility, and Sunlit contracts. A redirect from an old route to a smaller current surface is compatibility behavior, not proof that the original capability has been replaced.

## 2026-08-16: Strategy horizons distinguish target from current validation

The intended final product offers 30-, 60-, and 90-day Strategy generation. Which horizons belong to which plans remains a product decision. A 7-day Strategy is a possible future option, not an accepted contract yet.

Current source exposes 30/60/90 choices in the Sunlit Strategy UI, defaults that UI to 30 days, and validates any integer horizon from 30 through 180 days at the shared API boundary. Do not describe 7-day generation as implemented; adding it requires an explicit validation, provider-contract, quota, plan, UI, and test change.

## 2026-08-16: Graph v25.0 is provisional configuration

MARKOS has one Instagram product integration, but current source separates the Instagram Login/account client settings from the publishing/analytics adapter settings. This is a transport/configuration split, not a claim that the product uses two unrelated integrations.

Use v25.0 provisionally for both version defaults because it is the only visible version in the supplied Railway snapshots and is the current working choice. This is not an API-research conclusion. Before enabling either remaining permission, verify the correct hosts, version placement, endpoints, fields, media requirements, metrics, review contract, and migration implications against current authoritative Meta documentation and the real dashboard.

## 2026-08-17: Milestone A locks one Instagram Login application contract

Supersede the provisional repository transport split for the Milestone A application implementation. Request the canonical ordered set `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_insights`; reject duplicates, unknown permissions, missing basic, and Facebook Login permission names. Persist the requested set on a fresh connection, expose it separately from provider-confirmed scopes, and never infer provider confirmation from the authorization request alone.

Use fixed `https://graph.instagram.com/v25.0` versioned calls for Instagram account, publishing, and insights operations. Publishing and insights send the access token in the bearer header, bound provider calls by timeout and response size, and expose only sanitized application error codes. Retire the publishing/analytics `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, `META_GRAPH_BASE_URL`, and `META_GRAPH_VERSION` inputs from application readiness; retain the separately consumed webhook verification token.

For the controlled Standard Access proof, publish exactly one validated JPEG through an item-specific, MFA-protected operator route. Use only a process-local duplicate guard for this manual window and keep durable leases, restart recovery, Reels, carousels, and worker scheduling in Milestone B. Account insights use `reach,profile_views` with `period=day`; media insights use `shares,comments`. Preserve absent provider metrics as unavailable and explicit numeric zero as zero throughout persistence, summaries, UI, PDF, and Vault learning.

This decision does not establish provider-granted permissions, deployment, reconnect, live publish/insights success, or App Review. The private Railway Bucket and just-in-time signed-URL design was still pending at the time of this application-contract decision and is superseded by the storage decision below.

## 2026-08-17: Milestone A uses a private Railway Bucket and provider-only signed reads

Use a private Railway Bucket through its S3-compatible interface for Milestone A media. Retain the local filesystem driver for local development. Stored object keys are workspace-prefixed, application-generated, non-overwritable, and persisted as stable `s3:` keys; the ordinary API-facing media URL remains a stable authenticated/application proxy URL rather than a signed bucket URL.

Generate a fresh presigned GET URL from the stored key immediately before Meta image-container creation. Never persist, return to ordinary clients, or log that URL. Configure the API through Railway references to the Bucket-generated `AWS_ENDPOINT_URL`, `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_S3_BUCKET_NAME`, and `AWS_DEFAULT_REGION` credentials. Set the application-owned values `MEDIA_STORAGE_DRIVER=s3` and `AWS_S3_URL_STYLE=virtual`; constrain `SIGNED_URL_TTL` to 300–86,400 seconds with 3,600 seconds as the Milestone A starting value. `MEDIA_PUBLIC_BASE_URL` remains optional when `API_BASE_URL` is the canonical public HTTPS API origin.

Sarah reported on 2026-08-17 that the private Bucket exists, its five credentials are wired to the API, `AWS_S3_URL_STYLE=virtual` is set, and a test image is visible in the Bucket. That operator report does not yet prove application-path upload/read/delete, retention/backups, an external presigned read, deployment of the reviewed application commit, or Meta fetchability. Those remain infrastructure and joint live-verification gates. Direct browser-to-Bucket upload/CORS, lifecycle cleanup, worker credentials, and durable publish attempts remain Milestone B work; browser-to-API upload is part of the application flow.

## 2026-08-18: Content media and post drafts remain workspace-owned with separate lifecycles

Store media under workspace-prefixed object keys and keep `MediaAsset` ownership at `workspaceId`. A user's or workspace member's identity may be recorded later as attribution/audit metadata, but it must not become the storage ownership boundary or permit an asset to cross workspaces.

Treat **Remove from draft**, **Delete post draft**, and permanent media-library deletion as distinct actions. Removing media from a draft only detaches the asset. Deleting a post draft soft-deletes the workspace-scoped `ContentItem` and leaves its media assets in the workspace library. Permanent object deletion continues to require no active content references; product-facing media-library deletion and orphan reconciliation remain Milestone B.

Content and media can change only in `DRAFT` or `IN_REVIEW`. Reopening an `APPROVED` item explicitly invalidates approval and returns it to `DRAFT`. A `SCHEDULED` item must first pass through a separately confirmed cancellation back to `APPROVED`; draft deletion is then a second, separately confirmed action. The draft deletion control never represents deletion of an already-published Instagram post.

For the Milestone A feed upload, reject rather than silently transform incompatible input. Require JPEG bytes, a `.jpg`/`.jpeg` name, `image/jpeg`, no more than 8,000,000 bytes, 320–1,440 pixel width, and an aspect ratio from 4:5 through 1.91:1. Derive dimensions from the uploaded JPEG structure on the API. Keep decode/re-encode, color normalization, source/derivative relationships, and platform-specific variants in Milestone B; the preview must preserve source framing while stating that Instagram may recompress and convert color to sRGB.

## 2026-08-19: Provider responses remain inspectable during AI quality tuning

Temporarily supersede the earlier stateless Responses API choice while MARKOS content quality, latency, and token efficiency are being tuned. Default `OPENAI_STORE_RESPONSES` to `true` and send that explicit value through the shared structured-output adapter so approved inputs and outputs can be inspected in the correct OpenAI project dashboard. This applies to provider-backed Strategy, onboarding-profile, and content-copy requests; the deterministic local provider remains the default development mode.

Stored provider state can include the business context deliberately sent to the model. Never send secrets, credentials, raw private identifiers, or production customer data that has not been approved for provider processing. Revisit and normally disable storage at the production privacy/retention gate or when the tuning phase ends. A Zero Data Retention project overrides the requested storage behavior. Dashboard presence is quality-review evidence, not proof that MARKOS persisted the result or completed the browser-to-provider journey.

## 2026-08-19: Calendar MVP is week-first and manages existing content truthfully

Make Calendar a primary Sunlit destination between Create and Insights. Default to a week-first actionable view, provide a compact month overview, surface the next meaningful content action, and keep Draft/Review/Ready work in an unscheduled queue. Use Bahrain-local labels, bilingual/RTL behavior, and text plus color for status. The mobile primary navigation centers the active destination so Calendar remains discoverable in both directions.

Build this MVP from existing workspace-owned `ContentItem` records. Do not fabricate pre-draft planned slots: the current `ContentCalendar.plan` is only a monthly index of scheduled content IDs and cannot represent an objective, pillar, topic, or proposed time before content exists. A complete AI monthly plan needs a reviewed slot contract linked to a content item in a later pass.

Add the ordinary user-facing `POST /v1/content/:contentItemId/reschedule` contract for `SCHEDULED` and `FAILED` items. Update the content item and its monthly index in one transaction, clear the bounded prior failure on recovery, and retain separately confirmed schedule cancellation. This route requires no migration or new cloud service. A saved schedule remains MARKOS state, not provider-confirmed automatic publication, until the durable worker and live Instagram path are separately verified.

## 2026-08-19: Milestone A container polling covers five minutes without automatic retry

For the controlled JPEG proof, query the new container once immediately and then at one-minute intervals for five further attempts. Use `INSTAGRAM_CONTAINER_POLL_ATTEMPTS=6` and `INSTAGRAM_CONTAINER_POLL_DELAY_MS=60000` as the application defaults, which covers five elapsed minutes while keeping the provider polling cadence bounded.

Treat a container-processing timeout as an operator-review state, not an automatic retry signal. Do not issue another publish request or create a replacement container until the operator confirms that no provider media ID was persisted and no post appeared. Durable container IDs, attempt state, reconciliation, leases, and retry policy remain Milestone B work.

The item-specific publish route continues to require a workspace-owned `POST` in `SCHEDULED` state with `scheduledAt` at or before the current API time. `APPROVED` is a prerequisite state in the journey, not a publishable substitute for a due schedule.

## 2026-08-20: Create uses an action hub before a focused Draft Editor

Open Create in an overview/action-hub state when no content item is selected. Do not mount a large empty post form by default. The primary actions are **Start a blank post**, **Draft with MARKOS AI**, **Explore content ideas**, **Continue a draft**, and **Open Calendar**. Account readiness and recent performance may appear as supporting cards only when backed by real workspace/provider data; empty states must not invent activity or success.

**Start a blank post** is a first-class manual path. It creates one workspace-owned `DRAFT` without Vault retrieval, an AI request, or AI quota/token usage. **Draft with MARKOS AI** creates an editable grounded draft through the existing metered generation boundary. Content ideas remain suggestions until the user deliberately selects one; merely viewing an idea must not create a saved item or consume publishing state.

After a draft is created or selected, Create becomes the focused Draft Editor for caption, hashtags, CTA, media, follower-style preview, approval, scheduling, cancellation, and deletion according to the existing lifecycle. AI assistance is optional and contextual inside the editor; it must never overwrite user work without confirmation. Manual media upload remains first-class. Provider-backed image generation must use the configured image-provider interface, enforce quota/metering and moderation, normalize or reject output into the supported Instagram JPEG contract, and use the local JPEG renderer only as an explicitly selected development fallback.

The information architecture is locked; implementation remains a subsequent UI/API slice. The smallest API addition is an ordinary workspace-scoped blank-content create contract consistent with the build specification's `POST /content` catalogue.

## 2026-08-20: Provider images are direct, validated workspace JPEGs

Use the OpenAI Images API behind the independent `AI_IMAGE_PROVIDER` selector so image rollout does not change text-provider behavior. Resolve the model through the existing `IMAGE_MODEL_PRIMARY` slot; the initial live setting is `gpt-image-2`. Generate one medium-quality, 90%-compressed JPEG with automatic provider moderation. Request exact sizes of 1024×1024 for 1:1, 1024×1280 for 4:5, and 1008×1792 for 9:16.

Reserve the workspace's `AI_IMAGE` allowance before making the paid provider request. Require provider usage, valid base64, a decodable JPEG, no more than 8 MB, and exact requested dimensions before storage. Then reserve storage, persist the workspace-owned object and attachment, and record the interaction and input/output tokens transactionally. Refund the image allowance when moderation, provider, validation, storage, or persistence prevents delivery. Never send a raw workspace ID to the provider or log prompts/image bytes; use a pseudonymous provider user identifier.

## 2026-08-20: Business Profile editing is an explicit return to onboarding

An ordinary visit to onboarding still redirects a workspace whose business profile is complete and approved to Strategy. The **Review and edit profile** action is different: it opens onboarding in explicit edit mode and hydrates the seven modules from the workspace's current Vault values so the user edits existing truth rather than an empty form.

Saving any changed canonical module retains the existing invalidation contract: the resolved profile becomes stale, onboarding returns to `IN_PROGRESS`, and the user reviews and approves a regenerated profile before it becomes the new grounding record. Historical approved interactions remain preserved.

## 2026-08-23: UI feedback is interpreted within the active Sunlit system

Treat meeting notes, screenshots, templates, design exports, and stakeholder suggestions as evidence and prompts for investigation rather than automatic product requirements. Keep raw review notes outside the active repository documentation. Promote only an interpreted problem, proposed direction, decision state, preserved contracts, and observable acceptance criteria. The product team may accept, reframe, defer, or reject a suggestion.

Keep `docs/ui-design-foundation.md` as the active visual and interaction authority beneath the build specification and experience flows. Use `docs/ui-ux-workflow.md` for reference, prototype, implementation, and QA practice, and `docs/ui-ux-improvement-plan.md` for the interpreted working backlog. Archive the superseded light/red and dark command-center checklists, exports, and dated state audits rather than leaving them in the active documentation root.

Prototype consequential navigation, information hierarchy, multi-step journey, and dense workspace changes before implementation when feasible. A Figma file, browser prototype, or annotated screenshot is evidence only after the intended frames and relevant states have been visually reviewed. Preserve application behavior, workspace isolation, approval gates, metering, accessibility, Arabic/RTL, and honest external-provider state throughout visual work.

## 2026-08-25: Draft planning time is distinct from a publishing schedule

Supersede the August 19 assumption that every Draft/Review/Ready item belongs in the unscheduled queue. Add an optional `plannedAt` timestamp to the workspace-owned content item contract. A saved `DRAFT`, `IN_REVIEW`, or `APPROVED` item without `plannedAt` belongs in Unscheduled; one with `plannedAt` appears on the corresponding Calendar date and time. The UI collects the planned date and time together and stores one timezone-safe instant.

`plannedAt` is planning metadata, not publishing state. Setting or changing it must not mark an item Ready, put it in the publishing queue, or cause the worker to publish it. `scheduledAt` remains reserved for the explicit schedule/reschedule contract and `SCHEDULED` or recoverable `FAILED` state; `publishedAt` remains the provider-confirmed publication time. Calendar must never substitute `createdAt` or `updatedAt` for any of these timestamps.

The explicit Schedule action may begin with `plannedAt` as its proposed value, but it must still require confirmation and write `scheduledAt` through the existing scheduling boundary. Scheduling may retain `plannedAt` while the schedule is active, but cancelling the schedule clears both `scheduledAt` and `plannedAt`, returns the item to Ready, and moves it to Unscheduled. In Calendar Post Focus, that transition unwinds one level to the originating Day Focus and reports the move through timed feedback. A planned time that passes without scheduling is an attention state, never permission to publish.

Opening **Start a blank post** now begins with an unpersisted browser working copy rather than immediately inserting an empty `ContentItem`. The planned date/time itself counts as a meaningful edit: saving an otherwise empty working copy with that value creates a legitimate Calendar draft, while leaving a completely untouched working copy creates nothing. In-app navigation away from meaningful unsaved changes offers Save draft, Discard changes, and Keep editing; a confirmed save does not make the item Ready.

Keep the existing least-cost persistence boundary for AI copy generation. Submitting a valid **Generate draft** request is the user's deliberate decision to create a saved workspace `DRAFT`; successful generation persists the content and AI interaction and meters usage. The UI must disclose that boundary before submission. Leaving the generated draft without later local edits needs no save prompt; discarding later edits restores the last saved generated version, while deleting the generated draft remains a separate explicit action and does not refund consumed AI usage.

For the first implementation, manual edits remain explicit-save changes and media actions require an already persisted draft. Keep upload and AI-image controls unavailable on a new unsaved working copy, explain the save-first boundary in the editor, and revisit temporary media only if a later media-first Create redesign proves that extra architecture worthwhile.

## 2026-08-25: Calendar reads use a bounded workspace range and a paginated Unscheduled queue

Add one workspace-scoped `GET /v1/calendar` read contract for the connected Week, Month, Day Focus, and Post Focus experience. The client supplies an inclusive `from` and `to` date range of no more than 63 Bahrain calendar days, optional real content-status and content-type filters, and bounded Unscheduled offset/limit parameters. Every placed item, Unscheduled item, and referenced media asset must belong to the active workspace.

Calendar placement follows lifecycle timestamps rather than record creation time: Draft/Review/Ready items use `plannedAt`, Scheduled and Failed items use `scheduledAt`, and Published items use `publishedAt`. Draft/Review/Ready items without `plannedAt` form the paginated Unscheduled queue. Do not fall back to `createdAt` or return an arbitrary newest-content slice.

Return the placed records, only the referenced media assets needed to render them, the filtered Unscheduled page with its total and next offset, and the Calendar summary in one response. Status filters apply to the content collections; the summary remains a stable workspace overview while a status filter is active. Content-type filtering applies to both collections and the summary. Offset pagination is the smallest conventional option for the expected initial volume; revisit cursor pagination only if concurrent queue churn or substantially larger workspaces make stable traversal necessary.

## 2026-08-27: Graph v26 migration is a provider-integration gate, not a Create prototype prerequisite

Continue the Create workflow audit and browser prototype against the existing application contracts without first changing the Instagram Graph version. Meta introduced Graph API v26.0 on July 29, 2026, but its versioned changelog does not change the organic Instagram Login publishing, account, or insights endpoints currently used by MARKOS. The recent Instagram AI-label, audio, and media-protection changes relevant to Create are documented separately as applying to all versions; moving to v26.0 does not make the Facebook-Login-only Audio API available to the current Instagram Login architecture. Graph v25.0 remains supported until July 29, 2028.

Before new Create controls are wired to Meta requests—or before the next controlled live publishing and insights proof—run one bounded v26.0 compatibility pass. Update the canonical version constant, strict environment validation, focused Instagram client fixtures, and current operational documentation together. Coordinate the Railway `INSTAGRAM_GRAPH_VERSION` value with the deployment because the application intentionally rejects a runtime version that differs from its reviewed contract.

The migration does not itself expand permissions, change login architecture, prove provider acceptance, or authorize newly documented fields. Re-run the focused account, publishing, analytics, environment, and security-contract checks, then apply the existing staging and live-provider evidence gates. Keep audio-library access, comment-management permission expansion, and any other login or scope change as separate reviewed decisions.

## 2026-08-27: First-save orchestration may include a browser-local manual JPEG

Supersede the August 25 persisted-first restriction for manual media only. A user may select and preview one validated JPEG while working in a new unpersisted browser draft. Selection counts as a meaningful change, remains local, consumes no AI quota, and makes an in-app exit use the accepted Save draft, Discard changes, or Keep editing boundary. Leaving an untouched editor still creates nothing; discarding releases the browser-local selection without an API write.

On the first explicit Save, use the existing contracts as one recoverable client workflow: create the workspace `DRAFT`, upload the JPEG, then attach the resulting workspace media asset. Do not introduce a temporary-media backend contract for this pass. If draft creation fails, retain the local working copy and file selection where the browser permits. If creation succeeds but upload or attachment fails, report the saved draft truthfully, preserve confirmed writes, and offer the appropriate upload or attachment retry rather than claiming that the whole operation rolled back.

AI image generation remains unavailable until the content item is persisted because its quota, interaction, storage, and attachment contracts require a workspace content ID. This decision does not add a Media Library, carousel/reel asset workflow, durable browser-file recovery after reload, or background autosave.

## 2026-08-30: Onboarding readiness is separate from Vault completeness

Keep the build specification's seven canonical onboarding areas, but require only Company and Products before MARKOS can prepare the first bilingual business profile. Story, Audience, Competitors, Brand/Tone, and Objectives remain useful workspace knowledge; the user may explicitly skip them, and that skip is persisted so resume behavior does not repeatedly block on the same optional question. The information check exposes every area as a direct edit action before generation.

Do not turn process completion into a false data-quality score. `readyForProfile` means the two essential areas exist; Vault completeness continues to report the sections that are actually present. Approving the editable AI-resolved profile completes the onboarding journey and hands off to Strategy, but it does not force the Vault score to 100 or erase optional gaps. Both provider-backed and deterministic generation must avoid inventing unsupported facts and use honest editable wording when a profile area is not yet defined.

Defer the visible onboarding document-upload control until one focused pipeline can store the file, extract only fields MARKOS currently consumes, report uncertainty and issues, map the result to the existing seven-area contract, and require owner confirmation before Vault writes. The manual wizard remains the fallback and correction surface for that future automatic path; an upload box that only stores unread documents is not a completed onboarding capability.

## 2026-08-31: Offerings are canonical business records and Vault entries are projections

Store the workspace's products and services in one versioned, workspace-scoped Offering Catalog. Preserve stable offering identities across edits, retain catalog and offering revisions, and archive removed offerings instead of erasing their history. Record whether an approved value came from the owner, a document, or Instagram, with an optional source reference, so later import pipelines can present evidence without silently replacing owner-approved truth.

Keep the existing Products onboarding contract as the first editor for this catalog. A summary-only edit preserves structured offerings; supplying an explicit item list replaces the active set after normalized duplicate-name validation. Existing Products Vault records are migrated into the catalog where possible.

Treat `PRODUCTS/catalog` and granular `PRODUCTS/offering:<id>` Vault records as derived AI-retrieval projections, not the canonical source. When canonical data changes, retire the previous Products projection before attempting the replacement. If projection fails, mark the catalog failed and leave no stale active Products knowledge; retry the same catalog version without manufacturing another canonical revision. Document extraction, temporary upload storage, issue resolution, owner confirmation, and Instagram evidence reconciliation remain separate focused passes.

## 2026-08-31: Offering documents are temporary evidence until owner approval

Place document assistance inside the existing Products/Services onboarding step as an optional accelerator. Keep the open manual field available at all times. Accept one or two PDF, DOCX, or UTF-8 TXT files, limited to 8 MB each and 12 MB combined. Do not claim OCR: reject scanned or otherwise textless PDFs with a clear recovery message. Images, presentations, and broader business-profile extraction remain outside this first pass.

Allow only one active analysis per workspace. Store raw files through the existing workspace-scoped storage boundary for no more than 24 hours, then remove them through the maintenance worker. Do not create permanent media records for these temporary files, serve them through the public media route, or retain raw document text in AI interaction metadata. The owner may retry a failed analysis or discard it explicitly; repeated future use is allowed because no current provider or cost constraint requires a one-time opportunity.

Treat extracted offerings, summaries, and issues as an editable proposal. Nothing is written to the canonical Offering Catalog or Products Vault projection before explicit approval. Approval first removes the temporary raw files, then saves the owner-reviewed result as a document-sourced catalog revision and projects it into the Vault. Preserve the analysis identifier as the source reference without keeping the source document. If Instagram later provides product evidence, reconcile it as another attributed source and never silently replace owner-approved catalog truth.

Offering-document extraction requires a configured provider-backed AI path. Do not expose the deterministic line parser as a user-facing fallback: incomplete local guesses create more risk than an honest unavailable state. If the provider, credential, or model is unavailable, store only a sanitized failure code, keep the temporary files available for the existing retention window, preserve the manual Products/Services field, and tell the owner whether retry can help. Do not show Retry for configuration, authentication, unreadable-input, unsupported-input, refusal, or missing-usage failures.

The next experience pass may replace the compact Products/Services uploader with a focused Document Analyst panel that guides upload, analysis, clarification, and owner approval. Keep it limited to Products/Services initially while designing its boundary for later business-wide document assistance. This provider-boundary pass does not implement that conversational UI.

The Products/Services-specific policy in this section remains active for that shortcut. Its limitation against broader business extraction is superseded by the separate full-business path accepted on 2026-09-01 below.

## 2026-08-31: Onboarding Back protects only the active step's unsaved work

Treat each onboarding step as its own editing boundary in both first-run and profile-edit mode. Back leaves an untouched step immediately. If the active step contains meaningful changes, Back opens a focused choice to **Discard changes** or **Keep editing**; discarding restores only that step's entry state and must not undo previously saved or edited steps.

An active ready or failed offering-document analysis also counts as step work because its temporary files and proposal require an explicit disposition. Discarding from the Products/Services step removes that temporary analysis before leaving. Processing cannot be interrupted through Back, and an API failure keeps the user on the step with an honest error instead of claiming the analysis was discarded.

## 2026-08-31: Approved-profile edits do not spend another AI generation

Supersede the August 20 edit-mode regeneration rule for the current explicit onboarding editor. When a workspace already has an approved Business Profile, owner edits to the seven canonical modules are approved knowledge changes: save them directly, preserve the accepted profile interaction, keep onboarding complete, and return to Business Profile from the final information check. Do not call the onboarding profile resolver or consume another AI generation merely to reword information the owner has already approved.

This is a narrow bridge until Business Profile receives a dedicated knowledge editor. The canonical module records and Offering Catalog remain the current truth used for retrieval; the previously approved bilingual profile can temporarily remain a summarized snapshot. A future knowledge-editor pass must define how bilingual summaries are refreshed without silently inventing facts or forcing an avoidable provider call.

Only the explicit edit-mode request may ask to preserve an approved profile, and the API must verify that an approved profile actually exists. A first-run or incomplete workspace cannot use this flag to bypass profile generation, owner approval, or onboarding completion.

## 2026-09-01: Full-business document assistance is a first-run path, not an approval bypass

Supersede the August 30 deferral and the broader-business limitation in the August 31 offering-document decision. Keep the minimal greeting, but present two equally prominent first-run choices: **Use business documents** and **Enter details myself**. The manual path remains the seven-module correction and fallback surface. The full document path fills as much of those same modules as supported evidence allows, then converges on the same information check and editable bilingual Business Profile. It does not make onboarding optional, introduce a second business-knowledge model, or bypass owner approval.

Accept one to five PDF, DOCX, UTF-8 TXT, JPEG, PNG, or WebP files, limited to 8 MB each and 20 MB combined. Stage the browser selection visibly and send nothing until the owner chooses **Analyze files**. Pass supported files to the provider's native multimodal file and image inputs rather than building a separate backend OCR pipeline. Treat every uploaded file as untrusted evidence: file contents may describe the business but may never supply application instructions. Unknown facts stay empty, visual color inference is explicitly labeled for confirmation, and the owner may add no more than seven business colors through an explicit add action.

Allow only one active full-onboarding analysis per workspace. Store its source files behind the workspace-scoped storage boundary for at most 24 hours, never expose them as permanent media, and remove them on approval, discard, expiry, or workspace erasure. Persist filenames, checksums, sizes, status, structured extraction, evidence, issues, model/token metadata, and the owner-approved result, but do not retain file bytes or raw extracted text in AI interaction metadata. Keep the Products/Services-only analyzer as a separate optional shortcut inside that step with its narrower one-or-two-file policy.

The provider result is an editable proposal, not business truth. Approval writes the reviewed Company and Products modules plus any reviewed optional modules, records document provenance for the Offering Catalog, marks the analysis approved, and removes the temporary files. The browser then invokes the existing bilingual profile resolver; onboarding becomes `COMPLETE` only after the owner separately approves that Business Profile. Provider, model, credential, timeout, and malformed-output failures remain sanitized and recoverable. Do not substitute the deterministic local parser when provider-backed document analysis is unavailable.

## 2026-09-01: Time-bound Strategy artifacts become Campaigns

Supersede the generated-Strategy naming and duration decisions above. A marketing strategy is durable business knowledge and belongs in the Business Profile/Knowledge Vault. The generated, scheduled, measurable plan that governs content creation is a **Campaign**. Rename the active product surface, storage, API, AI contract, quota metric, and current documentation accordingly; retain `MARKETING_STRATEGIST` only where it identifies the agent role that applies durable strategic reasoning.

Use one canonical workspace-scoped `Campaign` model. It records a title, optional objective, lifecycle status, start and end dates, duration, publishing intensity, versioned generated content, and timestamps. `ContentItem.campaignId` is nullable: content may belong to a Campaign, but orphaned content remains valid. Existing pre-launch Strategy and legacy Campaign records are disposable and are not migrated into the new model.

The current duration contract is exactly 3, 7, 14, 30, 60, or 90 days. Publishing intensity is one to five publishes per day. The owner chooses the duration, start date, objective, and intensity explicitly. Onboarding routes an approved Business Profile to `/{locale}/app/campaigns`; generation uses `POST /v1/campaigns/generate`, listing uses `GET /v1/campaigns`, and PDF export uses `GET /v1/campaigns/:campaignId/pdf`.

This first pass corrects the domain language and contracts. The next Campaign passes must add multi-Campaign management, a compact high-level overview, no more than one week of detailed review at a time, and per-post approval that registers a minimal Campaign-linked draft in both Create and Calendar. Those later controls must not block valid orphaned content.

## 2026-09-01: An approved Campaign suggestion becomes one minimal unscheduled draft

Treat each generated weekly action as a stable Campaign suggestion identified by its Campaign, week number, and action index. The owner may approve that exact suggestion from the week review. Approval creates one workspace-owned `ContentItem` in `DRAFT` state with the suggestion as its brief, the week's focus as its Campaign goal, and the Campaign/week/action identity retained for later editing and measurement.

Make this approval idempotent. Repeating the same approval returns the existing draft instead of creating duplicates, including when two requests race. A deleted suggestion draft may be restored as a draft through the same action. Every read and write remains scoped to the active workspace.

Do not invent a publication time, caption, hashtags, media, or approval status at this boundary. The new item appears in Create as a Campaign draft and in Calendar's Unscheduled collection until the owner develops and deliberately plans or schedules it. Existing manual and AI-assisted orphaned content remains valid. A richer Campaign slot model, automatic content generation, and bulk approval are separate future decisions.

## 2026-09-02: Campaign Create registers one dated planning draft

Supersede only the Unscheduled placement in the September 1 Campaign-suggestion decision. A generated daily Campaign idea already owns a calendar day, so its single **Create** action idempotently creates or restores one Campaign-linked `DRAFT`, copies that day's date into `plannedAt`, and opens the same record in Create. Repeating the action must reuse the unique Campaign/week/action identity and never create another draft.

The Campaign day is a planning date, not a publishing time. Calendar places the draft on that date and labels it as planned without presenting the stored date boundary as a chosen publication time. The action still does not generate finished copy or media, approve the draft, write `scheduledAt`, or enter the publishing queue. A future Campaign idea that lacks an assigned day must require a date before this registration boundary can succeed.

## 2026-09-02: Create has two normal entry choices and preserves Campaign identity during generation

Supersede the five-action Create hub for the current presentation slice. Opening Create without a selected item now offers only **Create with MarkOS** and **Explore**. It does not show a separate blank-post, recent-work, Calendar, or user-facing quota action. The Draft Editor and existing saved records remain available through their own direct links and connected product journeys.

Opening Create from a Campaign bypasses that greeting and loads the one idempotently registered Campaign draft. The owner may review or edit its topic, content type, post objective, content pillar, tone, platform context, and planning date before generation. `POST /v1/content/:contentItemId/generate` generates into that same editable record; it must preserve the record ID, Campaign/week/action identity, post objective, planning date, and any explicit tone or pillar override. Repeated generation revises the existing draft and consumes another deliberate generation call, but never inserts a duplicate Campaign draft.

## 2026-09-02: Generated copy enters an in-place review and revision loop

After successful AI generation, show a review surface before the ordinary manual editor. It presents the complete English and Arabic copy, Instagram/content-type metadata, call to action, hashtags, planning date, and any Campaign objective/context. The generated result is already one saved workspace draft; the owner may mark it Ready or continue to manual editing and media.

`POST /v1/content/:contentItemId/revise` accepts one explicit revision instruction only for an editable AI-generated draft. MARKOS sends that instruction together with the current full draft, the original Campaign plan, the post-level goal/pillar/tone, and retrieved Vault context through the existing structured content boundary. A successful response updates the same `ContentItem` and records another metered `ai_interaction`. A failed response leaves the previous draft untouched, and further revision prompts reuse the same record rather than creating version-like duplicates.

## 2026-09-02: Insights compares only provider-backed reporting windows

Build the current Insights presentation surface from the existing workspace-scoped Instagram analytics records. The API returns the requested 7- or 30-day window plus totals for the immediately preceding equal-length window and calculates percentage changes only when both values exist and the previous value is non-zero. A missing metric, previous period, audience demographic, or content association remains unavailable; the UI must not translate it into a fabricated zero or estimate.

Use the existing lightweight daily chart treatment rather than adding a chart dependency for this bounded dashboard. Show compact performance metrics, selectable reach/impression/interaction trends, period comparison, content-type buckets, ranked content, follower/profile activity when returned, and an explicit demographic-unavailable state. Keep monthly PDF export. Detailed post, Reel, Story, audience-demographic, 90-day/custom-range, and provider-backed recommendation screens remain later work.

Retain Lucide as the single interface icon system because it is already installed and covers the modified navigation and action surfaces; do not add a redundant package based on a stale assumption that no icon library exists. Put the active English/Arabic control directly above Settings, preserve the current route and query while switching, store the choice locally, and let the locale route continue to control RTL.
