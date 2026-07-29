# Instagram PR-Readiness Corrections Report

## Scope and verdict

This task corrected the cumulative review findings for the Instagram `instagram_business_basic` connection slice without amending existing history. The original observability Blocker and all three Major findings are closed. Both Minor findings were addressed with stronger RLS write-policy evidence and explicit documentation of retained legacy configuration. The branch is ready for one short final delta review before opening a PR.

No real Meta, Railway, shared database, production credential, deployment, publishing, analytics, worker, or scheduler behavior was used or enabled.

## Findings and decisions

### Callback telemetry

Confirmed: unexpected callback failures could reach the global error handler with a query-bearing `request.url`. The error boundary now derives a path-only value once and uses it for both structured logging and Sentry context. A regression test supplies recognizable fake values for authorization code, OAuth state, provider error description, access token, and client secret and proves none reaches logger or capture arguments. A registered-route conflict test also demonstrates that unexpected callback logs contain only `/v1/workspace/instagram/oauth/callback` and the API response is sanitized.

### Callback binding model

The intended model is **transaction binding**, not independent returning-browser authentication. MARKOS authentication is a bearer token held by the web client; the public provider callback does not have an API-origin server session. Only an authenticated member with `instagram:manage` may start a transaction. The signed, expiring state and persisted hashed nonce bind that transaction to the initiating user, workspace, and allowlisted return path; atomic consumption occurs before provider exchange. The callback accepts no caller workspace, so an Authorization header for a different browser user cannot redirect persistence into that user's workspace. The route test proves the result remains in the initiating workspace.

This design does not claim that the callback independently authenticates the returning browser. No PKCE or fragile cross-origin correlation cookie was added.

### Active routes

New registered-Fastify-route coverage proves:

- start rejects unauthenticated, non-member, and insufficient-permission callers;
- an authorized owner receives the fixed Instagram authorization host, exact `instagram_business_basic` scope, and canonical configured redirect;
- caller-supplied host, scope, and redirect fields have no effect;
- a successful callback redirects safely, persists only to the initiating workspace even when another user's bearer header is present, and never returns callback values;
- tampered, expired, denied, and replayed state fails before another provider exchange;
- unexpected persistence conflict returns a sanitized 500 response and path-only telemetry;
- status, refresh/reconnect, and disconnect enforce authentication, membership, and `instagram:manage` where applicable;
- authorized refresh and disconnect return sanitized lifecycle data.

All provider responses were mocked; no Meta request occurred.

### RLS write isolation

The application-role integration suite retains the previous read-isolation check and now executes writes as `markos_app` with the real `app.current_workspace` context. It proves that a workspace cannot insert connections, media, or nonces for another workspace; move its connection into another workspace; update or delete another workspace's connection; delete another workspace's media or nonce; or consume another workspace's nonce. Policy-violating inserts/tenant moves reject, while invisible cross-tenant updates and deletes affect zero rows.

### Legacy environment variables

Repository tracing showed the apparently unused endpoint/scope variables are still referenced by unchanged token-refresh, analytics-readiness, and App Review paths. They were not removed. The architecture decision now records that the active business-basic client intentionally fixes its own hosts and exact scope, while the retained variables are legacy/dormant-path compatibility inputs. Publishing and analytics remain `dry_run`.

### Additional production defect found

The existing encryption tamper test exposed a non-canonical base64url alias that could decode to the same ciphertext bytes. Decryption now rejects non-canonical envelope components and validates the 12-byte IV and 16-byte GCM tag before decryption. The original authenticated-encryption tamper test now passes consistently.

### Report provenance

The Blocker 2 report now uses the committed PR diff from verified base `251cfd511744f71b67cfe835584e5c41b29d73f6` through review-time `HEAD` as the authoritative artifact. `89fc8af`, `1326687`, `18e84f617b7a5753da7169181890000f40431c81`, `68c8d4e`, and intervening documentation hashes are classified only as historical task-local or pre-consolidation execution references. The report distinguishes the accepted UI conclusion from the later cumulative security corrections without claiming those provisional objects remain reachable.

## Files changed

The task-local correction snapshot historically identified as `68c8d4e` contributed the following changes, now reviewable in `251cfd511744f71b67cfe835584e5c41b29d73f6..HEAD`:

