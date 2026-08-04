# MARKOS AI Milestone Checklist

Source of truth: `MARKOS_BUILD_SPEC. 2.pdf`, especially Section 7.3 and Section 22.

Use this file as the working progress tracker. Only tick an item when the implementation is merged, verified, and the relevant test or acceptance gate passes. If a feature is scaffolded but missing a required spec condition, leave it unchecked and add a short note.

UI, UX, and frontend journey parity are tracked separately in `docs/ui-functionality-checklist.md` and `docs/final-ui-implementation-checklist.md`.

Current implementation, roadmap, ownership, and evidence classifications are summarized in `docs/project-status.md`.

Legend:

- `[x]` Done and verified
- `[ ]` Not done, partial, or not yet proven

## Current Snapshot

- Status date: 2026-08-03.
- Current milestone ledger: implementation spans M0 through M6, but M0, M3, M4, M5, and M6 external gates remain open. Do not infer launch readiness from the active M6 label.
- Latest production-verified step: one real Instagram professional account completed the business-basic OAuth connection, appeared Connected in production Settings, and loaded recent media on 2026-08-03.
- That production result closes the first connection milestone only. Publishing, insights/analytics, Meta App Review, a full token lifecycle, provider-side revocation, production AI, durable media delivery, and broad launch readiness remain unverified.
- The current near-term focus is the complete user journey, verification email delivery, bearer-token lifecycle, UI work with Mohamed, continued security/API hardening, first AI-service deployment and provider connectivity, Railway/database operations, and an image storage/CDN decision.
- Required external evidence remains live staging/production inventory, Meta App Review, real image/reel publishing, real analytics, and Bahrain live payments. See `docs/m6-acceptance-evidence.md`.

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
- [x] Email verification token/request/confirmation flow implemented and tested.
- [ ] Production transactional verification-email delivery verified.
- [x] Google OAuth login.
- [x] JWT access token and refresh token issuance.
- [x] Refresh token rotation and reuse detection.
- [x] Cookie-backed browser refresh, in-memory access-token renewal, cross-tab serialization, and terminal-expiry reauthentication to Profile.
- [x] Argon2id password hashing.
- [x] TOTP MFA for admin/finance roles.
- [x] RBAC permission catalog with role and permission guards.
- [x] Shared packages: shared types, validation, API client, i18n, UI tokens.
- [x] AI HTTP client boundaries and configurable model slots.
- [ ] A real AI provider interface is implemented and verified end to end.
  - Note: the current FastAPI service returns deterministic local embeddings and fixed outputs; it does not call OpenAI or another provider.
- [x] AI interaction token metering skeleton.
- [x] Usage counters and plan quota enforcement for strategy/content AI generation.
- [x] Usage enforcement covers AI image generation, MARKOS post publish caps, storage, and reset rules.
- [x] Usage enforcement covers billing lifecycle states such as expired trial, past-due, suspended, and cancelled.
- [x] Usage enforcement covers automated plan reset scheduling.
- [x] GitHub Actions runs the full verification gate on PRs.
- [x] Staging deploy workflow builds and publishes deployable service images on merge to `main`.
  - Note: `.github/workflows/deploy-staging.yml` now uploads staging image evidence, ECS rollout evidence when AWS staging is configured, and smoke evidence when public staging URLs are configured. `corepack pnpm staging:github-preflight` checks the GitHub `staging` environment without printing variable values.
- [ ] Live staging deploy on merge to `main` has been proven with configured cloud credentials.
- [x] A deployed production web/API/database path completed one supervised real-Meta business-basic connection on 2026-08-03.
  - Note: this is narrow production provider evidence, not proof that the repository's GitHub staging workflow deployed Railway or that every Railway service/dependency is healthy. The dashboard topology still requires an operator inventory.
- [x] Sentry or equivalent observability in web, API, and AI services.
- [x] Deep health checks cover DB/Redis/OpenSearch/AI.
  - Note: dependency checks now report per-dependency duration and fail fast by dependency class, preventing unavailable HTTP dependencies from stalling readiness.
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
- [x] Vault embeddings are generated and stored using the deterministic local embedding contract.
- [x] Vault completeness score exists.
- [x] RAG search exists and is used by strategy/content calls.
- [x] One locally grounded Strategy path returns workspace Vault context.
- [x] Seven-module onboarding wizard is complete against the spec.
- [x] Vault versioning UX and history are complete.
- [x] Brand upload flow is complete.
- [x] Completeness gaps are surfaced in the expected UX.
- [ ] M1 acceptance gate fully passed with a live provider interface.
  - Note: local deterministic grounding is covered, but provider-backed embeddings/generation and deployed cross-service behavior remain unverified.

