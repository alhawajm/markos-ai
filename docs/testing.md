# Formatting and tests

Run commands from the repository root after [local setup](local-development.md). Keep test source, fixtures, and configuration in Git; generated logs and caches are not handoff material.

## Everyday checks

```sh
corepack pnpm format:check
corepack pnpm --filter web typecheck
corepack pnpm --filter web lint
```

Use the relevant workspace (`web`, `api`, or `ai`) for typechecking. Web lint uses ESLint; AI lint uses Ruff and its typecheck uses mypy. API lint is currently a placeholder, so rely on its typecheck and focused tests rather than treating lint output as coverage.

Prettier settings live in `.prettierrc.json`; `.editorconfig` and `.gitattributes` keep indentation and line endings consistent. `corepack pnpm format` rewrites supported files: review the diff afterward. Markdown, PDFs, and environment files are intentionally excluded and reviewed manually.

## Focused tests

- Launcher (no database): `node --test scripts/local-development.test.mjs`
- Web unit tests: `corepack pnpm --filter web test`
- One API file: `corepack pnpm --filter api exec vitest run test/<file>.test.ts`
- AI tests: `corepack pnpm --filter ai test`

Replace `<file>` with an existing test filename. Do not insert an extra `--` before a Vitest filename: it can cause the filter to be lost.

API tests can write database records. Before database-backed tests, set both `DATABASE_URL` and `INSTAGRAM_DATABASE_TEST_URL` to the same initialized, disposable loopback test database, never the `markos` development database or a hosted database. `NODE_ENV=test` alone does not provide isolation. See [test database requirements](staging-deploy.md#safe-test-database-setup); CI's preparation commands are in [ci.yml](../.github/workflows/ci.yml).

## Browser journeys

The real browser suite is `corepack pnpm --filter web test:browser` (also `make test.browser`). It uses Vitest with Playwright, not a separate Playwright test runner.

Start the web app first and set `SETTINGS_BROWSER_BASE_URL` to its local URL, usually `http://localhost:3000`. A Chromium browser must be available; set `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH` to an installed Chrome/Chromium executable if needed. To select one journey, run:

```sh
corepack pnpm --filter web exec vitest run --config vitest.browser.config.ts test/<file>.browser.test.ts
```

CI builds and starts the web app before these tests. Browser tests use mocked API responses where configured: passing them does not prove hosted providers or real publishing work. Wait for rendered state after asynchronous actions; a changed mock response is not proof the UI has finished updating.

## Full checks and generated files

`corepack pnpm verify` runs formatting, RTL checks, workspace typechecks, lint, and tests. It requires the disposable test database; it does not include the separate browser suite or deployment-image checks. Use focused checks during development and CI for the full sequence.

With the application and test processes stopped, `.next`, `.turbo`, Python tool caches/`__pycache__`, `*.tsbuildinfo`, temporary `.tmp` logs, and `.playwright-cli` session dumps can be deleted and regenerated. Keep useful conclusions in a short issue or verification note, not a pile of old logs. Historical logs include intermediate failures and are not evidence of the current revision passing.

Do not treat `.env`, uploaded media (`var`), Docker volumes, or evidence/screenshots as caches. Dependency directories (`node_modules`, `.venv`, `.pnpm-store`) are also outside routine test-output cleanup.
