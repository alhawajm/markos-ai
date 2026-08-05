# Instagram Integration and App Review Status

Status date: 2026-08-03.

The current connection milestone uses Instagram Login and requests exactly `instagram_business_basic`. Publishing and insights are confirmed first-release goals, but their permissions, App Review evidence, and live behavior remain separate milestones. Comments and messaging are not confirmed first-release requirements.

## Evidence classification

- **Implemented and locally/CI verified:** the current source and tests cover OAuth start/callback, signed state, expiry, transaction binding, single-use consumption, provider exchanges, professional-account resolution, encrypted persistence, bounded recent media, secure status, refresh, guaranteed local disconnect, guided manual provider removal, signed callback parsing/handling, redirects, and sanitized telemetry.
- **Production-verified on 2026-08-03:** one real professional account completed the deployed OAuth flow, appeared Connected in production Settings, and loaded recent provider-owned media.
- **Railway test verified on 2026-08-05:** local disconnect completed, the UI presented the Instagram Apps and websites action, manual removal moved MarkOS AI-IG from Active to Removed, and Meta delivered a deauthorization request to MARKOS. The request failed signed-request verification with HTTP 403.
- **Not yet externally verified:** formal App Review submission/approval, publishing, insights, a complete token-refresh lifetime, former-token invalidation, successful signed deauthorization/data-deletion handling, and webhook subscriptions.
- **Externally managed:** current Meta dashboard settings, app mode, roles, permissions, Graph version, URLs, and App Review status. Repository code and this handoff cannot prove their current dashboard values.

## Production connection milestone

The successful 2026-08-03 attempt reached the current implementation's complete business-basic path:

1. An authorized workspace member initiated OAuth.
2. MARKOS issued signed, expiring state bound to the user, workspace, return path, and persisted transaction nonce.
3. The public callback validated its input, verified the state, and atomically consumed the bound transaction.
4. The provider code was exchanged for short-lived and long-lived tokens.
5. MARKOS fetched the token-authenticated `/me` profile and persisted `/me.user_id` as the professional `providerAccountId` without comparing identifiers from different provider namespaces.
6. The access token was encrypted with AES-256-GCM using a canonical Base64 32-byte key.
7. The credential, up to six recent-media rows, and `INSTAGRAM_CONNECTED` audit row were written in one workspace-scoped transaction.
8. MARKOS performed the required secured read, transformed connection status, completed the success redirect, and the production Settings UI refreshed.

Meta's internal login, account-selection, and consent screens are not server-observable lifecycle stages. The successful return demonstrates the round-trip outcome but does not justify invented success events.

## Identity contract

For Instagram Login, the current client retains the authorization-code exchange `user_id` only as a required response field. The token-authenticated `/me.user_id` is the professional-account identity stored as `providerAccountId`; `/me.username` is stored as display identity. Do not compare the exchange value, `/me.id`, and `/me.user_id` unless current authoritative Meta documentation establishes that the exact compared fields represent the same entity.

Facebook Login for Business uses a different Page-to-Instagram discovery model and is not interchangeable with this flow. Downstream publishing, analytics, refresh, readiness, disconnect, deauthorization/data deletion, and erasure paths resolve the encrypted credential record and use the stored professional-account identity.

## Current permission boundary

The active client fixes its requested permission in code:

```text
instagram_business_basic
```

`INSTAGRAM_OAUTH_SCOPES` does not change the active authorization request. Current environment validation also accepts only the business-basic value. Do not claim that publishing or insights can be enabled by changing that variable.

The intended permission progression is:

1. Keep the production-verified business-basic connection stable.
2. When the application, storage, deployment, and review evidence are ready, implement and request `instagram_business_content_publish`.
3. Add the applicable insights permission only with the matching analytics implementation, review evidence, and controlled live verification.

Permission names and dashboard availability are provider-managed and must be checked in current Meta documentation and the real dashboard immediately before a review submission. Additional messaging or comment permissions require a separate approved product scope.

## Meta dashboard inventory to verify

The following is historical handoff context, not repository-proven current dashboard state. Confirm each item in Meta before using it in an App Review submission or operational decision.