## M2 AI Content Engine

Gate: From a calendar slot to a full tone-locked bilingual item plus AI image, moved through workflow; strategy PDF exports.

- [x] Vault-grounded local strategy generation exists.
- [x] Vault-grounded local content draft generation exists.
- [x] Content approval workflow exists.
- [x] Schedule/calendar foundation exists.
- [ ] All eight agents are provider-backed and satisfy their production contracts.
  - Note: one endpoint returns fixed local output shapes for all eight agent names; that is scaffolding, not mature provider-backed agent implementation.
- [x] Strategy PDF export.
- [x] Calendar slot to content generation workflow.
- [x] Bilingual tone-locked content workflow.
- [x] TipTap/editorial workflow.
- [ ] Provider-backed AI image pipeline.
  - Note: the current FastAPI path creates deterministic SVGs locally.
- [x] Prompt A/B tooling.
- [ ] Provider-reported token and image metering is verified.
  - Note: current local responses estimate token counts; real provider usage is absent.
- [ ] M2 acceptance gate fully passed.

## M3 Instagram

Gate: Real post and reel publish to a test Instagram Business account; forced failure creates alert and reschedule path.

- [x] Instagram OAuth connection flow implemented and covered by focused source, integration, browser, persistence, and redaction tests.
- [x] One production Instagram professional-account connection completed on 2026-08-03.
  - Note: production Settings showed Connected and rendered bounded recent provider media. The successful path includes state/transaction security, provider exchanges, `/me.user_id` professional-account resolution, encrypted persistence, atomic recent-media and `INSTAGRAM_CONNECTED` writes, secured status read, redirect, and UI refresh.
- [x] Meta Graph adapter behind live flag.
- [x] Dry-run publishing worker.
- [x] Publish readiness checks for public media URLs.
- [x] Instagram daily publish cap guard.
- [x] Token refresh flow and maintenance worker implemented and locally/CI verified.
- [ ] Token refresh across a full production lifetime and provider-side revocation/deauthorization behavior verified.
- [x] Meta callback endpoints for webhooks, deauthorization, and data deletion.
- [x] Callback audit logging.
- [ ] Real image post publish verified against a test IG Business account.
- [ ] Real reel publish verified against a test IG Business account.
- [x] Queue UI.
- [x] Failure alert UX.
- [x] Reschedule UX for failed publishing.
- [ ] M3 acceptance gate fully passed.

## M4 Analytics

Gate: Real metrics render; AI interprets 30 days; monthly PDF emails; performance data feeds the Vault.

- [ ] Instagram analytics sync workers.
  - Note: foundation exists with workspace-scoped API sync, maintenance worker hook, provider boundary, live-readiness endpoint, tests, UI, and live verification runbook. The active OAuth client still requests only `instagram_business_basic`; permission expansion and live Instagram metrics remain unverified.
- [x] Analytics screens AN-01 through AN-06.
- [ ] Provider-backed Analytics Consultant agent.
  - Note: a fixed local agent-shaped response exists; real interpretation is not implemented.
- [x] Digest and analytics chat application surfaces and API foundations.
- [x] Monthly analytics PDF.
- [x] Email delivery for monthly PDF.
- [x] Learning loop writes performance data back to the Vault.
- [ ] M4 acceptance gate fully passed.

## M5 Billing + VAT + Admin

Gate: Subscribe in BHD plus VAT, hit limit, prorated upgrade, admin edits plan limits without deploy and manages prompts.

- [x] CrediMax payment adapter boundary and dry-run checkout.
- [x] BENEFIT payment adapter boundary and dry-run checkout.
- [x] Stripe fallback adapter boundary and dry-run checkout.
- [ ] CrediMax live merchant credential and certification pass.
- [ ] BENEFIT live merchant credential and certification pass.
- [ ] Stripe live fallback credential pass.
- [x] Subscription lifecycle.
- [x] BHD minor-unit handling in fils across billing.
- [x] Bahrain VAT invoice model and 10 percent VAT handling.
- [x] Downloadable VAT invoice PDFs.
- [x] Metering and quota enforcement across all billable metrics.
- [x] Prorated upgrade flow.
- [x] Admin portal screens ADMIN-01 through ADMIN-10.
  - Note: `/[locale]/admin` renders ADMIN-01 through ADMIN-10 bands with live plan-limit, subscription, invoice, gateway-readiness, prompt, audit, security, and model-config visibility.
