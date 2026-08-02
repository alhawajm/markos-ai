# Clean database baseline completion report

## Task scope

Replace the inherited Prisma migration history on the existing Instagram OAuth branch with a single baseline for a disposable, brand-new pgvector PostgreSQL database, retain only runtime-required seed data, preserve OAuth/application code, document Railway bootstrap, and validate as far as this environment permits.

## Verdict

Implementation is complete and statically verified. Live empty-database bootstrap verification is blocked because this Codex environment has neither Docker nor PostgreSQL client/server binaries and no reachable PostgreSQL server. Therefore database initialization, migration deployment/status, both live seed executions, registration/auth/workspace persistence, and OAuth database persistence are **not claimed as passed** here; CI now performs initialization, migration deployment, two seed passes, migration status, repository verification, and builds with its disposable pgvector service.

## Investigation and findings

- Read the repository `AGENTS.md` and the experience flows. The build-spec PDF is present and its metadata was inspected, but no PDF text extractor was installed; installing `pypdf` was blocked by the environment's package-network policy.
- Inspected the Prisma schema, all ten inherited migrations, initialization SQL, seed, registration and Google sign-up paths, billing/usage plan queries, Instagram OAuth persistence services and tests, API Dockerfile, package/Make scripts, CI, and staging deployment documentation.
- The checkout has no Git remote and no local `main` ref, so a direct `main...HEAD` comparison was impossible. The current schema and migration history were instead reconciled together; the baseline retains all current OAuth tables and schema elements. No application or OAuth implementation file was removed.
- No repository evidence indicated that any target workflow must preserve valuable database data. The requested target is explicitly disposable/new.
- Password registration and Google sign-up both look up `STARTER` with `findUniqueOrThrow`. Billing lists all active plans and supports upgrades to catalog plans. Consequently the minimal runtime seed category is the four-plan active billing catalog; no tenant or sample data is justified.

## Artifacts removed, replaced, and retained

### Removed inherited migrations

- `20260610074810_init` (replaced/renamed into the clean baseline)
- `20260610110500_add_vault_hnsw_index`
- `20260611102000_add_workspace_rls`
- `20260611121300_scope_prompt_templates_to_workspace`
- `20260611133500_add_ai_token_usage_metrics`
- `20260611172000_add_vault_history`
- `20260614120500_add_model_settings`
- `20260729090000_instagram_oauth_security_foundation`
- `20260729120000_instagram_basic_profile_media`
- `20260729150000_harden_instagram_rls`

### Replacement

- `apps/api/prisma/migrations/20260802000000_clean_baseline/migration.sql`: one migration generated from the complete current Prisma datamodel, plus the HNSW vector index, role grants, workspace-context helper, RLS enablement, and workspace policies. It includes `oauth_state_nonces`, `instagram_connection_credentials`, and `instagram_recent_media`.

### Retained

- `apps/api/prisma/schema.prisma`: unchanged current authoritative datamodel.
- `apps/api/prisma/init/001-init.sql`: unchanged idempotent setup for `vector`, `pgcrypto`, UUIDv7 helper, and application roles.
- `apps/api/prisma/migrations/migration_lock.toml`: unchanged PostgreSQL provider lock.
- `apps/api/prisma/seed.ts`: retained only the idempotent plan upserts, with a rationale comment. `STARTER` is required by password/Google registration; `GROWTH`, `PREMIUM`, and `ENTERPRISE` are required by billing catalog and upgrade behavior. It creates no user, workspace, membership, content, analytics, OAuth, credential, or media rows.

## Files changed

- `.github/workflows/ci.yml`
- `apps/api/prisma/migrations/20260802000000_clean_baseline/migration.sql`
- Deleted superseded migration directories listed above
- `apps/api/prisma/seed.ts`
- `apps/api/test/database-baseline-contract.test.ts`
- `apps/api/test/instagram-migration-contract.test.ts`
- `docs/staging-deploy.md`

## Decisions

- Did not use or document `prisma db push`.
- Preserved application behavior rather than redesigning registration for an empty catalog.
- Retained the full four-plan catalog because billing runtime exposes and upgrades across it; no convenience/demo records remain.
- Made CI execute the seed twice and check migration status against its disposable database.
- Documented that the rewritten baseline is forbidden for a database with valuable data or inherited migration history.

## Bootstrap sequence

From the repository root, against a confirmed-new pgvector PostgreSQL database:

```bash
psql "$DATABASE_URL" --set=ON_ERROR_STOP=1 --file=apps/api/prisma/init/001-init.sql && pnpm --filter api prisma migrate deploy && pnpm --filter api prisma db seed
```

Then repeat `pnpm --filter api prisma db seed`, run `pnpm --filter api prisma migrate status`, inspect tables, verify exactly four plan rows, and verify tenant/sample tables remain empty before test fixtures are created.

## Commands and exact outcomes

### Passed

- `DATABASE_URL=postgresql://x:x@localhost:5432/x corepack pnpm --filter api exec prisma validate` — exit 0; schema valid (with Prisma package-configuration deprecation warning).
- `corepack pnpm --filter api exec vitest run test/database-baseline-contract.test.ts test/instagram-migration-contract.test.ts test/instagram-database-safety.test.ts` — exit 0; 3 files and 9 tests passed.
- `corepack pnpm --filter api typecheck` — exit 0.
- `corepack pnpm --filter api build` — exit 0.
- `git diff --check` — exit 0.

### Blocked or failed because of environment limitations

- `docker version --format '{{.Server.Version}}'` — command unavailable (`docker: command not found`).
- `command -v psql; command -v postgres; command -v initdb` — no PostgreSQL binaries found.
- Broad API test invocation and selected OAuth persistence/token-refresh tests reached `localhost:5432` and failed with Prisma `P1001` because no PostgreSQL server is available. Static OAuth/security tests in that selection passed, but the combined command failed (4 of 25 tests failed due to database reachability).
- `python -m pip install --quiet pypdf` — blocked by package index/network policy (HTTP tunnel 403), so the PDF could not be text-extracted in this environment.

## Tests not run successfully

- Live `001-init.sql` execution.
- Live `prisma migrate deploy` and `prisma migrate status`.
- First and second live seed execution and row-count assertions.
- Registration, authentication, initial workspace creation, RLS, and Instagram OAuth persistence/state integration against a fresh database.
- Full repository `pnpm verify`, because database-dependent API suites cannot run without PostgreSQL.

These remain mandatory in CI/Railway before acceptance; the CI workflow now encodes the two seed runs and migration-status check.

## Implementation commit

- `7fdb3675f3f19e8836efe104d61ca97a656715ee` — `refactor(db): replace migrations with clean baseline`

## Railway manual action

1. Confirm the current Railway database is disposable and contains no valuable data; do not target an existing valuable database.
2. Provision a brand-new PostgreSQL database with pgvector support and a user privileged to create extensions/roles and grant memberships.
3. Set the API pre-deploy command to the documented initialization + migrate-deploy + seed sequence.
4. Deploy without merging, then run the second seed, migration status, table/catalog/empty-row checks, registration/auth/workspace tests, and Instagram OAuth persistence/state tests.
5. Do not run `prisma db push`, do not rewrite an existing valuable database's migration history, and do not merge the PR until this live verification passes.

## Accepted limitations and next steps

- The repository checkout exposes no remote or `main` ref, so branch comparison and a repository-derived PR URL could not be resolved locally.
- A pgvector-capable CI/Railway run must provide the authoritative live-bootstrap evidence.
- Update the existing Instagram OAuth PR with these commits; do not open or merge an unrelated replacement PR.