| Item                      | Handoff record requiring dashboard verification                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| App/portfolio             | Business app under the Ra'edat Business Portfolio, intended for multiple external client accounts.                                                    |
| Login/product             | Instagram Login.                                                                                                                                      |
| Selected use case         | `Manage messaging & content on Instagram`; this selection does not make messaging/comments MARKOS requirements.                                       |
| Graph version at creation | v25.0. The repository's Instagram Login client currently defaults to v25.0; dashboard/runtime state may change independently.                         |
| App mode at creation      | Development.                                                                                                                                          |
| Initial permission        | `instagram_business_basic`.                                                                                                                           |
| Next intended permission  | `instagram_business_content_publish`, after foundation stabilization.                                                                                 |
| Access model              | Least privilege. Khalid had scoped app/technical access rather than portfolio-wide administration.                                                    |
| Custody                   | Yahya Alawadhi retained portfolio control; Maryam Buzaboon and Mohamed Al-Hawaj received longer-term app/business custody appropriate to their roles. |
| Cloud owner access        | Sarah does not require Meta access solely because she owns cloud work; grant only a concrete least-privilege need.                                    |

Do not copy dashboard secrets, real provider-account identifiers, callback query data, user details, or access tokens into this inventory.

## Required Meta dashboard URLs

Use public HTTPS URLs in deployed environments. Replace only the host in the dashboard; do not record the real production host or query values in repository evidence.

| Meta setting                       | MARKOS endpoint                                         |
| ---------------------------------- | ------------------------------------------------------- |
| OAuth redirect URI                 | `${API_BASE_URL}/v1/workspace/instagram/oauth/callback` |
| Instagram webhook callback         | `${API_BASE_URL}/v1/meta/webhooks/instagram`            |
| Deauthorize callback URL           | `${API_BASE_URL}/v1/meta/deauthorize`                   |
| Data deletion request callback URL | `${API_BASE_URL}/v1/meta/data-deletion`                 |

Local fake-only names:

```env
INSTAGRAM_OAUTH_REDIRECT_URI=http://localhost:4000/v1/workspace/instagram/oauth/callback
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic
INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS=14
META_WEBHOOK_VERIFY_TOKEN=<local-fake-value>
```

## App Review evidence script

1. Sign in to MARKOS and open Settings.
2. Click **Connect Instagram**.
3. Complete Instagram Login for a professional test account.
4. Return to Settings and show the Connected state.
5. Show the stored basic profile and bounded recent-owned-media result, including the valid empty state.
6. Show that callback query material is removed from the browser URL.
7. Demonstrate refresh only when the provider makes the token eligible.
8. Disconnect and show that MARKOS removes the active encrypted credential and presents the manual Instagram-permissions action without treating the required provider step as a local failure.

Do not record a real authorization code, token, state, callback URL with a query string, provider identifier, email, username, header, cookie, or raw provider response in the screencast or evidence pack.

## Operational gates

- Production API is served over HTTPS.
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `INSTAGRAM_TOKEN_ENCRYPTION_KEY`, `INSTAGRAM_OAUTH_STATE_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN` are supplied through the external secret manager.
- The redirect URI exactly matches the deployed callback.
- `INSTAGRAM_TOKEN_ENCRYPTION_KEY` is canonical Base64 that decodes to exactly 32 bytes. Presence alone is not validity.
- Webhook verification succeeds against `/v1/meta/webhooks/instagram`.
- Long-lived token refresh is verified from Settings and the worker over a real eligible lifecycle before it is described as production-complete.
- A controlled disconnect removes the local credential and presents the required Instagram Apps and websites action; selecting **Remove** invalidates the former token and delivers a valid signed callback that receives HTTP 200.
- Deauthorization and data-deletion callbacks accept only a valid Meta `signed_request` and are verified with controlled provider delivery.
- Webhook POSTs require a valid `X-Hub-Signature-256`; invalid or unsigned payloads are rejected before audit processing.
- Callback audit persistence redacts signed requests and secrets.
- `INSTAGRAM_PUBLISH_MODE` and `INSTAGRAM_ANALYTICS_SYNC_MODE` remain `dry_run` until their separate gates close.

## Webhook and provider limitations

- Dashboard callback verification does not subscribe a professional account to webhook fields. Per-account subscription and field selection require a separate provider operation and applicable permissions.
- `instagram_business_basic` does not by itself authorize publishing or insights, and this milestone requests no comments or messaging permissions.
- The repository implements refresh, deauthorization, data deletion, and webhook validation, but real provider timing and delivery remain externally unverified.
- The production connection does not prove App Review state. Attach submission/approval evidence before changing the milestone ledger.

See `project-status.md`, `staging-deploy.md`, `instagram-live-publish-verification.md`, and `instagram-analytics-live-verification.md` for the remaining boundaries.
