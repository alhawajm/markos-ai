# Railway worker setup for the showcase

Status date: 2026-09-03.

This is the staging setup for MARKOS's durable publishing and video-generation worker. It uses the existing repository worker plus the existing Railway PostgreSQL, Bucket, and AI services. It does **not** require OpenSearch.

## Decision summary

- Create one ordinary **persistent** Railway service named `worker`; do not configure it as a cron job.
- Deploy one replica from `apps/api/worker.Dockerfile`.
- Give it PostgreSQL, the Instagram credential encryption key, the two live-mode settings, the existing private Bucket credentials, and private access to the AI service.
- Do not add Redis, OpenSearch, SendGrid, JWT, OAuth callback, public-domain, volume, port, or health-check configuration to the worker.
- Keep the API deployment health check on `/v1/health`, not `/v1/health/deep`.

The worker process starts immediately, runs a maintenance tick on boot, and then scans for due scheduled content, Publish now jobs, and video-generation jobs every minute by default. Its other current jobs retain their source defaults: analytics email every 24 hours, analytics sync every 6 hours, token refresh every hour, and usage-period maintenance every hour.

## 1. Create the service

In the staging environment:

1. On the Railway project canvas, select **New -> Empty Service**.
2. Name the service exactly `worker`.
3. In **Variables**, add the variables from the next section before connecting the source.
4. In **Settings -> Source**, connect the same GitHub repository used by `api` and `web`.
5. Select the same staging branch as those services. For this pre-merge test, that branch is `agent/instagram-publish-permission-milestone-a`.
6. Leave **Root Directory** empty. The Docker build needs the monorepo root as its context.
7. Review the combined staged source and variable changes, then deploy them.

