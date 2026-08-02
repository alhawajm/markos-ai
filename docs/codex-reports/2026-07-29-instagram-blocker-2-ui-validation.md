# Revised Instagram Blocker 2 UI Validation Report

## Request and scope

This validation addressed the remaining reproducibility concern for the rendered Instagram Settings tests:

- The earlier validation environment had required a manually created, ignored `apps/web/node_modules/vitest` symlink.
- The earlier final suite had invoked Vitest through `apps/api/node_modules/.bin/vitest`.
- A committed web test must not depend on a manual link, a transitive package, or an API-owned executable.

The pass inspected dependency ownership, removed reliance on the earlier workaround, synchronized dependencies from the committed manifests and lockfile, proved package resolution from the web workspace, reran the complete rendered suite through a web-owned pnpm invocation, and repeated the relevant web checks.

It did not change backend behavior, rerun PostgreSQL or Redis validation, contact Meta, use real credentials, change production configuration, enable publishing, analytics, insights, workers, or schedulers, push, open a remote pull request, merge, deploy, or rewrite accepted implementation work.

## 1. Overall verdict

**Blocker 2 is fully closed.**

The active `SettingsPanel` remains covered by six rendered Chromium interaction scenarios through the real `/en/app/settings` route. The three existing helper tests also execute.

The reproducibility concern is resolved:

- Vitest is explicitly declared by the `web` workspace.
- `playwright-core` is explicitly owned as repository-level shared browser tooling by the root workspace.
- A trusted frozen-lockfile synchronization creates the normal pnpm-managed web Vitest link.
- The link points into pnpm’s content-addressed package layout, not into `apps/api/node_modules`.
- `vitest`, `vitest/config`, and `playwright-core` resolve successfully from the web workspace.
- The final suite runs through `corepack pnpm --filter web exec vitest run`.
- No API-local executable or manually created link is required.
- No manifest or lockfile change was necessary.

At the time of the UI validation, both Task 3 validation blockers were closed. A later cumulative security review identified callback telemetry, active-route coverage, RLS write-evidence, and report-provenance corrections outside the UI blocker itself. Those findings were addressed in a task-local correction snapshot historically identified as `68c8d4e`; Codex Cloud later consolidated that snapshot, so it is not represented as currently reachable. The UI evidence in this report remains unchanged.

## 2. Active Settings component proof

The active application shell imports the production `SettingsPanel` from `apps/web/app/[locale]/_components/settings-panel.tsx` and renders that exact component when the active section is `settings`.

The browser suite navigates to `/en/app/settings`, waits for the real Settings heading, and interacts with production controls through accessible browser queries. It does not substitute a duplicate component, fixture-only screen, reducer, or extracted helper for the active UI. The helper tests remain useful but are not treated as rendered proof.

## 3. Dependency ownership findings

### Vitest ownership

Vitest 4.1.8 is explicitly declared in the web workspace's `devDependencies`, and the web workspace owns the normal script `"test": "pnpm exec vitest run"`. The lockfile contains a dedicated `apps/web` importer entry. The API separately declares Vitest for its own tests, but the web suite does not need or use the API executable.

### `playwright-core` ownership

`playwright-core` is explicitly declared by the root workspace as shared repository browser tooling and resolves to 1.61.1 in the root lockfile importer. Normal module resolution from the web workspace reaches that declared root pnpm link. This is not an API transitive dependency. An attempted web-local addition was unnecessary and changed neither manifest nor lockfile.

### Other direct imports

The browser test imports `node:fs`, `playwright-core`, and `vitest`. The Vitest configuration imports `vitest/config`. Every non-built-in import is explicitly owned by the web or root workspace, and none resolves beneath `apps/api/node_modules`.

## 4. Cause of the earlier missing Vitest link

The earlier manual link resulted from transient environment damage or incomplete workspace linking, not a missing committed declaration. At the beginning of this pass, `apps/web/node_modules/vitest` was absent and was not the earlier manual symlink.

A successful trusted frozen-lockfile synchronization recreated it as a normal pnpm-managed link into the root virtual store. It did not point to `apps/api/node_modules`. This proves the committed web manifest and lockfile contain everything required to reconstruct it.

