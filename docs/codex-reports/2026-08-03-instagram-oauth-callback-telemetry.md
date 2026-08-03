# Instagram OAuth callback telemetry completion report

## Task scope

Trace the deployed Instagram Login callback path from authorization initiation through callback handling, state consumption, provider exchanges, profile validation, encrypted persistence, status retrieval, audit creation, and frontend redirect handling; add safe stage-specific production telemetry and focused redaction/behavior coverage without changing deployment configuration, provider configuration, credentials, database contents, publishing mode, or analytics mode.

## Verdict

Implemented and verified safe callback-failure telemetry. No provider-contract defect was changed because repository evidence does not identify a single failing provider operation with high confidence. A production retry after deployment is required to isolate the current failure.

## Root-cause assessment

- **Most likely failing area:** one of the provider operations after state consumption and before persistence: short-lived code exchange, long-lived-token exchange, or profile retrieval/account validation.
- **Evidence:** the deployed callback returns the route's handled `302`, the connection remains absent, and no `INSTAGRAM_CONNECTED` audit event is committed. In the pre-change code, `InstagramProviderError` from any of those provider calls was collapsed into `InstagramOAuthExchangeError`, which produced that handled redirect. The short-lived exchange fixture accepts string/number `user_id`; the profile fixture and parser accept direct and `data`-wrapped `user_id`; the requested scope, fixed endpoints, form-encoded short exchange, query-encoded long exchange, versioned profile request, ID comparison, and atomic persistence are internally consistent with the repository's documented Instagram Login contract.
- **Confidence:** medium that failure occurs before successful credential/audit persistence; low confidence in any exact provider stage.
- **Cannot establish locally:** the deployed provider HTTP status and safe error identifiers, the actual provider stage, whether the production response shape differs from repository fixtures, or whether production persistence/status retrieval fails. No live Meta, Railway, or production data was accessed.

The implementation therefore does not speculate by removing long-lived exchange, changing a host/version/field, weakening response validation, or changing account-ID semantics. The only callback behavior adjustment is that unexpected handled callback failures, including persistence failures, now retain the same generic browser-facing failure response rather than escaping to the global 500 boundary; their safe stage/category is logged explicitly.

## Findings and decisions

- Authorization start is authenticated and permission-gated, issues an HMAC-signed expiring state, persists only a nonce hash, fixes the Instagram authorization host/scope/redirect URI, and does not trust caller provider overrides.
- Callback access logging remains `silent` so query parameters do not enter normal access logs. The diagnostic uses the application logger directly, because the route-scoped silent request logger would suppress the explicit event too.
- State verification and atomic nonce consumption now have distinct diagnostics.
- Each provider call is wrapped independently. Safe provider HTTP status and allowlisted type/code/subcode are retained; provider messages and raw bodies are not retained.
- Account-ID mismatch and credential persistence/transaction completion are distinct stages.
- Persistence still writes encrypted credentials, recent media, and `INSTAGRAM_CONNECTED` inside one workspace-scoped transaction. No transaction was split or weakened.
- Wrapped errors retain an internal cause for debugging, but the callback logger never receives or serializes that error/cause.
- The telemetry reporter builds a strict allowlist and catches logger exceptions so observability cannot break callback handling.
- Generic browser redirect and generic JSON failure messaging are preserved; provider details are never returned.

## Telemetry contract

- **Event:** `instagram_oauth_callback_failure`
- **Stages:** `callback_input`, `state_validation`, `state_consumption`, `short_lived_token_exchange`, `long_lived_token_exchange`, `profile_retrieval`, `provider_account_validation`, `credential_persistence`
- **Always-safe operator fields:** `event`, `stage`, `category`, `requestId`, `retryable`
- **Conditional safe provider fields:** `providerHttpStatus`, `providerErrorType`, `providerErrorCode`, `providerErrorSubcode`
- **Explicitly excluded:** callback URL/query, authorization code, short- or long-lived token, app secret, OAuth state, encryption key, cookies, authorization headers, raw provider body/error object, originating error/cause, and database credentials.

## Files changed

