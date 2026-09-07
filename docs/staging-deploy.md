# Railway Deployment and Staging Runbook

Status date: 2026-08-19.

Railway is the current early-stage operating direction for MARKOS AI. The working planning horizon is approximately the first 50 users while capacity, reliability, cost, and security are observed. AWS may be considered later; no migration is approved or scheduled.

This is the A-to-Z repository runbook for reconstructing and auditing the deployment. It records variable **names and contracts only**. Never add values, credentials, provider identifiers, signed URLs, callback query strings, database connection strings, or customer data.

## Evidence boundary

The repository proves Dockerfiles, commands, health endpoints, environment parsing, database initialization, CI behavior, and application contracts. It cannot prove the current Railway dashboard.

The handoff reports one repository and an early-stage Railway deployment. On 2026-08-03, one production Instagram connection succeeded, which externally verifies a reachable web/API/database path for that attempt. User-supplied Railway variable screenshots captured on 2026-08-16 show service panels for `web`, `api`, `ai`, `pgvector`, and `redis`; additional redacted API captures supplied on 2026-08-17 show the existing `API_BASE_URL` and Instagram variable names. Later on 2026-08-17, Sarah reported that she provisioned the private Bucket, connected its five credentials to the API, set `AWS_S3_URL_STYLE=virtual`, saw a test image in the Bucket, and observed the baseline API deployment with all listed services online. This is operator-reported configuration evidence; it does not prove the reviewed application commit, deployed SHA, application-path upload/read/delete, external presigned GET, exact public/private networking, worker/OpenSearch existence, or the complete project/environment topology.

PRs #18, #19, and #20 are merged into the current repository `main`. The supplied screenshots do not expose the deployed commit SHA, so repository merge state must not be described as current Railway deployment proof. The shared provider-backed Campaign/onboarding-profile application path still requires a controlled live request and persisted-result review.

## Current service contract

| Service/dependency | Repository source                                      | Start/listen contract                                                                                 | Health/readiness                                            | Current external status                                                                                                                                            |
| ------------------ | ------------------------------------------------------ | ----------------------------------------------------------------------------------------------------- | ----------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Web                | `apps/web/Dockerfile`                                  | `pnpm --filter web start`; Next.js default port 3000                                                  | `/ar`, `/en`, and `/en/app/settings` for rendered Settings  | A 2026-08-16 screenshot shows its variable panel; production Settings participated in the 2026-08-03 connection. Verify source, deployed SHA, domain, build variable, and health check. |
| API                | `apps/api/Dockerfile`                                  | `pnpm --filter api start`; listens on injected `PORT` or `API_PORT`                                   | `/v1/health`, `/v1/health/deep`                             | A 2026-08-16 screenshot shows its variable panel; callback and persistence completed on 2026-08-03. Verify current deployment, SHA, and dependencies. |
| Worker             | `apps/api/worker.Dockerfile`                           | `pnpm --filter api worker`; no HTTP port                                                              | Worker lifecycle logs and resulting database/audit state    | Repository implementation only; verify whether a Railway worker service exists and is healthy.                                                                     |
| AI                 | `services/ai/Dockerfile`                               | Uvicorn on fixed port 8000                                                                            | `/ai/health`; `/ai/health/deep` currently always `degraded` | A 2026-08-16 screenshot shows its variable panel. A prior direct provider request succeeded, but the current application adapter remains pending deployed verification. |
| PostgreSQL         | `apps/api/prisma`, `apps/api/prisma/init/001-init.sql` | PostgreSQL with `vector`, `pgcrypto`, `uuid_generate_v7()`, `markos`, and `markos_app`                | Prisma migration status plus application-role/RLS checks    | A `pgvector` variable panel is externally evidenced and persistence worked for the production connection; version, extensions, roles, backups, limits, and migration history still require operator verification. |
| Redis              | `docker-compose.yml`, API auth/cache code               | Redis URL supplied to the API                                                                         | API deep health                                             | A `redis` variable panel is externally evidenced; deployment status, private networking, persistence expectations, and availability remain unverified. The current maintenance worker does not consume Redis. |
| OpenSearch         | `docker-compose.yml`, API deep-health probe only        | Optional reachable HTTP service for the deep-health report                                             | API deep health checks `/_cluster/health`                   | Not required for the 2026-08-20 showcase. No current product or worker path queries OpenSearch, so provisioning is deferred.                                         |
| Media storage      | `apps/api/src/media/storage-service.ts`                | `MEDIA_STORAGE_DRIVER` selects local filesystem or private S3-compatible storage; ordinary URLs use the API media route and provider reads are signed just in time | Upload/read smoke plus external signed GET and Meta fetchability when publishing | Sarah reports that the private Bucket and API credential wiring are complete and a test image is visible in the Bucket. Application-path upload/read/delete, external presigned GET, reviewed-code deployment, and Meta fetchability remain unverified. |