## 5. Frozen-install behavior

A normal frozen install began pnpm supply-chain-policy verification, but registry metadata and attestation endpoints were unreachable. It entered retries and was interrupted without modifying tracked files. `--offline` alone did not suppress that verification and was likewise interrupted.

The committed lockfile was then treated as the trusted dependency baseline using pnpm's documented `--trust-lockfile` option:

```text
corepack pnpm install --offline --frozen-lockfile --trust-lockfile
```

Exact result:

```text
Scope: all 11 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 1.9s using pnpm v11.5.2
```

No repository safety configuration was weakened or removed.

## 6. Import-resolution proof

Resolution initiated through the web workspace produced:

```text
vitest file:///workspace/markos-ai/node_modules/.pnpm/vitest@4.1.8_@opentelemetry+api@1.9.1_@types+node@24.13.1_vite@8.0.16_@types+node@24.13_7a268ae71e04b3568513c70e3844bb6d/node_modules/vitest/dist/index.js
vitest/config file:///workspace/markos-ai/node_modules/.pnpm/vitest@4.1.8_@opentelemetry+api@1.9.1_@types+node@24.13.1_vite@8.0.16_@types+node@24.13_7a268ae71e04b3568513c70e3844bb6d/node_modules/vitest/dist/config.js
playwright-core file:///workspace/markos-ai/node_modules/.pnpm/playwright-core@1.61.1/node_modules/playwright-core/index.mjs
```

`corepack pnpm --filter web exec vitest --version` returned:

```text
vitest/4.1.8 linux-x64 node-v22.22.2
```

## 7. Final repository-owned test command

The reproducible command is:

```text
SETTINGS_BROWSER_BASE_URL='http://127.0.0.1:3000' corepack pnpm --filter web exec vitest run
```

The application server is started with `corepack pnpm --filter web dev`. This uses web-owned Vitest, root-owned shared Playwright, prepared Chromium, and loopback-only application and mocked backend boundaries. It does not invoke an API-local executable or require a manual link.

## 8. Rendered component coverage

The six browser scenarios verify:

- Active-route rendering, truthful disconnected state, dry-run publishing, absence of fixtures, keyboard Connect, pending state, duplicate prevention, expected start request, and accessible sanitized failure.
- Successful, denied, failed, and unsupported callback handling; removal of codes, OAuth state, and provider errors; preservation of safe query parameters; and no repeated result after reload.
- Sanitized identity, recent media, captionless and optional media, meaningful image text, empty media, last synchronization, and absence of credentials or provider internals.
- Reauthorization not appearing connected or revoked, with the correct recovery action.
- Refresh and reconnect initiation, pending duplicate prevention, backend-confirmed updates, and preservation of a usable connection on cancellation or failure.
- Disconnect confirmation and cancellation, exactly one confirmed request, pending disablement, backend-confirmed state change, failure preservation, and prevention of stale actions after success.

## 9. Confirmed UI defects and fixes

The rendered validation fixed three defects:

1. Refresh and Disconnect had remained enabled while disconnected or requiring reauthorization; they now require an active connection and no pending operation.
2. A connected account had retained “Connect OAuth”; it now displays “Reconnect.”
3. Settings had displayed “Live workspace” based on session presence; it now truthfully displays “Dry run.”

No backend, OAuth, credential, workspace, CSRF, provider, database, or refresh-eligibility behavior changed.

## 10. Browser smoke topology

- **Application:** real loopback Next.js server.
- **Route:** `http://127.0.0.1:3000/en/app/settings`.
- **Browser:** prepared headless Chromium through `playwright-core`.
- **Authentication:** existing local browser-session convention with fake test values.
- **Backend:** intercepted loopback requests on port 4000.
- **Media:** isolated mocked response.
- **Meta, Railway, and database:** not contacted.
- **Publishing and analytics:** dry run.
- **Workers and schedulers:** inactive.

The server returned HTTP 200 for every tested route variant without a reported hydration or runtime error.

## 11. Commands and exact results

### Inspection

✅ Inspected repository status/history, applicable `AGENTS.md`, root/web/API manifests, workspace and package-manager configuration, lockfile importers, test configuration, browser-test imports, and the web Vitest link.

