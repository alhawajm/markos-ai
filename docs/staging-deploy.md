# Staging Deploy

MARKOS staging deploys from GitHub Actions on every merge to `main`.

## Pipeline

Workflow: `.github/workflows/deploy-staging.yml`

The pipeline builds and publishes four container images to GitHub Container Registry with immutable commit SHA tags and a moving `staging` tag from `main`:

- `web`
- `api`
- `worker`
- `ai`

If the GitHub `staging` environment is configured with AWS deployment variables, the workflow also forces a new ECS deployment for the configured services.

## Required GitHub Environment Variables

Set these on the `staging` GitHub environment:

- `STAGING_AWS_ROLE_ARN`
- `STAGING_AWS_REGION`
- `STAGING_ECS_CLUSTER`
- `STAGING_WEB_SERVICE`
- `STAGING_API_SERVICE`
- `STAGING_WORKER_SERVICE`
- `STAGING_AI_SERVICE`

The ECS services should reference the moving `:staging` tags or a separate image mirroring/task-definition step must update task definitions before service rollout.

## Required Runtime Secrets

Staging runtime must provide production-shaped values for:

- `DATABASE_URL`
- `REDIS_URL`
- `OPENSEARCH_URL`
- `JWT_ACCESS_SECRET`
- `JWT_REFRESH_SECRET`
- `API_BASE_URL`
- `WEB_BASE_URL`
- `AI_BASE_URL`
- `MEDIA_PUBLIC_BASE_URL`
- `META_APP_ID`
- `META_APP_SECRET`
- `META_REDIRECT_URI`
- `META_WEBHOOK_VERIFY_TOKEN`

Keep `INSTAGRAM_PUBLISH_MODE=dry_run` until Meta App Review and test-account live publish acceptance are complete.
