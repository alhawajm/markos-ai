# MARKOS AI Milestone Checklist

Source of truth: `MARKOS_BUILD_SPEC. 2.pdf`, especially Section 7.3 and Section 22.

Use this file as the working progress tracker. Only tick an item when the implementation is merged, verified, and the relevant test or acceptance gate passes. If a feature is scaffolded but missing a required spec condition, leave it unchecked and add a short note.

Legend:
- `[x]` Done and verified
- `[ ]` Not done, partial, or not yet proven

## Current Snapshot

- Current milestone: M0 Foundation
- Last confirmed full gates: `corepack pnpm verify` and `corepack pnpm build`
- Last pushed commit at checklist creation: `de6ae1e Enforce AI generation quotas`
- Latest completed implementation step: M1 brand asset upload flow
- Next M0 focus: close the remaining foundation gaps before declaring M0 complete

## M0 Foundation

Gate: Section 7.3 acceptance. Register, verify, login including Google, land on a gated localized shell in Arabic and English with RTL; schema deployed with HNSW vector index; isolation test passes; `make verify`/CI green; Meta App Review submitted.

- [x] Monorepo scaffold with Turborepo, pnpm workspace, apps, packages, infra, and service boundaries.
- [x] Web app shell renders localized Arabic and English routes.
- [x] Web navigation tabs are clickable and route between dashboard sections.
- [x] API service runs with `/v1/health` and `/v1/health/deep`.
- [x] AI service runs with `/ai/health`.
- [x] Local Docker infra for Postgres/pgvector, Redis, and OpenSearch.
- [x] Prisma schema and migrations for core MARKOS tables.
- [x] pgvector columns exist for Vault/media embeddings.
- [x] HNSW index exists on `knowledge_vault.embedding`.
- [x] Workspace context middleware exists using `AsyncLocalStorage`.
- [x] Workspace isolation tests cover every Prisma model with a `workspaceId` field.
- [x] Database RLS policies are implemented and fail closed with `app.current_workspace`.
- [x] Email/password registration and login.
- [x] Email verification flow.
- [x] Google OAuth login.
- [x] JWT access token and refresh token issuance.
- [x] Refresh token rotation and reuse detection.
- [x] Argon2id password hashing.
- [x] TOTP MFA for admin/finance roles.
- [x] RBAC permission catalog with role and permission guards.
- [x] Shared packages: shared types, validation, API client, i18n, UI tokens.
- [x] Provider interfaces and configurable model IDs.
- [x] AI interaction token metering skeleton.
- [x] Usage counters and plan quota enforcement for strategy/content AI generation.
- [x] Usage enforcement covers AI image generation, MARKOS post publish caps, storage, and reset rules.
- [x] Usage enforcement covers billing lifecycle states such as expired trial, past-due, suspended, and cancelled.
- [x] Usage enforcement covers automated plan reset scheduling.
- [x] GitHub Actions runs the full verification gate on PRs.
- [x] Staging deploy workflow builds and publishes deployable service images on merge to `main`.
- [ ] Live staging deploy on merge to `main` has been proven with configured cloud credentials.
- [x] Sentry or equivalent observability in web, API, and AI services.
- [x] Deep health checks cover DB/Redis/OpenSearch/AI.
- [x] Meta App Review preparation doc exists.
- [ ] Meta App Review formally submitted.
- [x] `corepack pnpm verify` passes locally.
- [x] `corepack pnpm build` passes locally.
- [ ] M0 acceptance gate fully passed.

## M1 Onboarding + Vault + RAG

Gate: A grounded test agent call returns correct business context; completeness and gaps work.

- [x] Onboarding screen scaffold exists in the web app.
- [x] Vault screen scaffold exists in the web app.
- [x] Vault storage APIs exist.
- [x] Vault embeddings are generated and stored.
- [x] Vault completeness score exists.
- [x] RAG search exists and is used by strategy/content calls.
- [x] One grounded Strategy Agent call returns Vault context.
- [ ] Seven-module onboarding wizard is complete against the spec.
- [ ] Vault versioning UX and history are complete.
- [x] Brand upload flow is complete.
- [x] Completeness gaps are surfaced in the expected UX.
- [ ] M1 acceptance gate fully passed.

## M2 AI Content Engine

Gate: From a calendar slot to a full tone-locked bilingual item plus AI image, moved through workflow; strategy PDF exports.

- [x] Vault-grounded strategy generation exists.
- [x] Vault-grounded content draft generation exists.
- [x] Content approval workflow exists.
- [x] Schedule/calendar foundation exists.
- [ ] All eight agents are implemented.
- [ ] Strategy PDF export.
- [ ] Calendar slot to content generation workflow.
- [ ] Bilingual tone-locked content workflow.
- [ ] TipTap/editorial workflow.
- [ ] AI image pipeline.
- [ ] Prompt A/B tooling.
- [ ] Full token and image metering.
- [ ] M2 acceptance gate fully passed.

## M3 Instagram

Gate: Real post and reel publish to a test Instagram Business account; forced failure creates alert and reschedule path.

- [x] Instagram OAuth connection flow scaffold.
- [x] Meta Graph adapter behind live flag.
- [x] Dry-run publishing worker.
- [x] Publish readiness checks for public media URLs.
- [x] Instagram daily publish cap guard.
- [x] Token refresh flow and maintenance worker.
- [x] Meta callback endpoints for webhooks, deauthorization, and data deletion.
- [x] Callback audit logging.
- [ ] Real image post publish verified against a test IG Business account.
- [ ] Real reel publish verified against a test IG Business account.
- [ ] Queue UI.
- [ ] Failure alert UX.
- [ ] Reschedule UX for failed publishing.
- [ ] M3 acceptance gate fully passed.

## M4 Analytics

Gate: Real metrics render; AI interprets 30 days; monthly PDF emails; performance data feeds the Vault.

- [ ] Instagram analytics sync workers.
- [ ] Analytics screens AN-01 through AN-06.
- [ ] Analytics Consultant agent.
- [ ] Digest and analytics chat.
- [ ] Monthly analytics PDF.
- [ ] Email delivery for monthly PDF.
- [ ] Learning loop writes performance data back to the Vault.
- [ ] M4 acceptance gate fully passed.

## M5 Billing + VAT + Admin

Gate: Subscribe in BHD plus VAT, hit limit, prorated upgrade, admin edits plan limits without deploy and manages prompts.

- [ ] CrediMax payment adapter.
- [ ] BENEFIT payment adapter.
- [ ] Stripe fallback adapter.
- [ ] Subscription lifecycle.
- [ ] BHD minor-unit handling in fils across billing.
- [ ] Bahrain VAT invoice model and 10 percent VAT handling.
- [ ] Metering and quota enforcement across all billable metrics.
- [ ] Prorated upgrade flow.
- [ ] Admin portal screens ADMIN-01 through ADMIN-10.
- [ ] Admin RBAC and sensitive action audit.
- [ ] Prompt/model management without deploy.
- [ ] M5 acceptance gate fully passed.

## M6 Beta + Launch

Gate: NFR met; security audit passed; Starter and Growth live in Bahrain.

- [ ] Private beta readiness plan.
- [ ] Performance work toward NFR targets.
- [ ] Load test.
- [ ] OWASP security audit.
- [ ] Bahrain PDPL data export and erasure verification.
- [ ] VAT compliance verification.
- [ ] Arabic/RTL QA pass.
- [ ] Starter and Growth plans live in Bahrain.
- [ ] Launch runbook.
- [ ] M6 acceptance gate fully passed.