Result: the tree was clean; only root `AGENTS.md` applied; web owned Vitest 4.1.8; root owned Playwright 1.61.1; matching lockfile importers existed; the web Vitest link was absent rather than manual; direct imports were limited to built-ins and declared tooling.

### Synchronization attempts

⚠️ `corepack pnpm install --frozen-lockfile`

Result: began verification of 807 entries, could not reach registry metadata/attestation endpoints, entered retries, and was interrupted with exit 130. No tracked file changed.

⚠️ `corepack pnpm install --offline --frozen-lockfile`

Result: offline mode did not suppress policy metadata verification; it entered the same retries and was interrupted with exit 130. No tracked file changed.

⚠️ `corepack pnpm --filter web add -D playwright-core@1.61.1 --offline --trust-lockfile`

Exact result:

```text
Progress: resolved 1, reused 0, downloaded 0, added 0
[WARN] The metadata of @sentry/nextjs is missing the "time" field; skipping the minimumReleaseAge check for this package.
[ERR_PNPM_NO_OFFLINE_META] Failed to resolve turbo@>=2.9.17 <3.0.0-0 in package mirror /root/.cache/pnpm/v11/metadata/registry.npmjs.org/turbo.jsonl

This error happened while installing a direct dependency of /workspace/markos-ai
```

No file changed; the addition was unnecessary because Playwright was already explicitly root-owned.

✅ `corepack pnpm install --offline --frozen-lockfile --trust-lockfile`

```text
Scope: all 11 workspace projects
Lockfile is up to date, resolution step is skipped
Already up to date

Done in 1.9s using pnpm v11.5.2
```

### Link and resolution proof

✅ `stat -c '%F %N' apps/web/node_modules/vitest node_modules/playwright-core`

```text
symbolic link 'apps/web/node_modules/vitest' -> '../../../node_modules/.pnpm/vitest@4.1.8_@opentelemetry+api@1.9.1_@types+node@24.13.1_vite@8.0.16_@types+node@24.13_7a268ae71e04b3568513c70e3844bb6d/node_modules/vitest'
symbolic link 'node_modules/playwright-core' -> '.pnpm/playwright-core@1.61.1/node_modules/playwright-core'
```

✅ Web-workspace import resolution returned the three virtual-store paths recorded in section 6. No path used `apps/api/node_modules`.

✅ `corepack pnpm --filter web exec vitest --version`

```text
vitest/4.1.8 linux-x64 node-v22.22.2
```

### Server and tests

✅ `corepack pnpm --filter web dev`

```text
$ next dev
▲ Next.js 16.2.9 (Turbopack)
- Local:         http://localhost:3000
✓ Ready in 588ms
```

All tested Settings variants returned HTTP 200. The long-running server was intentionally stopped with Ctrl-C afterward; pnpm reported the expected SIGINT termination.

✅ `SETTINGS_BROWSER_BASE_URL='http://127.0.0.1:3000' corepack pnpm --filter web exec vitest run`

```text
RUN  v4.1.8 /workspace/markos-ai/apps/web

Test Files  2 passed (2)
     Tests  9 passed (9)
  Start at  15:28:17
  Duration  43.62s (transform 117ms, setup 0ms, import 920ms, tests 41.76s, environment 0ms)
```

All six browser scenarios and all three helper tests executed. None failed or skipped.

### Static checks

✅ `corepack pnpm --filter web typecheck`

```text
$ tsc --noEmit --project tsconfig.typecheck.json
```

No error was reported.

✅ `corepack pnpm --filter web lint`

```text
$ eslint .
```

No error or warning was reported.

✅ `corepack pnpm --filter web build`

```text
$ next build
▲ Next.js 16.2.9 (Turbopack)
✓ Compiled successfully in 14.4s
Finished TypeScript in 9.7s
✓ Generating static pages using 2 workers (57/57) in 759ms
```

✅ `git checkout -- apps/web/next-env.d.ts` reverted only generated route-import churn.

✅ `git diff --check` passed with no whitespace errors.

✅ `rm -rf apps/web/evidence && git status --porcelain=v1 && git diff --check` removed only newly generated untracked screenshots; status and diff-check returned no output.

