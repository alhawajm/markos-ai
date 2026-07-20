# Pomelli-Inspired Enhancement Milestones

Date: 2026-07-12
Status: PE-M0 through PE-M6 implemented; PE-M7 deferred

This track turns Pomelli-inspired research into MARKOS-native product milestones. It does not replace M0-M6. It extends the existing milestone plan while preserving the build spec: workspace isolation, Vault-first generation, Instagram publishing realities, metering, quotas, bilingual UX, and production-grade tests.

## Principles

- No blank canvas: every generation starts from Vault, catalog, or confirmed user input.
- No silent scraping: website findings require review before becoming business memory.
- No unmetered AI: every token and image generation is counted.
- No publish without preview and approval.
- No cross-workspace leakage.
- Website and ads generation stay deferred until the Instagram loop is stable.

## PE-M0: R&D and Architecture Lock

Goal: Lock what we borrow from Pomelli and how it fits MARKOS.

- [x] Review official Pomelli product sources.
- [x] Map Pomelli capabilities to MARKOS-native features.
- [x] Separate near-term Instagram-first work from deferred website/ads work.
- [x] Document schema, API, AI, UX, and risk implications.
- [x] Create milestone implementation track.
- [ ] Review and approve this track with the product owner.

Gate:

- R&D docs exist.
- No product behavior changed.
- Decisions are recorded in `docs/decisions.md`.

## PE-M1: Business DNA Auto-Ingest

Goal: Let MARKOS learn a business from a website, then save only approved facts into the Knowledge Vault.

Deliverables:

- [x] Website URL ingest API/service.
- [x] Async website ingest job/worker for multi-page or slow-source crawls.
- [x] Extracted facts review screen.
- [x] Approved facts saved to `KnowledgeVault`.
- [x] Embeddings created for approved chunks.
- [x] Local development/test embedding fallback when the AI service is offline.
- [x] Source URL, confidence, and extraction timestamp tracked.
- [x] Audit log entries for ingest preview, approve, and reject.
- [x] Explicit overwrite/merge audit trail for edited review decisions.

Backend/API:

- [x] Add ingest service with public URL guardrails, timeout, size limit, and content-type checks.
- [x] Add extraction DTOs with strict validation.
- [x] Add review/approve/reject endpoints.
- [x] Enforce `workspace_id` on every query.
- [x] Add RLS coverage for website ingest drafts.

AI:

- [x] Add configurable model setting for website extraction.
- [x] Return strict JSON only.
- [x] Auto-retry invalid JSON once through the existing AI gateway.
- [x] Refuse unsupported claims when source evidence is weak.

Web:

- [x] Add Vault Auto-Ingest entry point.
- [x] Add extraction review UI with approve/reject/edit controls.
- [x] Add sparse-context warning and missing-fields prompts.

Tests/Gates:

- [x] Unit tests for extractor mapping.
- [x] Unit tests for development/test embedding fallback and production refusal.
- [x] Workspace isolation tests.
- [x] RLS coverage tests.
- [x] API route tests for preview, approve, reject, blocked URL, and cross-workspace access.
- [x] Web typecheck, lint, API client typecheck, and production build smoke pass.
- [x] API E2E: ingest URL, approve facts, and retrieve approved facts through Vault RAG with local embedding fallback.
- [x] Browser E2E: review facts in the Vault UI, approve facts, and see the Vault update.

## PE-M2: Product and Offer Catalog

Goal: Give campaigns structured commercial context instead of relying on prompt text.

Deliverables:

- [x] Product CRUD.
- [x] Offer CRUD.
- [x] Product media attachments.
- [x] Catalog-to-Vault summary sync.
- [x] Catalog retrieval during strategy and content generation.

Backend/API:

- [x] Add `Product` and `Offer` models.
- [x] Add workspace-scoped API endpoints.
- [x] Add product/offer search and status filters.
- [x] Add migration.
- [x] Add seed fixtures.

AI:

- [x] Include selected product/offer in generation context.
- [x] Generate campaign angles from product benefits, audience, and Vault facts.
- [x] Reject missing price/claims unless supplied or approved.

Web:

- [x] Add catalog screen or Vault module.
- [x] Add product picker to Campaign Builder and Content Studio.
- [x] Add offer badges and validity dates in campaign flows.

Tests/Gates:

- [x] Workspace isolation tests for products and offers.
- [x] CRUD API tests.
- [x] API generation tests prove catalog context reaches strategy/content prompts.
- [x] API generation rejects selected catalog records from another workspace.
- [x] E2E: create product, create offer, generate campaign from offer.

## PE-M3: AI Visual Studio

Goal: Generate brand-aware, product-aware visual assets with review, quota, and media lineage.

Deliverables:

