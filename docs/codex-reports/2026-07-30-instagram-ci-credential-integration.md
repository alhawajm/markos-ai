# Instagram CI and Encrypted Credential Integration

## Scope and verdict

Corrected PR #3's CI configuration and completed the migration of active Instagram consumers from legacy plaintext `Workspace` fields to `instagram_connection_credentials`. The secure OAuth credential now drives publishing, analytics, readiness, refresh, Meta deauthorization, disconnect, and erasure. Generic RLS/workspace-isolation registries cover all three new tables. Focused and complete API tests passed locally against disposable loopback PostgreSQL and Redis; the repository `pnpm verify` wrapper could not complete because pnpm's supply-chain metadata checks repeatedly required unavailable registry access.

## Findings and fixes

- **CI encryption and database guard:** confirmed missing. CI now provides fake test-only Instagram configuration, uses `markos_ci_test` for both `DATABASE_URL` and `INSTAGRAM_DATABASE_TEST_URL`, creates it inside the existing PostgreSQL service, migrates it, seeds it, and therefore enables the guarded secure database suites.
- **Mixed credential sources:** confirmed. Publishing and analytics readiness use sanitized secure connection state; live publishing and analytics hydrate a transient provider-boundary workspace from the centralized decrypting service; scheduled analytics and refresh discover active encrypted rows.
- **Legacy refresh:** confirmed. The old service read and replaced plaintext workspace tokens. It now delegates to secure refresh, preserves the 24-hour eligibility rule, encrypts replacements, and queries encrypted rows for scheduled refresh.
- **Stale tests:** confirmed. RBAC now calls OAuth start; workspace, publishing, analytics, maintenance, refresh, and Meta callback tests use a shared helper that persists encrypted credentials through the production service.
- **Isolation registries:** confirmed incomplete. `instagram_connection_credentials`, `instagram_recent_media`, and `oauth_state_nonces` are included in generic RLS and workspace-model isolation coverage.
- **Disconnect audit:** confirmed. Secure disconnect now records the non-secret provider account ID in `targetId` and metadata.
- **Refresh audit:** confirmed. Secure refresh now atomically records `INSTAGRAM_TOKEN_REFRESHED` with workspace, optional actor, account target, and expiry metadata.
- **Meta/PDPL cleanup:** secure connection/media/state rows are deleted by Meta callbacks and workspace erasure; tokens remain absent from audit evidence.

## Files changed

Implementation commit `f67eaf6` changed CI, Instagram connection/refresh services, publishing and analytics consumers, Meta/PDPL cleanup, workspace routes, generic RLS/isolation tests, and secure test fixtures. `docs/decisions.md` records the single encrypted credential-source decision. The authoritative review artifact remains the verified base-to-current-head PR diff; reviewers should resolve `HEAD` from Git.

## Commands and outcomes

- `pdftotext 'docs/source/MARKOS_BUILD_SPEC. 2.pdf' ...` — warning: `pdftotext` was unavailable; the checked-in experience flows and relevant repository implementation were inspected instead.
- `apps/api/node_modules/.bin/prisma generate` — passed; Prisma Client 6.19.3 generated.
- `apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json` — passed after generation.
- Disposable PostgreSQL setup on `127.0.0.1:55432`, database `markos_ci_test`; all 10 migrations applied and seed executed — passed.
- Focused test iterations exposed missing seed data, Redis, fixture identity collisions, two incorrect test selectors, and missing local OAuth configuration. Those environment/fixture issues were corrected; no security guard was weakened.
- Focused registered-route and encrypted-connection run — 2 files, 10 tests passed, 0 skipped.
- Complete API suite using disposable PostgreSQL and Redis — 32 files, 192 tests passed, 0 failed, 0 skipped. The guarded Instagram suites executed.
- `corepack pnpm verify` and configuration variants — warning: could not complete because pnpm repeatedly attempted unreachable `registry.npmjs.org` metadata/attestation checks. The run was interrupted after retry loops; it did not reach repository tasks.
- The equivalent API typecheck and complete API test portions were run directly and passed. `pnpm build` was not run because the required preceding `pnpm verify` did not complete; API build/typecheck passed via direct TypeScript invocation.
- `git diff --check` and cached diff check — passed.

## Security and compatibility

No real Meta credentials or production values were added. CI values are explicitly fake and provider calls remain mocked. Plaintext persistence was not restored, the removed PUT route was not reintroduced, RLS and database-name guards remain intact, and no secrets are included in responses or audit metadata. Publishing and analytics remain `dry_run`; workers and schedulers were not activated.

## Disposable service cleanup

The local PostgreSQL cluster and Redis instance were loopback-only and temporary. They were stopped after validation and their temporary data directories were removed.

## Remaining limitations

The root `pnpm verify` and subsequent root `pnpm build` remain unexecuted in this environment because pnpm's dependency-policy verification requires unavailable registry access. CI has network access and now has the missing database/encryption configuration needed to execute the full workflow. Live Meta behavior remains unvalidated and outside this correction.
