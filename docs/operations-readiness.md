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

The production pgvector volume has no backups and no schedules. The active
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

External alert delivery/Sentry and a restore rehearsal remain pending. The
readiness probe is implemented, but it is not itself an always-on monitor.

Independent maintenance failures are recorded with sanitized task/error codes
and do not prevent later tasks, including Reel rendering, from running. Monthly
analytics email is still simulated: `delivered` is false, `skippedReason` is
`DRY_RUN`, and new audit records use `MONTHLY_ANALYTICS_PDF_EMAIL_SIMULATED`.
Older `MONTHLY_ANALYTICS_PDF_EMAIL_SENT` rows with `deliveryMode: dry_run` are
historical simulations, not evidence of email delivery. Real report email needs
an owner preference and durable delivery handling before it is activated.
