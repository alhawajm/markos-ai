# MARKOS AI Current Status, Roadmap, and Ownership

Status date: 2026-08-16.

This document is the current implementation and operating overlay for MARKOS AI. It does not replace the structural source of truth in `source/MARKOS_BUILD_SPEC. 2.pdf` or the behavioral source of truth in `source/MARKOS_EXPERIENCE_FLOWS.md`. Use it to avoid treating target architecture, implemented code, automated tests, and external production evidence as the same thing.

Detailed milestone gates remain in `milestone-checklist.md`. Durable engineering decisions remain in `decisions.md`. Railway reconstruction and operations remain in `staging-deploy.md`.

## Status language

- **Implemented:** the behavior exists in the current `main` source. This does not prove a real external provider or production environment.
- **Locally/CI verified:** automated tests or repository gates exercised the behavior with local, fake, or disposable dependencies.
- **Production-verified:** the project team observed the behavior against the deployed application and a real external provider. The date and narrow scope must be stated.
- **Planned:** an accepted near-term outcome without completion evidence.
- **Proposed:** a technical direction still awaiting a decision.
- **Deferred:** deliberately outside the current phase.
- **Externally managed:** state held in Railway, Meta, OpenAI, or another dashboard that this repository cannot prove. Verify it in that system before relying on it.

## Product and first-release scope

MARKOS AI is an AI-assisted social-media marketing platform primarily for small businesses and entrepreneurs in Bahrain, developed by Ra'edat Software Company W.L.L. It is designed for multiple external client workspaces, not only Ra'edat accounts. Workspace authorization and isolation, encrypted provider credentials, and correct provider-account identity are therefore release requirements.

The confirmed first-release Instagram outcomes are:

1. Connect external clients' Instagram professional accounts.
2. Publish approved content to those accounts.
3. Retrieve relevant insights and analytics.

Messaging and comment management are not confirmed first-release requirements. A Meta use-case selection that exposes those capabilities does not add them to MARKOS scope by itself.

The intended final Strategy choices are 30, 60, and 90 days. Which choices belong to which plans is unresolved, and a possible 7-day option is not yet an accepted contract. Current `main` offers 30/60/90 in the Sunlit UI, defaults that UI to 30, and accepts any integer from 30 through 180 at the shared API boundary.

## Current architecture overlay

| Area           | Current repository evidence                                                                                                                                           | Target or open work                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Web            | Next.js 16 and React 19 in `apps/web`; the adopted Sunlit landing, auth, onboarding, Overview, Strategy, Create, Insights, Business Profile, and Settings routes call the Fastify API through `NEXT_PUBLIC_API_BASE_URL`. | Restore the complete final-system operational surface recorded in `ui-design-foundation.md` and continue consequential UI review with Mohamed. |
| API            | Fastify, Prisma 6, PostgreSQL/pgvector, workspace middleware, application-role RLS, and provider orchestration in `apps/api`.                                         | Continue auth lifecycle, email delivery, API, and security hardening.                                                                      |
| Worker         | A separate API-owned interval worker runs publishing, analytics, token-refresh, usage-reset, and email tasks.                                                         | Review production deployment, retries, availability, and future queue needs.                                                               |
| AI service     | Python 3.11 FastAPI service with OpenAI-capable Strategy and onboarding-profile adapters plus deterministic local embeddings, content, image, and generic agent responses. | Deploy and live-verify the shared structured-output path and completed onboarding-profile journey.                                          |
| Data           | One clean Prisma baseline for a new pgvector PostgreSQL database; plan-only idempotent seed; workspace RLS policies and isolation tests.                              | Review the deployed database safely and use forward migrations for any non-disposable existing database.                                   |
| Cache/search   | Redis and OpenSearch are local Compose dependencies and API deep-health dependencies.                                                                                 | Confirm whether and how each is deployed and networked on Railway.                                                                         |
| Media          | Workspace-scoped local filesystem storage and an API-served public URL fallback; publish readiness requires public HTTPS media.                                       | Choose durable image storage/CDN and upload flow before live publishing. S3 + CloudFront is the build-spec direction, not a deployed fact. |
| Infrastructure | Railway is the current early-stage operating direction. The repository also publishes GHCR images and contains an optional ECS workflow plus a placeholder CDK stack. | AWS is a possible later direction, not an approved migration plan or current implementation.                                               |

Repository runtime requirements are Node.js `>=20.16.0 <21 || >=22.3.0`, pnpm 11.5.2, and Python `>=3.11,<3.12`. The handoff recorded Node.js 22.23.1, Python 3.11.9, Docker Desktop 29.6.2, Docker Compose 5.3.1, and Git 2.54.0 for Windows as one historically working developer setup; those exact patch versions are not repository minimums.

## Current status snapshot

