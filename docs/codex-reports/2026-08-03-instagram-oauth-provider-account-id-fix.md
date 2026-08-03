# Instagram OAuth provider account ID root-cause fix completion report

## Task scope

Verify the production `provider_account_id_mismatch` callback failure against current official Meta Instagram Platform documentation and the repository's complete Instagram connection lifecycle; implement the smallest supported identity-handling correction; add regression coverage; verify the focused OAuth, persistence, status, audit, telemetry, type, lint, and build behavior; and prepare a pull request without changing provider, Railway, database, credential, scope, publishing, analytics, or deployment configuration.

## Verdict

**Implemented. Root-cause confidence: high.**

MARKOS compared two documented fields with different meanings:

- the authorization-code exchange `user_id` is the app user's Instagram-scoped identity;
- Instagram Login `/me.id` is the access-token-bound app-user identity in that scoped namespace;
- Instagram Login `/me.user_id` is the Instagram professional account identity used by account/media API operations.

Meta documents the exchange value and `/me.user_id` differently and does not document or guarantee their equality. Existing fixtures assigned the same synthetic value to both, so the invalid cross-namespace comparison passed locally. Production's successful provider responses exposed the assumption.

The corrected callback requests both `id` and `user_id`, retains a same-namespace validation between exchange `user_id` and `/me.id`, and persists `/me.user_id` as the canonical `providerAccountId`.

## Official Meta documentation consulted

- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/business-login
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-instagram-login/get-started
- https://developers.facebook.com/docs/instagram-platform/instagram-api-with-facebook-login/get-started
- https://developers.facebook.com/docs/instagram-platform/reference/me

The Instagram Login Business Login guide describes the authorization-code exchange response `user_id` as the app user's Instagram-scoped user ID. The Instagram Login Get Started guide describes `/me?fields=user_id,username` as returning the professional account user ID and uses that IG ID for subsequent account media calls. Its `/me` note ties the endpoint object to the app-user ID received from the access token. Meta does not state that the professional-account `user_id` field equals the exchange's scoped identity.

Facebook Login for Business uses a different contract: a Facebook User access token and Page discovery lead to an Instagram business account ID. MARKOS's active connection uses Instagram Login and `instagram_business_basic`; the two login contracts are not treated as interchangeable.

## Findings and implementation decisions

1. Authorization start remains authenticated and permission-gated, uses the fixed Instagram authorization endpoint and scope, issues signed expiring state, and persists an atomically consumable nonce.
2. Callback state verification and transaction binding remain unchanged.
3. The fixed short-lived, long-lived, versioned `/me`, and refresh endpoints remain unchanged.
4. The short-token transformation is renamed from misleading `accountId` to `scopedUserId`.
5. The profile boundary now requires and distinguishes `scopedUserId` (`id`) and `professionalAccountId` (`user_id`).
6. The callback validates only the same-namespace scoped identities.
7. Encrypted credential persistence, recent-media persistence, and `INSTAGRAM_CONNECTED` audit creation remain in the existing workspace-scoped database transaction.
8. `professionalAccountId` is stored in `instagram_connection_credentials.providerAccountId`, returned by connection status, and used as the audit target.
9. No database migration is required because the existing provider account column already represents the canonical professional account ID.
10. Existing callback failure classification, generic browser redirect/JSON behavior, and allowlisted sanitized telemetry remain unchanged.
11. No actual identifiers are added to mismatch telemetry.

## Downstream consumers reviewed

- publishing: uses the stored account ID in `/{IG_ID}/media` and `/{IG_ID}/media_publish`;
- analytics: uses the stored account ID for account and media reads;
- refresh: rotates the encrypted token on the same credential row and retains the canonical provider account ID;
- disconnect and workspace erasure: delete/clear the encrypted connection using workspace isolation;
- readiness and connection status: resolve the encrypted credential record and return its professional account ID;
- Meta deauthorization/data deletion: match verified callback account identity against the stored provider account ID;
- audit: connection, refresh, disconnect, and callback audit targets use the stored professional account ID.

These consumers require the Instagram professional account ID, confirming that `/me.user_id`, rather than the token-exchange scoped user identity, is the correct canonical value.

## Files changed

- `apps/api/src/workspace/instagram-basic-client.ts`
- `apps/api/src/workspace/instagram-oauth-service.ts`
- `apps/api/src/workspace/instagram-connection-service.ts`
- `apps/api/test/instagram-basic-client.test.ts`
- `apps/api/test/instagram-connection.integration.test.ts`
- `apps/api/test/instagram-oauth.test.ts`
- `apps/api/test/instagram-routes.integration.test.ts`
- `apps/api/test/helpers/instagram-connection.ts`
- `docs/decisions.md`
- `docs/codex-reports/2026-08-03-instagram-oauth-provider-account-id-fix.md`

## Implementation provenance

