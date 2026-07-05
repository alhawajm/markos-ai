# MARKOS AI Final UI Implementation Checklist

Source of truth:
- Product behavior: `docs/source/MARKOS_BUILD_SPEC. 2.pdf`
- Experience and behavioral flows: `docs/source/MARKOS_EXPERIENCE_FLOWS.md`
- Final design export: `C:\Users\mohamed.yusuf\Downloads\AI-Powered Marketing OS MVP`
- Target implementation: `apps/web/app/[locale]`

This checklist supersedes the previous Figma parity tracker for frontend design execution. Use the exported Figma code as visual reference, but port it into the existing Next.js app deliberately: preserve workspace isolation, bilingual/RTL behavior, API contracts, metering, and production states.

Legend:
- `[x]` Done and verified
- `[ ]` Not done, partial, or not yet proven

## Current Snapshot

- Active UI direction: final "AI Marketing Command Center" look from `AI-Powered Marketing OS MVP`
- Primary visual system: luxury dark command center, glass panels, 80px icon sidebar, turquoise/gold/amber accents, Inter typography
- Superseded visual references: previous white/red dashboard and the older `Design AI Marketing Platform` export
- Key implementation risk: final export mixes `luxury-*` and older `quantum-*` token names; normalize before porting screens
- Source inventory: `docs/final-ui-source-inventory.md`
- Execution rule: implement by milestone, verify each milestone, then tick items here
- Latest evidence: `evidence/ui/2026-06-18`
- Latest responsive evidence: desktop/tablet harness screenshots plus true 390px mobile CDP capture at `evidence/ui/2026-06-18/dashboard-en-mobile-cdp.png`
- Latest verification: `corepack pnpm --filter web typecheck`, `corepack pnpm --filter web lint`, `corepack pnpm --filter web build`
- Latest functional auth smoke: public `/en` and `/en/login` return 200; API register -> email verification -> login -> authenticated onboarding read passed; browser signup and login pass with stored app sessions via `corepack pnpm local:auth-smoke`.

## UI-M0: Source Lock And Design Inventory

- [x] Record final export path and Figma URL in the active UI docs.
- [x] Map every wired route from `src/app/App.tsx` to the target Next.js route.
- [x] Classify components as `final`, `legacy-reference`, or `unused`.
- [x] Extract typography, spacing, radius, glass, shadow, animation, and color tokens.
- [x] Identify every unresolved token mismatch, especially `quantum-*` versus `luxury-*`.
- [x] Define target route names and product labels for the command-center navigation.
- [x] Capture source screenshots from the export for desktop, tablet, and mobile reference.
- [x] Update `docs/ui-functionality-checklist.md` to point at this final checklist.

Acceptance gate:
- [x] Final UI source is documented, route/component inventory exists, and no old Figma export is treated as active.

## UI-M1: Global Design System And Tokens

- [x] Port final font stack: Inter body and display typography.
- [x] Replace previous light dashboard tokens with final luxury command-center tokens.
- [x] Add stable semantic tokens for background, panels, foreground, muted text, turquoise, gold, amber, success, warning, error, and info.
- [x] Implement glass utility classes without relying on Vite-only Tailwind v4 behavior.
- [x] Normalize all final source references from `quantum-*` into approved final tokens or explicitly keep both token families if needed.
- [x] Define page max widths, sidebar width, content gutters, card radius, icon tile sizes, and animation timings.
- [x] Add reduced-motion fallbacks for ambient movement and pulsing effects.
- [x] Keep Arabic/RTL support in the global layout from the first pass.

Acceptance gate:
- [x] `corepack pnpm --filter web typecheck`
- [x] `corepack pnpm --filter web lint`
- [x] Desktop `/en` renders with the final dark background, fonts, and token system.

## UI-M2: App Shell And Navigation

- [x] Replace the old wide sidebar with the final 80px glass icon sidebar.
- [x] Add active route indicator, gradient icon state, hover tooltip, and notification dot.
- [x] Add final command-center route set: Command Center, Daily Briefing, Opportunities, Campaign Builder, Content Studio, Analytics, Knowledge Vault, Settings.
- [x] Preserve accessible labels for icon-only navigation.
- [x] Define mobile and tablet navigation behavior without visual overlap.
- [x] Add profile/account affordance matching the export.
- [x] Add an opaque profile dropdown menu with routed account/settings actions.
- [x] Remove duplicate leftover sidebar icon after the real navigation list.
- [x] Restore Figma-style sidebar hover labels at normal desktop widths.
- [x] Keep existing locale routing and language switching available.