| Capability                                                                                       | Status                                                           | Evidence and limit                                                                                                                                                                                                                       |
| ------------------------------------------------------------------------------------------------ | ---------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Instagram business-basic connection                                                              | **Production-verified on 2026-08-03**                            | One real professional account completed OAuth, appeared Connected in production Settings, and loaded its bounded recent media. The repository implements and tests the same path.                                                        |
| OAuth state, binding, replay protection, encryption, atomic persistence, and sanitized telemetry | **Implemented and locally/CI verified**                          | Current source and focused tests cover signed expiry-bound state, user/workspace transaction binding, atomic nonce consumption, canonical encrypted credentials, transaction rollback, secured reads, stable diagnostics, and redaction. |
| Instagram token refresh and disconnect                                                           | **Implemented and locally/CI verified; deauthorization Railway-test verified** | Manual and worker refresh paths, expiration handling, guaranteed local cleanup, an explicit Instagram Apps and websites removal action, and strict signed callback handling exist. Railway testing verified local disconnect, manual provider removal, multipart signed-request verification, credential matching, cleanup, audit persistence, callback completion, and HTTP 200. A full production token lifetime, former-token invalidation, and end-to-end data-deletion behavior remain unverified follow-ups. |
| Instagram publishing                                                                             | **Implemented behind `dry_run`/`live`; not production-verified** | Container creation, polling, publish, readiness, limits, and failure handling have mocked/local tests. No real image or reel publish evidence is recorded.                                                                               |
| Instagram insights/analytics                                                                     | **Partially implemented; not production-verified**               | Provider, sync, worker, UI, PDF, and Vault-learning paths exist. The active OAuth client requests only `instagram_business_basic`; insights permission work and live evidence remain open.                                               |
| Meta App Review                                                                                  | **Externally managed; not repository-proven**                    | Preparation documentation exists. Submission or approval must be verified in the Meta dashboard.                                                                                                                                         |
| Account-verification email                                                                       | **Implemented on current `main`; production delivery pending** | Current source has bilingual verification UI, Redis-backed expiring single-use tokens, local and SendGrid providers, production fail-fast configuration, and verified-user gates for onboarding, AI generation, and Instagram credential actions. Focused tests are recorded; real delivery and the deployed link remain unverified. |
| MFA and browser bearer-token lifecycle                                                           | **Implemented on current `main`; production journey pending** | TOTP, access/refresh issuance, rotation, and reuse detection have focused tests. Enrollment renders the API-provided `otpauth://` value locally with a manual-key fallback. Instagram credential changes require a fixed, non-sliding 15-minute MFA step-up that survives refresh and the OAuth round trip; a deployed authenticator journey remains pending. |
| Seven-module onboarding and resolved business profile                                            | **Implemented and locally verified; deployment and live journey review pending** | The active wizard collects Company, Story, Products, Audience, Competitors, Brand, and Objectives, persists only disclosed answers, and blocks advancement on validation/API failure. At 100% completeness, a verified user can generate, edit in English and Arabic, regenerate, and approve a workspace-scoped business profile before onboarding becomes complete. Focused API, browser, isolation, and responsive-layout tests pass; the provider-backed deployed journey is not yet verified. |
| AI provider inference                                                                            | **Provider connectivity verified; application paths require renewed live verification** | A controlled direct Responses API request from the deployed AI container completed on 2026-08-06 and appeared in the OpenAI project logs, proving the project key, model access, billing, and outbound connectivity for that request. The then-deployed Strategy adapter still returned `AI_PROVIDER_UNAVAILABLE`. Current source replaces its parsed-response dependency with a shared strict JSON Schema `responses.create` path used by Strategy and onboarding profile resolution, with bounded timeouts/retries, sanitized diagnostics, and provider token metering. Local and fake-client tests pass; the new application path is not yet deployed or live-verified. Other AI routes remain deterministic. |
| Railway production topology                                                                      | **Partly externally evidenced**                                  | The 2026-08-03 connection proves a reachable web/API/database path for that attempt. User-supplied 2026-08-16 Railway screenshots additionally show variable panels for web, API, AI, pgvector, and Redis services, but not values, deployments, networking, worker/OpenSearch existence, or health. The exact topology still requires an operator audit. |
| AI service on Railway                                                                            | **Deployed and reachable; provider-backed application response pending** | On 2026-08-06, API deep health reported the Railway AI dependency `ok`, and the protected Strategy request reached the AI provider layer. A direct provider request from the same container succeeded, but the application Strategy request returned 503 under the prior adapter. Deploy and verify the current shared adapter before calling the path complete. |
| Durable media storage/CDN                                                                        | **Proposed**                                                     | No S3/CloudFront or alternative durable adapter exists on `main`. Do not enable live publishing on Railway container storage.                                                                                                            |
| Launch readiness                                                                                 | **Not complete**                                                 | Production connection is one completed milestone, not proof of publishing, analytics, payments, AI, App Review, or the complete M6 gate.                                                                                                 |
| Sunlit browser journey                                                                           | **Partially implemented and locally/browser tested**             | The canonical public/auth/onboarding/primary-app routes are mounted. PR #19 also removed old queue, full analytics, full Vault, AI consultant, and admin panels before complete Sunlit replacements existed; their final-system capabilities remain deferred restoration work.                              |

