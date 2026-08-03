# Instagram OAuth end-to-end observability completion report

## Task scope

Trace every server-controlled operation in Instagram OAuth initiation, callback security, provider communication, professional-profile processing, atomic credential persistence, completion redirects, and connection-status retrieval; replace broad persistence telemetry with a stable typed taxonomy; preserve exactly-once terminal logging and strict redaction; add minimal lifecycle success events; verify security and behavior; and prepare an unmerged pull request without changing provider/account semantics, OAuth scopes, configuration values, credentials, database contents, Railway/Meta settings, deployment configuration, publishing/analytics features, or dry-run behavior.

## Verdict

**Implemented.** The former `credential_persistence` / `credential_persistence_failed` event could locate only the broad phase. The callback now retains the precise active operation through encryption, transaction context, each write, commit, secured read, and status transformation. Provider request/response failures, state failure modes, start authorization, status authorization, and database classes are likewise distinct. Lower layers attach typed safe diagnostics; only the owning request boundary emits a terminal event.

No persistence root cause was guessed or behaviorally fixed. The production evidence establishes only that the current deployment reached persistence. A repeat attempt will identify the failing sub-operation and, when safely recognized, a Prisma code.

## Server-controlled flow traced

1. Settings/status authentication, workspace membership/RBAC, scoped credential/media read, and response transformation.
2. Start authentication, workspace authorization, provider configuration, return-path validation, signed state claims, nonce persistence, authorization URL construction, and response.
3. Callback parameter/provider-error handling; state structure, signature, expiry, transaction binding, atomic consumption, missing/expired transaction, and replay.
4. Short-token request plus HTTP/network/timeout/body/schema validation; long-token request plus the same validation; `/me` fetch and profile schema/professional-account transformation.
5. Encryption-key presence and decoding, persistence-data serialization, runtime encryption, Prisma transaction/context start, credential upsert, recent-media delete/insert, `INSTAGRAM_CONNECTED` insert, commit, secured post-write read, and status transformation.
6. JSON response or success/failure redirect construction.

MARKOS cannot observe Meta's internal account selection, login, or consent screens and emits no events claiming those steps succeeded.

## Final events and stage taxonomy

Terminal failure events:

- `instagram_oauth_start_failure`
- `instagram_oauth_callback_failure`
- `instagram_connection_status_failure`

Lifecycle success events:

- `instagram_oauth_start_success`: emitted only after nonce persistence and authorization URL construction.
- `instagram_oauth_callback_success`: emitted only after credential/media/audit commit, secured post-write read, connection transformation, and response/redirect construction.

Authoritative stages:

- Start: `start_request_validation`, `start_authentication`, `start_workspace_authorization`, `provider_configuration`, `oauth_transaction_creation`, `oauth_transaction_persistence`, `authorization_url_construction`.
- Callback security: `callback_request_validation`, `provider_authorization_denied`, `state_verification`, `oauth_transaction_binding`, `oauth_transaction_consumption`.
- Provider: `short_lived_token_exchange`, `short_lived_token_response_validation`, `long_lived_token_exchange`, `long_lived_token_response_validation`, `profile_fetch`, `profile_response_validation`, `professional_account_resolution`.
- Persistence: `credential_configuration`, `credential_serialization`, `credential_encryption`, `database_transaction_begin`, `connection_upsert`, `recent_media_delete`, `recent_media_insert`, `audit_insert`, `database_transaction_commit`, `post_persistence_read`, `connection_status_transformation`.
- Completion/status: `success_redirect`, `failure_redirect`, `connection_status_authentication`, `connection_status_authorization`, `connection_status_read`.

Categories are fixed operation outcomes, never exception text. Provider failures distinguish timeout, network, HTTP, non-JSON, oversized response, and schema failure. State failures distinguish malformed/signature/expiry/binding/already-consumed/not-found-or-expired. Persistence distinguishes missing/invalid encryption configuration, serialization/encryption failures, and fixed database classifications.

The dead `provider_account_validation` / `provider_account_id_mismatch` path remains absent. The broad `credential_persistence` stage is no longer executable.

## Exactly-once terminal logging

Provider, state, encryption, and persistence layers never log. They throw `InstagramOAuthDiagnosticError` or existing OAuth wrapper errors containing only the typed diagnostic. The start, callback, status, or route pre-handler boundary emits one terminal event. Tests spy on the serialized/request logger boundary and prove a callback conflict yields one terminal failure, malformed/denied callbacks yield one each, an unauthenticated start yields one, rollback yields no success, and a complete callback yields one success.

