# Feature documentation

Feature behavior and implementation details live here. Start with [project status](../project-status.md) for current handoff priorities and verification limits; a document describing implementation is not proof of production acceptance.

## Business Profile

- [Business Profile plan](business-profile-plan.md) — implemented manual-maintenance design, with the original rationale and a linked verification checkpoint.

## Create

- [Authoring invariants](create-authoring.md) — implemented content/media structure, saving, revisions, and readiness rules; start here.
- [Assistant authoring contract](create-assistant-authoring-contract.md) — targeted edits, confirmations, and generation boundaries.
- [Conversation backend](create-conversation-backend.md) — persistence, execution recovery, and workspace ownership.

## Campaign and content planning

- [Content/Campaign model proposal](content-campaign-model-proposal.md) — a dated mix of implemented changes and proposed extensions, not a blanket implementation contract. For current Create structure, prefer the authoring invariants above. Production Campaign generation has an [open timeout issue](../project-status.md#immediate-handoff-issue--campaign-generation-timeout).

Shared setup, testing, deployment, and design guidance remain directly under `docs/`. Dated audits remain in `docs/analysis/`; authoritative product sources remain in `docs/source/`.
