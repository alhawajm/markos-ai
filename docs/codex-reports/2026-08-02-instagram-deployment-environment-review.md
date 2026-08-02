# Instagram Deployment Environment Review

## Scope

Review the environment-loading and deployment-configuration contract for PR #3 before its first Railway deployment and supervised Instagram Login test. The review was limited to the existing `instagram_business_basic` connection milestone.

Starting checkout commit: `34308f25e235f89e3ed60c8a215adafe5ed6f944`.

Implementation commit: `b25520e5c1cc78f08c85babf1e1fd8db9244a638`. If Codex Cloud later consolidates task commits, treat this as a provisional execution reference and use the committed comparison from the verified base `251cfd511744f71b67cfe835584e5c41b29d73f6..HEAD`, resolving `HEAD` from Git at review time.

## Verdict

The confirmed environment-contract defects were fixed with a focused change. An empty `MEDIA_PUBLIC_BASE_URL` is now treated as absent; local API, worker, and seed entry points explicitly and safely load an optional repository-root `.env`; existing process variables retain precedence; Docker build contexts exclude environment files; and deployment documentation now separates local, CI, Docker, Prisma, Next.js, and Railway configuration.

The branch is ready to update PR #3 and run its complete GitHub Actions gate. It is **not yet ready to merge** until the new head's mandatory Verify, Build, API/web Docker builds, and rendered browser tests pass. It is not production-validated, and live Railway/Meta acceptance remains supervised work.

## Confirmed issues fixed

### Empty optional media URL

`MEDIA_PUBLIC_BASE_URL=` previously failed Zod URL validation even though the example intentionally left it empty. It now uses the repository's existing optional-URL preprocessing, so omitted and empty values both resolve to `undefined`, while a configured value must still be a valid URL.

The current connection milestone does not generate publishable media. Falling back to the public `API_BASE_URL` media route is acceptable for its first supervised test. Durable public storage remains mandatory before publishing is enabled.

### Explicit local API and worker environment loading

Neither pnpm, Turborepo, nor `tsx` implicitly loaded the repository-root `.env` for the API package. A small loader now resolves the file from the source module location, loads it only when present, and relies on Node's `loadEnvFile` behavior so shell, CI, Docker, or Railway variables are not overwritten.

All API imports of the validated environment use this loader. Consequently:

- root `pnpm dev` reaches it through the API dev entry point;
- API `start` and `dev` reach it through `src/main.ts`;
- API `worker` and `dev:worker` reach it through the maintenance-worker dependency graph;
- Prisma seed reaches it through its existing environment import.

The root `.env` remains optional and Git-ignored. No dependency, package script, platform-specific shell syntax, or required local file was introduced.

### Docker context secret exclusion

The Dockerfiles already copied only selected repository paths, but `.env` files were still eligible to be sent in the Docker build context. `.dockerignore` now excludes `.env` and `.env.*` while retaining the fake `.env.example`. No environment file is copied into either image.

### Deployment documentation

The example and staging guide now state that:

- local AI and OpenSearch loopback URLs must become reachable service URLs on Railway;
- the root `.env` is for local API/worker/seed loading only;
- Prisma CLI migrations require an explicitly supplied `DATABASE_URL` or Prisma's package-local convention;
- Next.js uses its own package environment behavior and public values are build-time inputs;
- GitHub Actions uses explicit fake workflow variables and does not read `.env` or `.env.example`;
- Railway injects runtime variables per service;
- `NEXT_PUBLIC_API_BASE_URL` remains a web Docker build argument;
- unreachable AI or OpenSearch degrades `/v1/health/deep`, even though the Instagram connection routes do not call those services.

## Findings requiring no code change

- `.github/workflows/ci.yml` defines its own fake-only test variables and does not source repository environment files.
- `apps/api/src/media/storage-service.ts` already falls back to `API_BASE_URL` when `MEDIA_PUBLIC_BASE_URL` is absent.
- Railway runtime variables do not require local `.env` loading; the loader is a no-op when no file exists.
- Next.js environment loading should remain separate from the API root file. `NEXT_PUBLIC_API_BASE_URL` is already passed to the web Docker build.
- Prisma CLI commands should not gain an application-specific wrapper merely to emulate local API loading. Migration inputs remain explicit, which is safer for deployment.
- The OAuth connection itself does not depend on AI or OpenSearch, but the repository's deep-health acceptance contract does.
- No publishing, analytics, comments, messages, Facebook Login, worker activation, scheduler activation, or additional Meta permission was added.

## Files changed

