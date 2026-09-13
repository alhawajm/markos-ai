# Business Profile maintenance: implementation plan

## Audit and decisions

Base: updated `main`, PR #25 merge `b95622a`. Implementation branch: `feat/business-profile-maintenance`.

The September 7 decision replaces the August 20 return-to-onboarding maintenance workflow. The approved prototype supplies the interaction model; the current design system supplies styling. This increment implements owner editing only.

Current flow: onboarding module writes → Vault entries and offering catalog → approved AI interaction plus `COMPANY/business-profile` summary → completion-oriented Business Profile. Create, Campaigns and agents retrieve Vault chunks and brand/tone entries. Ordinary module edits can leave the approved summary stale. Embeddings currently run before Vault persistence. Catalog reconciliation matches mutable names, and paused offerings remain projected.

Required foundation:

- Store one authoritative profile document under a reserved `COMPANY/authoritative-profile` key. Reuse existing workspace isolation, atomic transactions and Vault revision history instead of adding another table with the same capabilities. Exclude this storage record from ordinary Vault lists, completeness and retrieval. Existing section entries become derived readable projections.
- Initialize existing workspaces from their current saved module values and accepted profile, without changing historical AI interactions. Keep the approved introduction while it remains current; after facts change, onboarding's compatibility summary is assembled deterministically from saved facts, without AI or invented translations. The old introduction remains in revision history and must no longer ground generation.
- Commit canonical edits, readable projections and stale-summary retirement together. Maintenance makes no AI call: retrieval indexes committed unembedded versions on demand. Late embeddings cannot replace newer versions, and retrieval uses current readable values during an outage.
- Keep the existing offering catalog authoritative. Introduce revision-checked ID-based maintenance, retain existing price and lifecycle fields, and project active offerings only. Onboarding receives catalog IDs and preserves fields it does not edit. No historical content rewrites.
- Both onboarding and Profile use the same writers. Direct raw Vault writes cannot bypass managed knowledge ownership. Routine Profile saves preserve completed onboarding.

## Passes

1. **Data foundations:** shared contracts/validation; canonical profile writer and read adapter; atomic projection and post-commit embedding; stable catalog maintenance and concurrency tests. No schema migration is required for profile storage.
2. **Shell:** replace the mounted completion page; URL-backed tabs ordered Marketing Strategy (default), Products & Services, Audience & Market, Brand & Voice, Business. Reuse existing theme, typography and modal behavior.
3. **Strategy and offerings:** readable current strategy with focused editors; searchable/filterable/paginated catalog and add/edit dialogs. No suggestion placeholders.
4. **Remaining sections:** audience/competitors, brand/voice, business/story/contact and optional establishment stage. Preserve unsuccessful edits and confirm dirty dismissal/archive.
5. **Synchronization:** round-trip module values and catalog identities through onboarding, including document-assisted paths; verify future grounding changes without modifying saved posts or campaigns.
6. **Verification:** focused service/component tests throughout, then normal formatting, lint, type checks, test suite and builds. Update obsolete assertions while retaining ownership, isolation, concurrency and failure coverage. User performs visual review; browser inspection is diagnostic only.

## Scope boundaries

No Intelligence, recommendations, autonomous editing, profile history UI, new commerce, or unrelated Create/Calendar changes. The strategy layout can conditionally accept future recommendations above its current sections without reserving empty space. Existing prototype asset repairs are preserved on this branch.

## Implementation checkpoint

All six passes are implemented. The mounted page uses the current light/dark tokens, Plex typography, native modal behavior and English/Arabic labels. It offers direct section editing and a searchable, filtered, paginated offering catalog. The default route is Marketing Strategy. Failed saves retain input, stale revisions require review of current values, and dirty dismissal/archive consequences are explicit.

The existing catalog and workspace-scoped Vault/history tables are reused; no migration or data reset was needed. Profile and catalog maintenance make no AI requests. Current readable projections are saved atomically and indexed lazily during retrieval. Historical interactions, posts and campaigns are preserved. Onboarding retains its optional edit route, carries catalog identity/revisions/pricing, preserves fields outside its reduced form, and explicitly clears fields the user empties. No Intelligence behavior is included.

Verification on the feature branch:

- `corepack pnpm verify`: passed, 32/32 tasks; 388 API tests, 48 web unit tests and 58 AI tests. Includes formatting, RTL checks, lint and type checks.
- `corepack pnpm build`: passed, 9/9 tasks, including the production Next.js build.
- Targeted existing presentation-journey browser tests: 2 passed (direct Profile save/failure recovery and optional onboarding edit mode); 8 unrelated journeys excluded by the test-name filter. No screenshots were captured.
- Database-backed tests used loopback `markos_local_test`. The ordinary local database and external environments were not reset or used for automated mutations.
- Final subjective visual review remains with Khalid. No general visual audit, theme screenshot tour or snapshot-baseline regeneration was performed.

The preserved prototype asset repair is a separate commit. Feature publication/deployment is outside this local implementation checkpoint.