## Production Instagram connection record

On 2026-08-03, the production Settings UI showed a real test professional account as Connected and rendered its recent provider-owned media. This is project-observed external evidence; this documentation reconciliation did not access Railway, Meta, credentials, production logs, or production data to reproduce it.

For that successful attempt, the observed outcome together with the current callback implementation establishes completion of:

- OAuth start and the provider authorization round-trip;
- callback input handling;
- signed-state verification and expiry checks;
- user/workspace/transaction binding and atomic single-use consumption;
- short-lived and long-lived token exchanges;
- token-authenticated `/me` profile retrieval and professional-account resolution from `/me.user_id`;
- canonical-key validation, AES-256-GCM credential encryption, and persistence;
- one workspace-scoped transaction for the connection, bounded recent media, and `INSTAGRAM_CONNECTED` audit row;
- the required secured post-persistence read and connection-status transformation;
- success redirect and the production Settings refresh.

The application cannot observe Meta's internal account-selection and consent screens as separate lifecycle events. The successful return proves the round-trip outcome, while server telemetry intentionally records only minimal start/callback lifecycle success.

This production result does **not** establish:

- image, carousel, story, or reel publishing;
- insights or analytics;
- Meta App Review submission or approval;
- refresh across a full production token lifetime;
- provider-side revocation, deauthorization, or data-deletion delivery;
- final UI or onboarding quality;
- production AI inference;
- durable storage/CDN readiness;
- payment certification or broad launch readiness.

## Current roadmap

These are current priorities, not claims that each item is already in progress:

1. Perfect the complete user journey and restore the final-system operational surfaces that did not receive Sunlit replacements in PR #19.
2. Validate, deploy, and production-verify account-verification email delivery.
3. Deploy and production-verify the completed browser session renewal journey, including one required login for sessions created before the cookie contract.
4. Fix UI issues with Mohamed involved in UI review and consequential direction.
5. Continue security, sanitized logging, and API-process hardening.
6. Deploy and live-verify the shared provider-backed Strategy and onboarding-profile response path.
7. Strengthen Railway, database, networking, environment-variable, secret, and deployment operations.
8. Choose and prepare durable image storage and delivery for future publishing.
9. Map, implement, review, and live-verify the remaining first-release permissions: `instagram_business_content_publish` and `instagram_business_manage_insights`.

Each permission keeps its own application, Meta dashboard/App Review, environment, reconnect, test, and external-evidence gate. Neither is active today. Editing `INSTAGRAM_OAUTH_SCOPES` cannot expand the active client: current code fixes the requested permission to `instagram_business_basic`.

## AI delivery phases

### Phase 1: service deployment and connectivity

The FastAPI service is deployed on Railway, the API can reach it, and the protected boundary accepts the configured shared internal bearer token. A direct minimal OpenAI Responses request from the service completed, but the then-deployed Strategy adapter failed before returning an application response. The remaining Phase 1 gate is to deploy the shared structured-output adapter and receive one real Strategy response through the browser-to-API-to-AI path.

The current service's `/ai/health` is a shallow process check. `/ai/health/deep` intentionally reports `degraded` with database, provider, and embedding dependencies `not_checked`. Source and tests enforce `INTERNAL_SERVICE_TOKEN` on non-health AI routes and send it from the API. The deployed Strategy attempt passed that internal boundary and reached provider handling; the default development token remains unsuitable as a production secret.

An OpenAI API Platform project and project-authorized credential are separate from a ChatGPT or Codex subscription and its billing. Prefer a project-owned service-account credential over a personal shared key, inject it only into the AI service, and never commit or log it. The current source consumes `OPENAI_API_KEY` only when `AI_TEXT_PROVIDER=openai`; local mode remains the default.

### Phase 2: first onboarding behavior

Current source uses the user's seven onboarding modules to generate a bilingual draft business profile, preserves the raw answers and generation history, supports editing and regeneration, and marks onboarding complete only after user approval. Khalid owns the product behavior and integration; Sarah owns deployment, networking, availability, and secret configuration. Local tests and responsive browser review pass; deployment and one controlled provider-backed end-to-end approval remain open.

### Phase 3: grounded AI maturity

Connect provider-backed embeddings, pgvector storage, workspace-scoped retrieval, prompt assembly, generation, metering, and broader agent quality. The repository already has Vault storage/RAG orchestration and deterministic embeddings, but that does not prove provider-backed retrieval or mature agent behavior.

