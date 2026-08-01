# Instagram Meta and Railway Hardening Report

## Scope

Review and correct the remaining security, provider-contract, database-enforcement, Railway-deployment, and CI gaps in the `instagram_business_basic` pull-request diff without using a real Meta App or deploying production infrastructure.

The implementation commit for this task is `0c3559a252c94933c22911170c75e949f287ca3b`. If Codex Cloud later consolidates task commits, treat that hash as a provisional execution reference and review the authoritative committed PR comparison from `251cfd511744f71b67cfe835584e5c41b29d73f6..HEAD`, resolving `HEAD` from Git at review time.

## Verdict

The locally correctable issues are fixed. Webhook payloads and destructive Meta callbacks now fail closed unless authenticated with the active Instagram App Secret; documented `data[]` profile responses are supported; provider bodies are bounded while streaming; workspace transactions actually assume the RLS application role; disposable and Railway database initialization no longer creates a fixed-password login role; and the Docker/CI contract covers Railway ports, build-time browser configuration, canonical database setup, and both deployment images.

The complete verification suite passed against a disposable loopback PostgreSQL and Redis environment. Six rendered Settings scenarios also passed against the built application. No live Meta or Railway acceptance was performed, so the branch must not be described as production-validated.

## Findings and decisions

### Meta callback security

- Instagram webhook POST bodies are captured with a one-MiB ceiling and verified over the exact raw bytes using `X-Hub-Signature-256` and HMAC-SHA-256 before parsing results are audited.
- Deauthorization and data-deletion endpoints no longer accept caller-supplied `account_id`, `instagram_account_id`, or `user_id` values. They require a valid `signed_request` created with the active `INSTAGRAM_APP_SECRET`.
- Invalid or unsigned callbacks return a sanitized `403` and cannot delete a credential.
- Data-deletion confirmation codes are unique UUIDs, and the result URL now targets the active `/en/app/settings` route.
- Signed requests and token-like fields remain redacted from audit metadata.

These choices follow Meta's official webhook payload-validation guidance for `X-Hub-Signature-256` and the Instagram App Secret: <https://developers.facebook.com/docs/graph-api/webhooks/getting-started#validate-payloads>.

### Provider response contract

- The profile mapper accepts Meta's documented `data`-wrapped `user_id` and `username` response while retaining compatibility with the top-level shape already covered by tests.
- Provider response limits are now enforced by `Content-Length` and by counting streamed bytes before the complete body is materialized.
- The provider remains fixed to Instagram Login hosts, exactly `instagram_business_basic`, a six-media bound, and the configured `v25.0` Graph contract. No Facebook Login, publishing, insights, comments, or messages capability was enabled.

The implementation was checked against Meta's current Instagram Login documentation: <https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/business-login> and <https://developers.facebook.com/documentation/instagram-platform/instagram-api-with-instagram-login/get-started>.

### Database and RLS

- `withWorkspaceDbContext` now executes `SET LOCAL ROLE markos_app` before applying the transaction-local workspace selector. RLS is therefore enforced in the active application helper rather than only in special integration-test setup.
- The canonical initialization creates `markos_app` and compatibility role `markos` as `NOLOGIN`, removes the committed fixed password, and grants the current deployment/migration owner permission to assume `markos_app`.
- All ten historical migrations were applied unchanged to a fresh disposable database after canonical initialization. No database safety guard or RLS policy was weakened.

### Railway deployment

- The API honors Railway's injected `PORT` while retaining `API_PORT` compatibility.
- The web Docker build explicitly accepts `NEXT_PUBLIC_API_BASE_URL` as a build argument, because Next.js public values are embedded during build.
- The API image includes `postgresql-client`, and the deployment guide provides one fail-fast pre-deploy command that applies the canonical initialization SQL before Prisma migrations.
- The guide requires a PostgreSQL target with `vector`, `pgcrypto`, role-creation privileges, and the UUID-v7 helper. It does not assume Railway's default PostgreSQL image provides every extension.

These corrections follow Railway's official Dockerfile and pre-deploy guidance: <https://docs.railway.com/builds/dockerfiles>, <https://docs.railway.com/deployments/pre-deploy-command>, and <https://docs.railway.com/databases/postgresql>.

### CI recommendation implemented

The updated workflow is the recommended PR gate for the current codebase. In addition to the existing disposable database, full Verify, monorepo Build, Chromium, built-server readiness, and six rendered Settings scenarios, it now:

- uses least-privilege `contents: read` workflow permissions;
- permits an explicit manual dispatch;
- supplies fake-only webhook and build-time public API configuration;
- builds both the API and web Docker images, including the required web build argument;
- retains fail-fast behavior, logs, process cleanup, container/volume cleanup, and all existing database/browser gates;
- allows 45 minutes for the two added image builds instead of weakening or skipping checks.

## Files changed

- `.github/workflows/ci.yml`: least-privilege/manual trigger, fake callback/build configuration, and API/web deployment-image validation.
- `apps/api/Dockerfile`: PostgreSQL client for canonical Railway pre-deploy initialization.
- `apps/web/Dockerfile`: build-time `NEXT_PUBLIC_API_BASE_URL` contract.
- `apps/api/prisma/init/001-init.sql`: passwordless group roles and current-owner role membership.
- `apps/api/src/config/env.ts`, `apps/api/src/main.ts`: Railway `PORT` support.
- `apps/api/src/db/workspace-transaction.ts`: application-role RLS enforcement.
- `apps/api/src/meta/meta-routes.ts`, `apps/api/src/meta/meta-service.ts`: raw webhook signature verification, signed destructive callbacks, bounded payloads, and unique deletion confirmation.
- `apps/api/src/workspace/instagram-basic-client.ts`: streamed response ceiling and documented profile envelope mapping.
- `apps/api/test/meta-callback-security.test.ts`, `apps/api/test/meta-routes.test.ts`, `apps/api/test/instagram-basic-client.test.ts`, `apps/api/test/rls.test.ts`: regression coverage for the corrections.
- `docs/instagram-app-review.md`, `docs/staging-deploy.md`, `docs/decisions.md`: exact basic scope, callback security, webhook limitations, and Railway requirements.