## Persistence classification

Persistence prepares and validates data before opening the transaction, encrypts once, and retains an `activeStage` around the unchanged workspace-scoped Prisma transaction. Known inner failures retain `connection_upsert`, `recent_media_delete`, `recent_media_insert`, or `audit_insert`; a failure before transaction callback entry is `database_transaction_begin`; a failure after all inner operations is `database_transaction_commit`. The secured read occurs afterward and is `post_persistence_read`, not a write failure. Its object transformation is separately `connection_status_transformation`.

Fault-injection tests throw at every boundary and verify rollback leaves neither credentials nor `INSTAGRAM_CONNECTED` for transactional failures. The post-persistence-read fault occurs after commit by definition and is tested as such.

## Safe metadata and retryability

Allowed fields are only `event`, `stage`, `category`, `retryable`, `requestId`, validated provider HTTP status/type/numeric code/subcode, recognized `databaseCode`, and fixed-format `validationCode`.

Recognized Prisma codes are `P1000`, `P1001`, `P1002`, `P1008`, `P1017`, `P2002`, `P2003`, `P2025`, and `P2034`. Unknown/arbitrary codes are omitted and map to `database_unknown_failure`.

Retryable policy:

- Retryable: provider timeouts/network errors, provider 429/5xx, Prisma `P1001`, `P1002`, `P1008`, `P1017`, and transaction conflict `P2034`.
- Not retryable: request/authz/state/config/schema/encryption failures, authorization denial, unique/foreign-key/not-found constraints, unknown database failures, and other integrity failures.

No retryability inference uses raw messages.

## Absolute redaction and adversarial testing

Forbidden from OAuth telemetry: codes, state or derived fingerprints, short/long/refresh tokens, app secrets, encryption keys, ciphertext/IV/tag, authorization/callback URLs, query strings, headers, cookies/sessions, provider bodies/messages, raw errors/causes/stacks, Prisma messages/meta, SQL/parameters, user/workspace/transaction/provider IDs, usernames, and emails.

The serialization test places recognizable canaries representing authorization code, state, token, provider body, Prisma message/meta, SQL, stack, nested cause, user/workspace/account identifiers, and username into adversarial inputs, captures Pino's fully serialized output, and asserts none appears. Only a valid synthetic request ID and allowlisted `P2002` remain.

## Behavior and security preservation

- Signed HMAC state, expiry, single-use nonce, workspace/user binding, and atomic replay consumption remain.
- Start/status authentication and workspace RBAC remain.
- Fixed provider endpoints, token exchanges, `/me` retrieval, and `/me.user_id` professional-account persistence remain.
- AES-256-GCM encrypted credential storage remains; encryption is performed once before the transaction rather than separately in each upsert branch.
- Credential, recent-media, and `INSTAGRAM_CONNECTED` writes remain in one workspace-scoped transaction.
- Browser errors remain generic and success redirects are unchanged.
- No diagnostic detail is returned to the UI.
- No global Prisma/SQL logging or application log-level change was introduced.
- Publishing, analytics, refresh, readiness, disconnect, webhook, identifier, and dry-run semantics are unchanged.

## Files changed

- `apps/api/src/security/oauth-state.ts`
- `apps/api/src/security/prisma-oauth-state-store.ts`
- `apps/api/src/tenancy/workspace-plugin.ts`
- `apps/api/src/workspace/instagram-basic-client.ts`
- `apps/api/src/workspace/instagram-connection-service.ts`
- `apps/api/src/workspace/instagram-oauth-service.ts`
- `apps/api/src/workspace/instagram-oauth-telemetry.ts`
- `apps/api/src/workspace/workspace-routes.ts`
- `apps/api/test/instagram-basic-client.test.ts`
- `apps/api/test/instagram-connection.integration.test.ts`
- `apps/api/test/instagram-oauth-persistence-observability.test.ts`
- `apps/api/test/instagram-oauth-telemetry.test.ts`
- `apps/api/test/instagram-routes.integration.test.ts`
- `apps/api/test/instagram-routes.service-free.test.ts`
- `apps/api/test/instagram-security-foundation.test.ts`
- `docs/decisions.md`
- `docs/staging-deploy.md`
- `docs/codex-reports/2026-08-03-instagram-oauth-end-to-end-observability.md`