- `apps/api/src/http/app.ts` — routes unexpected errors through conservative path-only telemetry and uses sanitized warning context.
- `apps/api/src/http/error-telemetry.ts` — centralizes path extraction, structured error logging, and observability capture.
- `apps/api/src/security/credential-encryption.ts` — rejects non-canonical base64url envelope encodings and invalid IV/tag lengths.
- `apps/api/test/error-telemetry.test.ts` — proves recognizable fake callback secrets never enter logs or observability context.
- `apps/api/test/instagram-routes.integration.test.ts` — adds authenticated registered-route lifecycle, transaction-binding, replay, denial, failure, membership, and permission coverage.
- `apps/api/test/instagram-connection.integration.test.ts` — adds application-role RLS write-policy checks.
- `apps/api/test/instagram-oauth.test.ts` — updates stale legacy expectations to the encrypted business-basic flow.
- `docs/decisions.md` — records the transaction-binding threat model and conservative legacy-variable treatment.

Documentation changes after the implementation commit:

- `docs/codex-reports/2026-07-29-instagram-blocker-2-ui-validation.md` — corrects consolidation-aware provenance and the post-correction readiness statement.
- `docs/codex-reports/2026-07-29-instagram-pr-readiness-corrections.md` — records this task.

## Commands and exact outcomes

### Initial type check

`corepack pnpm --filter api typecheck` failed because the rebuilt environment's generated Prisma client predated the Instagram models. It reported missing `oAuthStateNonce`, `instagramConnectionCredential`, and `instagramRecentMedia` properties. This was environment-generated-client staleness, not a source-schema mismatch.

`corepack pnpm --filter api prisma generate && corepack pnpm --filter api typecheck` passed. Prisma Client 6.19.3 generated successfully in 322 ms; the subsequent TypeScript check produced no errors. Prisma emitted only its existing package.json configuration deprecation warning.

### Disposable PostgreSQL setup and migrations

The first `initdb` attempt as root failed as expected because PostgreSQL refuses to run as root. The isolated cluster was then initialized and run as the system `postgres` user.

Topology:

```text
PostgreSQL: 16.14
Bind: 127.0.0.1:55432
Database: markos_codex_test
Owner/migration role: postgres
Application-equivalent role: markos_app
Data: /tmp/markos-instagram-rls.4h5oTd/data
Redis: not started or required
```

The first fresh migration attempt failed because the repository expects `uuid_generate_v7()` to be provided by its target environment. The database was recreated and given a test-only wrapper backed by `gen_random_uuid()`. The next attempt reached the repository role-grant migration and failed because fresh disposable PostgreSQL did not yet contain the expected `markos` role. The database was recreated again with disposable `markos` and `markos_app` roles plus `pgcrypto`, `vector`, and the UUID wrapper.

`DATABASE_URL='[redacted loopback test URL]' corepack pnpm --filter api exec prisma migrate deploy` then applied all 10 migrations successfully, including all three Instagram migrations, and reported `All migrations have been successfully applied.`

### Focused test iterations

The first focused run executed 33 tests: 32 passed and one stale `instagram-oauth.test.ts` failed because the fresh database had no seeded plan for its legacy registration helper. The test was corrected to create isolated user/workspace records directly and assert encrypted credential persistence rather than removed plaintext legacy behavior.

The second focused run executed 33 tests: 32 passed and the encryption tamper test failed because a changed final base64url character could decode to identical bytes. Canonical base64url and IV/tag validation were added.

The third focused run passed all 33 tests in 7 files.

After adding the unexpected registered-route failure scenario, one run executed 35 tests: 33 passed and two route assertions failed. One expected response omitted the envelope's existing empty `details` array; the other was a cascade because the preceding failed assertion skipped test cleanup. The assertion was corrected to use `toMatchObject`, and the route-only suite then passed 5/5.

### Final focused validation

The final command ran:

```text
corepack pnpm --filter api exec vitest run \
  test/error-telemetry.test.ts \
  test/instagram-security-foundation.test.ts \
  test/instagram-basic-client.test.ts \
  test/instagram-connection.integration.test.ts \
  test/instagram-routes.integration.test.ts \
  test/instagram-routes.service-free.test.ts \
  test/instagram-oauth.test.ts \
  test/instagram-migration-contract.test.ts
```