Acceptance gate:
- [x] All sidebar routes are clickable.
- [x] Active states match the final export.
- [x] Desktop and mobile screenshots pass visual sanity checks; Edge mobile screenshot harness has a known CSS viewport mismatch to keep in mind.

## UI-M3: Auth And Onboarding Journey

- [x] Add a public landing page before the authenticated dashboard.
- [x] Port the final login/signup portal surface into the existing auth flow.
- [x] Store the real `AuthSession` contract used by the app shell.
- [x] Gate the authenticated app under `/{locale}/app` and redirect missing/invalid sessions to `/{locale}/login`.
- [x] Redirect legacy section routes into the canonical authenticated app route.
- [x] Prevent pre-hydration auth form submits/typing from clearing controlled inputs.
- [x] Verify register -> email verification -> login -> authenticated workspace endpoint against the local API.
- [ ] Implement final onboarding entry route with immersive command-center styling.
- [ ] Decide whether to use the wired 8-screen friendly onboarding flow or the unused `Future*` command-center onboarding variants.
- [ ] Build the chosen onboarding path with progress, back/continue, validation, completion, and skip rules from experience flows.
- [ ] Persist onboarding answers to workspace business memory/Vault APIs.
- [ ] Include loading, failure, retry, and partial-completion recovery states.
- [ ] Route completed onboarding into the final Command Center.
- [ ] Verify Arabic copy and RTL form layout.

Acceptance gate:
- [ ] A new workspace can move from onboarding start to dashboard without dead ends.
- [ ] Onboarding writes retrievable business memory.
- [ ] Screenshots captured for English and Arabic.
- [x] Auth portal creates and verifies a real local workspace session.

## UI-M4: AI Command Center Dashboard

- [x] Port `AICommandCenter` as the new dashboard/home route.
- [x] Replace hard-coded names, currency, date/time, KPI values, and mission text with workspace/API-backed data or explicit empty states.
- [x] Implement AI CMO greeting, priority mission, growth/best-time/revenue cards, content-ready carousel, and floating assistant.
- [x] Ensure all CTAs route to real flows or perform visible local actions: campaign builder, opportunities, content studio, schedule, analytics, settings, and AI assistant.
- [x] Match Content Ready cards to the final Figma composition with four distinct artwork previews and desktop 4-up layout.
- [x] Add empty, loading, API-error, low-data, and Vault-gap states for the command center.
- [ ] Add no-Instagram, quota-warning, and quota-blocked states to the command center.
- [ ] Keep money formatting in integer minor units and ISO-4217 semantics.
- [ ] Add Arabic/RTL versions for labels, metric formatting, and layout direction.

Acceptance gate:
- [x] Dashboard has no hard-coded customer identity in production mode.
- [x] Every visible CTA performs a route/action.
- [x] Visual screenshots match final export scale and density for the implemented command-center dashboard.

## UI-M5: Daily Briefing And Opportunities

- [x] Port `DailyBriefing` with executive summary, 24-hour highlights, metrics, strategic insights, and recommended timeline.
- [x] Port `ContentOpportunities` with confidence scores, projected impact, why-it-works reasoning, tags, and generation CTAs.
- [ ] Wire insights to analytics, content, strategy, and Vault grounding data where available.
- [ ] Add source/context indicators for AI-generated recommendations.
- [ ] Add stale-data, no-data, disconnected-channel, and refresh states.
- [ ] Keep user-facing copy plain and action-oriented.

Acceptance gate:
- [ ] Briefing and Opportunities render from real or clearly marked fixture data.
- [ ] AI recommendations show grounding/source context.
- [x] Relevant CTAs create or route to content/campaign workflows.

## UI-M6: Campaign Builder

- [x] Port `AICampaignBuilder` into a production campaign creation route.
- [x] Implement the 3-step flow: goal, AI generation, launch/schedule.
- [x] Use real campaign inputs through a workspace-backed campaign brief.
- [x] Generate content plans through the backend content APIs.
- [ ] Enforce token/image quotas and show warning/blocking states.
- [x] Save generated plans to workspace scope as content drafts.
- [x] Route approved content into the publishing queue by scheduling through the API.
- [ ] Add retry and partial-save behavior for generation failures.