- [x] Product image upload or media selection via existing media assets and source media IDs.
- [x] Visual mode selector API contract.
- [x] AI image generation request.
- [x] Generated media variants saved to `MediaAsset`.
- [x] Review state before use in content.
- [x] Quota and usage metering for every generation.

Backend/API:

- [x] Add generated media metadata fields or related variant model.
- [x] Track prompt, source asset IDs, generation model, dimensions, and quality status.
- [x] Enforce image quota and plan limits.
- [x] Add list, generate, approve, reject, and attach-to-content endpoints.
- [x] Block generic content-media attachment for unapproved generated variants.

AI:

- [x] Brand-safe visual prompt builder.
- [x] Negative prompt and quality guardrails.
- [x] Configurable image model.
- [x] Generate platform-specific variants.

Web:

- [x] Add Visual Studio panel.
- [x] Add image variant gallery.
- [x] Add approve, reject, generate, IG set, and use-in-draft actions.

Tests/Gates:

- [x] Quota tests.
- [x] Media lineage tests.
- [x] API E2E: generate image variant, approve it, attach it to content.
- [x] Browser E2E: generate image variant from the Visual Studio UI and use it in content.

## PE-M4: Campaign Workbench 2.0

Goal: Turn campaign generation into a complete production workflow.

Deliverables:

- [x] Campaign brief builder.
- [x] AI campaign angle suggestions.
- [x] Generated campaign package.
- [x] Editable asset list.
- [x] Approval states.
- [x] Schedule handoff into publishing queue.

Backend/API:

- [x] Extend `Campaign` with structured brief, linked products/offers, status, package JSON, and rationale.
- [x] Add campaign package list/generate/approve/schedule endpoints.
- [x] Add campaign item review actions.
- [x] Persist rejected ideas as feedback.

AI:

- [x] Strategy agent proposes angles from Vault and catalog.
- [x] Content agent creates post, carousel, story, and reel concepts.
- [x] Scheduling agent proposes times and rationale.
- [x] Runtime validation rejects malformed campaign package output before persistence.

Web:

- [x] Add campaign workbench flow.
- [x] Add generated package review screen.
- [x] Add inline edit, rework feedback, approval, and one-click move to calendar.

Tests/Gates:

- [x] Campaign package runtime schema validation.
- [x] State transition tests.
- [x] API E2E: brief, generate package, edit asset, approve package, schedule package.
- [x] Browser E2E: generate/edit/approve/schedule from the Campaign Builder UI.

## PE-M5: Brand Kit and Brand Book

Goal: Make MARKOS business memory visible and exportable.

Deliverables:

- [x] Brand Kit screen sourced from approved Vault entries.
- [x] Tone rules and examples.
- [x] Visual rules and approved assets.
- [x] Versioned brand book export.
- [x] Audit log for exports.

Backend/API:

- [x] Add brand book export record.
- [x] Add versioning for generated brand kits.
- [x] Add export endpoint.

AI:

- [x] Generate brand book draft from approved Vault only.
- [x] Include confidence and missing-data notes.
- [x] Avoid inventing unsupported brand claims.

Web:

- [x] Add Brand Kit module.
- [x] Add preview and export actions.
- [x] Add incomplete Vault warning.

Tests/Gates:

- [x] Export API tests.
- [x] Vault source-only generation tests.
- [x] E2E: update Vault, generate brand book, export version.

## PE-M6: Visual QA and Learning Loop

Goal: Make visual output improve from approvals, rejections, and Instagram performance.

Deliverables:

- [x] Asset approval/rejection reasons.
- [x] AI output scoring metadata.
- [x] Performance feedback into `AiInteraction` and Vault exemplars.
- [x] Dashboard insight showing what visual patterns are working.

Backend/API:

- [x] Add feedback capture to generated assets.
- [x] Link content performance back to campaign and source assets.
- [x] Add learning-loop worker.

AI:

- [x] Retrieval includes approved high-performing examples.
- [x] Generation avoids rejected visual/copy patterns.
- [x] Analytics agent summarizes winning creative patterns.

Web:

- [x] Add feedback controls.
- [x] Add visual learning insights.
- [x] Add performance-linked campaign recommendations.

Tests/Gates:

- [x] Feedback persistence tests.
- [x] Workspace isolation tests.
- [x] E2E: reject asset, regenerate, confirm rejected pattern is not reused in prompt context.

## PE-M7: Optional Website and Ads Handoff

Goal: Add Pomelli-style website/ad asset handoff only after the Instagram loop is stable.

Deliverables:

- [ ] Campaign landing page draft export.
- [ ] Google Ads or Meta Ads draft handoff record.
- [ ] Export pack for agency review.

Gate:

- Instagram live publish path is verified.
- Billing and quotas are enforced.
- Legal and asset-rights review is complete.

Status:

- [ ] Deferred.
