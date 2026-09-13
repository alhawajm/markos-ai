# Business Profile implementation plan

Date: 2026-09-07. Branch: `feat/business-profile`.

Status: scope narrowed by Khalid to manual editing only. Detailed layout and implementation remain proposed. This is a planning checkpoint, not implemented behavior or browser verification.

## Outcome and scope

Make Business Profile the place to read and manually maintain the approved business knowledge used by MARKOS. Onboarding creates the initial profile; ongoing edits happen here. This information rarely changes and can substantially affect AI behavior, particularly for established businesses. Prioritize stability and deliberate owner edits over frequent activity or suggestions.

The first increment contains the profile/catalog editor and its data consistency work only. Do not add a Business Profile assistant, suggestion generation, conversation persistence, or learning-loop behavior. Keep the approved Create checkpoint intact.

The governing principles are simplicity, purposeful contrast, consistency, low cognitive load, user control, and user understanding. Use the interface to prevent unnecessary overlapping work before introducing backend coordination. Retain ordinary server validation, workspace authorization, atomic saves, and a revision check for changes the current browser cannot observe.

## Proposed desktop composition

Use a compact page heading and a wide profile surface. Do not reserve empty space for a future assistant or expose disabled AI controls. Preserve Sunlit tokens, readable type, generous buttons, and visible keyboard focus. The profile initially displays saved information, with clear Edit or Add actions, rather than a page full of active inputs or a prominent completeness percentage.

| Section | Contents |
| --- | --- |
| Business | Name, location, website/socials, overview, story, differentiation, establishment stage |
| Products & services | Offering catalog, descriptions, pricing, availability |
| Audience & market | Customers, needs, competitors, positioning |
| Brand & voice | Tone, languages, colors, writing preferences |
| Marketing strategy | Business goals, priorities, durable marketing strategy |

Use the term **Marketing strategy** in the interface and data descriptions. Select one section at a time. Use contrast to identify the current section, primary action, saved information, and unsaved edits. Color must be accompanied by text or an icon. Routine success feedback is a short-lived overlay that does not move the page. Errors remain beside the relevant action with a recovery route.

## Editing and confirmation rules

- Open a focused modal for a coherent section or one offering, rather than a separate popup for every field. The surrounding page remains readable but inactive. Use the same field, footer, and button patterns throughout.
- Allow one editing modal at a time in this page. Save submits once and blocks repeat submission while pending. A successful save updates the displayed record and closes the modal; a failed save keeps the entered values and modal open.
- Cancel closes a clean modal immediately. If there are edits, offer Keep editing or Discard changes. Use the same guard for Escape, backdrop dismissal, section changes, and application navigation. Reload uses the browser warning where available; it is not a guaranteed persistence mechanism.
- Save is already an explicit decision. Do not add an extra confirmation to routine saves. Reserve confirmation for discarding work, archiving an offering, and other actions with a meaningful consequence. Prefer a confirmation state in the existing dialog to stacked modals.
- State concrete consequences. Example archive wording: "MARKOS will stop suggesting this offering in new content. Existing posts and campaigns will stay as they are."
- An edit carries the version it opened. If another tab or user has saved newer data, the API rejects the stale save and the modal retains the unsaved text. Explain the conflict and provide a deliberate route to load the latest values. Do not silently merge, overwrite, or add an Undo system.

## Products and services at larger sizes

Use a compact list/table with name, type, price, status, and one Edit action. Provide search, Product/Service filtering, status filtering, and pagination. Keep long descriptions and secondary fields inside the offering modal. Avoid editable table cells, expanded forms on every row, and bulk actions in the first pass.

Add offering opens the same modal empty. Edit opens it with saved values. Renames use the existing offering ID. Paused means temporarily unavailable; archived means retired from the normal active catalog. Both remain inspectable through status filters and are excluded from new offering suggestions. Archiving preserves history and does not rewrite existing content.

Support the catalog's existing price types: unspecified, fixed, starting from, range, and quotation. Only reveal the amount fields needed for the selected type. Keep optional category and localized names secondary. English and Arabic names belong to the same offering; price, currency, availability, and identity are shared facts. Do not require duplicate entry of the same fact in both languages.

## Business truth and save consistency

Keep manual Save independent of generative AI availability. Save the exact owner-reviewed values and preserve the draft on failure. Do not invoke AI to reinterpret facts, regenerate the whole profile, or translate fields as a side effect of saving.

