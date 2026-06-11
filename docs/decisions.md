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
