# MARKOS AI

An Instagram-first marketing OS for Bahrain businesses, with shared web, Android and iPhone accounts, campaigns and media.

## Use MARKOS

Double-click **Run MARKOS.cmd** or open the [Railway app](https://web-production-94e63.up.railway.app/en/login). Railway is the current host; no local server is needed for everyday use.

The native app lives in [apps/mobile](apps/mobile/README.md). The [Expo project](https://expo.dev/accounts/mo4180/projects/markos) holds native builds and updates. See [release readiness](docs/release-readiness.md) for verified results and external release gates.

## Develop locally

Follow [Run MARKOS locally](docs/local-development.md) for offline setup and [Formatting and tests](docs/testing.md) for focused checks. Standard `pnpm dev` and `pnpm local:check` use the safe local profile.

The optional [local handover](docs/local-handover.md) describes explicit developer profiles. `scripts/run-local.ps1 -Mode railway` uses the workstation's ignored environment and SSH identity; these are not included when cloning. Shared database edits affect Railway. **Stop MARKOS.cmd** stops local processes only.

Persistent tests require an explicitly named disposable database. Never run tests, seeds or migrations against the shared Railway environment.

## Project references

- [AGENTS.md](AGENTS.md): repository instructions and precedence.
- [Build specification](docs/source/MARKOS_BUILD_SPEC.%202.pdf): structural authority.
- [Experience flows](docs/source/MARKOS_EXPERIENCE_FLOWS.md): behavioral authority.
- [Implementation progress](docs/implementation-progress.md) and [release readiness](docs/release-readiness.md): current evidence and pending work.
- [Project status](docs/project-status.md): dated handover and historical roadmap.
- [Feature documentation](docs/features/README.md): Business Profile, Create and Campaign contracts.
- [Decisions](docs/decisions.md), [source index](docs/source/README.md) and [milestone checklist](docs/milestone-checklist.md).
- [Railway deployment operations](docs/staging-deploy.md) and [recovery runbook](docs/recovery-runbook.md).
