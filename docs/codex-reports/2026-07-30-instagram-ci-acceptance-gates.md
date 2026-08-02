# Instagram CI acceptance-gate follow-through

## Scope and starting state

Starting commit: `5b64dbde778f57c451def51abb04c50fcc40e8b8`. This task corrected Turbo API-test environment propagation, the Instagram database-test safety contract, and the rendered Settings CI gate without changing product behavior, dependencies, schemas, migrations, or runtime credential handling.

## Verdict

The three reported CI gaps are corrected in the committed implementation. `api#test` now uses strict, task-scoped tracked environment variables and disables caching; both guarded Instagram suites validate the actual Prisma target and cannot silently skip in CI; and CI builds and starts the web app before running all six rendered Settings tests with Chromium.

Local disposable-database and rendered-browser validation passed. Final GitHub Actions review remains pending because this checkout has no Git remote or authenticated workflow access. Repository-wide `pnpm verify` and the Turbo-launched API suite were blocked before test execution by Codex Cloud npm registry metadata failures, so this report does not call PR #3 CI-green.

## Implementation

- `turbo.json`: adds a narrow `api#test` definition with the API test runtime's database, Instagram, JWT, service, and test-mode variables under `env`; strict mode remains active, no pass-through environment is used, and database tests are never cached.
- `apps/api/test/helpers/instagram-database.ts`: centralizes opt-in and target validation. The real `DATABASE_URL` must be loopback-only and safely named; the declared Instagram test URL must identify the same host/port/database; missing CI opt-in, unsafe actual targets, and mismatches fail with secret-free errors.
- API integration suites now use that helper without weakening their assertions or cleanup. A focused safety test covers local opt-out, valid matching targets, missing values, unsafe targets, mismatch, and error redaction.
- Web Vitest configuration excludes rendered tests from normal unit collection and provides a dedicated browser configuration and package command. Collecting the browser suite without its base URL is now an error, not a skip.
- CI installs only Playwright Chromium and Linux prerequisites, starts the built Next.js app on loopback, waits with a bounded process-aware readiness loop, runs the six browser cases, emits the server log on failure, and always stops the server. Existing infrastructure initialization, migrations, seed, Verify, Build, diagnostic logs, and container cleanup remain ordered and intact.

Implementation commit: `514579de44500ae8b29e682ef2580d6e75e65450` (`fix(ci): enforce Instagram acceptance tests`). If platform consolidation rewrites task commits, treat this as a provisional execution reference and review the verified base-to-current-`HEAD` PR diff.

## Verification

| Command / check | Result |
| --- | --- |
| Canonical PostgreSQL initialization, 10 Prisma migrations, and seed against disposable loopback `markos_ci_test` | Passed after creating the application roles required by historical RLS migrations. The first local migration attempt failed clearly because the ad-hoc cluster initially lacked role `markos`; the database was recreated correctly rather than altering migrations. |
| Turbo dry run for `api#test` | Passed: task ID `api#test`, strict environment mode, 20 task-scoped tracked variables, no pass-through environment, local and remote cache disabled. No values or credentials were printed. |
| `node_modules/.bin/turbo run test --filter=api --output-logs=full` | Environment-blocked before Vitest: pnpm supply-chain metadata calls returned `EAI_AGAIN` and entered retry delays. The run was stopped rather than waiting through repeated storms. |
| Direct focused API run: database safety plus both secure integration suites | Passed: 3/3 files, 15/15 tests, 0 skipped; all expected 5/5 encrypted-connection and 5/5 registered-route tests executed. |
| Final database-safety helper run | Passed: 1/1 file, 6/6 tests, 0 skipped. |
| Direct full API Vitest run against `markos_ci_test` | Passed: 33/33 files, 197/197 tests, 0 skipped. |
| API TypeScript (`apps/api/node_modules/.bin/tsc --noEmit -p apps/api/tsconfig.json`) | Passed. |
| Normal web unit configuration | Passed: 1/1 file, 3/3 tests; browser file was not collected. |
| Direct Next.js production build | Passed: compile, TypeScript, and 57 static pages. Local validation temporarily linked the already-installed locked Vitest package into the incomplete web workspace and removed the link afterward; no manifest or lockfile dependency changed. |
| Built Next.js server plus dedicated rendered Settings suite | Passed: 1/1 file, 6/6 tests, 0 skipped; server was stopped afterward. Two earlier local attempts failed with `ERR_CONNECTION_REFUSED` because this execution environment terminates background processes between command cells; the final same-cell server/test run passed. CI uses normal job steps plus an explicit `always()` cleanup. |
| `corepack pnpm verify` | Environment-blocked before repository checks: registry metadata requests returned `error (0)` and the prerequisite pnpm install process was stopped after repeated retry warnings. This is not a pass. |
| `pnpm build` | Not run because the required full Verify command did not pass. The direct web production build and API typecheck passed separately. |
| JSON parsing, Ruby YAML parsing, Prettier check, `git diff --check`, and final scope/security inspection | Passed. |

No `pnpm install` was run. No package dependency or lockfile changed.

## Temporary behavior

None. The CI separation and safety contract are the intended design, not a temporary workaround.

## Security and compatibility

- No real credential, production URL, shared database, or live Meta request was introduced.
- Plaintext Instagram persistence was not restored; encrypted credentials, transaction-bound OAuth, audit evidence, callback redaction, RLS, RBAC, and isolation assertions remain intact.
- Safety validation is based on the actual Prisma `DATABASE_URL`; a safe-looking secondary URL cannot authorize an unsafe or different target.
- CI cannot silently skip either guarded database suite or the rendered browser suite.
- No loose Turbo environment mode, pass-through environment, cached database test, historical migration edit, weakened assertion, dependency churn, backup file, or persistent validation artifact remains.

## Remaining issues

- A network-enabled GitHub Actions run on the updated PR head must confirm the complete `pnpm verify`, monorepo `pnpm build`, Chromium installation, and browser acceptance sequence.
- Live Meta authorization remains a separate supervised milestone and has not been validated.
