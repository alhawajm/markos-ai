# Instagram CI database bootstrap follow-through

## Scope

Correct the PR #3 CI database bootstrap so the disposable `markos_ci_test` database receives the repository's canonical PostgreSQL prerequisites before Prisma migrations, preserve the existing encrypted-credential integration, and correct stale configuration and report-provenance documentation.

## Verdict

The reported migration failure is fixed in the workflow and reproduced successfully against a disposable loopback PostgreSQL 16 database: the canonical initialization script installed `vector`, `pgcrypto`, and `uuid_generate_v7()` in `markos_ci_test`, after which all 10 migrations and the seed completed. The three focused migration and secure Instagram database suites then executed with 11/11 tests passing and no skips.

PR #3 cannot yet be described as CI-green from this environment. No Git remote is configured, the referenced GitHub Actions run was not accessible without authentication, and the final branch revision could not be pushed or observed in GitHub Actions. The repository-wide `pnpm verify` attempt was also blocked before verification by Codex Cloud registry metadata requests returning `error (0)`; `pnpm build` was therefore not run.

## Root cause and fix

The PostgreSQL container initializes its default `markos` database with `apps/api/prisma/init/001-init.sql`. CI subsequently created `markos_ci_test` from the normal template, so database-scoped extensions and `uuid_generate_v7()` were absent. The baseline migration consequently failed at its first `uuid_generate_v7()` use and would also have lacked `vector`.

The `Prepare disposable Instagram test database` step now runs the already-mounted canonical script directly against `markos_ci_test` with `psql --set=ON_ERROR_STOP=1`. Migrations remain ordered after that step, so any initialization error stops CI before Prisma runs. No initialization SQL was duplicated and no historical migration or database-name safety guard was changed.

## Previous corrective work preserved

Inspection confirmed that the authoritative PR diff from verified base `251cfd511744f71b67cfe835584e5c41b29d73f6` through the current PR `HEAD` still:

- supplies fake test-only Instagram OAuth and encryption configuration in CI;
- uses `instagram_connection_credentials` as the active encrypted source for publishing, analytics, readiness, refresh, Meta callback cleanup, disconnect, and workspace erasure;
- decrypts only through the shared secure credential boundary rather than restoring plaintext persistence;
- replaces removed-`PUT` test fixtures with the secure lifecycle/helper;
- covers `instagram_connection_credentials`, `instagram_recent_media`, and `oauth_state_nonces` in RLS and workspace-isolation tests;
- records the safe Instagram account identifier on disconnect;
- records `INSTAGRAM_TOKEN_REFRESHED` with actor, workspace, target account, and non-secret metadata;
- retains the guarded `INSTAGRAM_DATABASE_TEST_URL` integration suites without weakening their database-name check.

## Files changed

- `.github/workflows/ci.yml` — applies the mounted canonical initialization script to `markos_ci_test` with immediate error handling before migrations.
- `.env.example` — classifies `INSTAGRAM_REFRESH_TOKEN_URL` as inert compatibility configuration because secure refresh uses the code-constrained client endpoint.
- `docs/decisions.md` — records that secure refresh delegates to `InstagramBasicClient` and that the retained refresh URL has no runtime consumer.
- `docs/codex-reports/2026-07-30-instagram-ci-credential-integration.md` — classifies unreachable `f67eaf6` as a task-local reference removed by platform consolidation and makes `<verified-base>..HEAD` authoritative.

Implementation commit created before this report: `fe477ab2f3202ed4e877cf650c9ca369af15633a` (`fix(ci): initialize Instagram test database`). If Codex Cloud later consolidates task commits, this hash is a provisional execution reference; the authoritative artifact is `251cfd511744f71b67cfe835584e5c41b29d73f6..HEAD`, with reviewers resolving `HEAD` from Git.

## Verification

| Command or check | Outcome | Counts / notes |
| --- | --- | --- |
| Canonical `001-init.sql` via `psql -v ON_ERROR_STOP=1` against loopback `markos_ci_test` | Passed | Created `vector`, `pgcrypto`, and `uuid_generate_v7()`; direct checks found both extensions and the function. |
| `prisma migrate deploy --schema apps/api/prisma/schema.prisma` against `markos_ci_test` | Passed | All 10 migrations applied; a follow-up deploy reported no pending migrations. |
| `tsx apps/api/prisma/seed.ts` against `markos_ci_test` | Passed | Exit code 0. |
| First focused Vitest run before regenerating the local Prisma Client | Failed | 1/11 passed and 10/11 failed because the provisioned client lacked the new model delegates; this was a local generated-client state issue, not a database bootstrap failure. |
| `corepack pnpm --filter api prisma generate` | Environment-blocked | Supply-chain registry metadata requests returned `error (0)` and entered retry delays. |
| `apps/api/node_modules/.bin/prisma generate --schema apps/api/prisma/schema.prisma` | Passed | Prisma Client 6.19.3 generated locally without dependency installation. |
| Focused Vitest: migration contract, encrypted connection integration, and registered Instagram routes | Passed | 3/3 files, 11/11 tests, 0 skipped. The guarded secure database suites executed. |
| `corepack pnpm verify` | Environment-blocked | Stopped after repeated registry metadata `error (0)` warnings; pnpm's prerequisite install process exited after SIGINT. No repository checks ran through this command. |
| `pnpm build` | Not run | Required only after `pnpm verify` passes; that prerequisite was environment-blocked. |
| Complete diff inspection and targeted searches | Passed | No duplicated init SQL, historical migration edit, real credential, weakened guard, plaintext persistence restoration, unrelated change, stale refresh-variable claim, or reachable-commit misstatement found. |
| `git diff --check` and staged diff check | Passed | No whitespace errors. |

The disposable PostgreSQL and Redis processes were stopped and their temporary data removed after focused validation.

## Dependency and network behavior

No `pnpm install` was intentionally run and no package manifest or lockfile changed. Corepack's pnpm wrapper nevertheless performs a supply-chain prerequisite check that attempted npm registry metadata requests. Those requests returned `error (0)` in the Codex Cloud agent phase. Repeated retry storms were not allowed to continue, and no supply-chain or lockfile protection was weakened.

## Security and compatibility

- No real Meta credential, production credential, shared database value, or production configuration was added.
- The committed workflow key and OAuth values remain fake, test-only inputs for mocked provider calls.
- Plaintext Instagram credential persistence was not restored; legacy workspace fields remain only for compatibility/clearing, while active consumers receive decrypted values at the authorized shared boundary.
- The disposable database remains named `markos_ci_test`, satisfying the existing safety guard.
- RLS policies, authentication, RBAC, database safety guards, and test assertions were not weakened.
- Historical migrations were not edited.
- Publishing and analytics remain `dry_run`; workers and schedulers remain inactive.
- No live Meta, Railway, production, or shared-database interaction occurred.

## Remaining issues

- The final PR branch revision still requires a network-enabled GitHub Actions run to prove the complete `pnpm verify` and `pnpm build` jobs are green.
- Local repository-wide verification was blocked before execution by Codex Cloud npm registry metadata `error (0)` responses. This is an environment limitation, not a passing result.
- Live Meta validation remains deliberately uncompleted.
