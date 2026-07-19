# Railway Production Deployment

This document is the production runbook for Railway project `68878e53-9589-4632-9495-c8a762cff633`.

## Topology

| Service | Exposure | Source | Persistent state |
| --- | --- | --- | --- |
| `web` | Public HTTPS | `apps/web/Dockerfile` | None |
| `api` | Public HTTPS | `apps/api/Dockerfile` | `/app/var/media` volume |
| `worker` | Private only | `apps/api/worker.Dockerfile` | PostgreSQL and Redis |
| `ai` | Private only | `services/ai/Dockerfile` | None |
| `pgvector` | Private only | `pgvector/pgvector:pg16` | PostgreSQL data volume |
| `Redis` | Private only | Railway Redis service | Railway-managed volume |

OpenSearch is intentionally disabled for the first production deployment. No shipped feature currently queries it; deploying the JVM service would add avoidable baseline cost. Set `OPENSEARCH_ENABLED=true` and provide `OPENSEARCH_URL` when search-backed product behavior is introduced.

## Release Contract

The API container runs `pnpm --filter api db:deploy` before Fastify starts. The command is idempotent and performs these steps:

1. Enables `vector` and `pgcrypto`.
2. Creates the UUID v7 database function used by the schema.
3. Creates compatibility roles required by the RLS migrations and grants the migration owner permission to assume `markos_app` in isolation checks.
4. Applies all pending Prisma migrations.
5. Upserts plan reference data with demo workspace seeding forced off.

If any release step fails, the API process never starts and Railway marks that deployment as failed. Confirm the existing production deployment remains active before retrying or rolling back.

## Service Variables

Use Railway reference variables instead of copying database credentials between services. Seal JWT, Meta, provider, payment, email, and webhook secrets after validation.

### API

```text
NODE_ENV=production
API_BASE_URL=https://<api-domain>
WEB_BASE_URL=https://<web-domain>
AI_BASE_URL=http://${{ai.RAILWAY_PRIVATE_DOMAIN}}:${{ai.PORT}}
DATABASE_URL=${{pgvector.DATABASE_URL}}
DIRECT_DATABASE_URL=${{pgvector.DATABASE_URL}}
REDIS_URL=${{Redis.REDIS_URL}}
OPENSEARCH_ENABLED=false
JWT_ACCESS_SECRET=<generated-64-character-secret>
JWT_REFRESH_SECRET=<different-generated-64-character-secret>
MEDIA_STORAGE_DIR=/app/var/media
MEDIA_PUBLIC_BASE_URL=https://<api-domain>
INSTAGRAM_PUBLISH_MODE=dry_run
INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run
META_REDIRECT_URI=https://<api-domain>/v1/workspace/instagram/oauth/callback
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0
RAILWAY_DOCKERFILE_PATH=/apps/api/Dockerfile
```

### Worker

Use the same database, Redis, JWT, Meta, publishing, model, email, and Sentry variables as the API. Also set:

```text
NODE_ENV=production
AI_BASE_URL=http://${{ai.RAILWAY_PRIVATE_DOMAIN}}:${{ai.PORT}}
OPENSEARCH_ENABLED=false
RAILWAY_DOCKERFILE_PATH=/apps/api/worker.Dockerfile
```

Do not generate a public domain for the worker.

### AI

```text
DATABASE_URL=${{pgvector.DATABASE_URL}}
INTERNAL_SERVICE_TOKEN=<generated-service-secret>
SENTRY_ENVIRONMENT=production
SENTRY_TRACES_SAMPLE_RATE=0
RAILWAY_DOCKERFILE_PATH=/services/ai/Dockerfile
```

Do not generate a public domain for the AI service. Railway supplies `PORT`, and the container binds to it.

### Web

```text
NODE_ENV=production
NEXT_PUBLIC_API_BASE_URL=https://<api-domain>
NEXT_PUBLIC_SENTRY_ENVIRONMENT=production
NEXT_PUBLIC_SENTRY_TRACES_SAMPLE_RATE=0
RAILWAY_DOCKERFILE_PATH=/apps/web/Dockerfile
```

`NEXT_PUBLIC_API_BASE_URL` is a Docker build argument and must be present before the web image is built.

## Storage

Attach one Railway volume to `api` at `/app/var/media`. The current media implementation serves public files through the API. A volume supports one API replica; move the storage adapter to S3-compatible object storage before enabling horizontal API scaling.

Enable automated PostgreSQL volume backups before onboarding a paying client. Test restoration into a non-production environment before calling the backup policy complete.

## Deployment Order

1. Provision `pgvector` and Redis and wait for both to become healthy.
2. Configure and deploy private `ai`.
3. Configure `api`, attach its media volume, generate its public domain, and deploy it.
4. Confirm `GET /v1/health` and `GET /v1/health/deep` return HTTP 200; deep health must report database, Redis, and AI as `ok`, with OpenSearch `skipped`.
5. Configure and deploy `worker` without a public domain.
6. Set the final API URL on `web`, deploy it, then verify `/ar`, `/en`, registration, login, logout, and an authenticated workspace request.

## Production Gates Still Owned Externally

- Add and seal the selected AI provider API key and model configuration before replacing local deterministic generation.
- Complete Meta application configuration and App Review, then run a test-account publish acceptance before changing either Instagram mode to `live`.
- Configure transactional email, payment gateways, Sentry DSNs, custom domains, DNS, and TLS.
- Enable database backups and alerts, define retention, and record a restoration test.
- Keep Railway production deployments on a reviewed commit. The current feature branch must pass GitHub checks and be merged before switching automatic production deploys back to `main`.

## Smoke Commands

```powershell
$env:API_BASE_URL="https://<api-domain>"
$env:WEB_BASE_URL="https://<web-domain>"
$env:RELEASE_SHA="<git-sha>"
corepack pnpm staging:smoke
```

Also perform a real browser registration and login because the smoke script checks service routing and dependency health, not the complete authentication interaction.