## 12. Earlier test-development failures

The original rendered-test development record remains explicit:

- The initial run had six timeouts under Vitest's default timeout.
- The second run had five failures and one pass due to readiness and loopback-host matching.
- Those issues were corrected in the task-local UI implementation historically identified as `1326687` before Codex Cloud consolidated the branch. The UI files and tests remain reviewable in the authoritative PR diff described below.
- The accepted run passed all six browser and three helper tests.
- This reproducibility pass independently reran the same nine tests through the web-owned command, and all passed.

The synchronization warnings in this pass were separate network/environment issues, not test failures.

## 13. Files and implementation commits

Relevant files:

- `apps/web/app/[locale]/_components/settings-panel.tsx`
- `apps/web/test/settings-panel.browser.test.ts`
- `apps/web/test/instagram-settings-state.test.ts`
- `apps/web/vitest.config.ts`
- `apps/web/package.json`
- `package.json`
- `pnpm-lock.yaml`

No manifest, lockfile, test, configuration, or production source changed during the reproducibility check, so no new implementation commit was required.

## Reviewable implementation provenance

The authoritative artifact is the committed PR diff:

```text
251cfd511744f71b67cfe835584e5c41b29d73f6..HEAD
```

Reviewers must resolve `HEAD` from Git at review time. The implementation and evidence are represented by the production, migration, API test, web test, and documentation files in that diff. The final delta review observed consolidated head `e60c66bfb40175fbc542cba14a5bc81f2a1a4d06`, but that observation is not a promise that later task application will preserve the same hash.

`89fc8af`, `1326687`, `18e84f617b7a5753da7169181890000f40431c81`, `68c8d4e`, and intervening documentation hashes are historical task-local or pre-consolidation execution references. None is represented here as currently reachable. Codex Cloud combined work that agents originally committed as separate implementation and documentation commits into the current PR tree. Valid test and UI evidence does not depend on preservation of those provisional hashes, and this report intentionally does not attempt to embed the hash of a commit containing itself.

## 14. Checks not run

- PostgreSQL and Redis were not rerun because the database blocker was already closed and no backend or schema behavior changed.
- API tests were not rerun because no API, shared type, API-client, dependency, or backend source changed.
- No live provider, Railway, production environment, deployment, or real credential was used.

## 15. Accepted limitations

- Registry supply-chain metadata and attestation endpoints were unavailable.
- A network-verifying frozen install could not finish, but the committed lockfile synchronized reproducibly offline with pnpm's documented `--trust-lockfile` option.
- Exact screen-reader speech was not manually evaluated.
- Arabic layout was not separately screenshot-smoked.
- Real Instagram CDN media and live Meta OAuth remain reserved for supervised acceptance.
- Screenshots are evidence, not a pixel-diff regression system.

None of these limitations creates reliance on an undocumented link, an API executable, an undeclared transitive dependency, or a fabricated result.

## 16. Final working-tree status

The final tracked tree was clean. Normal pnpm-managed Vitest and Playwright links existed only under ignored `node_modules` directories. No manual API-directed link, tracked screenshot, or generated build artifact remained.

## 17. Final readiness conclusion

- **Six rendered browser scenarios:** passed.
- **Three helper tests:** passed.
- **Web-owned Vitest invocation:** proven.
- **Manual symlink dependency:** eliminated.
- **API-local Vitest executable dependency:** eliminated.
- **Vitest ownership:** explicit in web.
- **Playwright ownership:** explicit in root shared tooling.
- **Frozen synchronization:** successful from the trusted committed lockfile.
- **Manifest and lockfile changes:** none.
- **Blocker 2:** fully closed.
- **Both Task 3 validation blockers:** closed.
- **Later cumulative security findings:** corrected in the current PR diff with focused route, telemetry, encryption, and RLS tests; `68c8d4e` is only the historical task-local correction reference.
- **Feature readiness:** the implementation passed the final delta review and is ready for human PR opening after the consolidation-safe documentation correction; live Meta behavior remains unverified.

Publishing and analytics remain **dry run**. Workers and schedulers remain inactive. No live provider request, production configuration change, deployment, push, merge, or remote pull-request creation occurred.
