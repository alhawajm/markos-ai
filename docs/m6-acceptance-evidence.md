# M6 Acceptance Evidence Ledger

Status date: 2026-09-01.

This ledger is the working checklist for closing M6 Beta + Launch acceptance. It records what is already proven by code/tests/runbooks and what still requires external provider evidence.

## Current Status

M6 is not launch-accepted. Several internal/application gates need current release-candidate evidence, and both application-owned and external blockers remain.

One narrow external milestone is complete: on 2026-08-03, the project team observed a real Instagram professional account complete the production business-basic connection, appear Connected in Settings, and load recent media. This is production verification of the connection path only. It is not publishing, analytics, App Review, full token-lifecycle, or launch evidence.

Open application-owned blockers:

- Verify the current shared Strategy/profile provider adapter through the deployed API-to-AI path; a direct provider probe is not sufficient.
- Verify production email delivery and the complete register -> verify -> browser-session -> onboarding -> Strategy journey.
- Verify the mounted full-business document-assisted onboarding path on the deployed provider: staged multi-file submission, editable evidence/issues, explicit extraction approval, temporary-file removal, separate bilingual Business Profile approval, and honest failure/manual recovery.
- Restore and verify every final-system Sunlit surface included in launch scope. PR #19 removed the prior pages for full Vault editing/history, publishing operations, full analytics, AI assistance, and administration; their product requirements remain active.
- Provide durable public media delivery for live Instagram publishing.

Open external blockers:

- Live staging deployment proof.
- Formal Meta App Review submission.
- Real Instagram image post publish.
- Real Instagram reel publish.
- Live Instagram analytics sync.
- CrediMax or BENEFIT merchant credentials, webhook secret, certification, and one live paid checkout.
- Final seller VAT/legal wording review before issuing production VAT invoices.

## Evidence Status

| Gate                            | Status                         | Evidence source                                                                                                                                                                      | Closure requirement                                                                                                                                                                  |
| ------------------------------- | ------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Build verification              | Prior internal evidence; rerun | `corepack pnpm verify`                                                                                                                                                               | Pass on and save command output for the release commit.                                                                                                                              |
| Production build                | Prior internal evidence; rerun | `corepack pnpm build`                                                                                                                                                                | Pass on and save command output for the release commit.                                                                                                                              |
| Performance baseline            | Prior internal evidence; rerun | `corepack pnpm perf:baseline`, `docs/performance-nfr-baseline.md`                                                                                                                    | Pass on and save the latest release-candidate output.                                                                                                                                |
| Load test                       | Prior internal evidence; rerun | `corepack pnpm load:test`, `docs/load-test.md`                                                                                                                                       | Pass on and save the latest release-candidate output.                                                                                                                                |
| OWASP/security audit            | Prior internal evidence; rerun | `corepack pnpm security:audit`, `docs/security-audit.md`                                                                                                                             | Pass on the release candidate, save output, and confirm no critical/high findings.                                                                                                   |
| Arabic/RTL QA                   | Source gate exists; visual open | `corepack pnpm rtl:qa`, `docs/arabic-rtl-qa.md`                                                                                                                                      | Pass the release source gate and save manual screenshots of every in-scope Sunlit surface.                                                                                           |
| PDPL export/erasure             | Implemented; staging proof open | `docs/pdpl-data-rights.md`, current source/tests                                                                                                                                      | Save export, erasure, audit, and Instagram-specific hard-delete evidence from staging; add explicit assertions for all Instagram erasure tables.                                     |
| VAT compliance                  | Implemented; live proof open    | `GET /v1/billing/invoices/:invoiceId/vat-compliance`, `docs/vat-compliance.md`                                                                                                       | Save a report for a paid invoice with final seller/legal wording.                                                                                                                    |
| Starter/Growth catalog          | Verified internally            | `GET /v1/admin/bahrain-launch-readiness`, `docs/bahrain-plan-launch-readiness.md`                                                                                                    | Needs `liveReady: true` after local gateway credentials are configured.                                                                                                              |
| Launch runbook                  | Documented                     | `docs/launch-runbook.md`                                                                                                                                                             | Release owner confirms the go/no-go matrix was followed for the release candidate.                                                                                                  |
| Deployed AI application path    | Open application               | `services/ai/README.md`, `docs/project-status.md`, current API/AI source                                                                                                             | Attach an authenticated, Vault-grounded provider response through the deployed application plus unauthorized-request rejection evidence.                                            |
| Sunlit browser coverage         | Open application               | `docs/ui-design-foundation.md`, `docs/ui-ux-workflow.md`, current web routes                                                                                                         | Restore or explicitly exclude each final-system surface, then attach desktop/mobile Arabic/English journey evidence for every included surface.                                      |
| Production Instagram connection | Verified externally 2026-08-03 | `docs/project-status.md`, `docs/instagram-app-review.md`, current OAuth source/tests                                                                                                 | Preserve the project-observed status without committing provider identifiers, credentials, callback data, or production records. Re-verify only if the deployed behavior changes.    |
| Live staging deploy             | Blocked external               | `docs/staging-deploy.md`, `corepack pnpm staging:github-preflight`, `corepack pnpm staging:evidence-download`, `corepack pnpm staging:smoke`, `.github/workflows/deploy-staging.yml` | Configure GitHub `staging` environment, attach image publish evidence, ECS/cloud rollout evidence where applicable, release SHA, public URLs, and successful staging smoke evidence. |
| Meta App Review                 | Blocked external               | `docs/instagram-app-review.md`                                                                                                                                                       | Submit app review and attach submission/approval evidence.                                                                                                                           |
| Live Instagram publishing       | Blocked external               | `docs/instagram-live-publish-verification.md`                                                                                                                                        | Attach image post and reel publish responses plus Instagram screenshots/links.                                                                                                       |
| Live analytics                  | Blocked external               | `docs/instagram-analytics-live-verification.md`                                                                                                                                      | Attach live readiness, sync response, real metrics screenshots, and Vault learning evidence.                                                                                         |
| Bahrain live payments           | Blocked external               | `docs/bahrain-plan-launch-readiness.md`                                                                                                                                              | Attach CrediMax or BENEFIT certification, live checkout, paid invoice, and VAT compliance report.                                                                                    |