Acceptance gate:
- [x] Campaign builder can create persisted campaign content drafts.
- [ ] Generated assets are metered.
- [x] Approved items appear in queue/schedule after scheduling.

## UI-M7: Content Studio

- [x] Port `AIContentStudio` with split creation panel and live Instagram preview.
- [x] Replace `quantum-*` references with final tokens or shared aliases before implementation.
- [x] Implement content type selection for post, reel, carousel, and story.
- [x] Wire prompt, content type, caption rewrite, hashtag suggestions, best time, generation feedback, and schedule actions at UI state/route level.
- [x] Keep preview behavior realistic for Instagram formats and publishing constraints.
- [x] Support accept/regenerate/edit/share/copy flows.
- [x] Enforce approval before publish/schedule.
- [ ] Add media library and upload handoff states.

Acceptance gate:
- [x] A user can generate, edit, accept, and schedule a content draft through the workspace API.
- [x] Preview updates from current form state.
- [ ] Instagram-readiness blocks work before live publish.
- [x] Quota and Vault-gap API blocks surface as user-visible messages.

## UI-M8: Operational Modules

- [x] Re-skin Analytics to match final command-center glass system.
- [x] Re-skin Knowledge Vault while preserving module completeness, gaps, source history, and RAG grounding.
- [ ] Re-skin Strategy while preserving 30/60/90 planning, pillars, refresh/export, and source context.
- [x] Re-skin Settings with account, workspace, billing, language, security, and channels.
- [ ] Decide whether Publishing Queue remains a primary route or is reached from Campaign/Content flows.
- [ ] Decide whether AI Consultant remains separate or becomes the floating assistant plus a full chat route.
- [ ] Keep admin/operations screens dense enough for real use while using the final token system.

Acceptance gate:
- [ ] All existing functional modules remain reachable.
- [ ] No module loses API-backed behavior during visual migration.
- [ ] Arabic/RTL screenshots pass for core modules.

## UI-M9: Responsive, Accessibility, And State QA

- [x] Verify desktop at 1440px and 1920px.
- [x] Verify tablet around 1024px.
- [x] Verify mobile around 390px.
- [ ] Verify keyboard navigation for sidebar, modals, forms, and AI assistant.
- [ ] Verify focus states, accessible names, contrast, and reduced-motion behavior.
- [x] Verify all text fits containers without overlap.
- [ ] Verify Arabic/RTL layout for dashboard, onboarding, content studio, and settings.
- [ ] Capture quota, Vault-gap, Instagram-disconnected, publish-failed, and analytics-no-data states.

Acceptance gate:
- [ ] `corepack pnpm rtl:qa`
- [ ] `corepack pnpm ui:screenshots`
- [x] Manual visual review evidence is updated.
- [x] Confirmed true mobile viewport has no horizontal overflow: `innerWidth`, `documentElement.scrollWidth`, and `body.scrollWidth` all equal `390`.

## UI-M10: Final Evidence And Lockdown

- [x] Run `corepack pnpm --filter web typecheck`.
- [x] Run `corepack pnpm --filter web lint`.
- [ ] Run `corepack pnpm verify`.
- [x] Run `corepack pnpm --filter web build`.
- [x] Run local public route smoke for `/en` and `/en/login`.
- [x] Run local auth API smoke for register, verification, login, and authenticated onboarding read.
- [x] Run local browser auth smoke for signup -> onboarding and login -> app session routing.
- [x] Update UI evidence docs with screenshots and notes.
- [x] Update milestone checklist with completed frontend milestone impact.
- [ ] Record any remaining product/design decisions in `docs/decisions.md`.
- [ ] Leave user-attention items open until the implementation work is otherwise complete.

Acceptance gate:
- [ ] Final design implementation is reproducible from docs, verified by commands, and ready for user review.

## Open Decisions To Keep Visible

- [ ] Confirm whether the final brand should use only luxury turquoise/gold/amber or retain selected purple/pink quantum accents for auth/onboarding.
- [ ] Confirm whether onboarding should be the friendly 8-screen flow currently wired, or the darker unused `Future*` command-center flow.
- [ ] Confirm whether the app shell should stay icon-only on desktop or reveal labels on hover/expanded mode.
- [ ] Confirm final production customer examples: Zain Arabia/Ahmed/Maryam must be fixtures only, not hard-coded production identity.
- [ ] Confirm which older modules remain top-level after the command-center redesign.