- `apps/api/src/workspace/instagram-basic-client.ts`
- `apps/api/src/workspace/instagram-oauth-service.ts`
- `apps/api/src/workspace/instagram-oauth-telemetry.ts`
- `apps/api/src/workspace/workspace-routes.ts`
- `apps/api/test/instagram-basic-client.test.ts`
- `apps/api/test/instagram-connection.integration.test.ts`
- `apps/api/test/instagram-oauth-telemetry.test.ts`
- `apps/api/test/instagram-routes.integration.test.ts`
- `docs/staging-deploy.md`

## Implementation commit

- `80f57091acd97cc1a39140eba1485c1953e41c6a` — `fix(instagram): add safe OAuth callback telemetry`

## Commands and exact outcomes

- `corepack pnpm --filter api exec vitest run test/instagram-oauth-telemetry.test.ts test/instagram-basic-client.test.ts test/instagram-routes.service-free.test.ts test/error-telemetry.test.ts` — passed: 4 files, 19 tests.
- `corepack pnpm --filter api typecheck` — passed (`tsc --noEmit`, exit 0).
- `corepack pnpm verify` — passed (RTL QA plus Turbo typecheck, lint, and test, exit 0).
- `corepack pnpm build` — passed (Turbo build, exit 0).
- `git diff --check` — passed before the implementation commit.
- `corepack pnpm --filter api exec vitest run test/instagram-routes.integration.test.ts test/instagram-connection.integration.test.ts test/instagram-oauth.test.ts` — did not complete as a passing integration run: the two guarded integration files skipped because their explicit database guard was absent, while both legacy `instagram-oauth.test.ts` cases failed with Prisma `P1001` because no PostgreSQL server was reachable at `localhost:5432`.

## Tests passed

Focused coverage proves:

- short exchange, long exchange, and profile provider failures receive the correct stage;
- state validation/consumption, account validation, and persistence stage contracts are distinct;
- HTTP status and allowlisted provider type/code/subcode survive sanitization;
- provider messages/raw responses are excluded;
- serialized Pino output excludes conspicuous sentinels for authorization code, both token forms, app secret, OAuth state, encryption key, raw provider response, and callback query;
- logging exceptions are swallowed;
- malformed callbacks retain generic handled responses;
- existing successful provider-boundary behavior remains intact.

Existing database integration coverage was strengthened to assert that failed persistence leaves neither a credential nor `INSTAGRAM_CONNECTED` audit row. The repository-wide verification passed, but the direct database-focused invocation could not exercise live PostgreSQL assertions in this environment.

## Checks not run or external evidence not collected

- No live Meta OAuth request was made.
- No Railway application, settings, variables, deployment configuration, or logs were accessed or changed.
- No production/shared database was accessed or changed.
- No security audit network command was run; the repository-required `verify` and `build` gates passed.
- No screenshot was taken because this change has no perceptible web UI change.

## Blockers, accepted limitations, and remaining risks

- Exact root cause remains pending one deployed callback retry and its sanitized event.
- Provider behavior can change independently of repository fixtures; the new event identifies the failing boundary without exposing payloads.
- A local PostgreSQL service was unavailable for the direct database integration invocation. CI with its disposable pgvector database remains authoritative for the strengthened atomicity assertion and registered-route integration update.
- Retryability is intentionally conservative: only HTTP 429 and 5xx provider responses are marked retryable; unknown/client/schema/persistence failures are not guessed as retryable.

## Post-deployment reproduction and evidence to capture

1. Deploy the PR without changing Railway or Meta configuration.
2. Sign in to MARKOS with a fresh valid application session.
3. In Settings, select **Connect Auth**, grant `instagram_business_basic`, and allow the browser to return to MARKOS once.
4. In Railway application logs, find the single event whose `event` is `instagram_oauth_callback_failure` for that callback.
5. Capture only `stage`, `category`, `requestId`, `retryable`, and any present `providerHttpStatus`, `providerErrorType`, `providerErrorCode`, and `providerErrorSubcode`.
6. Do not capture or paste the callback URL/query, provider response, code, state, token, secret, cookie, or authorization header.

## Next steps

Use the captured stage and safe provider identifiers to decide whether a narrowly evidenced provider-contract or persistence fix is needed. If no failure event appears, first verify the deployed commit contains this change and search by the stable event name; do not enable callback access logging.