- [x] Admin RBAC and sensitive action audit.
- [x] Prompt/model management without deploy.
  - Note: prompt version create/update and model setting updates are live, audited, and editable from the admin portal.
- [ ] M5 acceptance gate fully passed.

## M6 Beta + Launch

Gate: NFR met; security audit passed; Starter and Growth live in Bahrain.

- [x] Private beta readiness plan.
  - Note: `docs/private-beta-readiness.md` defines beta scope, entry criteria, cohort rules, user test script, evidence capture, exit criteria, and rollback while keeping external live-provider gates open.
- [x] Performance work toward NFR targets.
  - Note: `corepack pnpm perf:baseline` and `docs/performance-nfr-baseline.md` define repeatable p50/p95/max/error-rate checks for API health, deep health, and localized web shells. Latest production-web local evidence passed with API deep health p50 22ms, English shell p50 11ms, and Arabic shell p50 10ms.
- [x] Load test.
  - Note: `corepack pnpm load:test` and `docs/load-test.md` define a configurable concurrent public-readiness scenario over API health, deep health, and localized web shells with throughput, p95, max-latency, and error-rate thresholds. Latest local production-web evidence passed with 1,248 requests, 41.58 RPS, zero errors, p95 559ms, and max 1,267ms.
- [x] OWASP security audit.
  - Note: `corepack pnpm security:audit` passes with no known vulnerabilities after patched `esbuild`/`postcss` overrides and `@opentelemetry/core@2.8.0` workspace override; `docs/security-audit.md` maps current controls to OWASP Top 10 evidence.
- [x] Bahrain PDPL data export and erasure verification.
  - Note: `GET /v1/workspace/data-export`, `POST /v1/workspace/data-erasure`, and `docs/pdpl-data-rights.md` verify scoped export, owner/admin-only erasure, workspace-owned data deletion/anonymization, and audit evidence.
- [x] VAT compliance verification.
  - Note: `GET /v1/billing/invoices/:invoiceId/vat-compliance` and `docs/vat-compliance.md` verify workspace-scoped BHD fils, 10 percent VAT, exclusive/inclusive arithmetic, invoice issue evidence, and payment reconciliation; seller VAT number/customer VAT ID/legal wording remain launch caveats.
- [x] Arabic/RTL QA pass.
  - Note: `corepack pnpm rtl:qa`, `docs/arabic-rtl-qa.md`, localized `lang/dir`, Arabic default route, language-switch preservation, and mojibake scanning are verified; screenshot-based visual regression remains recommended before public launch.
- [ ] Starter and Growth plans live in Bahrain.
  - Note: `GET /v1/admin/bahrain-launch-readiness` and `docs/bahrain-plan-launch-readiness.md` verify Starter/Growth catalog readiness, BHD fils, 10 percent VAT, required limits, and local gateway readiness checks. Remains open until CrediMax or BENEFIT live credentials, webhook secret, certification, and one live paid checkout are proven.
- [x] Launch runbook.
  - Note: `docs/launch-runbook.md` defines launch roles, evidence pack, go/no-go matrix, preflight, deployment, smoke test, rollback, monitoring, and links to supporting provider/compliance runbooks.
- [x] M6 evidence collection structure.
  - Note: `evidence/README.md`, `evidence/m6/README.md`, committed evidence templates, `.gitignore` artifact protections, `corepack pnpm evidence:m6 -- --init`, and strict `corepack pnpm evidence:m6 -- --strict` define how launch proof is collected locally without committing sensitive provider, payment, token, or customer data. The 2026-06-17 local pack now marks the internal build gate READY and keeps external provider gates open.
- [x] Staging smoke evidence capture.
  - Note: `corepack pnpm staging:smoke` checks staging API health, deep health, Arabic shell, and English shell, then writes ignored local proof to `evidence/m6/<date>/staging/staging-smoke-report.json`; the script refuses localhost unless `ALLOW_LOCAL_STAGING_SMOKE=true` is set for local validation. This does not close the live staging gate until real staging URLs, release SHA, and cloud deploy evidence are used.
- [ ] M6 acceptance gate fully passed.
  - Note: `docs/m6-acceptance-evidence.md` tracks verified internal evidence, the narrow 2026-08-03 production connection milestone, and the remaining external provider blockers. Keep M6 open until live staging inventory, Meta App Review, Instagram publish/analytics, and Bahrain live payment evidence are attached.
