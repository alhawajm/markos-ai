# Instagram Integration and App Review Status

Status date: 2026-08-17.

The production-verified connection used Instagram Login with `instagram_business_basic`. The Milestone A working implementation now requests the canonical ordered set `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_insights`, but it has not been deployed, reconnected, or live-verified. Each added permission retains its own dashboard, provider-call, persistence, App Review, and external-evidence gate. Comments and messaging are not confirmed first-release requirements.

## Evidence classification

- **Existing implemented and locally/CI verified foundation:** OAuth start/callback, signed state, expiry, transaction binding, single-use consumption, provider exchanges, professional-account resolution, encrypted persistence, bounded recent media, secure status, refresh, guaranteed local disconnect, guided manual provider removal, signed callback parsing/handling, redirects, and sanitized telemetry.
- **Milestone A working implementation:** canonical three-scope parsing/request/persistence, fixed `graph.instagram.com/v25.0` publishing and insights clients, one-JPEG operator publishing, local/S3 storage with provider-only just-in-time signing, separate account/media metrics, unavailable-versus-zero handling, and focused plus disposable-database tests. Railway bucket provisioning/references, deployment, reconnect, and provider acceptance remain open.
- **Production-verified on 2026-08-03:** one real professional account completed the deployed OAuth flow, appeared Connected in production Settings, and loaded recent provider-owned media.
- **Railway test verified on 2026-08-05:** local disconnect completed, the UI presented the Instagram Apps and websites action, and manual removal moved MarkOS AI-IG from Active to Removed. Meta delivered the deauthorization request as multipart form data; MARKOS verified the signed request, matched and removed the stored credential, persisted the audit, completed the callback with HTTP 200, and refreshed Settings to Disconnected.
- **Not yet externally verified:** formal App Review submission/approval, publishing, insights, a complete token-refresh lifetime, former-token invalidation, end-to-end data-deletion behavior, and webhook subscriptions.
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

## Milestone A permission boundary

The working implementation requests exactly:

```text
instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
```

`INSTAGRAM_OAUTH_SCOPES` is now parsed through the same canonical allowlist used by OAuth, persistence, status, readiness, and tests. It rejects duplicates, unknown scopes, missing basic, and Facebook Login names. Changing configuration alone does not grant permission: deploy the reviewed code, verify the live dashboard identifiers, and complete a fresh authorized connection.

The accepted execution order is:

1. Keep the production-verified business-basic connection stable.
2. Complete the application and private-storage contract while both modes remain dry-run.
3. Verify the live dashboard identifiers and eligible app-team test account.
4. Deploy, reconnect, and run one controlled JPEG publish plus one account- and one media-insights call.
5. Preserve independent App Review evidence and approval gates for publishing and insights before external-client use.

The current API mapping and Milestone A execution checklist are in `instagram-permissions-phase-2-checklist.md`. Do not implement from the retired Facebook-Page flow or from old permission names.

Permission names and dashboard availability are provider-managed and must be checked in current Meta documentation and the real dashboard immediately before a review submission. Additional messaging or comment permissions require a separate approved product scope.

## Meta dashboard inventory to verify

The following is historical handoff context, not repository-proven current dashboard state. Confirm each item in Meta before using it in an App Review submission or operational decision.

| Item                      | Handoff record requiring dashboard verification                                                                                                       |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- |
| App/portfolio             | Business app under the Ra'edat Business Portfolio, intended for multiple external client accounts.                                                    |
| Login/product             | Instagram Login.                                                                                                                                      |
| Selected use case         | `Manage messaging & content on Instagram`; this selection does not make messaging/comments MARKOS requirements.                                       |
| Graph version at creation | v25.0. The Milestone A application contract now fixes versioned Instagram Login account, publishing, and insights calls to `graph.instagram.com/v25.0`; verify current dashboard/runtime state separately. |
| App mode at creation      | Development.                                                                                                                                          |
| Initial permission        | `instagram_business_basic`.                                                                                                                           |
| Remaining permissions     | `instagram_business_content_publish` and `instagram_business_manage_insights`; both are in the working OAuth request, but deployment, fresh authorization, live calls, and App Review remain unverified. |
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
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS=14
META_WEBHOOK_VERIFY_TOKEN=<local-fake-value>
```

## Business-basic evidence script

1. Sign in to MARKOS and open Settings.
2. Click **Connect Instagram**.
3. Complete Instagram Login for a professional test account.
4. Return to Settings and show the Connected state.
5. Show the stored basic profile and bounded recent-owned-media result, including the valid empty state.
6. Show that callback query material is removed from the browser URL.
7. Demonstrate refresh only when the provider makes the token eligible.
8. Disconnect and show that MARKOS removes the active encrypted credential and presents the manual Instagram-permissions action without treating the required provider step as a local failure.

Do not record a real authorization code, token, state, callback URL with a query string, provider identifier, email, username, header, cookie, or raw provider response in the screencast or evidence pack.

The publishing and insights submissions need separate evidence scripts after phase-two research confirms Meta's current review requirements. Reuse only the connection/security portion above; add permission-specific user action, provider result, data-use explanation, failure/recovery, and deletion/privacy evidence rather than claiming the basic connection demonstrates either permission.

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
- `INSTAGRAM_GRAPH_VERSION` is fixed to `v25.0` for this milestone. Version presence is not proof of dashboard configuration, permission grant, or successful provider behavior.

## Webhook and provider limitations

- Dashboard callback verification does not subscribe a professional account to webhook fields. Per-account subscription and field selection require a separate provider operation and applicable permissions.
- `instagram_business_basic` does not by itself authorize publishing or insights, and this milestone requests no comments or messaging permissions.
- The repository implements refresh, deauthorization, data deletion, and webhook validation, but real provider timing and delivery remain externally unverified.
- The production connection does not prove App Review state. Attach submission/approval evidence before changing the milestone ledger.

See `project-status.md`, `staging-deploy.md`, `instagram-live-publish-verification.md`, and `instagram-analytics-live-verification.md` for the remaining boundaries.
