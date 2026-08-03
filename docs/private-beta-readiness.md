# Private Beta Readiness

This runbook closes the M6 private beta readiness planning gate. It does not close live external gates by itself; staging proof, Meta App Review, live Instagram publishing, live analytics, and payment certification remain open until verified with real provider accounts.

Status update, 2026-08-03: one real professional account completed the production business-basic connection and loaded recent media. Keep the broader external gates open. The AI service still returns deterministic local scaffolding and is not OpenAI-backed; do not invite users on the promise of production AI behavior until the phased AI gate in `docs/project-status.md` is satisfied.

## Beta Scope

Private beta is for a small Bahrain SMB cohort using MARKOS as an Instagram-first marketing operating system.

Allowed beta surfaces:

- Register, verify email, login, Google login, and MFA for sensitive roles.
- Arabic and English app shell with RTL behavior.
- Seven-module onboarding and Knowledge Vault completeness.
- Vault-grounded local strategy/content scaffolding and the current deterministic image/agent-shaped paths, with their limitation explained to testers.
- Content approval, scheduling, failed-publish queue, and rescheduling.
- Instagram connection, live-readiness checks, and dry-run publishing by default.
- Analytics screens, analytics consultant, monthly PDF generation, and Vault learning loop.
- Billing checkout, subscription lifecycle, VAT invoices, quotas, prorated upgrade, and admin controls.

Excluded from unattended beta until separately approved:

- `INSTAGRAM_PUBLISH_MODE=live` outside a controlled verification window.
- `INSTAGRAM_ANALYTICS_SYNC_MODE=live` outside a controlled verification window.
- Live CrediMax, BENEFIT, or Stripe payment capture before merchant certification evidence is attached.
- Any non-Instagram channel.

## Entry Criteria

All items below must be true before inviting external beta users.

| Area              | Required evidence                                                                                                                                                                                  |
| ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Build health      | `corepack pnpm verify` and `corepack pnpm build` pass on the release candidate.                                                                                                                    |
| Staging           | GitHub Actions publishes images and the staging environment is reachable over HTTPS.                                                                                                               |
| Tenant isolation  | Workspace isolation test suite passes, including every Prisma model with `workspaceId`.                                                                                                            |
| Auth              | Register, verify, login, Google login, refresh rotation, and MFA sensitive-role checks pass.                                                                                                       |
| Arabic/RTL        | Arabic routes render with RTL direction and no blocking layout regressions.                                                                                                                        |
| Vault/RAG         | A grounded Strategy Agent call returns workspace-specific Vault context.                                                                                                                           |
| AI provider       | The deployed AI service is reachable through a protected backend boundary and the beta scope explicitly states whether responses are deterministic scaffolding or verified provider-backed output. |
| Billing           | BHD fils, 10 percent VAT, invoice PDF, quotas, and prorated upgrade flows pass in dry-run mode.                                                                                                    |
| Admin             | Admin roles can edit plan limits, prompt templates, and approved model settings without deploy.                                                                                                    |
| Observability     | Web, API, worker, and AI services have Sentry or equivalent DSNs configured in staging.                                                                                                            |
| External blockers | Open provider gates are listed for the beta owner and are not hidden as product-complete.                                                                                                          |

## Beta Cohort

Start with 3 to 5 Bahrain SMB workspaces.

Required workspace profile:

- Instagram is the primary marketing channel.
- Arabic and English content is useful for the business.
- Owner can provide brand details, offers, audience, and content preferences during onboarding.
- Owner agrees to use dry-run publishing unless a controlled live-publish verification slot is scheduled.

Do not invite regulated, high-risk, or sensitive-data-heavy businesses until the security audit and PDPL verification gates are complete.

## Operator Checklist

Before each beta invite:

1. Create or confirm the workspace owner account.
2. Confirm the owner is on the intended Starter or Growth plan.
3. Confirm quota limits match the beta agreement.
4. Confirm `INSTAGRAM_PUBLISH_MODE=dry_run` unless live verification is scheduled.
5. Confirm `INSTAGRAM_ANALYTICS_SYNC_MODE=dry_run` unless analytics verification is scheduled.
6. Confirm payment gateways are in dry-run or certified live mode, with no mixed partial-live state.
7. Confirm the workspace has a support contact and escalation owner.

## User Test Script

Each beta workspace should complete this path once.

1. Register, verify email, and log in.
2. Switch between English and Arabic and confirm navigation remains usable.
3. Complete onboarding.
4. Review Vault completeness and resolve at least one surfaced gap.
5. Generate one strategy from Vault context.
6. Generate one bilingual content item from a calendar slot.
7. Generate or attach one media asset.
8. Approve the item and schedule it.
9. Run publishing in dry-run mode and verify the queue result.
10. Trigger one blocked quota path or confirm the quota state in Billing.
11. Download one VAT invoice PDF.
12. Open Analytics and confirm the current available metrics and AI explanation.

## Evidence To Save

For every beta workspace, save:

- Workspace id and owner email.
- Date invited and current plan.
- Onboarding completion screenshot or API response.
- Vault completeness score after onboarding.
- Strategy generation id and content generation id.
- Scheduled content item id and dry-run publish result.
- Billing invoice id and downloaded PDF evidence.
- Any support issues, severity, owner, and resolution.

For controlled provider verification, also attach the evidence required by:

- `docs/instagram-live-publish-verification.md`
- `docs/instagram-analytics-live-verification.md`
- payment merchant certification records for CrediMax, BENEFIT, and Stripe

## Exit Criteria

Private beta can move toward launch only when:

- No critical or high-severity open defects remain.
- M0 live staging and Meta App Review gates are complete.
- M3 real post and reel publish gates are complete.
- M4 real analytics sync gate is complete.
- M5 live payment gateway certification gates are complete, or the launch plan explicitly disables uncertified gateways.
- PDPL data export and erasure verification passes.
- VAT compliance verification passes.
- Arabic/RTL QA passes.
- Load test and OWASP audit gates pass.

## Rollback

If beta exposes a critical issue:

1. Disable new invites.
2. Keep publishing and analytics in dry-run mode.
3. If a payment issue is involved, disable live gateway credentials and return to dry-run checkout.
4. Preserve audit logs, payment records, AI interactions, and affected workspace ids.
5. Patch and run `corepack pnpm verify` plus `corepack pnpm build` before re-enabling invites.
