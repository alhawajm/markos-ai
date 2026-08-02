# Instagram Business-Basic Connection Readiness

This milestone uses Instagram Login and requests exactly `instagram_business_basic`. Publishing, insights, comments, messages, and their additional permissions remain outside this connection milestone and stay disabled.

## Required Meta Dashboard URLs

Use HTTPS URLs in production.

| Meta setting | MARKOS endpoint |
| --- | --- |
| OAuth redirect URI | `${API_BASE_URL}/v1/workspace/instagram/oauth/callback` |
| Instagram webhook callback | `${API_BASE_URL}/v1/meta/webhooks/instagram` |
| Deauthorize callback URL | `${API_BASE_URL}/v1/meta/deauthorize` |
| Data deletion request callback URL | `${API_BASE_URL}/v1/meta/data-deletion` |

Local defaults:

```env
INSTAGRAM_OAUTH_REDIRECT_URI=http://localhost:4000/v1/workspace/instagram/oauth/callback
META_WEBHOOK_VERIFY_TOKEN=change-me-for-meta-dashboard
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic
INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS=14
```

## Permissions To Request

Request exactly the permission used by this milestone:

- `instagram_business_basic`

Do not request publishing, insights, comments, mentions, messaging, or ad permissions until the matching product surface, provider integration, review evidence, and tests exist.

## App Review Screencast Script

1. Sign in to MARKOS and open Settings.
2. Click `Connect Instagram`.
3. Complete Instagram Business Login for a professional test account.
4. Return to MARKOS Settings and show the connected account state.
5. Show the stored basic profile and the bounded recent-owned-media result (including the valid empty state).
6. Refresh an eligible long-lived token, reconnect, and disconnect from MARKOS Settings.

## Operational Gates Before Live Mode

- Production API is served over HTTPS.
- `INSTAGRAM_APP_ID`, `INSTAGRAM_APP_SECRET`, `INSTAGRAM_OAUTH_REDIRECT_URI`, `INSTAGRAM_TOKEN_ENCRYPTION_KEY`, `INSTAGRAM_OAUTH_STATE_SECRET`, and `META_WEBHOOK_VERIFY_TOKEN` are set in production secrets.
- Meta dashboard OAuth redirect URI exactly matches `INSTAGRAM_OAUTH_REDIRECT_URI`.
- Webhook verification succeeds against `/v1/meta/webhooks/instagram`.
- Long-lived token refresh succeeds from MARKOS Settings and from the maintenance worker for connected accounts.
- Data deletion/deauthorization callbacks carry a valid Meta `signed_request` and disconnect the matching encrypted credential.
- Webhook POSTs carry a valid `X-Hub-Signature-256`; invalid or unsigned payloads are rejected before audit processing.
- Instagram webhook, deauthorization, and data deletion callback audits redact signed requests and secrets.
- `INSTAGRAM_PUBLISH_MODE` and `INSTAGRAM_ANALYTICS_SYNC_MODE` remain `dry_run`.

## Webhook and Live-Provider Limitations

- Dashboard callback verification does not subscribe a professional account to webhook fields. Meta requires a separate per-account `/{ig-user-id}/subscribed_apps` operation and field selection.
- The exact `instagram_business_basic` permission does not by itself authorize webhook fields that require comments or messaging permissions. No additional permission is requested by this milestone, so those subscriptions must not be represented as active.
- Live Meta authorization, callback payloads, field availability, per-account webhook subscription, refresh timing, and deauthorization/data-deletion delivery still require supervised validation with the real Meta App.
