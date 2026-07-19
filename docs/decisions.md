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

Expose API callback URLs for Instagram webhook verification, deauthorization, and data deletion so the Meta app can be configured during App Review. Deauthorization and data deletion callbacks disconnect matching workspace Instagram credentials when the callback includes the stored Instagram account id.

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

## 2026-07-12: Pomelli-inspired visual features

Pomelli-inspired capabilities enter MARKOS as native extensions to Vault, catalog, media, and campaign workflows. Business DNA becomes Vault Auto-Ingest, product context becomes Product/Offer Catalog, visual generation becomes AI Visual Studio, and campaign generation becomes Campaign Workbench 2.0. Website and ads generation are deferred until after the Instagram-first publishing loop is stable.

Pomelli is a useful reference for brand-aware visual generation, but MARKOS must remain an Instagram-first AI marketing operating system with workspace isolation, RAG-grounded output, review states, publishing, analytics, metering, and bilingual UX. We will not introduce a hard dependency on Pomelli or Google-specific APIs; provider choices remain configurable.

## 2026-07-12: Website Auto-Ingest Starts Deterministic

Start Vault website auto-ingest with deterministic DOM signal extraction rather than an LLM call. This keeps PE-M1 usable before paid model keys are configured, avoids unmetered AI work, and gives users reviewable source-backed candidates. LLM extraction can be added later behind model settings and usage metering, but approved facts must continue flowing through the normal Vault upsert and embedding path.

## 2026-07-14: Local Embedding Fallback Is Development Only

Use deterministic local embeddings in development and test when the AI embedding service is unavailable, so Vault Auto-Ingest and RAG search remain usable before paid model infrastructure is connected. Production does not use this fallback: it still requires the configured AI embedding service to return the 1536-dimension Vault contract, and invalid provider responses fail loudly in every environment.

## 2026-07-14: Catalog Archive Preserves Commercial History

Archive product and offer catalog records by setting their status to `ARCHIVED` instead of soft-deleting them. Archived records remain workspace-scoped and queryable by explicit status so past campaigns, audit views, and reporting can still explain what was offered. Archiving a product also archives linked offers because an active offer should not point at an inactive product.

## 2026-07-14: Catalog Context Uses Vault-Compatible Chunks

Sync product and offer catalog rows into the `PRODUCTS` Vault section with stable `catalog:product:*` and `catalog:offer:*` keys. Strategy and content generation also merge active catalog rows into retrieved context as Vault-compatible chunks, deduped by `section/key`, so commercial facts are available to AI prompts even when vector search would not rank them highly.

## 2026-07-14: Selected Catalog Context Is Explicit

Strategy, campaign, content, and slot generation may include a selected `productId` and/or `offerId`. The backend validates those IDs inside the current workspace, only accepts active and non-expired commercial records, adds linked product context for selected offers, and marks selected chunks with `selectedForGeneration` in the retrieved prompt context. Cross-workspace or inactive selections fail clearly instead of falling back to generic Vault context.

## 2026-07-14: Catalog Is A First-Class Command Center Section

Expose active products and offers as their own app section instead of hiding them only inside Vault. Campaign Builder and Content Studio can still select commercial context inline, but the dedicated catalog screen is the workspace owner entry point for maintaining products, prices, validity windows, and offer status before generation.

## 2026-07-15: Catalog Commercial Briefs Gate Generation

Strategy and content generation now build a deterministic commercial brief from selected products, selected offers, active catalog rows, audience Vault facts, and approved Vault evidence. The brief is passed as a Vault-compatible `PRODUCTS` chunk so AI prompts receive campaign angles, selected commercial context, and explicit guardrails before generic RAG context.

Catalog-backed generation rejects price-led requests when neither selected catalog context nor the user prompt supplies a price, and rejects comparative or proof claims unless the wording is supported by selected product benefits or approved Vault facts. This keeps MARKOS from inventing prices, discounts, superiority claims, or proof points while still allowing approved business memory to drive sharper campaign output.

## 2026-07-15: Demo Catalog Seed Is Opt-In

Keep `prisma/seed.ts` production-safe by default: it still creates only plan rows unless `MARKOS_SEED_DEMO_WORKSPACE=true` is set. The optional demo fixture creates a verified Maryam Jewelry workspace with owner membership, active product and offer rows, and matching Vault entries so local or staging environments can exercise the commercial generation path without polluting production seeds.

