# MARKOS release preparation — 26 October 2026

The owner authorized implementation of the remaining security, operations, product-depth,
notifications, analytics, acceptance and submission preparation. Railway is the selected
host for the website, API, AI, workers and video rendering. Commercial billing remains
deferred. No public approval, live delivery or physical-device acceptance is inferred from code.

## Confirmed operator details

- Legal entity: **Raedat Software Company W.L.L** (owner supplied).
- Public support/privacy contact: **support@raedat.online** (owner supplied).
- Operational alert recipient: **info@raedat.online** (owner supplied).
- Public business/postal address: not supplied; do not invent it.
- The owner confirms access to Meta, Google Play Console and Firebase. These accounts
  still need their actual MARKOS project credentials/authorization connected to the tooling.

## Execution ledger

| Area                       | Current evidence / work                                                                                                                                                                            |
| -------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Railway access             | Saved OAuth session expired; owner reauthorized the official CLI. Project access verified.                                                                                                         |
| Error privacy              | Shared telemetry sanitization, safe HTTP/worker logs and AI monitoring filtering are deployed. Tests cover credentials, request payloads and raw exception messages.                               |
| Operations alerts          | Classified, deduplicated Brevo alerts are deployed and configured. Sender/domain verification blocks delivery. The GitHub incident-monitor update remains local until published.                   |
| Dependency security        | JavaScript audit now has zero critical and zero unmitigated findings; two high and one moderate version-range advisories have hash-verified backports. Python runtime audit has no known findings. |
| Native Railway backups     | Production PostgreSQL volume has no snapshots/schedules. The current plan rejects native backups as Pro-only. No plan upgrade was purchased.                                                       |
| Portable scheduled backups | Daily encrypted PostgreSQL/reference-media snapshots deployed to a separate Railway recovery project, with 30-day retention. A real restore recovered five workspaces and 22 media objects.        |
| Meta                       | Prepare exact three-scope Instagram Login review package, current-version compatibility and isolated reviewer walkthrough. Dashboard approval unverified.                                          |
| Notifications              | Existing iOS push key present. EAS reports Android FCM and Google Play submission credentials absent.                                                                                              |
| Live analytics / email     | Instagram analytics and publishing modes are live; real-account metrics/publishing acceptance remains pending. Brevo accepted controlled emails, then reported sender/domain delivery failures.    |
| Product depth              | Longer campaigns, Vault/version operations, brand/media management and remaining analytics views need connected implementation and acceptance.                                                     |
| Store preparation          | Native 0.4 binaries exist. Bilingual public privacy/terms/support pages now identify the real operator and email provider. Updated native binaries, screenshots and final disclosures remain.      |
| Release source             | Current branch source is deployed to API, worker, web and AI and saved on GitHub's `codex/production-mobile` branch. Default-branch/automatic-source reconciliation remains pending; do not deploy the older main checkout. |
| Video                      | Railway CPU Motion Reels remain the runnable default. No paid video API or unverified GPU provider will be enabled.                                                                                |

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
  temporary plaintext. The latest rehearsal restored all current 30 migrations.
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
