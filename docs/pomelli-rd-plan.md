# Pomelli R&D Plan for MARKOS

Date: 2026-07-12
Status: R&D ready for implementation planning

## Purpose

Pomelli validates that SMB marketing teams want a fast path from business identity to usable creative. MARKOS should not copy Pomelli feature-for-feature. MARKOS should absorb the strongest patterns into the existing Instagram-first operating system: Vault, RAG, campaign generation, approvals, scheduling, publishing, analytics, and learning.

## Source Inventory

Official sources reviewed:

- Google Labs Pomelli about page: `https://labs.google.com/pomelli/about/`
- Google launch blog: `https://blog.google/innovation-and-ai/models-and-research/google-labs/pomelli/`
- Google Labs Help, About Pomelli: `https://support.google.com/labs/answer/16715058?hl=en`
- Google Labs Help, using and sharing Pomelli assets: `https://support.google.com/labs/answer/17105309?hl=en`
- Google Labs Terms: `https://labs.google/terms`

## What Pomelli Does Well

1. Business DNA from a website
   Pomelli starts with a business URL, then extracts brand signals such as site copy, visuals, colors, and style cues. The value is that the user does not face a blank canvas.

2. Campaign idea generation
   Pomelli proposes campaign directions after it understands the business. This turns brand context into concrete marketing angles instead of asking the user to write a perfect prompt.

3. Editable creative assets
   Pomelli generates assets that users can edit, rather than treating AI output as final. This matches a real marketing workflow where review and revision matter.

4. Multi-format output
   Pomelli supports social, ads, webpages, brand books, and photoshoot-style creative. The lesson for MARKOS is not to add every channel immediately, but to create reusable campaign assets that can be adapted to multiple surfaces.

5. Visual brand continuity
   Pomelli emphasizes on-brand visuals. MARKOS currently has the stronger operating loop, but Pomelli points to a better visual layer: product-aware imagery, brand book output, and creative previews.

6. Connected-app handoff
   Pomelli can export or share assets to connected destinations. MARKOS should treat this as an export and publishing workflow, not just a download button.

## MARKOS Advantage

MARKOS should stay differentiated in these areas:

- Instagram-first execution, not generic creative generation.
- Bahrain SMB focus, Arabic and English support, RTL UX, and BHD pricing.
- Workspace isolation and production-grade tenant boundaries.
- Knowledge Vault and RAG grounded generation.
- Approval, scheduling, publishing, analytics, and learning loop.
- Metering, quotas, billing readiness, and audit logs.
- Agency/client workflow potential.

Pomelli is an inspiration source for visual quality and onboarding velocity. MARKOS remains the operating system that can actually manage the marketing loop.

## Feature Decisions

| Pomelli pattern | MARKOS implementation | Milestone fit | Decision |
| --- | --- | --- | --- |
| Business DNA | Vault Auto-Ingest from website plus user review | M1 extension | Build |
| Catalog | Product and offer catalog linked to Vault | M1/M2 bridge | Build |
| Photoshoots | AI Visual Studio with product-aware generated media | M2 extension | Build after quota/metering hooks |
| Campaign ideas | Campaign Workbench with brief ideas and generated asset set | M2/M3 bridge | Build |
| Brand books | Versioned Brand Kit export from Vault | M2/M6 bridge | Build |
| Share assets | Export packs and provider handoff records | M3/M6 bridge | Build |
| Websites | Campaign microsite drafts | Post-M6/M7 | Defer |
| Ads launch | Meta/Google ad handoff | Post-M6/M7 | Defer until publish loop is stable |

## Proposed System Additions

### Business DNA Auto-Ingest

Inputs:

- Business website URL
- Optional social profile URL
- Optional logo, product, or storefront imagery
- Optional user notes

Flow:

1. Fetch allowed public website pages.
2. Extract candidate facts, tone, categories, product/service hints, proof points, and visual cues.
3. Present extracted findings for user confirmation.
4. Save approved facts into `KnowledgeVault`.
5. Chunk and embed approved entries for RAG.
6. Record source URL, extraction timestamp, and confidence.

Guardrails:

- Do not silently save extracted facts without user review.
- Respect workspace isolation on every record.
- Treat website imagery as brand reference unless the user confirms reuse rights.
- Add audit log entries for ingest, approval, and overwrite events.

