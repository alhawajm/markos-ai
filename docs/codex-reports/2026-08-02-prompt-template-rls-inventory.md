# Prompt-template RLS inventory fix report

## Task scope

Address the sole reported failure from PR #4 CI run `30769848090` by reconciling the authoritative RLS test inventory with the clean baseline's tenant-scoped `prompt_templates` policy, without weakening the test or policy.

## Verdict

Complete. `prompt_templates` is now included in `rlsTables`, so the inventory covers all 21 workspace-scoped policies while preserving the baseline policy and strict equality assertion.

## Findings and decision

- `PromptTemplate.workspaceId` is required in `apps/api/prisma/schema.prisma`.
- The clean baseline correctly enables RLS and creates `prompt_templates_workspace_rls` using `app_current_workspace_id()` for both `USING` and `WITH CHECK`.
- `apps/api/test/rls.test.ts` omitted only `prompt_templates`, leaving the expected inventory at 20 tables.
- The smallest correct fix is one inventory entry. No migration, policy, CI, application behavior, or assertion was changed.

## Files changed

- `apps/api/test/rls.test.ts`: added `prompt_templates` to `rlsTables`.

## Implementation commit

- `564c118b473d591c8d46efc03227602b8c9562a3` — `test(db): include prompt templates in RLS inventory`

## Commands and outcomes

- `corepack pnpm --filter api typecheck` — passed, exit 0.
- `corepack pnpm --filter api exec vitest run test/database-baseline-contract.test.ts test/instagram-migration-contract.test.ts test/instagram-database-safety.test.ts` — passed, 3 files and 9 tests.
- `corepack pnpm --filter api build` — passed, exit 0.
- `git diff --check` — passed, exit 0.
- `corepack pnpm --filter api exec vitest run test/rls.test.ts` — could not complete locally: all 3 tests failed after Prisma could not reach PostgreSQL at `localhost:5432`; this environment has no responsive disposable database. This is an environment limitation, not a claimed test pass.

## External CI evidence supplied with the task

The user reported that PR #4 CI run `30769848090` passed fresh-database creation, clean baseline migration, two seed executions, and `prisma migrate status`, with the outdated 20-table RLS inventory as its only failure. A new PR #4 CI run against commit `564c118b473d591c8d46efc03227602b8c9562a3` remains the authoritative focused-database verification.

## Blockers and next steps

- This checkout has no Git remote, so the commit cannot be pushed from the local environment and no repository PR URL can be derived here.
- Update existing PR #4 with the committed change and confirm its fresh-database RLS test and broader CI pass.
- Do not merge PR #4 as part of this task.