## Implementation commit and provenance

- `a390e32252bbd3e4ee78f1075e88a79c8775cae7` — `feat(instagram): trace OAuth failures end to end`

The focused branch starts at `8e0573d`, the latest repository `main` snapshot supplied for this task and containing the recently applied professional-account validation fix. The committed PR comparison `8e0573d..HEAD` is authoritative; reviewers should resolve `HEAD` at review time because the documentation report commit follows the implementation commit.

## Commands and exact outcomes

### Passed

- Repository prerequisite SQL against disposable loopback PostgreSQL, followed by `corepack pnpm --filter api prisma migrate deploy` and `corepack pnpm --filter api prisma db seed` — passed; Redis was started locally for repository tests.
- `corepack pnpm --filter api exec vitest run test/instagram-basic-client.test.ts test/instagram-oauth-telemetry.test.ts test/instagram-oauth-persistence-observability.test.ts test/instagram-security-foundation.test.ts test/instagram-routes.service-free.test.ts test/error-telemetry.test.ts` — passed: 6 files, 39 tests.
- Database-enabled `corepack pnpm --filter api exec vitest run test/instagram-oauth.test.ts test/instagram-routes.integration.test.ts test/instagram-connection.integration.test.ts test/instagram-basic-client.test.ts test/instagram-oauth-telemetry.test.ts test/instagram-oauth-persistence-observability.test.ts test/instagram-security-foundation.test.ts test/instagram-routes.service-free.test.ts test/error-telemetry.test.ts` — passed: 9 files, 58 tests.
- Post-format focused `corepack pnpm --filter api exec vitest run test/instagram-routes.integration.test.ts test/instagram-oauth-telemetry.test.ts test/instagram-oauth-persistence-observability.test.ts` — passed: 3 files, 20 tests.
- `corepack pnpm --filter api typecheck` — passed.
- `corepack pnpm verify` — passed: 32 tasks; API 38 files/233 tests, web 1 file/3 tests, AI 7 tests, RTL QA, repository typecheck, and lint all passed.
- `corepack pnpm build` — passed: 9 tasks including API TypeScript and Next.js production build.
- `git diff --check` — passed.

### Checks not run or limitations

- No live Meta, Railway, or production database request was made, as required.
- The container has no PDF extraction tool/library. The authoritative PDF was read only through available raw strings; `AGENTS.md`, the complete experience flow companion, decisions, security, deployment, launch, App Review, prior observability reports, source, schema, migrations, and tests were inspected directly.

## Operations not separately distinguishable

Prisma's callback transaction API does not expose an independent public begin/commit callback. Classification therefore uses the reliable execution boundary: errors before entering the application callback remain `database_transaction_begin`, explicitly annotated inner failures retain their operation, and errors after the final inner operation remain `database_transaction_commit`. No transaction was split or weakened to gain observability.

An unsuccessful atomic nonce update is followed by a workspace-scoped lookup to distinguish `already_consumed` from `not_found_or_expired`; expiration and missing records remain intentionally combined because the outcome is security-equivalent and distinguishing them further would add no safe operational value.

## Privacy/configuration confirmation

No credentials, OAuth values, environment-variable values, callback query strings, provider bodies, database contents, real identifiers, raw exceptions, Prisma messages, Prisma metadata, SQL, or parameters were retrieved, logged, printed, exposed, or committed. No Railway, Meta App, scope, redirect URI, environment, credential, database, deployment, live-mode, or dry-run configuration was changed.

## Production validation procedure

1. Wait for Railway's new API deployment to become **Active**.
2. Sign into MARKOS freshly and perform one Instagram OAuth connection attempt.
3. If it fails, locate exactly one terminal OAuth failure event for the callback request.
4. Confirm its stage is narrower than `credential_persistence`.
5. Record only `stage`, `category`, `retryable`, `requestId`, and any safe allowlisted provider/database code.
6. Do not share the complete callback URL, query string, code, state, token, provider body, raw exception, Prisma message, or Prisma metadata.
7. If it succeeds, confirm Settings shows **Connected** and the atomic `INSTAGRAM_CONNECTED` audit event exists.

## Next steps

Review the new pull request and CI results. Do not merge it as part of this task. After a future approved merge and Active deployment, execute the production validation procedure above.
