# MARKOS service readiness and recovery

`node scripts/check-service-readiness.mjs` checks the deployed API, PostgreSQL,
Redis and the authenticated AI boundary without generating content or charging
provider tokens. Set `MARKOS_API_URL` for another environment. HTTP 200 means
the checked dependencies are available; HTTP 503 means at least one failed.
Use `/v1/health` for process liveness and `/v1/ready` for dependency readiness.

AI readiness checks key/configuration presence, embedding dimensions and FFmpeg.
It explicitly leaves provider connectivity and credits unverified. A provider
request is still needed to establish those. The 24 September release checks
included actual embeddings, an analytics-agent response and a free Motion render.
OpenSearch is skipped because no current product path uses it; set
`OPENSEARCH_HEALTH_REQUIRED=true` if that changes. Public dependency failures
never echo connection strings or exception bodies.

## Backup access blocker, verified 24 September 2026

On 24 September the production pgvector volume had no backups or schedules. The active
Railway credential can deploy services, but backup schedule changes return
`Not Authorized`. No backup was created or schedule changed. The project owner
must enable daily and weekly schedules under **pgvector > Backups** and create
an initial snapshot. [Railway's backup documentation](https://docs.railway.com/volumes/backups)
describes retention and incremental storage charges. Redis also currently has
no snapshots; its rotating credentials are disposable, unlike business data.

Never test restoration over the active production volume. A restore rehearsal
must use an isolated disposable database/environment, verify schema, row counts,
workspace scoping and sampled media references, and record the snapshot/date
and result. A backup listing alone is not evidence that restoration works.
The existing database uses pgvector and a UUID v7 function; preserve those
extensions/functions and migration history in any logical restore.

Media lives in configured object storage, so database snapshots do not establish
media recovery. Confirm bucket versioning/retention separately before a public
launch. The AWS CDK folder is still a placeholder; no AWS migration or GPU
service has been provisioned. Existing Railway services remain the live backend
for both mobile platforms and the website.

The following notes describe the 24 September release. See the 27 September changes below for the completed restore rehearsal, scheduled monitor and opt-in report delivery.

Independent maintenance failures are recorded with sanitized task/error codes
and do not prevent later tasks, including Reel rendering, from running. Monthly
analytics email was simulated: `delivered` was false, `skippedReason` was
`DRY_RUN`, and new audit records use `MONTHLY_ANALYTICS_PDF_EMAIL_SIMULATED`.
Older `MONTHLY_ANALYTICS_PDF_EMAIL_SENT` rows with `deliveryMode: dry_run` are
historical simulations, not evidence of email delivery. Real report email needs
an owner preference and durable delivery handling before it is activated.

## Recovery and delivery update — 27 September 2026

Backup listing/scheduling still returned `Not Authorized` with this credential; current Railway snapshot coverage cannot be asserted. `scripts/railway-database-backup.cjs` now takes a consistent logical PostgreSQL backup over the authenticated database-service SSH connection. It streams into AES-256-GCM encryption and wraps the key with Windows DPAPI for the current Windows user. No database password or plaintext dump is written to disk. This computer-bound copy requires the same Windows identity and is not off-site disaster recovery.

The 08:32 UTC production backup restored into a new disposable `markos_restore_rehearsal_20260927` database: 25 migrations, five users, five workspaces, 11 content items and 18 media references. `pgcrypto`, `vector` and the UUID v7 function restored. There were no orphan content/media workspace references; all media keys included their workspace ID. The restored database was removed after validation; the encrypted copy and metadata-only proof remain under ignored `var/backups/`. Media bytes remain a separate recovery obligation.

That media obligation was also exercised at 09:03 UTC: `scripts/railway-media-backup.cjs` copied all 18 active database-referenced objects (19,796,528 bytes) into an encrypted archive. Restoration into a new isolated directory matched every SHA-256 hash; the plaintext restore directory was then removed. It preserves object/workspace metadata with the bytes and never writes or deletes remote objects. This is a point-in-time reference-media copy, not a full bucket/version-history backup. The storage provider reported bucket versioning not enabled. Scheduled, independent off-site storage and an approved retention policy remain pending.

```powershell
node scripts/railway-database-backup.cjs backup 13a11103-4cfb-4ec1-82b4-e6fe776acdbe@ssh.railway.com
node scripts/railway-database-backup.cjs restore <manifest.json> markos_restore_<unique_name>
node scripts/railway-media-backup.cjs backup a3cb8762-58a3-4425-a801-b6cbec29b822@ssh.railway.com
node scripts/railway-media-backup.cjs restore <media-manifest.json> markos_media_restore_<unique_name>
```

Restore only creates a new disposable database; it never overwrites an existing one. Keep the encrypted file and manifest together. Establish independently accessible off-site storage and retention before public launch.

GitHub's `MARKOS service readiness` workflow is installed on `main`, scheduled twice per hour, and supports manual dispatch. First run `36306918393` succeeded. It uses no AI generation; GitHub alert delivery depends on the owner's Actions notification settings. This is availability monitoring, not dedicated on-call paging or comprehensive product-flow monitoring. Sentry/external alert routing remains unconfigured.

Installing the workflow triggered existing Railway main-branch hooks. Web/API/worker builds were cancelled; AI was restored to the previously working image (`sha256:e14c9d5c3a0b24f817dd4b681018509ffcb5480c6870dbf1fcd68f4cf6c46d89`). Readiness passed afterward. Production watch patterns now cover relevant application/shared dependencies and exclude monitoring/docs-only commits. Application releases still preserve the hosted source in `var/onboarding-fix/deploy`; do not deploy an old `main` checkout over it.

The 0.4 release adds durable, opt-in SendGrid report email. A one-time request does not subscribe the recipient. `ACCEPTED` means provider acceptance, not inbox delivery; `UNKNOWN` is deliberately excluded from automatic/manual retry. No existing user is subscribed automatically. Publishing push jobs use recipient-owned encrypted Expo tokens, membership checks and provider receipts. Explicit logout and OS permission revocation remove the device registration when the network is available; stale registrations stop receiving delivery after 30 days.

Platform administrators can inspect failed/unknown report, push and account cleanup jobs in web Settings/Platform operations and native Administration. Retry only confirmed failures; investigate UNKNOWN sends with provider evidence first. Account cleanup jobs are durable and recheck that the workspace belongs to the deleted owner. Keep the worker running alongside the API. Android FCM configuration and real-device notification receipt remain release prerequisites.
