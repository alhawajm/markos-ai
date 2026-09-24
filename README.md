# MARKOS AI

AI-powered marketing operating system for Bahrain SMBs. Version 1 is Instagram-only, bilingual Arabic/English, and built around a Knowledge Vault plus eight AI agents.

Start with M0 Foundation from [`docs/source/MARKOS_BUILD_SPEC. 2.pdf`](docs/source/MARKOS_BUILD_SPEC.%202.pdf).

The active source set is intentionally small:

- [`AGENTS.md`](AGENTS.md) — repository operating instructions and precedence.
- [`docs/source/MARKOS_BUILD_SPEC. 2.pdf`](docs/source/MARKOS_BUILD_SPEC.%202.pdf) — structural product target.
- [`docs/source/MARKOS_EXPERIENCE_FLOWS.md`](docs/source/MARKOS_EXPERIENCE_FLOWS.md) — behavioral target and state transitions.
- [`docs/project-status.md`](docs/project-status.md) — current implementation, evidence, roadmap, and ownership overlay.

Superseded PRD, implementation, cost, design, and agent-instruction sources are retained under [`docs/archive/source/`](docs/archive/source/README.md) for history only. Do not use them as current contracts.

Detailed progress is tracked in
[`docs/milestone-checklist.md`](docs/milestone-checklist.md), durable engineering choices in
[`docs/decisions.md`](docs/decisions.md), and Railway deployment operations in
[`docs/staging-deploy.md`](docs/staging-deploy.md).

Double-click **Run MARKOS.cmd** to open the [Railway app](https://web-production-94e63.up.railway.app/en/login).
This is the default application for demos and everyday use; it runs entirely on
Railway with the existing accounts, workspaces, AI and media. No local server is needed.
The optional developer setup remains documented in [Local handover](docs/local-handover.md).

The Android/iOS app lives in [`apps/mobile`](apps/mobile/README.md), with the same Railway accounts and campaigns. Its [Expo project](https://expo.dev/accounts/mo4180/projects/markos) contains native preview builds; [the mobile plan](docs/mobile-app-plan.md) records the implemented slice and remaining milestones.

This workstation's ignored `.env` and SSH identity are required for that
connection. They are not included when copying or cloning the repository. Current
source also does not implement every planned feature, including complete live
billing.

Install the pinned Node dependencies with:

```bash
corepack pnpm install --frozen-lockfile
```

For explicit local development only, use `powershell -File scripts/run-local.ps1`.
That launcher configures the database tunnel and hosted job ownership together.
**Stop MARKOS.cmd** stops those local processes; it does not stop Railway.
`pnpm dev` is for separately configured local development.

Follow the focused testing rules in [`AGENTS.md`](AGENTS.md). Persistent tests
require an explicitly named disposable database and separate test configuration.
Do not run `pnpm verify`, persistent API tests, seeds or migrations against the
shared Railway `.env`.

Python 3.11 is required when running `services/ai` locally; the prepared Railway
profile uses hosted AI. On Windows, use the Python launcher if `python` is
shadowed by the Microsoft Store alias:

```bash
py -3.11 -m venv services/ai/.venv
cd services/ai
.venv/Scripts/python.exe -m pip install -e ".[dev]"
```

Full M0 local infra requires Docker Desktop with WSL enabled.
