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

```bash
corepack pnpm install
corepack pnpm dev
```

Local verification:

```bash
corepack pnpm verify
```

Python 3.11 is required for `services/ai`. On Windows, use the Python launcher if `python` is shadowed by the Microsoft Store alias:

```bash
py -3.11 -m venv services/ai/.venv
cd services/ai
.venv/Scripts/python.exe -m pip install -e ".[dev]"
```

Full M0 local infra requires Docker Desktop with WSL enabled.
