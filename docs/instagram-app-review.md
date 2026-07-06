# Instagram App Review Readiness

MARKOS uses Instagram Business Login and Content Publishing. Keep this file aligned with Meta dashboard settings before `INSTAGRAM_PUBLISH_MODE=live`.

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
META_REDIRECT_URI=http://localhost:4000/v1/workspace/instagram/oauth/callback
META_WEBHOOK_VERIFY_TOKEN=change-me-for-meta-dashboard
INSTAGRAM_OAUTH_SCOPES=instagram_business_basic,instagram_business_content_publish,instagram_business_manage_insights
INSTAGRAM_REFRESH_TOKEN_URL=https://graph.instagram.com/refresh_access_token
INSTAGRAM_TOKEN_REFRESH_WINDOW_DAYS=14
```

## Permissions To Request

Request only the permissions currently used by the product:

- `instagram_business_basic`
- `instagram_business_content_publish`
- `instagram_business_manage_insights`

Do not request comments, mentions, messaging, or ad permissions until the matching product surface and tests exist.

## App Review Screencast Script

1. Sign in to MARKOS and open Settings.
2. Click `Connect Instagram`.
3. Complete Instagram Business Login for a professional test account.
4. Return to MARKOS Settings and show the connected account state.
5. Open Schedule and show a scheduled content item with an HTTPS public media URL.
6. Run a dry-run publish and show readiness checks.
7. For live-review testing only, set `INSTAGRAM_PUBLISH_MODE=live`, publish one approved due item, and show the generated Instagram post.
8. Open Analytics, show `/v1/analytics/live-readiness`, sync analytics, and show real metrics plus Vault learning evidence.
9. Disconnect Instagram from MARKOS Settings.

## Operational Gates Before Live Mode

- Production API is served over HTTPS.
- `META_APP_ID`, `META_APP_SECRET`, `META_REDIRECT_URI`, and `META_WEBHOOK_VERIFY_TOKEN` are set in production secrets.
- Meta dashboard OAuth redirect URI exactly matches `META_REDIRECT_URI`.
- Webhook verification succeeds against `/v1/meta/webhooks/instagram`.
- Public media URLs use HTTPS and are reachable by Meta.
- Publishing remains behind `INSTAGRAM_PUBLISH_MODE=live`.
- Daily publishing caps are enforced before background publishing is enabled.
- Long-lived token refresh succeeds from MARKOS Settings and from the maintenance worker for connected accounts.
- Analytics live readiness passes before `INSTAGRAM_ANALYTICS_SYNC_MODE=live`.
- Analytics sync creates workspace-scoped `instagram_analytics` rows and a Vault learning entry.
- Data deletion/deauthorization callbacks disconnect Instagram credentials when the callback account identifier matches a stored `instagramAccountId`.
- Instagram webhook, deauthorization, and data deletion callbacks are persisted to `AuditLog` with sensitive payload fields redacted.

## Current Limitations

- Deauthorization and data deletion callbacks cannot disconnect accounts when Meta sends only an app-scoped user id that is not stored by MARKOS.
