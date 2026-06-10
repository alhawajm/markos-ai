# AGENTS.md

This repo is built from one authoritative spec:

`docs/source/MARKOS_BUILD_SPEC. 2.pdf` is the complete source of truth. Read it before changing product behavior.

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
