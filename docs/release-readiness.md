# MARKOS release preparation — 27 October 2026

The owner authorized implementation of the remaining security, operations, product-depth,
notifications, analytics, acceptance and submission preparation. Railway is the selected
host for the website, API, AI, workers and video rendering. Commercial billing remains
deferred. No public approval, live delivery or physical-device acceptance is inferred from code.

## Confirmed operator details

- Legal entity: **Raedat Software Company W.L.L** (owner supplied).
- Public support/privacy contact: **support@raedat.online** (owner supplied).
- Operational alert recipient: **info@raedat.online** (owner supplied).
- Public business/postal address: not supplied; do not invent it.
- The owner confirms Meta and Google Play Console access. Firebase/FCM is connected;
  Play app-level publisher permission and the dashboard submission states remain pending.

## Execution ledger

| Area                       | Current evidence / work                                                                                                                                                                                                                                                              |
| -------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Railway access             | Saved OAuth session expired; owner reauthorized the official CLI. Project access verified.                                                                                                                                                                                           |
| Error privacy              | Shared telemetry sanitization, safe HTTP/worker logs and AI monitoring filtering are deployed. Tests cover credentials, request payloads and raw exception messages.                                                                                                                 |
| Operations alerts          | Classified, deduplicated Brevo alerts are deployed and configured. Sender/domain verification blocks delivery. The GitHub incident monitor is active on main and its manual run passed.                                                                                              |
| Dependency security        | JavaScript audit now has zero critical and zero unmitigated findings; two high and one moderate version-range advisories have hash-verified backports. Python runtime audit has no known findings.                                                                                   |
| Native Railway backups     | Production PostgreSQL volume has no snapshots/schedules. The current plan rejects native backups as Pro-only. No plan upgrade was purchased.                                                                                                                                         |
| Portable scheduled backups | Daily encrypted PostgreSQL/reference-media snapshots deployed to a separate Railway recovery project, with 30-day retention. A real restore recovered five workspaces and 22 media objects.                                                                                          |
| Meta                       | Prepare exact three-scope Instagram Login review package, current-version compatibility and isolated reviewer walkthrough. Dashboard approval unverified.                                                                                                                            |
| Notifications              | Android FCM V1 is now configured for com.markos.mobile in a dedicated Firebase project and linked to Expo. Existing iOS push key remains. Android APK and iPhone/TestFlight 0.5.0 build 7 finished; device receipt and Google Play submission credentials remain pending.            |
| Live analytics / email     | Instagram analytics and publishing modes are live; live account metrics and saved summaries are verified; per-format publishing acceptance remains pending. Brevo accepted controlled emails, then reported sender/domain delivery failures.                                         |
| Product depth              | 30/60/90-day campaigns now use saved weekly checkpoints, source summaries and creator-only recovery. Web/API/AI are deployed. Canonical profile history/recovery is deployed. Offering-catalog rollback, expanded brand/media tooling and deeper Insights remain product follow-ups. |
| Store preparation          | Native 0.5 APK and IPA builds finished; iPhone build is in the owner-only TestFlight group. Bilingual public privacy/terms/support pages now identify the real operator and email provider. Device walkthroughs, store screenshots and final disclosures remain.                     |
| Release source             | PR #37 is merged. API, web, worker and AI are deployed from main release 9363386; production source triggers now wait for GitHub checks.                                                                                                                                             |
| Video                      | Railway CPU Motion Reels remain the runnable default. No paid video API or unverified GPU provider will be enabled.                                                                                                                                                                  |

## Verification recorded in this pass

- API/web/mobile typechecks passed. Web production build and 17 web unit files (97 tests) passed.
- Full AI suite: 150 tests passed. AI image build, selected Ruff checks and observability mypy passed.
- Final API release run on a newly created disposable `markos_ci_test` database:
  **80 files, 630 tests passed**. This includes email/alert, telemetry/logging, backup
  integrity/retention, workspace isolation and durable delivery coverage. Test files
  now have independent auth-limit namespaces; isolation fixtures do not queue fake
  executable erasure jobs. The real production rate limits remain unchanged.
  The PowerShell wrapper reported exit 1 because initialization emitted a PostgreSQL
  role-membership NOTICE on stderr; Vitest itself reported all files/tests passing
  with no unhandled errors. The complete GitHub CI release gate has not run for this checkpoint.
- All 42 workspace-owned Prisma models are covered by the isolation inventory;
  new RLS policies and campaign app-role grants are applied in production.
- Public English/Arabic legal pages passed three rendered checks, including mobile
  overflow and contact links. This is browser evidence, not native device acceptance.