The repository's `.github/workflows/deploy-staging.yml` builds and publishes web, API, worker, and AI images to GHCR. It can optionally roll AWS ECS when GitHub environment variables exist. That workflow is not proof of the current Railway deployment and does not make AWS the current platform.

## Runtime prerequisites

- Node.js `>=20.16.0 <21 || >=22.3.0`; deployment Dockerfiles use Node 22.
- pnpm 11.5.2 through Corepack.
- Python `>=3.11,<3.12`; the AI Dockerfile uses Python 3.11.
- PostgreSQL 16-compatible server with pgvector and privileges needed by the initialization contract.
- Redis 7-compatible service for the API's authentication/cache behavior.
- OpenSearch is a local Compose dependency and an optional API deep-health probe; it is not a current staging feature prerequisite.
- Public HTTPS domains for browser, API, and Meta callbacks.

## Environment loading contract

Environment sources are deliberately separate:

- Local API, worker, and Prisma seed entry points load an optional repository-root `.env` without overriding variables already supplied by the shell. That ignored file is for local/fake values only.
- Prisma generation/migration commands do not import the API entry point. Supply `DATABASE_URL` to the invoking process or through Prisma's package-local convention.
- Next.js uses `apps/web/.env*` locally. `NEXT_PUBLIC_*` values are browser-visible build inputs, not server-only secrets.
- GitHub Actions supplies explicit fake test values in `.github/workflows/ci.yml`; it does not consume `.env` or `.env.example`.
- Docker build contexts exclude `.env` files. The images do not copy local environment files.
- Railway injects runtime variables per service. `NEXT_PUBLIC_API_BASE_URL` must also be available during the web image build because Next.js embeds public variables at `next build` time.

With `NODE_ENV=production`, the API refuses to start unless SendGrid delivery is complete. Keep the production email variables coherent before any deployment so a nominally successful release cannot leave signup without verification delivery.

## Variable inventory by service

This inventory reflects current consumers. Sarah owns the external audit and the decision about service-local versus shared organization. Do not infer that a name exists in Railway because it exists here.

### Web build/runtime

- `NEXT_PUBLIC_API_BASE_URL` — public API HTTPS origin; required at build time.
- `NEXT_PUBLIC_SENTRY_DSN`
- `NEXT_PUBLIC_SENTRY_ENVIRONMENT`
- `NEXT_PUBLIC_SENTRY_RELEASE`
- `NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE`

### API runtime

Core and dependencies:

- `NODE_ENV`
- `PORT` or `API_PORT`
- `API_BASE_URL`
- `WEB_BASE_URL`
- `AI_BASE_URL`
- `INTERNAL_SERVICE_TOKEN`
- `AI_HTTP_TIMEOUT_MS`
- `DATABASE_URL`
- `REDIS_URL`
- `OPENSEARCH_URL`
- `HEALTH_DEPENDENCY_TIMEOUT_MS`
- `HEALTH_DATABASE_TIMEOUT_MS`
- `HEALTH_REDIS_TIMEOUT_MS`
- `HEALTH_HTTP_TIMEOUT_MS`

Authentication and application security:

- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `JWT_ACCESS_TTL`
- `JWT_REFRESH_TTL`
- `MFA_STEP_UP_TTL`
- `EMAIL_VERIFICATION_TTL`
- `EMAIL_PROVIDER` — must be `sendgrid` in production.
- `SENDGRID_API_KEY` — API-only secret with transactional mail access.
- `FROM_EMAIL` — a sender address authorized by the configured SendGrid account/domain.
- `MFA_ISSUER`
- `GOOGLE_OAUTH_CLIENT_ID`
- `GOOGLE_OAUTH_ISSUER`
- `GOOGLE_OAUTH_JWKS_URL`

Media and models:

