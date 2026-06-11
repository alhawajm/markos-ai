# Decisions

## 2026-06-10: Canonical Documents

Use `MARKOS_BUILD_SPEC. 2.pdf` and `MARKOS_AGENTS. 2.0.pdf` as canonical over older PDFs and over older implementation-plan assumptions.

## 2026-06-10: Payments Precedence

The implementation plan references Stripe as primary, but the newer build spec supersedes it. Build Bahrain-first payment adapters for CrediMax and BENEFIT, with Stripe as international fallback.

## 2026-06-10: Model Names

Do not hardcode model names in code. Use environment variables and provider interfaces. The named models in source documents are planning examples, not code constants.

## 2026-06-10: Tailwind Major

Use Tailwind CSS 3.4.x for the initial Next.js 14 scaffold because the spec expects a conventional Tailwind config and token mapping. Revisit Tailwind 4 only if it removes friction without changing product behavior.

## 2026-06-10: Next Config Extension

Use `next.config.mjs` instead of the spec example `next.config.ts` because Next.js 14.2 rejects TypeScript config files in this environment.

## 2026-06-10: Brand Onboarding Writes Tone

The spec defines 7 onboarding modules but the Vault has 8 sections, including `TONE`. Treat the Brand module as the source for both `BRAND` and `TONE` when tone words or voice notes are supplied, so onboarding can complete the full Vault readiness score without adding an eighth wizard step.

## 2026-06-10: Public Media Registration Before Storage

Before building S3/CDN upload infrastructure, support workspace-scoped registration of external HTTPS media URLs and attach those media assets to content items. Publish readiness must verify attached media belongs to the same workspace and has an HTTPS public URL. Treat this as scaffolding for Instagram container readiness, not as final storage or publishing.

## 2026-06-10: Local Media Storage Adapter

Use a local filesystem media adapter for development uploads before wiring S3/CDN credentials. Store files under `MEDIA_STORAGE_DIR`, expose them through `/media-files/:workspaceId/:storedFilename`, and keep publish readiness requiring HTTPS public URLs so local HTTP uploads do not masquerade as Instagram-publishable assets.

## 2026-06-11: Instagram Publishing Starts As Dry Run

Build the publishing worker boundary as a dry-run adapter before enabling Meta Graph API writes. The dry-run path validates due time, workspace-scoped media, Instagram connection metadata, and payload shape, but does not mutate scheduled content to `PUBLISHED` or call Meta until OAuth, App Review, and the container -> poll -> publish adapter are implemented.

## 2026-06-11: Meta Graph Adapter Behind Live Flag

Implement the Meta Graph container -> poll -> publish adapter behind `INSTAGRAM_PUBLISH_MODE=live`, while keeping `dry_run` as the default. Live mode can mark content `PUBLISHED` only after Meta returns a published media ID, and records Meta adapter errors as `FAILED` content with a failure reason.

## 2026-06-11: Instagram OAuth Callback Lives In API

Use the API as the Instagram OAuth redirect target at `/v1/workspace/instagram/oauth/callback`, then redirect back to the localized web settings page. Keep manual token entry as a local-development fallback until production App Review credentials are available.

## 2026-06-11: Meta Dashboard Callback URLs

Expose API callback URLs for Instagram webhook verification, deauthorization, and data deletion so the Meta app can be configured during App Review. Deauthorization and data deletion callbacks disconnect matching workspace Instagram credentials when the callback includes the stored Instagram account id.

## 2026-06-11: Instagram Token Refresh Starts Manual

Implement long-lived Instagram token refresh as an explicit workspace API action and settings control before adding a background scheduler. Meta callbacks disconnect workspace Instagram credentials only when the callback includes an account identifier that matches `instagramAccountId`; broader app-scoped user mapping requires a future schema field.

## 2026-06-11: Maintenance Worker Starts As Interval Polling