Exact summary:

```text
Test Files  8 passed (8)
Tests       35 passed (35)
Duration    6.83s
```

The registered unexpected-conflict log showed method `GET` and path `/v1/workspace/instagram/oauth/callback` only; it contained none of the supplied callback query values.

`corepack pnpm --filter api typecheck` passed with no errors.

`corepack pnpm --filter api lint` passed and printed the repository's current `lint: api` placeholder.

`corepack pnpm --filter api build` passed with no TypeScript errors.

`git diff --check` passed.

## Passed, failed, and skipped checks

Final passing checks:

- 8 focused API test files;
- 35 focused tests;
- registered route authorization and callback tests;
- OAuth state/security tests;
- provider boundary tests;
- disposable PostgreSQL connection/RLS integration tests;
- migration contract test;
- API type check;
- API build;
- API lint command;
- diff whitespace check.

Historical development failures are recorded above and were corrected. No final focused test was skipped because the disposable loopback database URL was supplied.

The broad unrelated API suite was not run because many unrelated tests require Redis, seeded services, or other external dependencies and no shared API behavior outside the error boundary changed. Chromium/web tests, web type checking, web lint, and web build were not rerun because no frontend or shared frontend contract changed; the prior 9/9 UI evidence remains applicable.

## Disposable-service cleanup

PostgreSQL was stopped with `pg_ctl -m fast`. The temporary cluster directory, marker file, and init log were removed. `pg_isready` confirmed nothing remained on `127.0.0.1:55432`, and the temporary path no longer existed. Redis was not started.

## Security and scope confirmation

- No real Meta request occurred.
- No Railway, shared database, or production credential was used.
- Callback query values are absent from telemetry and structured error logs.
- Transaction binding is accurately documented and route-tested; independent returning-browser authentication is not claimed.
- Nonce consumption remains atomic and occurs before provider exchange.
- RLS read and write isolation is proven with `markos_app` and real workspace context.
- Publishing and analytics remain `dry_run`.
- Workers and schedulers remain inactive.
- No deployment or production configuration changed.

## Implementation provenance

The authoritative reviewable artifact is:

```text
251cfd511744f71b67cfe835584e5c41b29d73f6..HEAD
```

Reviewers must resolve the current `HEAD` from Git. The final delta review observed `e60c66bfb40175fbc542cba14a5bc81f2a1a4d06` after Codex Cloud consolidated the implementation, correction, tests, and reports, but this report does not rely on that observed head remaining stable.

Historical execution references are classified as follows:

- `89fc8af` — task-local disposable-PostgreSQL validation reference;
- `1326687` — task-local rendered-UI correction reference;
- `18e84f617b7a5753da7169181890000f40431c81` — pre-consolidation implementation reference;
- `68c8d4e` — task-local callback/readiness correction reference;
- intervening documentation hashes — task-local report commits later combined by platform-managed consolidation.

None is represented as currently reachable. Codex Cloud may combine commits that the agent originally created separately; the implementation and validation evidence remains in the committed PR tree. This report intentionally does not embed the hash of a commit that contains itself, and it should not be edited again merely to chase a later platform-generated head hash.

## Remaining limitations and next steps

- The public callback provides transaction binding, not independent returning-browser authentication. A future same-origin server-session architecture could add browser binding, but a fragile cross-origin cookie was intentionally not introduced.
- Live Meta authorization, denial variants, token exchanges, profile/media payloads, refresh timing, and provider-side invalidation remain unverified and require supervised acceptance.
- The target deployment must provide its expected UUID-v7 function and database roles before migrations; the disposable test supplied isolated equivalents.
- The API lint script remains a placeholder inherited from the repository.
- The full unrelated API suite was not run in this focused correction pass.
- The implementation passed the final delta review. After this consolidation-safe documentation correction, the branch is ready to open as a PR without another code review.

## Final verdict

The original observability Blocker and all Major cumulative-review findings are closed. The RLS Minor has direct write-policy evidence, and the retained-variable ambiguity is now documented per variable without activating dormant behavior. The implementation passed the final delta review and, after this documentation correction, is ready for PR opening. Live Meta validation remains explicitly uncompleted.