Use a dedicated versioned Business Profile as the authoritative profile record, retaining the existing canonical Offering Catalog separately. AI interaction records remain history; Vault entries are derived retrieval representations. Onboarding, profile editing, Campaign generation, and Create must share this ownership model. A generated summary must not remain active grounding after its underlying facts change unless it has been brought up to date. Saved business changes must remain recoverable if retrieval projection fails, and outdated projections must not be used silently.

Plan migrations only for profile identity/revisions and any missing manual field storage, plus ID-based offering update contracts. No Business Profile conversation tables, AI write endpoints, or suggestion jobs belong to this increment. Do not introduce a second offering store or restructure Create conversations. Existing campaigns and content retain their saved text and state. Later generation uses current approved knowledge; learning ingestion remains deferred.

## Establishment stage

Add an owner-reported establishment-stage field to Onboarding's Business basics and the Business Profile Business editor, using the same stored value. This describes how established the business is; it is not company size, a model-inferred maturity score, or a measure of marketing competence.

Proposed simple choices for prototype review: Preparing to launch, Newly operating, Established. Permit an unspecified value without blocking onboarding or existing profiles, and let the owner update it manually. Exact labels remain a UI proposal. Store this context now; do not implement suggestion timing, evidence thresholds, or behavior-changing prompt logic in the manual-editing increment.

## Future learning-loop boundary — deferred implementation

General business facts are owner-only: name, location, website/social accounts, offerings and prices, business story, establishment stage, brand assets, and other factual information. Future Business Profile AI must not propose or apply edits to these fields. An AI-assisted correction request must direct the owner to the appropriate manual editor. Existing onboarding document extraction remains a separate owner-reviewed intake workflow; it does not grant an ongoing profile assistant permission to change facts.

Only an explicit field-level allowlist of marketing information may receive future AI change proposals: marketing strategy, tone, writing preferences, business goals, and other marketing fields separately approved for that purpose. Section placement alone does not grant AI permission; a Brand & voice section can contain both protected brand facts and eligible tone preferences. Enforce the eventual restriction in application code as well as the prompt.

Even eligible proposals require relevant real performance insights, an understandable explanation, and a credible material benefit. Missing, weak, or inconclusive evidence should produce no change proposal. Do not manufacture activity, periodic rewrites, or a claim that a proposed change will certainly improve results. The owner reviews eligible changes before Save; neither chat nor performance ingestion may apply them automatically.

Establishment stage should inform how often MARKOS offers suggestions or challenges an existing marketing decision, with a more conservative posture for established businesses. It does not grant permission to change facts, lower the evidence requirement for newer businesses, or substitute for observed performance. Frequency, evidence sufficiency, dismissal behavior, and learning-loop mechanics need a later focused decision.

## Delivery and acceptance

1. Review a desktop prototype of a populated section, an incomplete section, the offering list/modal, establishment-stage field, and save/discard/error states. Confirm the layout before runtime implementation.
2. Implement canonical profile/catalog reads and manual saves, including the onboarding handoff, establishment-stage persistence, and retrieval consistency.
3. Verify refresh persistence, offering rename identity, archive consequences, failure recovery, stale-save rejection, workspace isolation, and updated context reaching Campaign/Create. Verify that ordinary saves make no generative AI request. Use focused automated checks and browser-visible English/Arabic validation.

Dedicated mobile composition follows the desktop checkpoint; retain accessible dialog behavior and avoid choices that require hover or an oversized editing grid. Media generation remains in Create. Business Profile AI, suggestion frequency, learning, quotas, bulk catalog operations, inventory/checkout, and a history restoration UI are outside this pass. Database resets, hosted deployments, and live provider verification are separate execution steps.

## Prototype checkpoint — 2026-09-07

The [interactive desktop draft](prototypes/business-profile.html) is available for Khalid's visual review. Start it with `node scripts/business-profile-preview.mjs`; [preview instructions](prototypes/README.md#business-profile-draft) describe its sample states. It uses the runtime Sunlit stylesheet and Lucide artwork, with an isolated HTML/JavaScript implementation rather than mounted application components.

The draft demonstrates all five profile sections, establishment-stage editing, focused modals, catalog search/filter/pagination, offering pricing and status, archive/discard confirmation, and simulated save failure/conflict recovery. Browser checks cover English/Arabic at the three agreed desktop sizes, including forward/backward keyboard focus within the modal. Native dialog focus briefly moved to the document at wraparound during review; explicit boundary cycling was added and rechecked.

All data is fictional and resets on refresh. This does not implement Onboarding capture, profile database migrations, actual concurrency protection, retrieval updates, hosted changes, or AI. Responsive fallbacks exist, but the separate mobile design pass remains outstanding. Visual approval of this candidate is still pending.