Run due publishing and Instagram token refresh from a small API-owned maintenance worker with configurable intervals. Defer a durable Redis queue until concurrency, retries, and volume require it; the worker still calls workspace-scoped services so tenant isolation remains enforced.

## 2026-06-11: Meta Callback Events Are Audited

Persist sanitized `AuditLog` entries for Instagram webhooks, deauthorization callbacks, and data deletion callbacks. Redact tokens and signed requests, and write workspace-scoped rows when callback account identifiers match stored workspace Instagram connections.

## 2026-06-11: Standalone Web Typecheck Uses Its Own Config

Use `apps/web/tsconfig.typecheck.json` for standalone web `tsc --noEmit` so typecheck does not depend on generated `.next` artifacts. Keep Next's main `tsconfig.json` compatible with `next lint` and `next build`; `next build` remains responsible for validating generated Next route types.

## 2026-06-11: AI Usage Quotas Reserve Before Generation

Reserve monthly `UsageCounter` quota before strategy and content generation calls, and refund the reservation if downstream generation or persistence fails. In M0, workspace quota limits come from the workspace owner's active plan JSON limits.

## 2026-06-11: Email Verification Starts With Local Token Delivery

Store email verification tokens hashed in Redis and expose the raw token only outside production so the M0 register -> verify -> login flow is testable before choosing a transactional email provider. Production responses omit the token.

## 2026-06-11: RLS Uses The Dedicated App Role First

Enable PostgreSQL RLS policies for workspace-scoped tables against the `markos_app` role, using `app.current_workspace` as the fail-closed tenant selector. Keep migrations and owner-level maintenance on the `markos` role, which bypasses RLS, and use transaction-local workspace context helpers when app-role RLS enforcement is needed.

## 2026-06-11: RBAC Starts With Workspace Route Permissions

Define named permissions in shared types and enforce them in the workspace middleware after resolving the current database membership role. Owners and workspace admins can manage the full workspace surface, editors can create and schedule operational content, viewers stay read-only, and admin support roles get read/audit access until the admin portal introduces narrower global scopes.

## 2026-06-11: Google Login Uses Backend ID Token Exchange

Implement Google login as an API endpoint that accepts a Google ID token, verifies it against Google's issuer, audience, and JWKS, then creates or links a verified workspace user. This completes the M0 backend auth contract while leaving provider button UX and Google client loading to the web layer.

## 2026-06-11: Sensitive Roles Require TOTP-Verified Sessions

Use built-in TOTP generation and verification for sensitive workspace/admin roles. Users enroll while authenticated, sensitive-role login requires a valid six-digit TOTP code once enabled, and refresh tokens carry an `mfaVerified` claim so pre-MFA sessions cannot refresh into admin or finance access.

## 2026-06-11: CI Boots Local Infrastructure With Docker Compose

Run GitHub Actions CI on Ubuntu with Node 22, Python 3.11, pnpm 11.5.2, and Docker Compose services for Postgres/pgvector, Redis, and OpenSearch. Apply Prisma migrations and seed plans before running `corepack pnpm verify` and `corepack pnpm build`.

## 2026-06-11: Observability Uses Sentry SDKs Disabled by Default

Wire Sentry SDK initialization into the Next.js web app, Fastify API, maintenance worker, and FastAPI AI service, controlled by DSN environment variables. Keep DSNs empty in local/test/CI so telemetry is disabled by default, and defer source-map upload/release artifact publishing until staging credentials exist.

## 2026-06-11: Usage Quotas Use Monthly Periods Except Storage

Track AI generations, AI images, strategies, and MARKOS post publishes in calendar-month usage periods. Track storage bytes in one lifetime period because storage is an active allocation rather than a monthly-reset consumption metric.

## 2026-06-11: Paid Usage Requires Active Billing State

Allow usage reservations only for `TRIAL` users with an unexpired trial and `ACTIVE` users. Block `PAST_DUE`, `SUSPENDED`, `CANCELLED`, and expired `TRIAL` states before counters move, returning explicit billing status errors for API calls and blocked publish attempts for workers.