The platform consolidated the task commits when PR #7 was merged, so the task-local implementation hash is not a currently reachable commit. The authoritative merged PR comparison is `2b06bd3075c8447ab452c66cb84e4665d3cc47f1..149eea5300a7e2bcfa65a071b011a038bd85806e`; reviewers should resolve the endpoints from Git rather than substitute an unstable PR-head hash.

## Commands and exact outcomes

### Passed

- `corepack pnpm --filter api exec vitest run test/instagram-basic-client.test.ts test/instagram-oauth-telemetry.test.ts test/instagram-routes.service-free.test.ts test/error-telemetry.test.ts` — passed: 4 files, 19 tests.
- Disposable PostgreSQL bootstrap using repository initialization SQL and `corepack pnpm --filter api prisma migrate deploy` — passed: baseline migration applied.
- `corepack pnpm --filter api prisma db seed` against the disposable local database — passed.
- Database-enabled focused suite: `corepack pnpm --filter api exec vitest run test/instagram-routes.integration.test.ts test/instagram-connection.integration.test.ts test/instagram-oauth.test.ts test/instagram-basic-client.test.ts test/instagram-oauth-telemetry.test.ts test/error-telemetry.test.ts` — passed: 6 files, 27 tests.
- `corepack pnpm --filter api typecheck` — passed.
- `corepack pnpm turbo typecheck lint` — passed: 23 tasks.
- `corepack pnpm build` — passed: 9 tasks, including the production Next.js build.
- `git diff --check` — passed.
- Official Meta documentation retrieval with `curl` restricted to `https://developers.facebook.com` — passed; no provider API was called.

### Failed or limited

- `corepack pnpm verify` with the disposable database enabled did not complete successfully. An initial run lacked seeded plan rows. After applying the repository seed, the full API suite still ran shared database tests concurrently and produced 131 unrelated fixture/registration failures across 22 files; the six Instagram-focused files passed independently against the same database. RTL, web tests, AI tests, and the type/lint tasks shown before the API failure passed. This task did not weaken or bypass the gate.
- `corepack pnpm security:audit` could not query the npm advisory endpoint after retries because the registry request returned `fetch failed`. Type checking, linting, focused tests, and production build completed independently.
- The container lacked a PDF text extractor, and installing `poppler-utils` was blocked by the environment's Ubuntu mirror returning HTTP 403/signature errors. The authoritative PDF could not be mechanically extracted; the repository's behavioral companion, Instagram architecture/decision records, deployment runbook, security audit, prior callback telemetry report, source, schemas, and tests were inspected directly.

## Security and privacy confirmation

- OAuth HMAC state validation, expiry, persisted nonce consumption, and transaction binding are unchanged.
- Workspace authorization and workspace-scoped transaction behavior are unchanged.
- AES-256-GCM credential encryption and encrypted-only active credential storage are unchanged.
- Connection persistence, recent-media persistence, and `INSTAGRAM_CONNECTED` audit creation remain atomic.
- Callback route logging remains disabled and the existing generic browser-facing failure behavior remains unchanged.
- Sanitized telemetry remains allowlisted and contains no authorization codes, access tokens, app secrets, OAuth state, encryption keys, raw provider bodies, callback query strings, or provider account identifiers.
- No live Meta API request, real Instagram account access, production credential access, Railway access, environment-value change, database-content change, or deployment-setting change was performed.

## Remaining risks and uncertainties

- Meta's documentation distinguishes the identities but does not include an explicit sentence saying the exchange `user_id` and `/me.user_id` must differ or must never be compared. The fix uses the narrowest defensible behavior: preserve validation in the documented scoped namespace and persist the separately documented professional-account identity.
- A supervised post-deployment OAuth attempt remains necessary to confirm the deployed provider response includes `/me.id` under the current app/version and that production persistence completes.
- Repository-wide API tests need an isolated/serialized database strategy to make the full database-enabled `verify` run reliable in this container; that unrelated test-infrastructure work is outside this focused fix.
- The npm advisory check must be rerun where registry advisory access is available.

## Post-deployment validation

1. Wait for the new Railway API deployment to become **Active**.
2. Sign into MARKOS freshly.
3. Perform one Instagram connection attempt.
4. Confirm Settings shows **Connected**.
5. Confirm the `INSTAGRAM_CONNECTED` audit event appears.
6. Confirm no `provider_account_id_mismatch` telemetry event is emitted for the valid connection.
7. If a failure occurs, retain only the existing allowlisted callback telemetry fields; do not capture callback URLs, query strings, provider bodies, codes, tokens, state, secrets, or real identifiers.

## Next steps

- Review and merge the pull request after CI and code review; do not change Meta or Railway configuration for this fix.
- Perform the post-deployment validation above after Railway's existing automatic deployment from `main`.
- Rerun `corepack pnpm security:audit` in an environment with npm advisory access.
