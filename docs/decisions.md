# Decisions

## 2026-06-10: Canonical Documents

Use `MARKOS_BUILD_SPEC. 2.pdf` and `MARKOS_AGENTS. 2.0.pdf` as canonical over older PDFs and over older implementation-plan assumptions.

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

- Instagram Login is a distinct provider contract and requests only `instagram_business_basic`; Facebook Login and Page discovery are intentionally excluded from this slice.
- Access tokens use randomized AES-256-GCM envelopes. OAuth state uses a short-lived HMAC-protected payload plus an atomic, persisted nonce consumption record so it remains single-use across API instances.
- Requested scopes and provider-confirmed scopes are stored separately because consent requested by MarkOS is not evidence of what the provider actually granted.

## 2026-07-29: Instagram basic connection lifecycle

The active Settings connection uses the persisted encrypted credential record as its only source of truth. Provider profile reads are capped at six owned media items, provider-confirmed scopes remain empty unless Instagram explicitly returns confirmation, and external account IDs are unique across workspaces. Legacy workspace credential columns remain for compatibility but the new OAuth path never writes them.

## 2026-07-29: Instagram identity and ownership release hardening

Instagram Login's stable professional-account identity is the documented `user_id`, paired with `username`; `id` is not treated as interchangeable. Active `(provider, providerAccountId)` ownership remains globally unique, while disconnect deletes the credential record and releases that identity for a later authorized connection. New Instagram tables use the repository-standard `app_current_workspace_id()` RLS context and explicit `markos_app` grants.

## 2026-07-29: Instagram callbacks use transaction binding

The web app and API use bearer tokens stored by the browser client rather than an API-origin server session, and Instagram returns to a public API callback. The callback therefore uses transaction binding, not independent returning-browser authentication: only an authenticated member with `instagram:manage` can create the signed, expiring state and persisted nonce; atomic nonce consumption maps the callback back to that initiating user and workspace before any provider exchange. A different browser session cannot redirect the result to its own workspace because the callback accepts no workspace input and persistence uses only the integrity-protected transaction binding. Callback query values are stripped from application URLs and error telemetry. A future server-session design may add returning-browser binding, but this slice does not claim it.

The active business-basic connection consumes `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `INSTAGRAM_GRAPH_VERSION`, `INSTAGRAM_TOKEN_ENCRYPTION_KEY`, and `INSTAGRAM_OAUTH_STATE_SECRET`. Its authorization, short-token, long-token, refresh, and Graph hosts are constrained in code, and its permission is exactly `instagram_business_basic`.

Retained compatibility inputs have narrower meanings. `INSTAGRAM_OAUTH_SCOPES` is consumed by unchanged analytics-readiness logic and appears in App Review documentation, but it does not alter the active connection permission. `INSTAGRAM_OAUTH_AUTHORIZE_URL`, `INSTAGRAM_OAUTH_TOKEN_URL`, `INSTAGRAM_LONG_LIVED_TOKEN_URL`, `INSTAGRAM_REFRESH_TOKEN_URL`, and `INSTAGRAM_GRAPH_BASE_URL` currently have no runtime consumer and remain inert compatibility inputs pending a later coordinated cleanup. Secure refresh delegates to `InstagramBasicClient`, whose refresh endpoint is constrained in code. None of these compatibility inputs controls the active business-basic client or activates publishing, analytics, workers, schedulers, or additional permissions.

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

Treat the 2026-08-03 production business-basic OAuth success as completion of the first real professional-account connection milestone only. It proves the connection path for that attempt; it does not activate or verify publishing, insights, App Review, full-lifecycle refresh, provider-side revocation, or launch readiness. The active Instagram Login client continues to request exactly `instagram_business_basic`. Any permission expansion must be an explicit coordinated code, Meta dashboard, environment, test, and external-evidence change.

## 2026-08-03: Railway is the early-stage operating platform

Use Railway as the current early-stage deployment direction, with an approximate planning horizon through the first 50 users while capacity, reliability, and security are observed. This does not approve or schedule a migration at a numeric threshold. AWS remains a possible later expansion or migration direction.

The existing GHCR image pipeline, optional ECS rollout, placeholder CDK stack, and build specification's AWS target remain useful future references, but they are not evidence that AWS is the current runtime. Exact Railway project, environment, service, networking, and variable state remains externally managed and must be inventoried in Railway before it is described as current fact.

## 2026-08-04: Browser sessions use cookie-backed silent renewal

Keep refresh tokens in a path-scoped `httpOnly` cookie and keep access tokens only in the browser's in-memory Zustand session store, as required by the build specification. Persist token-free user, workspace, and role identity metadata only so the app can distinguish a returning expired session from a visitor. Authenticated API requests renew only after the precise `INVALID_TOKEN` response, retry once, and preserve the session on temporary network or server failures. Serialize refresh requests with the browser Web Locks API so tabs sharing the rotating cookie do not reuse a token concurrently. A terminal refresh failure clears the browser identity and sends the user to localized login; successful forced reauthentication lands on `/{locale}/app/settings#profile`.
