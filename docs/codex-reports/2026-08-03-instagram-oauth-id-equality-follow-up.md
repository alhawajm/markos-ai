# Instagram OAuth ID-equality follow-up completion report

## Task scope

Reassess the Instagram Login identity model after a current production deployment again emitted the sanitized `instagram_oauth_callback_failure` event at `provider_account_validation` with category `provider_account_id_mismatch`; remove the unsupported cross-response identity equality if Meta does not explicitly require it; preserve the OAuth security, encrypted persistence, atomic audit, redirects, and safe telemetry controls; update realistic tests and narrowly related operator/provenance documentation; verify the repository; and open a new pull request without merging or changing provider, Railway, OAuth scope, environment, credential, database, publishing, analytics, or deployment configuration.

## Verdict

**Implemented. Root-cause confidence: high.**

The deployed PR #7 reached code exchange, long-token exchange, and `/me` retrieval, then rejected a legitimate provider response because MARKOS required authorization-code exchange `user_id === /me.id`. Meta documents the exchange `user_id` as an Instagram-scoped user ID and documents `/me.user_id` as the Instagram professional account ID, but the official pages reviewed do not explicitly guarantee equality between the exchange value and `/me.id`. Production directly disproved MARKOS's remaining equality requirement. PR #7 passed because its mocks deliberately made those two synthetic values equal, so the unsupported assumption was encoded in the tests rather than challenged by them.

The callback now obtains `/me` using the long-lived access token derived from the validated callback, requests only the documented fields needed by MARKOS, and persists `/me.user_id` as `providerAccountId`. No client-supplied provider account ID is accepted or compared: the professional profile is returned directly by Meta for the exchanged token.

## Production evidence used

The only production evidence used was the already-sanitized event shape supplied with the task:

```json
{
  "event": "instagram_oauth_callback_failure",
  "stage": "provider_account_validation",
  "category": "provider_account_id_mismatch",
  "retryable": false
}
```

The deployment was current; authentication, authorization start, Meta authorization, state validation and transaction binding, short-token exchange, long-token exchange, and `/me` retrieval succeeded. Persistence and `INSTAGRAM_CONNECTED` were not reached. No real identifier, code, token, state, credential, callback URL/query, raw provider body, environment value, or production database value was retrieved or inspected.

## Official Meta documentation consulted

Only official Meta developer documentation was retrieved:

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- https://developers.facebook.com/docs/instagram-platform/reference/me

The Business Login guide describes the authorization-code exchange `user_id` as the app user's Instagram-scoped user ID. The Get Started guide instructs clients to call `/me?fields=user_id,username` with the access token, describes `user_id` as the app user's Instagram professional account ID, and uses that IG ID for `/{IG_ID}/media`. The reviewed official documentation does not explicitly state that authorization-code exchange `user_id` equals `/me.id`. Absence of that guarantee is not treated as proof of equality or inequality; the production response is the direct evidence that requiring equality is invalid.

## Identifier model and decisions

1. Authorization-code exchange `user_id`: a required provider response field representing the app user's Instagram-scoped user ID. MARKOS parses and names it `exchangeUserId` but does not infer that it is the professional account ID or compare it with another response.
2. `/me.id`: no documented downstream purpose in MARKOS after removal of the unsupported comparison. It is no longer requested, modeled, or transformed.
3. `/me.user_id`: the documented Instagram professional account ID. MARKOS names it `professionalAccountId`, persists it as `instagram_connection_credentials.providerAccountId`, returns it in connection status, and supplies it through the existing secure credential boundary to professional-account operations.
4. Equality: the official documentation reviewed contains no explicit guarantee that exchange `user_id === /me.id`; MARKOS requires no equality among cross-response identifiers.
5. Security rationale: state remains signed, expiring, single-use, and transaction-bound to the initiating user/workspace. Code exchange still uses the configured fixed provider endpoint, and `/me` still uses the token derived from that callback. Thus the account profile is provider-supplied and token-bound, not client-supplied; deleting a speculative equality gate does not weaken state, transaction, callback, token, workspace, encryption, or persistence security.
6. Schema: no migration is required because `providerAccountId` already stores the professional account identity.

## Downstream consumers reviewed

- Publishing obtains the canonical stored ID through the secure workspace credential boundary and uses it for `/{IG_ID}/media` and `/{IG_ID}/media_publish`.
- Analytics obtains the same canonical stored ID for account/media reads.
- Refresh rotates encrypted token material on the existing credential row without changing `providerAccountId`.
- Disconnect and workspace erasure remove the credential through workspace-scoped operations.
- Readiness and connection status use the encrypted credential record and report its professional account ID.
- Verified Meta webhook/deauthorization/data-deletion consumers match against the stored professional account ID.
- `INSTAGRAM_CONNECTED` is created in the same transaction as the credential and recent-media writes, with the professional account ID as its target.

No downstream consumer required `/me.id` or the exchange `user_id`.

## Telemetry

The event `instagram_oauth_callback_failure`, callback route logging protections, generic browser error, request correlation, and allowlisted provider diagnostics remain. Genuine malformed/schema responses are still classified at `profile_retrieval`; provider calls retain their stage-specific classifications; persistence failures remain `credential_persistence` / `credential_persistence_failed`.

The unreachable `provider_account_validation` stage and `provider_account_id_mismatch` category were removed from executable types/tests and current operator documentation. No identifier values were added to telemetry.

## Files changed