## 2026-07-15: Visual Studio Media Requires Review Before Use

Represent AI Visual Studio output as normal workspace-scoped `MediaAsset` rows plus a `GeneratedMediaVariant` lineage/review record. The variant stores source media IDs, selected product/offer IDs, visual mode, aspect ratio, prompt, negative prompt, model, prompt version, quality state, and generation metadata.

Generated variants start in `PENDING_REVIEW` and cannot be attached through the generic content-media route until approved. The dedicated approve/reject/attach workflow preserves human review while still letting downstream publishing treat approved output as standard media. Visual Studio image quota is reserved before calling the image provider, and storage/token usage is metered around successful persisted variants.

## 2026-07-15: Campaign Workbench Packages Are Review-Gated

Use `Campaign` as the package container for Campaign Workbench 2.0. The campaign stores a structured brief, selected product/offer IDs, package JSON, rationale, status, rejected-idea feedback, and schedule bounds, while each generated asset remains a normal workspace-scoped `ContentItem` linked by `campaignId`.

Campaign packages are assembled from approved Vault context and active catalog context, validated against a runtime package schema before persistence, and cannot be scheduled until the campaign and every linked content item are approved. Item edits stay on the existing content API while draft/in-review, item rejections return the package to review, and scheduling writes approved items into the publishing queue/calendar in one workspace-scoped transaction.

## 2026-07-19: Brand Book Exports Are Immutable Source-Grounded Snapshots

Build the live Brand Kit from the current workspace's approved Knowledge Vault entries and approved brand assets. Derive tone, messaging, and visual rules only from those records; expose confidence and missing-section notes instead of filling gaps with unsupported claims.

Each Brand Book export stores an immutable versioned snapshot, the exact Vault source entry IDs, confidence, missing sections, and an audit record. Later Vault edits affect the live Brand Kit and future versions but do not rewrite prior exports, preserving traceability for approved campaign work.

## 2026-07-19: Railway Uses a Cost-Controlled Five-Service Production Topology

Deploy the public Next.js web app and Fastify API as separate Railway services, with the Python AI service private to the project network. Use a pinned pgvector PostgreSQL image and managed Redis; keep OpenSearch disabled until a product feature actually requires it. Persist API media on a Railway volume mounted at `/app/var/media` so generated and uploaded assets survive deployments and retain public API URLs.

Railway's free-plan resource limit allows five services, so the API runtime starts the maintenance scheduler behind `WORKER_EMBEDDED=true`. The worker remains an independently deployable image and must move to its own private service before horizontal API scaling or when the project upgrades its Railway plan.

The API container runs the idempotent `db:deploy` release command before starting. That command installs required PostgreSQL extensions/functions, prepares compatibility roles for the existing RLS migrations, applies forward-only Prisma migrations, and upserts plan reference data without creating a demo workspace. `INSTAGRAM_PUBLISH_MODE` and analytics sync remain `dry_run` until Meta credentials, App Review, and live-publish acceptance are complete.

## 2026-07-19: Website Auto-Ingest Uses Review-Gated Async Extraction

Keep the existing single-page deterministic preview for fast local review, and add a workspace-scoped asynchronous job for multi-page or slow-source extraction. The maintenance worker claims jobs with `FOR UPDATE SKIP LOCKED`, crawls at most ten same-origin public pages, retries failures three times with backoff, and records queue, completion, retry, and failure audit evidence. Job and draft reads always include `workspaceId`, and the job table has row-level security coverage.

Route multi-page extraction through the configurable `WEBSITE_EXTRACTION_MODEL` slot and require a strict runtime-validated JSON response. Invalid JSON or unsupported evidence receives one repair attempt. Every accepted candidate must meet the confidence floor and cite a non-empty snippet that exists on its declared source page; unsupported candidates are refused instead of becoming Vault memory. Reserve one AI generation before extraction, meter model tokens after persistence, and refund only reservations that actually succeeded.

Approval remains a human decision. `MERGE` is the default and preserves existing object fields while applying reviewed values; `OVERWRITE` replaces the reviewed entry. Approval writes the Vault update, reviewed draft, and an audit trail containing the chosen write mode plus per-candidate edited/unchanged and created/merged/overwritten decisions in one transaction.