## Team ownership

| Person             | Current ownership                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mohamed Al-Hawaj   | Repository owner and primary technical mentor; reviews consequential decisions; participates in current UI work; controls or authorizes project-level provider credentials where appropriate.                                                                                                                                                                                          |
| Khalid Awadelkarim | Software-development intern and current development/project-coordination owner; owns application integration, the complete journey, UI coordination with Mohamed, verification email behavior, MFA, bearer-token lifecycle, onboarding-agent behavior, and roadmap coordination. Khalid is Sarah's teammate, not her formal supervisor.                                                |
| Sarah Mansour      | Continuing owner of Railway infrastructure/deployments, PostgreSQL operational setup, environment variables/secrets, cloud networking, FastAPI AI deployment and availability, storage/CDN decisions, and cloud requirements for future publishing. Sarah may propose and make cloud decisions, coordinate application-impacting changes with Khalid, and involve Mohamed when needed. |

Do not move Sarah-owned cloud work to Khalid merely because it affects application behavior. Conversely, onboarding behavior and product integration do not become cloud work merely because they call a deployed service.

## Railway and cloud follow-ups

The old 2026-08-06 assignment list is no longer presented as a current deadline. Sarah retains ownership of Railway, deployed PostgreSQL, service networking, secrets, AI availability, and storage/CDN decisions. The current externally managed follow-ups are:

1. Inventory the actual Railway project/environment, deployment sources, web/API/AI/worker/dependency services, networking, domains, build/start settings, health checks, and deploy triggers.
2. Reconcile service variable names against `staging-deploy.md` without copying values; preserve reserved future variables until their owning feature is reviewed.
3. Deploy and live-verify the current shared Strategy/onboarding-profile structured-output path through the browser-to-API-to-AI journey.
4. Inspect deployed PostgreSQL extensions, roles, migration history, backups, connection limits, and RLS without applying the clean baseline to valuable existing data.
5. Decide the durable media/storage contract required before live Instagram publishing.

## Open decisions and deferred work

| Topic                                           | Current classification                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Railway through roughly the first 50 users      | Current operating direction; capacity and security still require observation.                                                                    |
| AWS migration or expansion                      | Possible later direction; not approved or scheduled.                                                                                             |
| S3 + CloudFront for the Railway MVP             | Build-spec target and one candidate, not a current deployment or final MVP decision.                                                             |
| Browser-direct versus API-mediated image upload | Proposed; Sarah's storage decision should resolve the first implementation step.                                                                 |
| Additional Railway environments                 | Proposed; the repository cannot prove the current dashboard topology, and no new environment is mandated by this document.                       |
| Full AI retry/cost/governance system            | Broader build-spec target; defer non-critical complexity until the first provider connection, while retaining current quota/metering invariants. |
| Publishing and insights permissions             | Accepted remaining first-release scope; both are currently unimplemented in active OAuth and retain independent review/evidence gates.           |
| Messaging/comments                              | Deferred unless separately approved as product scope.                                                                                            |
| Graph transport/version                         | Current code separates an Instagram Login/account client from publishing/analytics adapter settings. Use v25.0 provisionally; verify the correct hosts, versioning, fields, and permission contracts in the API research phase before live activation. |
| Strategy plan entitlement                       | 30/60/90 are the final target choices; plan mapping is undecided and 7 days remains a possible future option.                                      |
| Missing Sunlit operational pages                | Deferred restoration/reimplementation, not removed product scope; see `ui-design-foundation.md`.                                                  |

## External state to verify manually

Before describing any of these as current, verify them in the owning dashboard without copying sensitive values into issues, commits, or chat:

- Railway project, environment, services, deployment sources, domains, health checks, private networking, variables, and current AI-service state;
- Meta App type, portfolio, use case, Graph version, mode, permissions, roles, redirect/callback URLs, webhook subscriptions, and App Review status;
- OpenAI API organization/project, service account, billing, limits, and credential authorization;
- payment-provider certification and live-mode status;
- storage/CDN resources and public-media delivery behavior.

## Authoritative documentation map

- Structural target: `source/MARKOS_BUILD_SPEC. 2.pdf`
- Behavioral target: `source/MARKOS_EXPERIENCE_FLOWS.md`
- Current implementation/roadmap/ownership: this document
- Detailed milestone status: `milestone-checklist.md`
- Durable decisions: `decisions.md`
- Railway deployment and environment operations: `staging-deploy.md`
- Instagram/App Review status: `instagram-app-review.md`
- Publishing and analytics external verification: `instagram-live-publish-verification.md` and `instagram-analytics-live-verification.md`
- AI service current state and phases: `../services/ai/README.md`
- Launch evidence: `m6-acceptance-evidence.md`
- Active source index and retired-source history: `source/README.md` and `archive/source/README.md`