## Commands and exact outcomes

| Command or check | Outcome |
| --- | --- |
| `corepack pnpm --filter api prisma generate` | Passed; Prisma Client 6.19.3 generated. |
| Focused API Vitest run for provider, callback security, OAuth security, and migration contract | Passed: 4 files, 20 tests, 0 skipped. |
| `corepack pnpm --filter api typecheck` | Passed. |
| `corepack pnpm --filter web typecheck` | Passed. |
| Canonical `001-init.sql` against `markos_ci_test` | Passed: extensions, UUID function, passwordless roles, and current-user grant created. |
| `DATABASE_URL=<redacted-loopback-test-url> corepack pnpm --filter api prisma migrate deploy` | Passed: all 10 migrations applied. |
| `DATABASE_URL=<redacted-loopback-test-url> corepack pnpm --filter api prisma db seed` | Passed. |
| Focused DB run: `meta-routes`, `rls`, `instagram-connection.integration`, `instagram-routes.integration` | Passed: 4 files, 18 tests, 0 skipped. Both secure Instagram integration suites executed 5/5 tests each. |
| First `corepack pnpm verify` without infrastructure | Failed as expected in this container: 24 API files and 142 tests failed because PostgreSQL and Redis were unavailable; 8 files and 50 tests passed, 2 files and 10 guarded database tests skipped. This was an environment limitation, not treated as a passing result. |
| `corepack pnpm verify` with disposable loopback PostgreSQL/Redis and fake Instagram configuration | Passed: 32/32 Turbo tasks. API: 34 files, 202 tests, 0 skipped; web unit: 1 file, 3 tests; AI: 7 tests. The 10 guarded secure database tests executed. |
| `corepack pnpm build` | Passed: 9/9 Turbo tasks; Next.js compiled, type-checked, and generated 57 static pages. |
| Built web server plus `SETTINGS_BROWSER_BASE_URL=http://127.0.0.1:3000 corepack pnpm --filter web test:browser` | Passed: 1 file, 6 rendered Settings tests, 0 skipped. Server was stopped after the run. |
| `git diff --check` | Passed. |
| Docker image builds | Not run locally because the container has no Docker executable. The updated GitHub workflow makes both image builds mandatory before browser acceptance. |
| Live GitHub Actions inspection | Not available from this checkout; the final workflow result remains a reviewer check after branch publication. |

The disposable PostgreSQL process, Redis process, generated browser screenshots, and temporary data directories were removed after validation. No `pnpm install` was run and no registry retry or `error (0)` occurred.

## Security and compatibility

- No real Meta credential, OAuth code, token, signed request, nonce, encryption key, database password, or sensitive connection string was committed or logged in this report.
- Plaintext Instagram credential persistence was not restored. Legacy workspace columns remain only for compatibility cleanup and are cleared on disconnect.
- Exactly `instagram_business_basic` remains the active requested permission.
- Publishing and analytics remain `dry_run`; no worker, scheduler, additional permission, or live provider behavior was enabled.
- Workspace RLS, authentication, RBAC, callback state binding, encryption, and existing assertions remain enforced.
- Historical migrations were not edited.

## Remaining blockers requiring real Meta or Railway acceptance

1. Configure the real Instagram App ID/Secret, canonical HTTPS redirect URI, independent OAuth-state secret, 32-byte encryption key, and webhook verify token in Railway without exposing their values.
2. Register the exact OAuth, webhook, deauthorization, and data-deletion HTTPS URLs in the Meta dashboard and prove live delivery against the deployed API.
3. Complete a supervised authorization with an eligible professional test account and validate real token exchanges, `user_id`, username, optional profile/media shapes, denial variants, reconnect, disconnect, and long-lived-token refresh timing.
4. Select webhook fields and explicitly subscribe each professional account through Meta's `/{ig-user-id}/subscribed_apps` flow. The current exact basic permission does not authorize comments or messaging fields that require additional permissions; this milestone intentionally does not request them. Meta's official webhook setup describes the separate subscription step: <https://developers.facebook.com/documentation/instagram-platform/webhooks>.
5. Provision a Railway PostgreSQL service/template that actually supports `vector`, `pgcrypto`, role creation, and the canonical initialization; run the pre-deploy command and verify application-role RLS on disposable staging data.
6. Supply `NEXT_PUBLIC_API_BASE_URL` during the Railway web build, expose API/web HTTPS domains, and confirm Railway health, logs, callback redaction, and secret non-disclosure.
7. Confirm that Meta still supports the configured Graph `v25.0` for the supervised release window; version upgrades must be deliberate and tested rather than silently changing the provider contract.
8. Review the mandatory API/web Docker-build results and the complete GitHub Actions run after the branch is updated.

No code-only blocker remains for the constrained business-basic connection. Live Meta webhook events beyond fields authorized by `instagram_business_basic` are not part of this permission slice and cannot be made active without a later product/permission decision.