- `MEDIA_STORAGE_DRIVER` — `local` for development; `s3` for the Milestone A Railway deployment.
- `MEDIA_STORAGE_DIR` — used only by the local driver.
- `MEDIA_PUBLIC_BASE_URL` — optional stable media-proxy origin. Omit it when `API_BASE_URL` is the canonical public HTTPS API origin.
- `AWS_ENDPOINT_URL` — required for `s3`; reference the Bucket-generated variable.
- `AWS_ACCESS_KEY_ID` — required for `s3`; secret Bucket-generated reference.
- `AWS_SECRET_ACCESS_KEY` — required for `s3`; secret Bucket-generated reference.
- `AWS_S3_BUCKET_NAME` — required for `s3`; Bucket-generated reference.
- `AWS_DEFAULT_REGION` — required for `s3`; Bucket-generated reference.
- `AWS_S3_URL_STYLE` — required for `s3`; set the application-owned value to `virtual` for Railway Buckets. The Railway dashboard does not expose a corresponding service-reference variable, while [Railway CLI credential output](https://docs.railway.com/cli/bucket#show-or-reset-credentials) reports `urlStyle: "virtual"`.
- `SIGNED_URL_TTL` — provider-only presigned GET lifetime in seconds; default `3600`, accepted range `300`–`86400`.
- `LLM_PRIMARY_MODEL`
- `LLM_LONGFORM_MODEL`
- `IMAGE_MODEL_PRIMARY`
- `IMAGE_MODEL_FALLBACK`

Instagram Login and callbacks:

- `INSTAGRAM_APP_ID`
- `INSTAGRAM_APP_SECRET`
- `INSTAGRAM_OAUTH_REDIRECT_URI`
- `INSTAGRAM_OAUTH_STATE_SECRET`
- `INSTAGRAM_TOKEN_ENCRYPTION_KEY`
- `INSTAGRAM_GRAPH_VERSION`
- `INSTAGRAM_OAUTH_SCOPES` — canonical allowlist for exactly the requested release subset. Milestone A uses `instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights`; duplicates, unknown names, missing basic, and old Facebook Login names are rejected.
- `INSTAGRAM_GRAPH_REQUEST_TIMEOUT_MS`
- `INSTAGRAM_GRAPH_MAX_RESPONSE_BYTES`
- `INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS`
- `META_WEBHOOK_VERIFY_TOKEN`

The schema still parses `INSTAGRAM_OAUTH_AUTHORIZE_URL`, `INSTAGRAM_OAUTH_TOKEN_URL`, `INSTAGRAM_LONG_LIVED_TOKEN_URL`, and `INSTAGRAM_REFRESH_TOKEN_URL` as inert compatibility inputs. Active OAuth/account/publishing/analytics clients constrain their provider hosts in code; setting these compatibility names cannot redirect the live clients.

Publishing and analytics foundations:

- `INSTAGRAM_PUBLISH_MODE`
- `INSTAGRAM_ANALYTICS_SYNC_MODE`
- `INSTAGRAM_CONTAINER_POLL_ATTEMPTS`
- `INSTAGRAM_CONTAINER_POLL_DELAY_MS`

OAuth, account, publishing, and analytics code now share the canonical requested-scope set and version contract. Versioned calls use the fixed `https://graph.instagram.com/v25.0` origin, and live provider tokens are sent in bearer headers for publishing and insights. Configuration and readiness do not prove provider-granted permission; a fresh connection and controlled live calls remain required.

D-02 was confirmed on 2026-08-17. For the API service only, set the three application-owned values `MEDIA_STORAGE_DRIVER=s3`, `AWS_S3_URL_STYLE=virtual`, and `SIGNED_URL_TTL=3600`, then add Railway references for the five Bucket credentials: endpoint, access key ID, secret access key, bucket name, and region. Do not duplicate or paste credential values. The environment parser fails closed if any required field is absent, the endpoint is not HTTPS, the public media-proxy origin is not HTTPS, or the TTL is outside its bounded range.

Keep the Bucket private. Do not enable public-bucket access or browser-upload CORS for Milestone A. Do not grant Bucket variables to web, AI, PostgreSQL, or Redis; the worker receives them only when Milestone B enables worker-owned media publishing. Existing `API_BASE_URL` is sufficient for stable application media URLs, so `MEDIA_PUBLIC_BASE_URL` should remain unset unless Sarah intentionally needs a different public API/proxy origin.

Observability:

- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`

### Worker runtime

Follow the focused [Railway worker setup guide](railway-worker-setup.md) for the exact service, reference variables, deployment settings, and live verification sequence. The current worker needs PostgreSQL, the Instagram credential encryption key, live-mode settings, private Bucket access, and the AI service's private URL plus the shared internal-service token for video-generation jobs. It does not consume Redis, OpenSearch, SendGrid, JWT settings, or OAuth callback configuration.

Worker intervals are:

- `WORKER_PUBLISHING_INTERVAL_MS`
- `WORKER_ANALYTICS_EMAIL_INTERVAL_MS`
- `WORKER_ANALYTICS_SYNC_INTERVAL_MS`
- `WORKER_TOKEN_REFRESH_INTERVAL_MS`
- `WORKER_USAGE_RESET_INTERVAL_MS`

For the showcase, set only `WORKER_PUBLISHING_INTERVAL_MS=60000`; the same tick advances both durable publishing and video-generation jobs, while the remaining intervals use their source defaults. Do not copy all API secrets blindly.

### AI runtime

Current code consumes:

- `AI_PORT`
- `INTERNAL_SERVICE_TOKEN` (must match the API value; enforced on non-health routes)
- `AI_TEXT_PROVIDER` (`local` for deterministic Campaign/profile/content development, `openai` for live provider-backed Campaign generation, onboarding profiles, both onboarding document analyzers, and content copy; document analysis has no local product fallback)
- `AI_IMAGE_PROVIDER` (`disabled` by default; `openai` for provider-backed image generation; no synthetic fallback)
- `AI_VIDEO_PROVIDER` (`disabled` by default; `openai` for the temporary Sora showcase bridge)
- `VIDEO_MODEL_PRIMARY` (required when `AI_VIDEO_PROVIDER=openai`; currently `sora-2` for the time-boxed showcase bridge)
- `OPENAI_API_KEY` (AI service only; required when any provider selector is `openai`)
- `AI_CAMPAIGN_TIMEOUT_SECONDS`
- `AI_PROFILE_TIMEOUT_SECONDS`
- `AI_CONTENT_TIMEOUT_SECONDS`
- `AI_IMAGE_TIMEOUT_SECONDS`
- `AI_VIDEO_TIMEOUT_SECONDS`
- `OPENAI_TIMEOUT_SECONDS`
- `OPENAI_MAX_RETRIES`
- `OPENAI_MAX_OUTPUT_TOKENS`
- `OPENAI_REASONING_EFFORT`
- `OPENAI_STORE_RESPONSES` (`true` during the current quality-tuning phase so requests and responses remain inspectable in the OpenAI API dashboard)
- `DATABASE_URL` (configured but not used by current handlers)
- `LLM_PRIMARY_MODEL`
- `LLM_FLAGSHIP_MODEL`
- `LLM_LONGFORM_MODEL`
- `LLM_CHEAP_MODEL`
- `EMBEDDING_MODEL`
- `EMBEDDING_DIMENSIONS`
- `IMAGE_MODEL_PRIMARY`
- `IMAGE_MODEL_FALLBACK`
- `SENTRY_DSN`
- `SENTRY_ENVIRONMENT`
- `SENTRY_RELEASE`
- `SENTRY_TRACES_SAMPLE_RATE`

Inject `OPENAI_API_KEY` only into the AI service. The API reaches the AI service through `AI_BASE_URL`, authenticates with the matching `INTERNAL_SERVICE_TOKEN`, and uses `AI_HTTP_TIMEOUT_MS` as its outer request budget. A configured key or successful shallow health response does not replace a controlled browser-to-API-to-AI request. While `OPENAI_STORE_RESPONSES=true`, use only approved text-provider inputs: the OpenAI project retains Responses API application state for dashboard review. That switch does not control Images API retention. Turn it off when the quality-review phase ends or before the applicable privacy/retention boundary requires stateless text requests.

### 2026-08-20 provider image deployment delta

The provider-backed image path requires only these deliberate changes:

- API: set `IMAGE_MODEL_PRIMARY=gpt-image-2` and update `AI_HTTP_TIMEOUT_MS=130000` so the gateway does not abort a valid long-running image request.
- AI: set `AI_IMAGE_PROVIDER=openai`, `IMAGE_MODEL_PRIMARY=gpt-image-2`, and `AI_IMAGE_TIMEOUT_SECONDS=120`. Keep the existing sealed `OPENAI_API_KEY`; do not copy it to API, web, or worker.
- No web or worker variable is added. No database migration, Redis change, OpenSearch service, or new storage variable is required.

The adapter asks the Images API for one medium-quality JPEG at 90% compression, uses `1024x1024` for 1:1, `1024x1280` for 4:5, and `1008x1792` for 9:16, and keeps automatic provider moderation enabled. The API reserves the workspace's `AI_IMAGE` quota before the paid request, validates the returned bytes and exact dimensions, records provider token usage, and stores the object under the existing workspace-owned S3 path. `OPENAI_STORE_RESPONSES` does not apply to this endpoint; inspect image activity in the same OpenAI project without assuming that the text response-retention switch governs it.

### 2026-08-19 branch deployment delta

Before testing this branch in staging, review the following AI-service values deliberately:

- set `AI_CONTENT_TIMEOUT_SECONDS=50` unless a different reviewed budget is required;
- set `OPENAI_STORE_RESPONSES=true` during the temporary dashboard quality-review phase;
- set `LLM_PRIMARY_MODEL` to the approved content-copy model instead of relying on the compatibility fallback;
- use `AI_TEXT_PROVIDER=openai` only when running the intended real-provider test, and confirm the correct OpenAI project before sending the request.

For the API service, use `INSTAGRAM_CONTAINER_POLL_ATTEMPTS=6` and `INSTAGRAM_CONTAINER_POLL_DELAY_MS=60000`, or remove explicit overrides so these safe defaults apply. This gives the controlled JPEG path one immediate status read followed by five one-minute checks. A timeout requires operator review and is not an automatic retry signal. No other service consumes these values.

The Calendar MVP adds `POST /v1/content/:contentItemId/reschedule` and a new web route, but requires no new environment variable, database migration, storage setting, Redis change, or Railway service. Deploy the existing API and web services. It records and manages schedule state only: until the dedicated worker service is provisioned and verified, a saved `SCHEDULED` item must not be described as proof of automatic Instagram publication.

### 2026-08-16 Railway variable-name snapshot

The user supplied screenshots of the Railway variable panels. Values were hidden except the explicitly visible `INSTAGRAM_GRAPH_VERSION=v25.0`. This is name-level external evidence only; it does not prove validity, service health, sharing, deployment SHA, or runtime consumption.

| Service | Visible service-level names |
| --- | --- |
| Web | `RAILWAY_DOCKERFILE_PATH`, `NEXT_PUBLIC_API_BASE_URL` |
| API | `RAILWAY_DOCKERFILE_PATH`, `DATABASE_URL`, `REDIS_URL`, `API_BASE_URL`, `WEB_BASE_URL`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `NODE_ENV`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_TOKEN_ENCRYPTION_KEY`, `INSTAGRAM_OAUTH_STATE_SECRET`, `INSTAGRAM_GRAPH_VERSION`, `INSTAGRAM_OAUTH_SCOPES`, `INSTAGRAM_PUBLISH_MODE`, `INSTAGRAM_ANALYTICS_SYNC_MODE`, `META_WEBHOOK_VERIFY_TOKEN`, `AI_BASE_URL`, `AI_HTTP_TIMEOUT_MS`, `EMAIL_PROVIDER`, `EMAIL_VERIFICATION_TTL`, `INTERNAL_SERVICE_TOKEN`, `LLM_LONGFORM_MODEL`, `MFA_ISSUER`, `SENDGRID_API_KEY`, `FROM_EMAIL` |
| AI | `INTERNAL_SERVICE_TOKEN`, `AI_TEXT_PROVIDER`, `LLM_LONGFORM_MODEL`, `OPENAI_REASONING_EFFORT`, `OPENAI_TIMEOUT_SECONDS`, `OPENAI_MAX_RETRIES`, `OPENAI_MAX_OUTPUT_TOKENS`, `AI_CAMPAIGN_TIMEOUT_SECONDS`, `PORT`, `AI_PROFILE_TIMEOUT_SECONDS`, `OPENAI_API_KEY` |
| pgvector | `POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `PGDATABASE`, `PGUSER`, `PGPASSWORD`, `PGHOST`, `PGPORT`, `DATABASE_URL`, `PGDATA` |
| Redis | `REDIS_PASSWORD`, `REDIS_URL` |

Railway-added platform variables were collapsed in the screenshots and are not enumerated here. No worker or OpenSearch variable panel was supplied.

Repository/snapshot gaps to resolve deliberately:

- The visible API list does not show health timeouts, worker intervals, Sentry settings, JWT TTLs, Google settings, or a future bucket variable contract. Confirm whether needed names are supplied elsewhere before relying on them; do not infer absence or readiness from a screenshot alone. `OPENSEARCH_URL` may remain unset for the showcase because OpenSearch is not on a current product path. The retired publishing/analytics `META_*` variables are no longer application prerequisites; `META_WEBHOOK_VERIFY_TOKEN` remains separately active.
- The visible AI `PORT` name is ignored by the current fixed-port Docker command. Current code consumes `AI_PORT`, which is not visible in the supplied service-level list.
- The AI screenshot does not show `DATABASE_URL`, `LLM_PRIMARY_MODEL`, `AI_CONTENT_TIMEOUT_SECONDS`, embedding/image model settings, alternate model slots, or Sentry settings. Some are optional or not used by current handlers. Provider-backed content prefers `LLM_PRIMARY_MODEL` and temporarily falls back to the configured long-form model when the gateway supplies an older synthetic `local-*` default; configure the primary slot deliberately instead of treating that compatibility behavior as final setup.
- Reserved future variables that are not part of current work should remain untouched until their feature is reviewed. Do not rename or delete them merely because the current service does not consume them.

## Secret handling

Treat at least database URLs, JWT secrets, Instagram/Meta app secrets, OAuth state secrets, token-encryption keys, webhook verification secrets, future OpenAI/provider keys, and Sentry DSNs as secrets. Keep them out of:

- Git and `.env.example` real values;
- Docker build arguments and `NEXT_PUBLIC_*` names;
- PR text, screenshots, chat, terminal transcripts, and evidence manifests;
- callback URLs or logs containing query data;
- client-side responses and browser storage.

Use names, presence/readiness state, and safe validation outcomes in audits. Never print a secret to prove it exists.

## A-to-Z Railway reconstruction

### 1. Inventory the actual target

In Railway, record without values:

- project and environment names;
- every service and its repository/Dockerfile source;
- current deployment branch/commit;
- public and private domains;
- build, pre-deploy, start, health-check, restart, and replica settings;
- attached PostgreSQL/Redis/OpenSearch/storage resources;
- variable names and whether they are service-local or shared;
- current deployment/health status and last successful deploy.

Compare the result with the service table above. Do not change the dashboard during the inventory pass unless the change is separately authorized.

### 2. Provision dependencies deliberately

For a new environment:

1. Provision PostgreSQL with pgvector support and the privileges required by `001-init.sql`.
2. Provision Redis if auth/worker/cache flows require it.
3. Provision OpenSearch or explicitly record why the current deep-health gate will remain degraded.
4. Decide whether the AI service is in scope. If yes, complete the AI review below before pointing `AI_BASE_URL` at it.
5. Do not use a Railway container filesystem as the durable publishing-media store.

### 3. Create application services

Create separate services from the repository root:

| Service | Dockerfile                   |
| ------- | ---------------------------- |
| Web     | `apps/web/Dockerfile`        |
| API     | `apps/api/Dockerfile`        |
| Worker  | `apps/api/worker.Dockerfile` |
| AI      | `services/ai/Dockerfile`     |

Set the web's `NEXT_PUBLIC_API_BASE_URL` build input before building. Confirm the API uses Railway's injected `PORT`. Confirm how Railway routes to the AI image's fixed port 8000 before relying on its health check.

### 4. Initialize a confirmed-new database

The current migration directory is a single baseline for a new, empty pgvector database. Do **not** apply it as rewritten history to a valuable database or one with a different `_prisma_migrations` history. Preserve such a database and design a reviewed forward migration.

For a confirmed-new/disposable target, the API image contains `psql` and supports this repository-root pre-deploy sequence:

```bash
psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --file=apps/api/prisma/init/001-init.sql && pnpm --filter api prisma migrate deploy && pnpm --filter api prisma db seed
```

A failed command must stop deployment. The initialization is idempotent; the seed upserts only the four active plan rows (`STARTER`, `GROWTH`, `PREMIUM`, and `ENTERPRISE`). It creates no users, workspaces, content, OAuth state, Instagram credentials, recent media, or analytics.

For an existing Railway database, first inspect migration status, roles, extensions, backups, and valuable data without running the baseline command. Never use `prisma db push` as a substitute for a reviewed migration.

### 5. Configure variables by consumer

Populate required names from the inventory above using Railway variables/secrets. Verify:

- browser-facing API URL is public HTTPS and embedded in the web build;
- API and worker database URLs, plus the API's Redis URL, use reachable service addresses;
- `AI_BASE_URL` is not a loopback URL when the AI service is separate;
- `API_BASE_URL` and `WEB_BASE_URL` are the deployed public origins;
- OAuth redirect and Meta callback paths match `instagram-app-review.md` exactly;
- provider modes match the authorized test window. The 2026-08-19 staging worker pass explicitly uses `live` for publishing and analytics.

### 6. Deploy in dependency order

For a new environment:

1. PostgreSQL and required extensions/roles.
2. Redis for API authentication/cache behavior. Do not add OpenSearch for the showcase.
3. AI service if included and reviewed.
4. API after database pre-deploy succeeds.
5. Worker after API/database/provider configuration is coherent.
6. Web after the public API build variable is set.

Automatic Railway deployments from `main` are externally configured behavior. Confirm the actual trigger rather than assuming it from this repository.

### 7. Configure domains and callbacks

Use HTTPS for public web/API domains. Update externally managed Meta URLs only through an authorized change. Do not paste a callback URL containing `code`, `state`, or any query string into logs, tickets, or evidence.

### 8. Verify infrastructure health

Run read-only checks against the deployed hosts:

```bash
curl https://<api-host>/v1/health
curl https://<api-host>/v1/health/deep
curl https://<web-host>/ar
curl https://<web-host>/en
curl https://<ai-host>/ai/health
```

When OpenSearch is intentionally absent, `/v1/health/deep` reports a degraded body while still returning HTTP 200. Use `/v1/health` as Railway's API deployment health-check path; treat deep health as dependency diagnostics rather than the deployment gate.

Interpret results narrowly:

- API shallow health proves the API process responds.
- API deep health reports database, Redis, OpenSearch, and AI reachability. For this showcase, only the intentionally deferred OpenSearch check may be down; database, Redis, and AI should still report healthy.
- Web 200 responses prove rendered routes, not authentication or business behavior.
- AI shallow health proves only the FastAPI process. Current deep health is always degraded. A prior direct provider request succeeded, but the current shared application adapter still requires deployed end-to-end verification.

### 9. Run application smoke tests

Use a fresh test workspace and non-sensitive evidence:

1. Register, verify, and log in using the intended environment's supported email path.
2. Load Arabic and English routes.
3. Confirm workspace isolation and access controls.
4. Complete a narrow onboarding/Vault request.
5. Check Settings connection status.
6. For a controlled Meta test, follow `instagram-app-review.md` and retain only sanitized evidence.
7. Keep publishing/analytics in `dry_run` unless their runbooks are explicitly authorized.

### 10. Capture reconstruction evidence

Record commit/ref, service names, Dockerfile mapping, variable-name inventory, health outcomes, migration status, and known gaps. Do not record values or real identifiers. Link the evidence to the exact reachable branch/commit; do not use a task-local or unreachable hash as durable provenance.

## AI service deployment review

Before deploying `services/ai/Dockerfile`, read `../services/ai/README.md` and verify the current contract:

- Campaign generation, onboarding-profile resolution, and bilingual content-copy generation can use the OpenAI Responses API when `AI_TEXT_PROVIDER=openai`; JPEG generation can use the OpenAI Images API when `AI_IMAGE_PROVIDER=openai`. Embeddings and generic agents remain deterministic.
- `OPENAI_API_KEY` is consumed only by the AI service in OpenAI mode.
- `OPENAI_STORE_RESPONSES=true` is an intentional temporary quality-review setting; confirm the chosen OpenAI project is the one being inspected and do not send secrets or unapproved customer data.
- `INTERNAL_SERVICE_TOKEN` is enforced on non-health AI routes and sent by the API.
- `/ai/health/deep` still reports dependencies as `not_checked`/`degraded`.
- Docker listens on fixed port 8000 even if Railway supplies `PORT`.
- The 2026-08-06 direct provider request proves only that request. The then-deployed, previously named Strategy adapter failed; deploy and verify the current Campaign adapter before claiming application success.

The immediate infrastructure gate is a healthy protected deployment followed by one synthetic browser/API/AI Campaign request whose validated result, persistence, and usage are confirmed without exposing prompts, provider bodies, credentials, or workspace identities. Do not claim the broader RAG or eight-agent platform production-ready from a successful shallow health or direct provider call.

## Instagram OAuth operations

### Production verification record

On 2026-08-03, a project-supervised production attempt completed the current business-basic flow: Settings showed Connected and recent provider media. This documentation update did not access Railway logs, Meta, credentials, or production data. The result does not close publishing, analytics, App Review, full token-lifecycle, storage/CDN, or launch gates.

### Terminal events and stages

The OAuth routes use three terminal failure events:

- `instagram_oauth_start_failure`
- `instagram_oauth_callback_failure`
- `instagram_connection_status_failure`

The only success events are:

- `instagram_oauth_start_success`
- `instagram_oauth_callback_success`

Each failed request emits exactly one terminal event at its owning route boundary. Lower layers attach typed safe diagnostics and do not log independently.

| Flow                    | Stages                                                                                                                                                                                                                                                                                       |
| ----------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Start                   | `start_request_validation`, `start_authentication`, `start_workspace_authorization`, `provider_configuration`, `oauth_transaction_creation`, `oauth_transaction_persistence`, `authorization_url_construction`                                                                               |
| Callback input/security | `callback_request_validation`, `provider_authorization_denied`, `state_verification`, `oauth_transaction_binding`, `oauth_transaction_consumption`                                                                                                                                           |
| Provider                | `short_lived_token_exchange`, `short_lived_token_response_validation`, `long_lived_token_exchange`, `long_lived_token_response_validation`, `profile_fetch`, `profile_response_validation`, `professional_account_resolution`                                                                |
| Persistence             | `credential_configuration`, `credential_serialization`, `credential_encryption`, `database_transaction_begin`, `connection_upsert`, `recent_media_delete`, `recent_media_insert`, `audit_insert`, `database_transaction_commit`, `post_persistence_read`, `connection_status_transformation` |
| Completion/status       | `success_redirect`, `failure_redirect`, `connection_status_authentication`, `connection_status_authorization`, `connection_status_read`                                                                                                                                                      |

Only these scalar metadata classes are allowed: event, stage, category, retryability, request ID, validated provider HTTP/type/numeric code/subcode, recognized Prisma code, and fixed validation code. Never serialize errors, causes, messages, stacks, Prisma metadata, SQL, parameters, URLs, query strings, headers, cookies, sessions, identities, usernames, emails, state or fingerprints, authorization codes, tokens, app secrets, encryption keys, ciphertext, IVs, tags, or provider/database bodies.

Recognized Prisma codes are `P1000`, `P1001`, `P1002`, `P1008`, `P1017`, `P2002`, `P2003`, `P2025`, and `P2034`. Only transient connection/timeout codes `P1001`, `P1002`, `P1008`, `P1017`, and transaction conflict `P2034` are retryable. Provider HTTP 429/5xx, timeout, and network failures are retryable; state, configuration, authorization, schema, encryption, integrity, and unknown database failures are not.

Search Railway API logs by the stable event name and correlate only with `requestId`. Prisma failures appear through the API event; there is no separate Prisma log stream.

### Encryption-key contract and 2026-08-03 incident

`INSTAGRAM_TOKEN_ENCRYPTION_KEY` must be canonical Base64 encoding exactly 32 bytes. The environment parser checks the decoded length when present; the credential boundary also checks canonical round-trip encoding. Because the variable is optional for general API startup, the OAuth credential-configuration stage remains an important runtime guard.

The production failure was safely isolated as:

```json
{
  "stage": "credential_configuration",
  "category": "encryption_key_invalid",
  "retryable": false
}
```

The Railway variable existed but did not satisfy the contract. It was replaced through the external secret manager with a securely generated canonical Base64 32-byte value, and a fresh OAuth attempt succeeded. Never record the value or any derivative.

Validate without outputting the key:

```bash
node -e "const v=process.env.INSTAGRAM_TOKEN_ENCRYPTION_KEY??'';const b=Buffer.from(v,'base64');process.exit(b.length===32&&b.toString('base64')===v?0:1)"
```

Run this only in the service environment where the secret is already injected. A zero exit code proves format only, not authorization or successful encryption/persistence.

## Safe test database setup

Repository API tests create users, workspaces, content, analytics, and other records. `NODE_ENV=test` does not select a separate database. Never run `corepack pnpm verify` with `DATABASE_URL` pointing to an ordinary development, staging, or production database.

CI creates a dedicated loopback `markos_ci_test` database, applies the initialization/baseline, seeds plans, and sets both `DATABASE_URL` and `INSTAGRAM_DATABASE_TEST_URL` to that disposable target. Instagram database suites additionally require:

- explicit `INSTAGRAM_DATABASE_TEST_URL` opt-in;
- a matching actual Prisma target;
- loopback host;
- database name containing `test`, `spec`, or `ci`.

Those guards do not make an ordinary database safe for the broader API suite. Use an isolated disposable database for every repository-wide local verification, then remove only that explicitly identified test database through a safe, reviewed operation.

## GitHub staging image pipeline

Workflow: `.github/workflows/deploy-staging.yml`.

On `main`, it builds and publishes immutable commit-tagged plus moving `staging` GHCR images for web, API, worker, and AI. Optional AWS ECS rollout occurs only when GitHub `staging` environment variables such as `STAGING_AWS_ROLE_ARN`, `STAGING_AWS_REGION`, and `STAGING_ECS_CLUSTER` are configured. Smoke evidence runs only when public staging URLs are configured.

Use the repository helpers when operating that separate workflow:

```bash
corepack pnpm staging:github-preflight
corepack pnpm staging:github-preflight -- --strict
corepack pnpm staging:evidence-download -- --sha <reachable-release-sha> --strict
```

The preflight and artifacts record names/readiness, not secret values. Optional ECS output is future/AWS evidence and must not be described as Railway deployment proof.

## Troubleshooting map

| Symptom                                                           | First evidence to check                                                   | Important limit                                                                                |
| ----------------------------------------------------------------- | ------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------- |
| Web calls the wrong API                                           | Web build variable and deployed browser bundle                            | Changing a Railway runtime variable after `next build` may not change the embedded public URL. |
| API deep health is degraded                                       | Per-dependency result for DB, Redis, OpenSearch, and AI                   | OAuth connection itself does not call AI/OpenSearch, but launch deep-health acceptance does.   |
| OAuth generic failure                                             | One terminal OAuth event and its allowlisted stage/category               | Never request callback URLs, codes, state, tokens, raw provider bodies, or Prisma errors.      |
| `credential_configuration` / `encryption_key_invalid`             | Canonical Base64 32-byte format check                                     | Variable presence is not validity; do not print it.                                            |
| Migration mismatch                                                | `prisma migrate status`, `_prisma_migrations`, backup/data classification | Do not apply the clean baseline to valuable inherited history.                                 |
| AI shallow health passes but API deep health or AI behavior fails | `AI_BASE_URL`, port/routing, AI logs, `/ai/health/deep`                   | Shallow health does not prove auth, providers, document/file handling, embeddings, RAG, or database access. |
| Publishing media rejected                                         | S3-backed object key, public HTTPS API origin, signing, and external fetch | Local/container filesystem media is intentionally rejected by the Milestone A live-publish gate. |

## Remaining manual verification

- Confirm the Railway project/environment/service topology and automatic deploy triggers.
- Confirm PostgreSQL extensions, roles, migration history, backups, connection limits, and application-role RLS.
- Confirm Redis/OpenSearch service existence and private reachability.
- Confirm web/API/worker/AI domains, ports, health checks, and restart behavior.
- Confirm variable names by consumer without inspecting or copying values into documentation.
- Confirm Meta dashboard URLs, mode, roles, permissions, Graph version, webhooks, and App Review status.
- Confirm the AI service's current deployed SHA, fixed-port routing, health checks, internal-token pairing, provider mode, one current application response, and one full-business mixed-file onboarding analysis through the browser-to-API-to-AI path.
- Provision/reference the confirmed private Bucket contract and prove upload, read, delete, and an external just-in-time signed fetch before live publishing.

See `project-status.md` for roadmap/ownership and `instagram-app-review.md` for the Meta boundary.
