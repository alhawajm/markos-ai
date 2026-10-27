# Railway encrypted recovery

The dedicated `backup` service runs at **00:15 UTC / 03:15 Bahrain daily** using
`railway-backup.json` and `apps/api/backup.Dockerfile`. It exits after each run;
an exited cron container is expected. Restart policy is NEVER.

The first verified run on 26 October 2026 used a consistent PostgreSQL 16 snapshot
and copied all 22 active database-referenced media objects. It uploaded and
read back 21,568,196 encrypted bytes. The database/media restore rehearsal recovered
28 migrations and five workspaces, checked media/workspace bindings and removed
its disposable database and temporary plaintext files afterward.

A second verified snapshot at 10:59 UTC on the same day included the two forward
isolation migrations: **30 migrations, five workspaces and 22 media objects** restored
successfully. Its durable operations receipt is present in the production database.
The rehearsal again removed its disposable database and all temporary plaintext.

On 27 October the scheduled run completed at 00:18 UTC. A fresh isolated restore
verified **32 migrations, five workspaces and 22 media objects**, including the
campaign checkpoint migrations. The rehearsal removed its own disposable database
and all temporary plaintext. This proves recovery within the current Railway
account; it does not provide independent-provider disaster recovery.

## Storage and keys

Source media stays in the app project's existing bucket. Recovery objects live in
the private **MARKOS Recovery** project, in its `markos-recovery-store` bucket
in Amsterdam. This survives loss of the application project; it remains on the
same Railway provider/account and is not independent-provider disaster recovery.
An earlier empty bucket definition named `markos-encrypted-recovery` is not the
active snapshot destination.

Every object uses a random salt/IV, HKDF and AES-256-GCM. A signed complete manifest
binds database and media ciphertext hashes, sizes and workspace mappings. A run
without `complete.json` is incomplete and must not be restored. Upload completion
alone is insufficient: every object is downloaded and its hash checked first.

`BACKUP_ENCRYPTION_KEY` is canonical Base64 encoding of 32 random bytes. The key
is held in the recovery project's shared variables as well as the backup service;
an encrypted Windows DPAPI escrow copy is under ignored `var/backups/` on this PC.
That escrow requires the same Windows identity. Keep independently accessible
operator recovery credentials; losing every key copy makes the archive unrecoverable.
Never generate a replacement key merely because a sealed variable cannot be read.
Rotate by adding a new key version and preserving the old key for retained runs.

## Configuration

Required backup-service variables:

- `DATABASE_URL`: PostgreSQL source; the dump client must match its major version.
- `SOURCE_S3_ENDPOINT`, `SOURCE_S3_REGION`, `SOURCE_S3_BUCKET`,
  `SOURCE_S3_ACCESS_KEY_ID`, `SOURCE_S3_SECRET_ACCESS_KEY`.
- `BACKUP_S3_ENDPOINT`, `BACKUP_S3_REGION`, `BACKUP_S3_BUCKET`,
  `BACKUP_S3_ACCESS_KEY_ID`, `BACKUP_S3_SECRET_ACCESS_KEY`.
- `BACKUP_ENCRYPTION_KEY`, `BACKUP_RETENTION_DAYS` (initially 30).
- `REDIS_URL` for the verified-snapshot freshness marker.
- `EMAIL_PROVIDER=brevo`, `BREVO_API_KEY`, `FROM_EMAIL`, `OPS_ALERT_EMAIL` for classified failure alerts. Delivery requires the verified sender/domain described in [email-delivery.md](email-delivery.md).

Mail credentials reference the API service's existing sealed credentials. Neither
credentials nor connection strings belong in Git, build arguments or commands.
Current source/destination clients use Railway's virtual-host S3 addressing.

Retention executes only after a new verified complete snapshot. It removes only
expired recovery-run prefixes, including abandoned runs, and preserves any run
with recently written objects. It never deletes source media. This is a referenced
media snapshot, not bucket version history. Native volume snapshots remain
unavailable on the current Railway plan.

## Verify and rehearse

Trigger a controlled run from the repository root:

```powershell
railway cron run --project <app-project> --environment production --service backup --yes
railway cron list --project <app-project> --environment production --service backup
```

Inspect the final sanitized `COMPLETE` status and run identifier. Configure the
API with `BACKUP_HEALTH_REQUIRED=true` only after the first successful snapshot.
`BACKUP_MAX_AGE_HOURS=36` makes `/v1/health/backups` fail if no recent verified
snapshot exists. The independent GitHub monitor checks it alongside `/v1/ready`.
An overdue backup raises an operations incident without taking a working application
offline. The durable global `BACKUP_COMPLETED` audit receipt survives Redis restarts;
Redis is retained as a fallback for the first snapshot taken before that receipt.

For a rehearsal, supply recovery variables securely to the recovery image and set
`BACKUP_RUN` to the complete run identifier. Set `RESTORE_POSTGRES_URL` to a new
local database named `markos_restore_<unique_name>`; allowed hosts are localhost,
127.0.0.1 and host.docker.internal. The local PostgreSQL installation must include
pgvector and the dump's required extensions.

```powershell
pnpm --filter api exec tsx src/operations/restore-rehearsal.ts
```

Run inside the backup image for its PostgreSQL 16 client. Use a private ephemeral
filesystem (the release rehearsal uses a `/tmp` tmpfs). Authentication and all
ciphertext hashes must pass before database creation. The tool refuses an existing
database, checks migration history and workspace/media bindings, and removes only
the database it created. It never writes to the original database or media bucket.

For an actual recovery, use `withVerifiedRecovery` in `backup-restore.ts` to consume
the authenticated dump and media in an isolated recovery environment. Keep
publishing and delivery workers stopped during validation. Resolve user erasure
requests made after the snapshot before enabling access or delivery. Cutover of
the production database remains an explicit operator action after validation.
