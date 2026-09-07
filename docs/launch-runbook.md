# MARKOS AI Launch Runbook

Status date: 2026-08-16.

This runbook closes the M6 launch-runbook planning gate. It does not close the external launch gates by itself; live staging, Meta App Review, real Instagram publishing, real analytics, and Bahrain payment certification still require provider evidence.

Current narrow evidence:

- The production `instagram_business_basic` connection succeeded once on 2026-08-03 and is recorded in `docs/project-status.md`.
- A direct OpenAI request from the Railway AI service succeeded on 2026-08-06, but the then-deployed, pre-rename application path returned `503`; the current Campaign provider adapter still needs deployed end-to-end proof.
- Railway is the current early-stage platform. The 2026-08-16 screenshots prove only selected service-variable names and one visible provisional Graph version, not deployments, values, networking, or health.

Publishing, insights access, Meta App Review, a full token lifecycle, provider-backed application behavior, durable public media storage, restored final-system Sunlit surfaces, and broad launch readiness remain open. AWS is only a possible later direction.

## Launch Principle

Launch only when the release candidate is boring:

- Repeatable verification passes.
- External providers are either certified live or explicitly disabled.
- Rollback is ready before rollout starts.
- Evidence is saved for every gate that claims launch readiness.

## Launch Roles

| Role             | Responsibility                                           |
| ---------------- | -------------------------------------------------------- |
| Release owner    | Owns the final go/no-go call and records evidence.       |
| Technical owner  | Runs deploy, smoke tests, rollback, and incident checks. |
| Product owner    | Confirms beta/launch scope and customer messaging.       |
| Compliance owner | Confirms PDPL, VAT, Meta, and payment-provider evidence. |
| Support owner    | Watches beta/customer channels and tracks issues.        |

## Required Evidence Pack

Save this evidence before marking M6 acceptance complete:

- `corepack pnpm verify` output.
- `corepack pnpm build` output.
- `corepack pnpm perf:baseline` output.
- `corepack pnpm load:test` output.
- `corepack pnpm security:audit` output.
- `corepack pnpm rtl:qa` output.
- Staging deployment URL and commit SHA.
- `/v1/health` and `/v1/health/deep` responses from staging.
- One authenticated, Vault-grounded Campaign/profile response through the deployed API-to-AI path, plus proof that an unauthorized direct AI request is rejected.
- Browser-journey evidence for every customer/operator surface included in launch scope, including any final-system surface restored after the Sunlit cutover.
- Sentry or equivalent project links for web, API, worker, and AI services.
- `GET /v1/admin/bahrain-launch-readiness` response.
- PDPL data export and erasure test evidence.
- VAT compliance report for a paid invoice.
- Meta App Review submission or approval evidence.
- Live Instagram image post and reel publish evidence.
- Live analytics sync evidence.
- CrediMax or BENEFIT certification and live checkout evidence.

## Go/No-Go Matrix

| Area                 | Go condition                                                                                                  | No-go condition                                                                                                   |
| -------------------- | ------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| Build health         | Verify and build pass on the release commit.                                                                  | Any failing typecheck, lint, unit, integration, build, or RTL QA check.                                           |
| Infrastructure       | Staging deploy is proven and health checks pass.                                                              | Staging cannot deploy from `main` or deep health is degraded.                                                     |
| AI service           | Protected API-to-AI connectivity and the intended provider-backed behavior are verified for the launch scope. | Only shallow health, a direct provider probe, or deterministic local scaffolding is available, or the internal boundary is unauthenticated. |
| Product surfaces     | Every final-system surface included in launch scope is mounted in Sunlit and its browser journey passes.       | A required surface exists only as an API, legacy evidence, redirect, or removed pre-Sunlit page.                   |
| Security             | OWASP audit is clean for known moderate+ dependency issues.                                                   | Critical/high app issue or unresolved dependency vulnerability.                                                   |
| Tenant isolation     | Workspace isolation and RLS tests pass.                                                                       | Any workspace-owned table can leak or cross-write data.                                                           |
| Instagram publishing | Meta App Review and real image/reel publish evidence exist.                                                   | Live publish mode is enabled without provider evidence.                                                           |
| Analytics            | Live analytics sync evidence exists.                                                                          | Live analytics mode is enabled without verified Meta insights access.                                             |
| Billing              | Starter/Growth are active in BHD and one local gateway is certified live.                                     | CrediMax/BENEFIT are uncertified or live checkout evidence is missing.                                            |
| Compliance           | PDPL export/erasure and VAT compliance pass.                                                                  | Seller VAT/legal wording or data-rights gaps are unresolved for launch scope.                                     |
| Arabic/RTL           | Automated RTL QA passes and manual screenshots are reviewed.                                                  | Arabic text, direction, or dense screens block use.                                                               |

## Preflight Sequence

1. Confirm the release commit SHA and branch.
2. Confirm `docs/milestone-checklist.md` reflects the current gate status.
3. Run local gates:

