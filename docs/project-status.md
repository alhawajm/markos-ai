# MARKOS AI Current Status, Roadmap, and Ownership

Status date: 2026-08-05.

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

## Current architecture overlay

| Area           | Current repository evidence                                                                                                                                           | Target or open work                                                                                                                        |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| Web            | Next.js 16 and React 19 in `apps/web`; browser calls the Fastify API through `NEXT_PUBLIC_API_BASE_URL`.                                                              | Complete the end-to-end journey and UI review with Mohamed.                                                                                |
| API            | Fastify, Prisma 6, PostgreSQL/pgvector, workspace middleware, application-role RLS, and provider orchestration in `apps/api`.                                         | Continue auth lifecycle, email delivery, API, and security hardening.                                                                      |
| Worker         | A separate API-owned interval worker runs publishing, analytics, token-refresh, usage-reset, and email tasks.                                                         | Review production deployment, retries, availability, and future queue needs.                                                               |
| AI service     | Python 3.11 FastAPI service with an OpenAI-capable Strategy adapter plus deterministic local embeddings, content, image, and generic agent responses.                  | Create the project credential, run one controlled live Strategy response, then deploy and production-verify the protected path.            |
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
| Account-verification email                                                                       | **Partially implemented**                                        | Token creation/verification is tested; non-production may return the raw token. Production transactional email delivery is not proven.                                                                                                   |
| MFA and browser bearer-token lifecycle                                                           | **Implemented and locally verified; production deployment pending** | TOTP, access/refresh issuance, rotation, and reuse detection have tests. Enrollment now renders the API-provided `otpauth://` value as a local QR code with a manual-key fallback and a readable six-digit field. The browser keeps refresh credentials in an `httpOnly` cookie, silently renews an in-memory access token, serializes refresh across tabs, and returns terminally expired sessions through interactive login to Profile. |
| Seven-module onboarding UI                                                                       | **Implemented and locally verified; visual and live journey review pending** | The active wizard now collects Company, Story, Products, Audience, Competitors, Brand, and Objectives, persists only disclosed answers, pre-fills only the authenticated workspace name, blocks advancement on validation/API failure, and retains the current draft under a reset versioned browser key. The review step no longer simulates AI work or fabricated readiness metrics. |
| AI provider inference                                                                            | **Implemented behind an explicit provider switch; not live-verified** | Strategy can use the OpenAI Responses API with strict structured output, bounded timeouts/retries, safe errors, actual provider token usage, requested locale, and authenticated API-to-AI calls. Local and fake-client tests pass; no real key, provider response, billing observation, or Railway evidence exists yet. Other AI routes remain deterministic. |
| Railway production topology                                                                      | **Partly externally evidenced**                                  | The 2026-08-03 production connection proves a reachable web/API/database path for that attempt. The exact Railway project, environment, service inventory, networking, and dependency health still require a dashboard audit.            |
| AI service on Railway                                                                            | **Not production-verified**                                      | A Dockerfile exists, but code or a container image is not deployment evidence. The handoff states it had not yet been deployed.                                                                                                          |
| Durable media storage/CDN                                                                        | **Proposed**                                                     | No S3/CloudFront or alternative durable adapter exists on `main`. Do not enable live publishing on Railway container storage.                                                                                                            |
| Launch readiness                                                                                 | **Not complete**                                                 | Production connection is one completed milestone, not proof of publishing, analytics, payments, AI, App Review, or the complete M6 gate.                                                                                                 |

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

1. Perfect the complete user journey.
2. Implement and production-verify account-verification email delivery.
3. Deploy and production-verify the completed browser session renewal journey, including one required login for sessions created before the cookie contract.
4. Fix UI issues with Mohamed involved in UI review and consequential direction.
5. Continue security, sanitized logging, and API-process hardening.
6. Live-verify the first provider-backed Strategy response, then connect the next onboarding-specific AI behavior.
7. Strengthen Railway, database, networking, environment-variable, secret, and deployment operations.
8. Choose and prepare durable image storage and delivery for future publishing.
9. Move toward `instagram_business_content_publish` only after the current foundation is ready.

Publishing and analytics permission expansion must be a coordinated code, Meta dashboard, environment, test, and evidence change. Editing `INSTAGRAM_OAUTH_SCOPES` cannot expand the active client: current code fixes the requested permission to `instagram_business_basic`.

## AI delivery phases

### Phase 1: service deployment and connectivity

Deploy the smallest healthy FastAPI service, make the API reach it over an appropriate Railway network path, configure the same non-default internal bearer token in both services, and receive one real OpenAI-backed Strategy response after an authorized API Platform project credential is available. Document health, networking, variables, and troubleshooting.

The current service's `/ai/health` is a shallow process check. `/ai/health/deep` intentionally reports `degraded` with database, provider, and embedding dependencies `not_checked`. Source and tests enforce `INTERNAL_SERVICE_TOKEN` on non-health AI routes and send it from the API, but the default development value is not a production secret and no deployed boundary test exists.