- `apps/api/src/workspace/instagram-basic-client.ts`
- `apps/api/src/workspace/instagram-oauth-service.ts`
- `apps/api/src/workspace/instagram-oauth-telemetry.ts`
- `apps/api/test/helpers/instagram-connection.ts`
- `apps/api/test/instagram-basic-client.test.ts`
- `apps/api/test/instagram-connection.integration.test.ts`
- `apps/api/test/instagram-oauth-telemetry.test.ts`
- `apps/api/test/instagram-oauth.test.ts`
- `apps/api/test/instagram-routes.integration.test.ts`
- `docs/codex-reports/2026-08-03-instagram-oauth-provider-account-id-fix.md`
- `docs/codex-reports/2026-08-03-instagram-oauth-id-equality-follow-up.md`
- `docs/decisions.md`
- `docs/staging-deploy.md`

## Implementation commit

- `84f1ebc63c66557558614cae922e288270d95cbb` — `fix(instagram): remove unsupported OAuth ID equality`

The branch starts from merged PR #7 commit `149eea5300a7e2bcfa65a071b011a038bd85806e`. The prior completion report now records the stable merged PR comparison `2b06bd3075c8447ab452c66cb84e4665d3cc47f1..149eea5300a7e2bcfa65a071b011a038bd85806e` instead of an unreachable task-local hash, removes its stray title prefix, and includes itself in its file list.

## Commands and exact outcomes

### Passed

- Official documentation retrieval with `curl -L --fail --silent --show-error --max-time 30` restricted to the three `https://developers.facebook.com` pages above — passed; no Meta API endpoint was called.
- Disposable local PostgreSQL initialization, repository prerequisite SQL, `corepack pnpm --filter api prisma migrate deploy`, and `corepack pnpm --filter api prisma db seed` — passed.
- `corepack pnpm --filter api exec vitest run test/instagram-basic-client.test.ts test/instagram-oauth-telemetry.test.ts test/instagram-routes.service-free.test.ts test/error-telemetry.test.ts` — passed: 4 files, 19 tests.
- Database-enabled `corepack pnpm --filter api exec vitest run test/instagram-oauth.test.ts test/instagram-routes.integration.test.ts test/instagram-connection.integration.test.ts test/instagram-basic-client.test.ts test/instagram-oauth-telemetry.test.ts test/error-telemetry.test.ts` — passed: 6 files, 26 tests. This covers different exchange/professional IDs, callback success redirect, encrypted persistence, status, audit atomicity, state validation/expiry/replay/transaction binding, conflict rollback, telemetry, and redaction.
- `corepack pnpm --filter api typecheck` — passed.
- `corepack pnpm verify` — passed with the disposable PostgreSQL and CI-style Instagram test configuration: RTL QA and repository typecheck, lint, and test tasks completed.
- `corepack pnpm build` — passed: 9 tasks, including API TypeScript and production Next.js build.
- `git diff --check` — passed.

### Environment-limited checks

- A combined downstream suite including publisher, security, migration, callback, analytics, and refresh tests produced 23 passing tests and 10 failures. Publisher, security, migration, and callback files passed; analytics and refresh registration helpers failed because no Redis server is installed/running in this container (`Connection is closed`). The earlier repository verify run used its existing test orchestration and completed; no gate or test was altered.
- The authoritative build-spec PDF could not be text-extracted because this container lacks a PDF text extractor and Python PDF library. `AGENTS.md`, the complete behavioral companion, architecture/decision, security, deployment, testing/runbook documents, source, schema, migrations, and relevant tests were inspected. This limitation did not require changing product semantics beyond the documented provider contract.

## Security and privacy confirmation

- Signed state, expiry, single-use nonce consumption, initiating user/workspace/transaction binding, fixed provider exchange endpoints, workspace authorization, AES-256-GCM token encryption, encrypted-only active credential storage, and atomic connection/media/audit persistence are unchanged.
- The callback profile still comes from Meta via the access token produced by the validated exchange. It accepts no browser account ID.
- Safe callback route logging and generic failure redirects are unchanged.
- Tests retain conspicuously different synthetic exchange and professional IDs, and matching values would also remain valid because equality is neither required nor forbidden.
- No authorization code, access/refresh token, app secret, OAuth state, encryption key, raw provider body, callback query string, real provider identifier, credential, production database value, or Railway/Meta configuration was retrieved, printed, logged, exposed, or committed.

## Remaining risks and ambiguity

- Meta documentation describes the fields but does not explicitly state an equality or non-equality relationship between exchange `user_id` and `/me.id`; MARKOS therefore makes no such inference.
- A supervised post-deployment provider attempt is still required to validate the complete live persistence path.
- Redis-backed legacy downstream tests need a Redis-capable verification environment; no Redis installation or configuration change was made for this task.
- No Railway, Meta App, OAuth scope, environment variable, credential, database content, deployment configuration, live publishing/analytics mode, or `dry_run` behavior was changed.

## Post-deployment validation

1. Wait for the new Railway API deployment to become **Active**.
2. Sign into MARKOS freshly.
3. Perform one Instagram connection attempt.
4. Confirm Settings shows **Connected**.
5. Confirm connection status uses the professional account ID.
6. Confirm `INSTAGRAM_CONNECTED` is created.
7. Confirm no `provider_account_id_mismatch` event is emitted.
8. If the flow still fails, capture only the new sanitized `instagram_oauth_callback_failure` event; do not capture callback URLs/query strings, provider bodies, codes, tokens, state, secrets, or identifiers.

## Next steps

- Review the new focused pull request and CI results; do not merge as part of this task.
- Perform the supervised post-deployment validation only after a future merge and Active Railway deployment.
