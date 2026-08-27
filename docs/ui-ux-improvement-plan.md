# MARKOS UI/UX Improvement Plan

- Status: interpreted working backlog
- Started: 2026-08-23
- Current focus: freeze the accepted Calendar desktop baseline, then review the shared shell, palette, and typography before focused Create discovery and prototyping

This document records the product team's interpretation of the August 2026 review and subsequent discussion. It is not a transcription of stakeholder feedback. Suggestions remain challengeable and do not override the build specification, experience flows, or durable decisions.

Accepted UI-specific decisions belong in docs/ui-ux-decisions.md. Product behavior and data-contract decisions belong in docs/decisions.md. This file keeps the design problems, proposed directions, and validation questions visible while they are being explored.

## Decision states

- Accepted direction — the problem and intended outcome are clear; visual details may still need review.
- Prototype — create and compare a concrete interaction before implementation.
- Product decision — behavior or data contracts must be resolved first.
- Later — valid work outside the current UI pass.

## Cross-product foundation

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| Internal or implementation-oriented labels leak into the interface | Run a plain-language naming pass. Prefer the user's object or task, such as Workspace, Create, Calendar, and Business Profile. | Accepted direction |
| The shell and individual pages can repeat navigation, title, or explanatory chrome | Give each page one authoritative heading. Keep global context compact and remove duplicate top bars or oversized introductions. | Accepted direction |
| Earlier UI documents still describe dark backgrounds and retired routes | Sunlit is the only active customer-facing visual direction. Preserve useful behavior and QA guidance, then archive the old documents. | Accepted direction |
| UI work previously began from vague requests without a shared visual target | Use annotated references and a visually reviewed prototype for consequential layout or journey changes. | Accepted direction |
| English-first composition can break in Arabic | Design and review English and Arabic together, including reading order, control direction, copy expansion, and locale formatting. | Accepted direction |
| The current Sunlit palette was selected before enough product-wide color-system research | Revisit brand, neutral, surface, action, semantic-status, data-visualization, focus, and disabled colors as one accessible token system. Compare a small number of researched directions in representative dense and quiet screens before changing runtime tokens. | Prototype |
| The current typography has not been evaluated as a bilingual product system | Review type families, Arabic/Latin pairing, numerals, weights, scale, density, licensing, loading, and fallback behavior. Test candidates in real MARKOS controls and content rather than approving a font from isolated specimens. | Prototype |

## Onboarding

The goal is to reduce effort and perceived length without weakening the business context required to ground Strategy and content.

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| Vision and mission should be explicit while value proposition should not block completion | Clarify the Story contract and required-field rules. Keep optional business language optional rather than manufacturing it during profile resolution. | Product decision |
| Product or service entry is repetitive for businesses with an existing catalogue | Add document-assisted import that extracts candidate products or services into a review table. Nothing becomes business truth until the user confirms it; manual entry remains available. | Prototype |
| Seven modules feel like more work than the user expects | Reduce perceived effort through progressive disclosure, sensible grouping, saved progress, clear time expectations, and conditional questions. Do not simply delete grounding data. | Prototype |
| Tone presets alone are restrictive, while free text alone is demanding | Use a searchable multi-select or combobox with suggested tone traits, custom entries, examples, and a concise live summary. | Prototype |
| Brand color entry needs to represent real brand systems | Support accessible color picking plus validated hex entry. Explore ordered color stops or a simple gradient definition without forcing gradients on every brand. | Prototype |
| Brand font entry is unclear and hard to validate | Explore a searchable font control with live preview, custom family entry, and explicit fallback behavior. File upload or licensed font hosting remains a separate decision. | Prototype |

## Overview

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| The page should communicate the next useful task instead of exposing system terminology | Reframe cards and actions around current workspace state, upcoming content, required attention, and the next decision. | Accepted direction |
| Duplicate shell and page chrome consumes the first viewport | Keep one page-owned heading, remove the redundant authenticated desktop header, and place locale/account controls in Settings. Retain a compact header only where the desktop sidebar is unavailable. | Accepted direction |
| Decorative or duplicated metrics can crowd out work | Keep only data backed by the workspace and tied to a useful action. Use honest empty states instead of placeholder success. | Accepted direction |

## Strategy

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| Raw day counts are not the easiest planning language | Keep the current 30, 60, and 90-day API contract until changed deliberately. Prototype human-readable duration labels and decide separately whether a custom duration is worth the contract and quota complexity. | Product decision |
| Long strategies are difficult to scan | Keep a compact strategy overview, then let the user select a week from a dropdown or adjacent controls and read that week's goals and day-level actions. | Prototype |
| The structure should scale beyond exactly four weeks | Generate navigation from the actual strategy duration and sections rather than hard-coding Week 1 through Week 4. | Accepted direction |