An OpenAI API Platform project and project-authorized credential are separate from a ChatGPT or Codex subscription and its billing. Prefer a project-owned service-account credential over a personal shared key, inject it only into the AI service, and never commit or log it. The current source consumes `OPENAI_API_KEY` only when `AI_TEXT_PROVIDER=openai`; local mode remains the default.

### Phase 2: first onboarding behavior

Use the user's onboarding/business answers to generate a draft business profile. Khalid owns the product behavior and integration; Sarah owns deployment, networking, availability, and secret configuration.

### Phase 3: grounded AI maturity

Connect provider-backed embeddings, pgvector storage, workspace-scoped retrieval, prompt assembly, generation, metering, and broader agent quality. The repository already has Vault storage/RAG orchestration and deterministic embeddings, but that does not prove provider-backed retrieval or mature agent behavior.

## Team ownership

| Person             | Current ownership                                                                                                                                                                                                                                                                                                                                                                      |
| ------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Mohamed Al-Hawaj   | Repository owner and primary technical mentor; reviews consequential decisions; participates in current UI work; controls or authorizes project-level provider credentials where appropriate.                                                                                                                                                                                          |
| Khalid Awadelkarim | Software-development intern and current development/project-coordination owner; owns application integration, the complete journey, UI coordination with Mohamed, verification email behavior, MFA, bearer-token lifecycle, onboarding-agent behavior, and roadmap coordination. Khalid is Sarah's teammate, not her formal supervisor.                                                |
| Sarah Mansour      | Continuing owner of Railway infrastructure/deployments, PostgreSQL operational setup, environment variables/secrets, cloud networking, FastAPI AI deployment and availability, storage/CDN decisions, and cloud requirements for future publishing. Sarah may propose and make cloud decisions, coordinate application-impacting changes with Khalid, and involve Mohamed when needed. |

Do not move Sarah-owned cloud work to Khalid merely because it affects application behavior. Conversely, onboarding behavior and product integration do not become cloud work merely because they call a deployed service.

## Sarah's immediate assignment batch

Target date: Thursday, 2026-08-06. These are short current assignments, not permanent architecture decisions or a month-long rigid plan.

1. **Railway review and runbook:** compare actual services with repository Dockerfiles and documentation; cover web, API, PostgreSQL, Redis/OpenSearch where applicable, networking, domains, build/start behavior, health checks, dependencies, and AI-service status; update the A-to-Z runbook and correct only clear low-risk mismatches through focused PRs.
2. **Environment variables and secrets:** inventory names and purposes by service without values; recommend service-local versus shared organization; identify missing, duplicate, obsolete, or weakly validated settings; prepare safe future handling for the OpenAI project credential. Startup validation is Sarah's decision after inspection; credential-rotation procedures may be deferred from this batch.
3. **AI service deployment:** assess the current FastAPI service and provider-capable Strategy path, deploy the smallest healthy service, establish protected backend connectivity, demonstrate one simple request/response, and document blockers. This assignment does not make the broader AI platform production-ready.
4. **Database review:** inspect Prisma schema, the clean baseline, migration reliability, relationships, constraints, RLS/isolation, indexes, connection handling, and deployed PostgreSQL; rank the three most important improvements; implement only the first clearly justified safe improvement with migration/tests when appropriate. Coordinate with Khalid before application-affecting or potentially destructive work; do not make undocumented manual production-schema changes.
5. **Image storage/CDN decision:** compare the build specification's S3 + CloudFront target with a simpler Railway MVP; decide storage/CDN, browser-direct versus API-mediated upload, workspace isolation, file-type/size validation, Meta-fetchable URL behavior, services, and variable names; record deferred hardening and an implementation-ready first step. This does not include a complete publishing pipeline or immediate Meta permission change.

## Open decisions and deferred work

| Topic                                           | Current classification                                                                                                                           |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------ |
| Railway through roughly the first 50 users      | Current operating direction; capacity and security still require observation.                                                                    |
| AWS migration or expansion                      | Possible later direction; not approved or scheduled.                                                                                             |
| S3 + CloudFront for the Railway MVP             | Build-spec target and one candidate, not a current deployment or final MVP decision.                                                             |
| Browser-direct versus API-mediated image upload | Proposed; Sarah's storage decision should resolve the first implementation step.                                                                 |
| Additional Railway environments                 | Proposed; the repository cannot prove the current dashboard topology, and no new environment is mandated by this document.                       |
| Full AI retry/cost/governance system            | Broader build-spec target; defer non-critical complexity until the first provider connection, while retaining current quota/metering invariants. |
| Publishing and insights permission timing       | Planned after foundation stabilization and explicit review; no automatic date.                                                                   |
| Messaging/comments                              | Deferred unless separately approved as product scope.                                                                                            |

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