### Product and Offer Catalog

Purpose:

The content engine needs structured commercial context. A campaign for a product launch, discount, service package, or seasonal offer should come from a catalog item instead of loose prompt text.

Suggested model:

- `Product`
  - `id`
  - `workspace_id`
  - `name`
  - `description`
  - `category`
  - `price_minor`
  - `currency`
  - `url`
  - `status`
  - `source`
  - `created_at`
  - `updated_at`

- `Offer`
  - `id`
  - `workspace_id`
  - `product_id`
  - `name`
  - `description`
  - `starts_at`
  - `ends_at`
  - `price_minor`
  - `currency`
  - `terms`
  - `status`

Notes:

- Link products and offers to media assets.
- Store approved catalog summaries in the Vault.
- Retrieve catalog context during strategy, campaign, and content generation.

### AI Visual Studio

Purpose:

Turn the existing media library and AI image generation into a controlled production workflow.

Capabilities:

- Upload product image or select catalog item.
- Choose visual mode: studio, lifestyle, social post background, story background, carousel frame.
- Generate platform-safe image variants.
- Save variants as `MediaAsset` records with source metadata.
- Meter every generation as `AI_IMAGE`.
- Require review before use in scheduled content.

Quality checks:

- Correct aspect ratio.
- No distorted logos.
- No unreadable embedded text.
- No unwanted people/faces unless explicitly requested.
- Brand color/tone alignment.
- Arabic text handling requires explicit layout review.

### Campaign Workbench 2.0

Purpose:

Make campaigns real production objects, not just generated rows.

Flow:

1. Select goal.
2. Select product, offer, and audience.
3. MARKOS proposes campaign angles.
4. User selects or edits an angle.
5. MARKOS generates a campaign package:
   - campaign brief
   - post and caption set
   - carousel, story, and reel concepts
   - suggested schedule
   - expected reach and engagement rationale
6. User approves or edits items.
7. Approved items move into content calendar and publishing queue.

Needed changes:

- Extend campaign schema with structured brief, target audience, linked products/offers, generated rationale, and status.
- Add campaign package API.
- Add review states for generated assets.
- Persist rejected ideas as feedback for the learning loop.

### Brand Kit and Brand Book

Purpose:

Give users and agencies a concrete artifact that represents what MARKOS has learned.

Capabilities:

- Brand summary from Vault.
- Tone rules.
- Visual rules.
- Approved colors, fonts, logo usage notes, and content examples.
- Export as PDF or shareable web view.

Guardrails:

- Brand book is generated from approved Vault data only.
- Version each export.
- Record who exported it and when.

### Export and Connected-App Handoff

Purpose:

Support asset movement without pretending every platform integration is complete.

Capabilities:

- Download campaign pack.
- Export image and caption bundle.
- Create handoff records for future Google Ads or Meta Ads.
- Keep Instagram publishing path separate and production-grade.

## Deferred Scope

These are useful, but should not interrupt the current Instagram-first product path:

- Full website or microsite builder.
- Google Ads campaign creation.
- TikTok support.
- Video production beyond structured reel concepts and future media generation hooks.

## Risks and Guardrails

1. Cost risk
   Visual generation can become expensive fast. Every image and token must be metered before broad rollout.

2. Legal and rights risk
   Business websites may include assets the user cannot reuse elsewhere. MARKOS must distinguish reference, source, and approved reusable assets.

3. Brand safety risk
   AI visuals can drift from brand identity. Use review states and reject-to-learn feedback.

4. Platform mismatch risk
   Instagram assets must be generated for real aspect ratios, captions, media constraints, and publishing states.

5. Generic output risk
   If the Vault is sparse, MARKOS should ask for missing context or use a safe template instead of inventing brand claims.

6. Arabic quality risk
   Arabic layout and typography need explicit QA. Avoid image text generation in Arabic unless the design path can be reviewed.

## Implementation Readiness

R&D is ready when:

- Official Pomelli capabilities are mapped to MARKOS-native features.
- Deferred features are clearly separated from near-term work.
- Every new feature has a Vault, media, campaign, quota, and review-state position.
- Implementation milestones exist with gates and test expectations.

This document completes the R&D framing. The implementation checklist is tracked in `docs/pomelli-enhancement-milestones.md`.
