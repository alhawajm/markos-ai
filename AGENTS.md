# AGENTS.md

This repo is built from one authoritative spec and one behavioral companion:

`docs/source/MARKOS_BUILD_SPEC. 2.pdf` is the complete source of truth. Read it before changing product behavior.

`docs/source/MARKOS_EXPERIENCE_FLOWS.md` explains the end-to-end user journey, state transitions, and failure behavior. Use it to understand how screens should move. Where it conflicts on behavior, prefer the experience flows; where it conflicts on structure, prefer the build spec.

## TL;DR

MARKOS AI is an Instagram-first AI marketing OS for Bahrain SMBs. It learns a business during onboarding, stores that knowledge in a workspace-scoped Knowledge Vault, retrieves it with RAG over pgvector, and uses eight AI agents to generate strategy, content, scheduling, analytics, and advice.

## Build Rules

1. Build milestones in order: M0 -> M6.
2. Build Foundation before features; build Vault + RAG before agent breadth.
3. `workspace_id` isolation is sacred. Add isolation tests for every workspace-owned table.
4. Models are configuration, not constants.
5. Respect Instagram publish realities: container -> poll -> publish, public media URL, daily cap, App Review in M0.
6. Money is integer minor units plus ISO-4217. BHD is stored in fils.
7. Meter every AI token and image; enforce plan quotas.
8. TypeScript strict, typed Python, bilingual/RTL from the first screen, tests as you go.

When the spec is silent, choose the smallest conventional option and record it in `docs/decisions.md`.

## Testing

- After each development pass, run only the tests that directly cover the changed behavior, plus the nearest relevant typecheck or lint check. Do not run root `pnpm verify`, an entire workspace suite, browser suites, or Docker-backed verification unless the user asks for it or the change genuinely crosses shared foundations, database/schema behavior, multiple services, or a release gate.
- For a focused Vitest file, invoke Vitest directly and pass the discovered path without an extra argument separator. Example: `corepack pnpm --filter api exec vitest run test/content.test.ts`. Do not use `corepack pnpm --filter api test -- test/content.test.ts`; that form can lose the intended file filter and collect the full API suite.
- Confirm a requested test path exists before running it. If a supposedly focused command starts collecting unrelated files or services, terminate it immediately, correct the invocation, and rerun only the intended scope. Do not wait for a timeout and do not compensate for a mistaken command by launching a repository-wide gate.
- Start PostgreSQL, Redis, OpenSearch, browsers, or other local services only when the selected tests actually require them. Any persistent API test must use an explicitly named disposable database, never an ordinary development, staging, or production database.
- Report the exact focused checks that passed, failed, or were skipped. Never describe focused coverage as a full-suite result. Leave broad regression coverage to CI or an explicitly requested release-verification pass.

## Local Git and GitHub CLI

In local Codex or IDE sessions, run every `git` and `gh` command with elevated, unsandboxed access. Do not first attempt these commands inside the sandbox, because sandboxed credential and repository access can produce misleading failures.

This execution rule does not authorize destructive Git operations, force pushes, history rewrites, merges, commits, pushes, or other publication unless the current task already authorizes them. Continue to verify exact targets and preserve unrelated work.

## Codex Cloud task completion reports

This section applies only to agents running in Codex Cloud. It does not apply to local Codex sessions, IDE-based agents, human contributors, or other automation unless a task explicitly opts into this reporting convention.

For every substantial implementation, review, investigation, or validation task performed by a Codex Cloud agent:

- Save the final completion report under `docs/codex-reports/` using `YYYY-MM-DD-<descriptive-task-slug>.md`.
- Include the task scope, verdict, findings, decisions, files changed, implementation commits, commands with exact outcomes, tests passed, failed, or skipped, checks not run, blockers, accepted limitations, and next steps.
- Keep reports factual. Do not include chain-of-thought, hidden reasoning, or intermediate conversational commentary.
- Never record secret values, credentials, tokens, OAuth codes, state values, nonces, database passwords, complete sensitive connection strings, or signed URLs. Preserve configuration variable names only.
- Complete implementation commits first. Commit the report afterward in a separate documentation-only commit using `docs(codex): record <task> report`.
- The report must identify the implementation commits but must not attempt to include its own report-commit hash.
- When the environment preserves task commits, the preceding commit separation and identification rules remain mandatory. When Codex Cloud or task application subsequently consolidates or rewrites those commits, task-local hashes may appear only as provisional execution references and must not be described as currently reachable after Git shows otherwise.
- If platform-managed consolidation leaves no stable implementation-only commit, treat the committed PR diff from the verified base or merge base through the current PR head as authoritative. Identify it semantically as `<verified-base>..HEAD`, list the implementation and test files involved, and require reviewers to resolve `HEAD` from Git at review time rather than embedding the report-containing head's hash in the report.
- Explain factually when platform consolidation combined implementation and documentation that the agent originally committed separately. Do not repeatedly edit an otherwise accurate report merely to chase hashes rewritten by later platform consolidation. This exception applies only to actual platform-managed rewriting and does not excuse failing to create clean, separated commits when the environment preserves them.
- Also reproduce the complete report in the Codex Cloud response as raw Markdown inside one outer four-backtick fenced block. Preserve any internal triple-backtick blocks.
- Outside the block, provide only the report path, report-commit hash, and final working-tree status.
- Do not rerun work merely to produce the report.
- If a task is explicitly read-only, do not create or commit a report unless the task explicitly authorizes that report-only write. Still return the copyable fenced Markdown report.