## Create

The already accepted Create information architecture remains: an action hub first, followed by a focused Draft Editor after a blank or AI-assisted draft is created or selected.

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| Media is central to an Instagram post but appears too late in the editing flow | Prototype media selection, upload, and generation before the longer caption and hashtag controls while preserving easy movement between sections. | Prototype |
| The preview should be useful during editing and easy to demonstrate | Use a follower-style Instagram post preview without decorative phone hardware. Match supported crop and caption behavior while clearly separating approximation from provider output. | Accepted direction |
| AI currently risks feeling like the only path into creation | Keep Start a blank post and manual upload first-class. AI suggestions, copy, and images remain optional, metered actions. | Accepted direction |
| The editor needs a clearer hierarchy and less friction | Review section order, progressive disclosure, sticky actions, save state, and the handoff from approval to scheduling as one connected journey. | Prototype |

## Calendar

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| Week and Month require scrolling before the complete grid is visible | Fit the complete active calendar grid in the first desktop viewport at `1440x900 @ 1x` and `1366x768 @ 1x`. Keep the separate Unscheduled collection below Calendar and allow it to continue below the fold at the smaller viewport. | Accepted direction |
| Three large summary cards duplicate the status filters and consume working space | Use a compact title/action row plus one larger-type filter toolbar. Embed the stable Ready, scheduled-this-week, and needs-attention counts in the matching filter controls. | Accepted direction |
| Month needs useful density without tiny content cards | Keep cells titleless. Show total volume, at most three prioritized status markers, and one `+N` remainder; use the persistent filter row as the color key. | Accepted direction |
| Day and Post Focus previously felt disconnected or slow | Preserve `Calendar → Day → Post` history, focus, and URL state while using short Motion transitions to explain scope changes. Keep reduced-motion behavior and eliminate heavy blur or broad layout work. | Accepted direction |
| Statuses are difficult to distinguish in dense review states | Use semantic slate, blue, orange, green, rose, and violet markers with labels, icons, counts, and logical-edge accents on predominantly white surfaces. Treat the exact palette as reviewable design tokens, not immutable brand law. | Accepted direction |
| Dragging could accelerate planning but an accidental move is dangerous | Keep drag-and-drop deferred until eligibility, activation, time selection, exact source/destination confirmation, cancellation, and accessible non-drag controls are designed together. | Later |

**Checkpoint — 2026-08-27:** Freeze the current desktop Calendar as the accepted working baseline. Its remaining source-aware motion polish, interrupted-transition hardening, mobile composition, and safeguarded drag-and-drop are separate future passes rather than incidental work during another page's refinement.

## Shared shell and sidebar

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| The current desktop sidebar is visually heavy and uses more width than every task needs | Keep a readable expanded default and provide an explicit persisted collapse into a stable icon rail. Let the page canvas reflow into the released space. | Accepted direction |
| Navigation icons shift when the sidebar changes width | Keep one fixed icon column in both states, remove the Workspace eyebrow, and use slightly larger icons without changing route labels or active semantics. | Accepted direction |
| Hover-driven automatic expansion can create motion and targeting friction | Do not auto-expand. Use one discoverable edge control; hover and keyboard focus reveal compact localized tooltips only. | Accepted direction |
| Navigation must remain obvious in English and Arabic | Preserve visible active state, accessible link names, keyboard navigation, localized tooltips, RTL logical edges, and Settings anchored at the bottom. | Accepted direction |
| A generic sample could add unnecessary framework and ownership overhead | Use the supplied 21st.dev component as a visual reference only. Keep the implementation inside the existing MARKOS shell and dependencies; do not reuse its source. | Accepted direction |

## Areas not yet reconstructed

The short written review did not capture all useful verbal feedback from the meeting. Add those items only after the product team can state the underlying problem and intended outcome. Do not create placeholder requirements from incomplete recollection.

## Suggested review order

1. Close the Calendar checkpoint without reopening its deferred polish.
2. Finish the shared desktop shell and run focused palette and bilingual typography explorations before changing global tokens or fonts.
3. Run a short read-only Onboarding dependency audit to identify the business context Create can rely on; do not begin the wider Onboarding redesign in that audit.
4. Research and prototype the locked Create action hub and Draft Editor around the daily solo-creator workflow, then implement one reviewed vertical slice.
5. Return to Onboarding as a separately briefed product and data initiative covering required context, progressive collection, and document-assisted import.
6. Refine Overview and Strategy around the recurring planning habit, then apply accepted patterns to Insights, Business Profile, and Settings.
7. Complete responsive capability decisions, Arabic/RTL, accessibility, and cross-browser hardening across each connected journey.
