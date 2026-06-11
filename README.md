# MARKOS AI

AI-powered marketing operating system for Bahrain SMBs. Version 1 is Instagram-only, bilingual Arabic/English, and built around a Knowledge Vault plus eight AI agents.

Start with M0 Foundation from `MARKOS_BUILD_SPEC. 2.pdf`.

Progress is tracked in [`docs/milestone-checklist.md`](docs/milestone-checklist.md).

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