The worker is a continuously running interval process, so it is a [persistent Railway service](https://docs.railway.com/services#persistent-services), not a scheduled job. A connected GitHub branch will automatically deploy new commits to that branch.

## 2. Add the exact variables

Use Railway's variable autocomplete when entering references so the service names resolve exactly. The reference syntax is documented in [Railway Variables](https://docs.railway.com/variables#reference-variables).

Paste this into the worker's **Variables -> RAW Editor**:

```dotenv
NODE_ENV=production
RAILWAY_DOCKERFILE_PATH=/apps/api/worker.Dockerfile

DATABASE_URL=${{pgvector.DATABASE_URL}}
API_BASE_URL=https://${{api.RAILWAY_PUBLIC_DOMAIN}}
AI_BASE_URL=http://${{ai.RAILWAY_PRIVATE_DOMAIN}}:8000
INTERNAL_SERVICE_TOKEN=${{api.INTERNAL_SERVICE_TOKEN}}

INSTAGRAM_TOKEN_ENCRYPTION_KEY=${{api.INSTAGRAM_TOKEN_ENCRYPTION_KEY}}
INSTAGRAM_PUBLISH_MODE=${{api.INSTAGRAM_PUBLISH_MODE}}
INSTAGRAM_ANALYTICS_SYNC_MODE=${{api.INSTAGRAM_ANALYTICS_SYNC_MODE}}
INSTAGRAM_CONTAINER_POLL_ATTEMPTS=6
INSTAGRAM_CONTAINER_POLL_DELAY_MS=60000

MEDIA_STORAGE_DRIVER=s3
AWS_ENDPOINT_URL=${{compact-keg.ENDPOINT}}
AWS_ACCESS_KEY_ID=${{compact-keg.ACCESS_KEY_ID}}
AWS_SECRET_ACCESS_KEY=${{compact-keg.SECRET_ACCESS_KEY}}
AWS_S3_BUCKET_NAME=${{compact-keg.BUCKET}}
AWS_DEFAULT_REGION=${{compact-keg.REGION}}
AWS_S3_URL_STYLE=virtual
SIGNED_URL_TTL=3600

WORKER_PUBLISHING_INTERVAL_MS=60000
```

If Railway's actual service display name differs from `pgvector`, `api`, or `compact-keg`, select the matching service through autocomplete instead of pasting that namespace literally.

Before deploying, confirm that the referenced API values resolve to:

- `INSTAGRAM_PUBLISH_MODE=live`
- `INSTAGRAM_ANALYTICS_SYNC_MODE=live`

Do not paste the raw database password, Bucket keys, or Instagram encryption key into the worker. Railway supports references to variables in other services, and the Bucket exposes `ENDPOINT`, `ACCESS_KEY_ID`, `SECRET_ACCESS_KEY`, `BUCKET`, and `REGION` specifically for this purpose. Railway Buckets are private and use virtual-hosted-style URLs; see [Storage Buckets](https://docs.railway.com/storage-buckets#connecting-to-your-bucket).

`API_BASE_URL` does not mean the worker calls the API. The shared S3 configuration parser requires a public HTTPS base when `MEDIA_STORAGE_DRIVER=s3`, and this reference supplies the existing canonical API origin. `AI_BASE_URL` uses Railway's private network and the AI service's fixed port; `INTERNAL_SERVICE_TOKEN` must match the AI service without copying the OpenAI key into the worker.

## 3. Configure deployment settings

Use these exact worker settings:

| Setting | Value |
| --- | --- |
| Service type | Persistent service; no cron schedule |
| Source | Same GitHub repository and staging branch as `api` and `web` |
| Root Directory | Empty |
| Dockerfile | `/apps/api/worker.Dockerfile` through `RAILWAY_DOCKERFILE_PATH` |
| Build command | Empty; use the Dockerfile |
| Start command | Empty; the Dockerfile runs `pnpm --filter api worker` |
| Pre-deploy command | Empty; the API deployment owns migrations |
| Replicas | `1` |
| Restart policy | `On Failure` |
| Public networking/domain | None |
| Private worker domain | No inbound domain required; the worker calls the AI service over its private domain |
| Health-check path | None; the worker has no HTTP server |
| Volume | None |

Railway documents `RAILWAY_DOCKERFILE_PATH` for a non-root Dockerfile in [Dockerfiles](https://docs.railway.com/builds/dockerfiles#custom-dockerfile-path). `On Failure` is Railway's default restart policy. Keep one replica for this showcase even though publishing and video jobs now use database leases; multi-replica throughput and contention have not been load-tested.

## 4. Do not add these variables or resources

They are not consumed by the current worker path:

- `REDIS_URL`
- `OPENSEARCH_URL`, `OPENSEARCH_USER`, or `OPENSEARCH_PASS`
- any `OPENAI_*` value (the worker calls the AI service and never receives the provider key)
- `PORT` or `API_PORT`
- `JWT_*`, `EMAIL_PROVIDER`, `SENDGRID_API_KEY`, or `FROM_EMAIL`
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, or `INSTAGRAM_OAUTH_STATE_SECRET`
- `WEB_BASE_URL` or `MEDIA_PUBLIC_BASE_URL`
- a worker public domain, volume, or Railway HTTP health check

The worker's remaining Instagram Graph, scope, request-limit, token-refresh, and non-publishing interval values have source defaults suitable for this staging proof. Adding copies would create extra dashboard state without changing tomorrow's behavior.

## 5. Deploy and verify the service

1. Review Railway's staged changes and deploy the worker.
2. In the build log, confirm Railway uses `/apps/api/worker.Dockerfile` and completes the API TypeScript build.
3. In the deployment log, confirm the process starts with `pnpm --filter api worker`.
4. Confirm the first runtime tick logs `Maintenance worker tick completed`. A zero count is healthy when nothing is due.
5. Leave the service running and verify it remains on one active replica.

The completion log contains bounded counts such as:

- `attemptedPublishes`
- `analyticsWorkspacesSynced`
- `refreshedTokens`
- `tokenRefreshFailures`
- `usageCountersEnsured`
- `videoJobsProcessed`
- `videoJobsCompleted`
- `videoJobsFailed`

A task-level failure logs `Maintenance worker tick failed`; inspect the accompanying safe error text. A clean container that remains running but never emits the first completed tick is not a successful verification.

## 6. Prove scheduled publishing end to end

1. Confirm the Instagram account was reconnected with the current release scopes and the intended draft has publish-ready media stored in the private Bucket.
2. In MarkOS, schedule the item on a half-hour boundary. Confirm its saved state is `SCHEDULED` and its Bahrain time becomes due.
3. Leave the worker running. It will select the item automatically; do not call the operator publish route for this proof.
4. Watch the worker log for `attemptedPublishes: 1`.
5. Confirm MarkOS changes the item to `PUBLISHED`, stores the Instagram media ID and publication time, and the post appears on the connected Instagram account.

The one-minute worker interval creates up to roughly one minute of scan delay. Meta container processing may still take several minutes after selection. Retryable provider failures remain in a persisted retry state with a bounded next-attempt time and no more than three total attempts; terminal or exhausted failures move the item and job to `FAILED` and create a persistent owner notification. Inspect the job attempt history and safe error code before retrying manually.

## OpenSearch decision for tomorrow

Do not provision OpenSearch for this showcase.

Current source references `OPENSEARCH_URL` only in the API's optional `/v1/health/deep` dependency report. No Calendar, AI generation, media upload, scheduled publishing, token refresh, analytics sync, or worker code performs an OpenSearch query. When it is absent, `/v1/health/deep` reports `degraded` in its response body, but the route still responds with HTTP 200.

For the API service:

- set Railway's deployment health-check path to `/v1/health`;
- leave `OPENSEARCH_URL` unset unless a later search feature is implemented;
- treat the deep-health OpenSearch `down` result as an expected deferred dependency, not as a failed publish path.

Railway only requires an HTTP 200 from a configured deployment health check and does not continuously monitor that endpoint after activation; see [Railway Healthchecks](https://docs.railway.com/deployments/healthchecks). The worker itself has no HTTP endpoint and therefore must not receive a health-check path.