- `.dockerignore`: prevent environment files from entering Docker build contexts.
- `.env.example`: clarify local-only AI/OpenSearch URLs and optional media URL behavior.
- `apps/api/src/config/load-repository-env.ts`: optional, process-precedence-preserving root environment loader.
- `apps/api/src/config/env.ts`: load the local file before validation, preprocess the optional media URL, and expose parsing for focused tests.
- `apps/api/test/environment.test.ts`: cover root-path resolution, omitted/empty/valid media URLs, process precedence, file loading, and absent-file behavior.
- `docs/decisions.md`: record the smallest conventional environment-loading decision.
- `docs/staging-deploy.md`: document the complete local/CI/Prisma/Next/Docker/Railway contract and remaining service dependencies.

## Commands and exact outcomes

| Command or check | Outcome |
| --- | --- |
| `git rev-parse HEAD` | Starting commit confirmed as `34308f25e235f89e3ed60c8a215adafe5ed6f944`. |
| GitHub PR/check-run API inspection | Blocked: the environment's CONNECT tunnel returned HTTP 403, so the latest remote head and mandatory Docker-build result could not be independently confirmed. |
| Initial `corepack pnpm --filter api exec vitest run test/environment.test.ts` | Blocked during pnpm supply-chain metadata checks by repeated npm registry `error (0)` retries; stopped rather than waiting through the repeated one-minute storm. |
| `apps/api/node_modules/.bin/prisma generate --schema apps/api/prisma/schema.prisma` | Passed; Prisma Client 6.19.3 generated. |
| `apps/api/node_modules/.bin/vitest run --root apps/api test/environment.test.ts` | Final focused result passed: 1 file, 6 tests, 0 skipped. |
| `apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json` | Passed after Prisma generation. |
| Temporary fake root `.env` plus direct API/worker environment probes and API `/v1/health` startup | Passed. The API listened on the fake configured port, the worker dependency graph observed the same fake configuration, empty media URL parsing succeeded, and the temporary file/process were removed. No values were printed. |
| Canonical PostgreSQL initialization, all Prisma migrations, and seed against disposable loopback `markos_ci_test` | Passed: all 10 migrations applied and seed completed. Temporary PostgreSQL and Redis processes/data were removed. |
| `corepack pnpm verify` | Blocked before execution by repeated npm registry supply-chain metadata `error (0)` retries. No verification result is claimed. |
| Direct `node scripts/rtl-qa.mjs` | Passed: 10 checks. |
| Direct Turbo `typecheck lint test` | Also blocked because package scripts invoked pnpm's same network-dependent supply-chain checks. It was stopped rather than weakening verification. |
| `corepack pnpm build` | Blocked before execution by the same repeated registry `error (0)` retries. No build result is claimed. |
| Direct Next.js build | Compiled application code, then failed type checking because the provisioned environment lacks the `apps/web/node_modules/vitest` package link. Dependencies were not reinstalled, as instructed. |
| Docker image builds | Not run because this container has no Docker executable. The committed CI workflow retains mandatory API and web image builds. |
| `git diff --check` | Passed. |

No `pnpm install`, dependency update, lockfile modification, database safety bypass, real provider request, or deployment was performed.

## Remaining Railway and Meta acceptance work

1. Publish the updated branch and require the complete GitHub Actions run to pass on the new head, including Verify, Build, both Docker images, Chromium, and all six rendered Settings tests.
2. Configure separate Railway service variables without exposing values. In particular, use public HTTPS `API_BASE_URL`/`WEB_BASE_URL`, the web build-time `NEXT_PUBLIC_API_BASE_URL`, reachable AI/OpenSearch/Redis/PostgreSQL service URLs, and the required Instagram secrets.
3. Run the canonical database initialization and migrations through the configured Railway pre-deploy command, then verify application-role RLS and deep health on disposable staging data.
4. Register the exact deployed OAuth, webhook, deauthorization, and data-deletion URLs in the Meta dashboard.
5. Conduct the supervised professional-account connection, profile/media retrieval, denial, refresh-age, reconnect, disconnect, and callback-delivery tests with the real Meta App.
6. Keep `instagram_business_basic` as the only requested permission. Per-account webhook field subscription and any field requiring additional permissions remain outside this milestone.
7. Keep publishing and analytics in `dry_run`; do not treat the API-local media fallback as durable publishing storage.

## Final readiness

The focused environment-loading implementation is complete and locally validated. The branch is ready for PR update and CI review, but merge readiness is conditional on the new remote CI run passing. A successful CI run permits supervised staging deployment; it does not establish production or live-Meta validation.