## Evidence Folder Convention

When collecting launch evidence, store artifacts using this naming pattern:

```text
evidence/m6/<yyyy-mm-dd>/<gate>/<artifact>
```

Examples:

```text
evidence/m6/2026-06-14/build/verify-output.txt
evidence/m6/2026-06-14/instagram/image-post-response.json
evidence/m6/2026-06-14/payments/credimax-certification.pdf
```

Do not commit secrets, access tokens, payment card data, or customer personal data. Redact provider tokens before saving artifacts.

Committed templates live under:

```text
evidence/m6/templates/
```

Actual dated evidence folders are ignored by Git on purpose. Use `evidence/m6/templates/artifact-manifest.md` for each provider gate and `evidence/m6/templates/launch-signoff.md` for final go/no-go approval.

Run the local evidence report with:

```bash
corepack pnpm evidence:m6
```

Initialize the local dated evidence pack before collecting provider artifacts:

```bash
corepack pnpm evidence:m6 -- --init
```

For release acceptance, run strict mode:

```bash
corepack pnpm evidence:m6 -- --strict
```

Strict mode must fail until all required external evidence folders contain completed manifests, proof artifacts beyond templates, no obvious unredacted text secrets, and final launch sign-off is marked `Go`.

## Acceptance Procedure

1. Freeze the release commit SHA.
2. Run the local/internal gates:

```bash
corepack pnpm verify
corepack pnpm build
corepack pnpm perf:baseline
corepack pnpm load:test
corepack pnpm security:audit
corepack pnpm rtl:qa
```

3. Attach command outputs to the evidence folder.
4. Deploy staging from `main` and attach deploy evidence from GitHub Actions.
5. Download the workflow artifacts with `corepack pnpm staging:evidence-download -- --sha <release-sha> --strict`, or manually download `m6-staging-image-evidence-<sha>`, `m6-staging-ecs-rollout-evidence-<sha>` when ECS is used, and `m6-staging-smoke-evidence-<sha>`.
6. If running smoke manually, run `corepack pnpm staging:smoke` against the staging URLs and attach the generated report. The script rejects localhost unless `ALLOW_LOCAL_STAGING_SMOKE=true` is set for local validation.
7. Complete Meta App Review submission.
8. Preserve or re-check the already completed production business-basic connection without exposing sensitive evidence.
9. Complete controlled live Instagram publish verification.
10. Complete controlled live Instagram analytics verification.
11. Complete CrediMax or BENEFIT live payment verification.
12. Run the launch smoke test from `docs/launch-runbook.md`.
13. Close or explicitly exclude every application-owned final-system surface for the release.
14. Update `docs/milestone-checklist.md` only after every application and external blocker is closed.

## Final Acceptance Criteria

M6 can be marked complete only when:

- All rows in this ledger are `Verified`.
- `GET /v1/admin/bahrain-launch-readiness` returns `liveReady: true`.
- M0, M3, M4, and M5 external acceptance blockers are either completed or explicitly excluded from the launch scope in writing.
- No critical/high defects remain open.
- Release owner, technical owner, and compliance owner sign off.

## Current Decision

Do not mark M6 acceptance complete yet. Focused provider evidence collection can continue, but application-owned AI, browser-surface, email/session, and durable-media blockers must also close before public launch acceptance.
