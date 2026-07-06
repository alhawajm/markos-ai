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
- `STAGING_API_BASE_URL`
- `STAGING_WEB_BASE_URL`

The ECS services should reference the moving `:staging` tags or a separate image mirroring/task-definition step must update task definitions before service rollout.

`STAGING_API_BASE_URL` and `STAGING_WEB_BASE_URL` are used by the workflow smoke job after images are published and the optional ECS rollout has completed or been skipped. Use public HTTPS URLs that match the Meta callback/runtime configuration.

Run the GitHub environment preflight before expecting the workflow to produce live staging evidence:

```bash
corepack pnpm staging:github-preflight
corepack pnpm staging:github-preflight -- --strict
```

The preflight writes:

```text
evidence/m6/<yyyy-mm-dd>/staging/github-staging-preflight.json
```

It records only variable names and readiness state, not variable values.

Set environment variables with GitHub CLI once the real values are known:

```bash
gh variable set STAGING_API_BASE_URL --env staging --body "https://api.staging.markos.ai"
gh variable set STAGING_WEB_BASE_URL --env staging --body "https://staging.markos.ai"
gh variable set STAGING_AWS_ROLE_ARN --env staging --body "arn:aws:iam::<account-id>:role/<role-name>"
gh variable set STAGING_AWS_REGION --env staging --body "me-south-1"
gh variable set STAGING_ECS_CLUSTER --env staging --body "<cluster-name>"
gh variable set STAGING_WEB_SERVICE --env staging --body "<web-service-name>"
gh variable set STAGING_API_SERVICE --env staging --body "<api-service-name>"
gh variable set STAGING_WORKER_SERVICE --env staging --body "<worker-service-name>"
gh variable set STAGING_AI_SERVICE --env staging --body "<ai-service-name>"
```

After setting values, rerun:

```bash
corepack pnpm staging:github-preflight -- --strict
```

After a successful `Deploy Staging` workflow run, download the generated evidence artifacts:

```bash
corepack pnpm staging:evidence-download -- --sha <release-sha>
corepack pnpm staging:evidence-download -- --sha <release-sha> --strict
```

This writes:

```text
evidence/m6/<yyyy-mm-dd>/staging/github-staging-artifact-download.json
```

and flattens the downloaded workflow artifacts into the same staging evidence folder.

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

## Smoke Evidence

After a merge to `main` deploys staging, run the staging smoke evidence script against the live URLs:

```bash
API_BASE_URL=https://api.staging.markos.ai \
WEB_BASE_URL=https://staging.markos.ai \
RELEASE_SHA=<commit-sha> \
corepack pnpm staging:smoke
```

PowerShell:

```powershell
$env:API_BASE_URL="https://api.staging.markos.ai"
$env:WEB_BASE_URL="https://staging.markos.ai"
$env:RELEASE_SHA="<commit-sha>"
corepack pnpm staging:smoke
```

The script checks:

- `GET /v1/health`
- `GET /v1/health/deep`
- `/ar`
- `/en`

It writes the ignored local artifact:

```text
evidence/m6/<yyyy-mm-dd>/staging/staging-smoke-report.json
```

Attach that artifact to the M6 evidence pack after redacting anything sensitive.

The GitHub workflow also uploads two non-secret artifacts on `main` when staging URLs are configured:

- `m6-staging-image-evidence-<sha>`: immutable GHCR image references for web, API, worker, and AI.
- `m6-staging-ecs-rollout-evidence-<sha>`: ECS cluster/service rollout proof when AWS staging variables are configured.
- `m6-staging-smoke-evidence-<sha>`: the generated smoke report for the configured staging URLs.

Download those artifacts and place them under `evidence/m6/<yyyy-mm-dd>/staging/` before marking the staging manifest as verified.