```bash
corepack pnpm verify
corepack pnpm build
corepack pnpm perf:baseline
corepack pnpm load:test
corepack pnpm security:audit
```

4. Confirm database migrations are present and reviewed.
5. Confirm production/staging environment variables are set for the intended launch mode.
6. Confirm the exact Instagram Login permissions approved for the release. The Milestone A working source requests `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_insights`; deployment, a fresh connection, controlled live calls, and App Review/Advanced Access remain separate gates before external-client use.
7. Confirm provider modes:

| Provider            | Launch-safe default                     | Live only when                                                       |
| ------------------- | --------------------------------------- | -------------------------------------------------------------------- |
| Instagram publish   | `INSTAGRAM_PUBLISH_MODE=dry_run`        | Meta App Review and live post/reel evidence are complete.            |
| Instagram analytics | `INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run` | Live insights sync evidence is complete.                             |
| Payments            | Dry-run/local adapter mode              | CrediMax or BENEFIT is certified and webhook secrets are configured. |

8. Confirm support and incident channels are staffed.
9. Confirm rollback target is known: previous image tag, previous commit SHA, and database rollback strategy.

## Deployment Sequence

1. Merge the release PR to `main`.
2. Confirm CI passes.
3. Confirm service images are built and published.
4. Deploy web, API, worker, and AI services to staging.
5. Run staging health checks:

```bash
curl https://<api-host>/v1/health
curl https://<api-host>/v1/health/deep
curl https://<web-host>/ar
curl https://<web-host>/en
```

6. Run smoke tests against staging using a fresh test workspace.
7. Only after smoke tests pass, enable controlled live-provider flags for the verification window.
8. Capture evidence, then return any unapproved provider mode to dry-run.

## Smoke Test

Complete this path on staging:

1. Register, verify email, and log in.
2. Switch Arabic and English routes.
3. Complete onboarding through the manual path, confirm Company and Products readiness separately from optional Vault gaps, and approve the bilingual Business Profile. Exercise the full-business document path separately with a supported mixed-file batch; confirm owner review and temporary-file removal before treating it as release-ready.
4. Generate one Campaign through the deployed provider mode and confirm its Vault grounding.
5. Generate one bilingual content item.
6. Attach media and check publish readiness.
7. Schedule content and run dry-run publishing through the API or worker; verify the persisted result.
8. View the current Insights summary in the configured mode and complete live sync only after the insights permission is approved and verified.
9. Start Starter checkout, capture payment in the allowed mode, and download invoice PDF.
10. Run VAT compliance for the invoice.
11. Run workspace data export for PDPL evidence.
12. Confirm every in-scope Sunlit surface is mounted and usable. The full Vault editor/history, calendar/media library, publishing recovery queue, AI consultant, AN-01 through AN-06 analytics suite, and admin console remain launch blockers when included in the final release scope.
13. Confirm administration through the restored Sunlit admin console; authenticated API checks alone are acceptable only if administration is explicitly excluded from the launch UI scope in writing.

## Rollback

Rollback immediately if:

- Authentication or workspace isolation breaks.
- Checkout creates incorrect BHD/VAT amounts.
- Publishing marks failed or unknown Meta responses as successful.
- Analytics sync corrupts or cross-writes workspace data.
- AI usage quotas stop enforcing limits.
- Critical/high security issue appears.

Rollback steps:

1. Disable live provider modes:

```bash
INSTAGRAM_PUBLISH_MODE=dry_run
INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run
```

2. Disable live gateway credentials or rotate webhook secrets if payment behavior is involved.
3. Re-deploy the previous known-good image tags.
4. Preserve audit logs, invoice/payment records, AI interactions, affected workspace ids, and Sentry event links.
5. If database migration rollback is needed, stop writes first and follow the migration-specific rollback note.
6. Re-run `corepack pnpm verify` and `corepack pnpm build` on the hotfix before re-enabling affected surfaces.

## Post-Launch Monitoring

For the first 48 hours:

- Review Sentry or equivalent errors at least twice daily.
- Review API and worker logs for publishing, analytics, billing, and quota errors.
- Check failed publish queue counts.
- Check payment initiation/capture failures.
- Review AI token/image usage for unusual spikes.
- Review support issues and classify severity.

## Links To Supporting Runbooks

- `docs/private-beta-readiness.md`
- `docs/performance-nfr-baseline.md`
- `docs/load-test.md`
- `docs/security-audit.md`
- `docs/pdpl-data-rights.md`
- `docs/vat-compliance.md`
- `docs/arabic-rtl-qa.md`
- `docs/bahrain-plan-launch-readiness.md`
- `docs/instagram-app-review.md`
- `docs/instagram-live-publish-verification.md`
- `docs/instagram-analytics-live-verification.md`
- `docs/staging-deploy.md`

## Current Launch Status

M6 launch operations are documented. M6 acceptance remains open until application-owned browser/AI/media blockers and external provider gates are complete and the evidence pack is attached.
