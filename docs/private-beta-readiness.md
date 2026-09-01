# Private Beta Readiness

Status date: 2026-09-01.

This runbook closes the M6 private beta readiness planning gate. It does not close live external gates by itself; staging proof, Meta App Review, live Instagram publishing, live analytics, and payment certification remain open until verified with real provider accounts.

Current evidence is narrower than beta readiness:

- On 2026-08-03, one real professional account completed the production `instagram_business_basic` connection and loaded recent media.
- On 2026-08-06, a direct request from the Railway AI service reached OpenAI successfully, but the then-deployed Strategy application path returned `503`. The current shared Strategy/profile provider adapter has not yet been verified in the deployed application path.
- PR #19 mounted the Sunlit UI and intentionally removed the temporary design-preview URLs, but it also removed several browser surfaces that remain in final product scope. See `docs/ui-design-foundation.md` and `docs/decisions.md`.
- Current reviewed source includes the refined Calendar and closed Onboarding checkpoints. Onboarding now mounts both manual and full-business document-assisted first-run paths, while the connected Create redesign, IBM Plex/Tangerine Slate foundation, and Media Library remain prototype or planned work.

Do not invite users on the promise of provider-backed AI, complete publishing operations, full analytics, or full administration until the corresponding deployed and browser-visible paths are verified.

## Beta Scope

Private beta is for a small Bahrain SMB cohort using MARKOS as an Instagram-first marketing operating system.

Allowed beta surfaces:

- Register, verify email, log in with email/password, refresh the browser session, and use MFA for sensitive roles. The Google-auth API exists, but the current Sunlit Google button is intentionally unavailable; password recovery is also not mounted as a working flow.
- Arabic and English app shell with RTL behavior.
- Reduced-effort seven-area onboarding: the owner may enter details manually or begin with up to five supported business documents. Company and Products are the two essentials; Story, Audience, Competitors, Brand/Tone, and Objectives may be explicitly skipped or left absent. Document extraction requires its own approval before the owner separately reviews and approves the generated bilingual Business Profile.
- Vault-grounded Strategy generation only after the selected `AI_TEXT_PROVIDER` path is verified in the deployed application. The 30/60/90-day choices are current; one week, two weeks, and other shorter day multiples require a focused contract and quality decision.
- Current mounted Create flow for content generation, editing, approval, and scheduling, with deterministic/provider limitations explained to testers. Do not demo the separate HTML Create prototype as production behavior.
- Current Calendar flow for Week/Month planning, Unscheduled content, Day/Post Focus, safe scheduling/rescheduling/cancellation, and editor handoff over existing records.
- Instagram connection with `instagram_business_basic`, recent-media loading, readiness checks, and dry-run publishing through the API or worker by default.
- Current Insights summary for 7/30-day metrics, top content, and monthly PDF generation in the configured mode.
- Billing and administration APIs only when the beta script explicitly covers them and the operator can support the workflow safely.

Excluded from unattended beta until separately approved:

- Google sign-in and password recovery through the current browser UI.
- Full Vault editor/history, permanent brand-asset storage, media library, failed-publish queue/retry UI, safeguarded Calendar drag-and-drop, AI consultant, the AN-01 through AN-06 analytics suite, and admin console until their Sunlit surfaces and contracts are implemented and verified. The mounted full-business onboarding document path must remain operator-controlled until its Railway provider and retention behavior is verified.
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
| Auth              | Register, verify, email/password login, browser-session refresh, and MFA sensitive-role checks pass. Google login and password recovery are required only if included in the declared beta scope.   |
| Arabic/RTL        | Arabic routes render with RTL direction and no blocking layout regressions.                                                                                                                        |
| Vault/RAG         | A grounded Strategy Agent call returns workspace-specific Vault context.                                                                                                                           |
| AI provider       | The deployed AI service is reachable through a protected backend boundary and the beta scope explicitly states whether responses are deterministic scaffolding or verified provider-backed output. |
| Billing           | BHD fils, 10 percent VAT, invoice PDF, quotas, and prorated upgrade flows pass in dry-run mode.                                                                                                    |
| Product surfaces  | Every browser surface promised to beta users is mounted in Sunlit and passes the declared user script; missing final-system surfaces are listed explicitly.                                        |
| Admin             | If administration is in beta scope, roles can edit plan limits, prompt templates, and approved model settings through a verified API or restored Sunlit admin surface.                             |
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
3. Complete manual onboarding, then separately test the document-assisted path with a supported mixed-file batch once its Railway provider gate is open. Confirm files are staged before submission, extracted facts remain editable, and source files disappear after extraction approval.
4. Review the Business Profile summary and resolve at least one onboarding/profile gap if the current UI exposes it.
5. Generate one 30/60/90-day strategy from Vault context and confirm the response is from the declared provider mode.
6. Generate and edit one bilingual content item in Create.
7. Attach or generate one media asset through the currently supported path and verify publish readiness.
8. Approve and schedule the item.
9. Run publishing in dry-run mode through the API or worker and verify the persisted result. Do not describe this as a complete queue/recovery UI.
10. Open Insights and confirm the current 7/30-day summary and monthly PDF behavior in the configured analytics mode.
11. If billing is included in the beta scope, trigger one quota state and complete the dry-run invoice/VAT script.

## Evidence To Save

Keep the participant registry outside Git in an access-controlled location. In committed or shared repository evidence, use a pseudonymous beta reference and redact account or provider identifiers.

For every beta workspace, save in the controlled evidence store:

- Pseudonymous beta reference, with the workspace ID and owner contact kept only in the separate secure registry.
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
- Every customer-facing surface included in launch scope is restored in Sunlit and passes its browser journey.

## Rollback

If beta exposes a critical issue:

1. Disable new invites.
2. Keep publishing and analytics in dry-run mode.
3. If a payment issue is involved, disable live gateway credentials and return to dry-run checkout.
4. Preserve audit logs, payment records, AI interactions, and affected workspace ids.
5. Patch and run `corepack pnpm verify` plus `corepack pnpm build` before re-enabling invites.