- Actual encrypted recovery rehearsals restored five workspaces and 22 referenced
  media objects, checked bindings, then removed their disposable databases and
  temporary plaintext. The 27 October rehearsal restored all 32 migrations.
- Production API core readiness passed after deployment. Backup freshness is a
  separate operations check and cannot take a serving application offline.

No current Brevo inbox delivery, Android FCM receipt, updated native binary acceptance,
Meta App Review approval or real-account publishing acceptance has been established.
Postal address and final legal review remain owner inputs. A separate project on the
same Railway account is not independent-provider disaster recovery.

## Acceptance boundaries

Use named disposable databases for persistent tests. No live publishing, account erasure,
customer subscription, broad data rewrite or customer notification is a routine test.
Live publishing requires a selected review account and explicitly reviewed content.
Physical Android/iPhone checks, provider review outcomes and inbox/device receipt must
be recorded as real observations. Automated fixture checks remain labeled as fixtures.

Security, recovery and privacy checks take precedence over public submission. Keep
the eight agents, existing user data and approval/scheduling boundaries intact.

## 27 October continuation

- Reconciled the upstream handover on the mobile release branch and opened PR #37. Eighteen local startup checks passed. Railway serving and backup freshness checks are healthy.
- Android 0.5.0/build 7 passed package, version, arm64 and target SDK 36 checks. iPhone 0.5.0/build 7 passed archive, identity, signing and production push-entitlement checks. Its exact TestFlight submission finished; Apple reports VALID / IN_BETA_TESTING with only the existing owner tester. Android store AAB build 8 is separate.
- Today's scheduled backup passed a real isolated restore: 32 migrations, five workspaces and 22 media objects. Disposable restore data and temporary plaintext were removed.
- Controlled read-only Meta requests for reach, views and profile_views returned HTTP 200. Saved account-total metrics for the connected workspace were updated by the live worker. Provider review and live publishing remain separate gates.
- Profile history is implemented for six canonical business modules in web and native editors. Users review an earlier snapshot, then explicitly save through current revision validation. Offering catalog rollback remains outside this slice. Three focused API history/error tests, ten native business/model tests, two English/Arabic rendered recovery checks, and Python privacy checks passed. API/web/mobile TypeScript checks passed.
- CI caught formatting drift and an untyped Python telemetry fixture; both were corrected. The complete release CI gate passed on the PR and again on main.
- Phone acceptance was explicitly deferred by the owner. Brevo DNS remains parked. Google Play publisher authorization, Meta dashboard review and the real public postal address remain external inputs.

## Verified 0.5 rollout

Release source: **93633864dd7f67b95bf826a14b2688c617baf5d0** on main, merged through [PR #37](https://github.com/alhawajm/markos-ai/pull/37). [Main release CI](https://github.com/alhawajm/markos-ai/actions/runs/40483133794) passed: 638 API tests, 154 AI tests, 119 native unit tests, 97 web unit tests and 82 rendered browser tests, plus typechecks, lint, security checks and all deployment-image checks. These counts describe the code release gate before the later documentation-only checkpoint.

All four Railway deployments report SUCCESS for that source: API 6d7f087d-e0c5-442b-91b5-16a72c9081e5; web afd0ed97-ac79-43a1-993d-82af701d73b4; worker 13ebb1d0-ea19-4fad-b387-23bc907c1547; AI 49db78cd-a25a-4dd9-90ee-c886bbb5cd82. Serving/backup checks passed, the new history route rejects anonymous reads with AUTH_REQUIRED, campaign migrations/private contracts are present, and the public web/login CORS checks passed.

Compatible runtime 0.5.0 updates are published and verified on [preview](https://expo.dev/accounts/mo4180/projects/markos/updates/79251581-f4e1-47d6-93ca-f244ca33aa0e) and [production](https://expo.dev/accounts/mo4180/projects/markos/updates/315aca56-c1c7-4f63-a7f4-adc5dc04afd9). Both served bundles match the verified exports; all 31 Android and 27 iPhone supporting assets passed content-integrity checks using the same manifest-provided asset headers as Expo Updates. This is delivery verification, not physical-device acceptance. Existing 0.4 updates were retained.

The [main incident monitor](https://github.com/alhawajm/markos-ai/actions/runs/40483216269) passed. GitHub-triggered production deployments for all four application services wait for checks; other environments were preserved.

The live application summary returns current account/media data. Meta rejects three older media items with code 100/subcode 2108006 because they predate professional-account conversion; partial sync remains visible instead of inventing values. Play's dedicated publisher identity/API are prepared without a private key or project IAM roles. App-specific Play Console authorization is still required.
