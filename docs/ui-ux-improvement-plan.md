# MARKOS UI/UX Improvement Plan

- Status: interpreted working backlog
- Started: 2026-08-23
- Current focus: treat the implemented Onboarding checkpoint as closed except for focused defects and deferred deployment evidence

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

## Shared shell and visual-foundation research checkpoint

- Status: prototype direction selected; production font/palette migration deferred
- Opened: 2026-08-27
- Primary surface: authenticated desktop shell
- Representative validation surfaces: the frozen Calendar overview and one quiet form/content surface in both English and Arabic

**User and job**

A solo workspace owner or social-media marketer needs to navigate a dense desktop product, identify hierarchy and state quickly, and read English or Arabic without the interface feeling cramped, inconsistent, or decorative at the expense of work.

**Outcome**

Establish a coherent shell, semantic color system, and bilingual type system before Create refinement so later pages inherit reviewed foundations rather than introducing page-specific fixes.

**In scope**

- Verify the expanded and collapsed desktop sidebar's hierarchy, alignment, discoverability, persistence, keyboard behavior, and RTL mirroring.
- Define color roles for canvas, surfaces, text, borders, primary and secondary actions, focus, disabled controls, feedback, content lifecycle status, and later data visualization.
- Compare a small set of licensed, production-suitable Arabic/Latin type systems using real MARKOS headings, navigation, controls, numerals, metadata, and paragraphs.
- Review type scale, weight, line height, and the current viewport-dependent root font-size behavior separately from font-family selection.
- Identify the smallest token and font-loading architecture that can replace overlapping legacy, Sunlit, and page-level values after a direction is approved.

**Out of scope for this pass**

- Redesigning Calendar, Create, Onboarding, or another feature workflow.
- Changing content lifecycle meaning, backend contracts, routes, or data.
- Mobile feature parity or a new mobile navigation model.
- A new logo, complete brand identity, production dark-mode rollout, Tailwind migration, or component-library adoption. One dark companion may remain in the isolated lab for token-system evaluation.
- Implementing a global palette or font before the comparison is visually reviewed.

**Current evidence to challenge**

- The web app imports Inter weights 300–700, but does not load an explicit Arabic family; Arabic therefore depends on the user's system fallback and cannot be assumed to match Latin metrics or tone.
- `font-display` and `font-sans` currently resolve to the same Inter stack, so a separate display role does not yet exist.
- Global root font size changes at multiple viewport and height thresholds, reaching 12.5px at the primary 1440px or compact-height conditions and 12px below 1180px. This can make every rem-based control smaller and must not be mistaken for a font-family problem.
- Sunlit variables are scoped in `sunlit-theme.css`, while legacy palette and typography values remain in global CSS, the Tailwind bridge, and page-level hard-coded colors. A safe palette change therefore requires consolidation rather than only replacing the top-level Sunlit values.

**Acceptance gate before implementation**

- The discovery artifact may hold more options while the team learns the design space. Narrow the decision review to no more than three coherent finalists, including the current system as the control where useful.
- Show each candidate on the same representative dense and quiet compositions at `1440x900 @ 1x` and `1366x768 @ 1x`.
- Compare English and Arabic side by side with localized numerals, navigation, controls, metadata, long text, and status treatments.
- Document font licensing and delivery, color contrast, semantic token mapping, expected migration surface, and explicit tradeoffs.
- Select one direction, request refinement, or keep the current system. Do not mix preferred fragments from several candidates without another coherent comparison.

**Review artifact:** Use [`docs/prototypes/shared-foundation-comparison.html`](prototypes/shared-foundation-comparison.html) to compare typography, semantic color, and root scale independently on the same dense and quiet bilingual desktop composition. Its ordinary Lab view keeps the comparison controls visible; Focus view removes the toolbar and decision notes so the representative product canvas receives the complete named viewport. It is an isolated decision aid, not application code or an implementation specification.

**Focused research shortlist — 2026-08-27**

| Variable | Control | Candidate A | Candidate B | Current recommendation |
| --- | --- | --- | --- | --- |
| Typography | Inter plus an implicit operating-system Arabic fallback | [Readex Pro](https://github.com/ThomasJockin/readexpro), one variable OFL family for Arabic and Latin | [IBM Plex Sans + IBM Plex Sans Arabic](https://github.com/ibm/plex), an OFL script pair designed for UI and extended reading | Compare A and B in the artifact. Do not keep an implicit Arabic fallback. Readex is warmer; Plex is more operational and compact. |
| Semantic color | Current Sunlit cream, bright coral, and aqua | Refined Sunlit: more white, accessible deep coral actions, and deep teal focus/support | Editorial Signal: white/slate surfaces, indigo actions, and coral as supporting emphasis | Start from refined Sunlit because it improves role clarity without discarding the recognizable identity. Keep Editorial Signal as the meaningful challenge. |
| Root scale | `12.5px` at the primary 1440px/compact-height condition | A normal `16px` root with deliberate component-level density | — | Remove viewport-driven global shrinking. Tune dense components locally after the readable baseline is chosen. |

Both proposed font families are already exposed by the installed [Next.js `next/font/google` integration](https://nextjs.org/docs/app/api-reference/components/font), so production evaluation does not require a new package. Next.js can self-host the selected files and avoid a browser request to Google Fonts. The prototype uses Google Fonts only for disposable comparison speed.

The palette candidates follow semantic roles rather than a collection of page-specific hex values. Normal text must retain at least `4.5:1` contrast; essential control boundaries and focus indicators must retain at least `3:1` against adjacent colors. The refined Sunlit prototype uses white on deep coral at `4.66:1` and deep teal against white at `5.02:1`. Before implementation, consolidate the split Sunlit/legacy tokens and audit the existing hard-coded color surface; changing only `.sunlit-theme` would leave material drift.

**Discovery expansion — 2026-08-27**

- Add [Alexandria](https://github.com/Gue3bara/Alexandria), [Cairo](https://github.com/Gue3bara/Cairo), and the [Noto Sans/Noto Sans Arabic UI pairing](https://github.com/notofonts/noto-docs/blob/main/docs/website/use.md) to the typography lab. Alexandria is the expressive geometric option, Cairo is the contemporary Arabic-first option, and Noto is the neutral robustness control. All remain OFL options available through the existing Next.js font path.
- Use the current [21st Themes gallery](https://21st.dev/community/themes) as a structured source of references rather than treating color swatches as a design system. Its themes expose background, surface, primary, secondary, accent, muted, destructive, border, input, ring, chart, sidebar, radius, typography, and shadow roles on real UI previews.
- Add original MARKOS adaptations of [Zen Linen](https://21st.dev/@serafimcloud/themes/zen-linen), [Mint Signal](https://21st.dev/@serafimcloud/themes/mint-signal), [Violet Bloom](https://21st.dev/@serafimcloud/themes/violet-bloom), and [Tangerine](https://21st.dev/@serafimcloud/themes/tangerine). Do not copy their CSS wholesale. Existing Refined Sunlit already covers much of the Claude Amber/Sunset territory, while Editorial Signal already provides the clean blue operational challenge.
- Keep `16px` as the working readable baseline during color and type discovery. The `12.5px` control remains visible to demonstrate the current global shrink, not as another aesthetic direction. Reopen scale only if a candidate fails the agreed desktop fit gate after local component density is tuned.

**Discovery validation:** All 96 Lab-view combinations of six type options, eight palettes, and two scale controls fit the complete 42-cell representative month at both `1440x900 @ 1x` and `1366x768 @ 1x` without document overflow. Focus view separately gives the representative product canvas exactly `1440x900` or `1366x768`, with no lab toolbar or decision strip consuming that space; the provisional IBM Plex plus Tangerine Slate light and dark candidates fit both focus checkpoints without document overflow. Every proposed palette passes the focused Lighthouse accessibility snapshot in the representative state. The current Sunlit control intentionally retains its observed failure—white date text on bright aqua is only `2.30:1`—so the control continues to expose rather than conceal the existing weakness.

**Provisional review direction — 2026-08-27:** Carry IBM Plex Sans plus IBM Plex Sans Arabic, Tangerine Slate, and the `16px` readable baseline into the Create prototype. Keep Tangerine Slate Dark as a companion-token exploration rather than a production commitment. The lab uses explicitly separate English and Arabic/RTL form specimens; it does not use artificial mixed-language labels to judge font behavior.

## Onboarding

The current checkpoint reduces effort without pretending optional business context is present. It now supports both a manual seven-area path and a separate full-business document-assisted path; the narrower Products/Services analyzer remains available inside that step.

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| Seven areas felt like mandatory paperwork | Keep Company and Products as the two essentials. Let the owner explicitly skip Story, Audience, Competitors, Brand/Tone, and Objectives, while preserving those gaps for later improvement. | Implemented checkpoint |
| Product or service entry is repetitive for businesses with an existing catalogue | Use compact structured offering rows for the manual and correction paths. Keep the focused Products/Services analyzer as a complete upload → analyze → report issues → edit → confirm flow; nothing becomes business truth until the owner confirms it. | Implemented; focused provider proof obtained, Railway regression proof remains |
| Tone presets alone are restrictive, while free text alone is demanding | Use an open field with clickable suggestions, allow suggestions to be removed, and limit the saved result to four tone words. | Implemented checkpoint |
| Wizard navigation looked like a clickable menu and review was difficult to correct | Use a compact Previous/Current/Next context strip. Make every information-check row a direct edit action that returns to the check. | Implemented checkpoint |
| Optional context could still block or be invented by AI | Keep optional areas skippable, show honest gaps, and require an editable bilingual profile plus explicit approval. Missing facts must not be manufactured during resolution. | Implemented checkpoint |
| Owners want to begin from existing business material rather than retype every area | Offer a separate first-run document path for one to five PDF, DOCX, TXT, JPEG, PNG, or WebP files. Stage selections visibly, send only after **Analyze files**, extract across the seven canonical areas, label evidence/issues, and converge on the ordinary information check and Business Profile approval. | Implemented; full Railway proof pending |
| Documents must not become permanent or unreviewed business truth | Keep full-path files temporary for at most 24 hours, allow retry or discard/manual recovery as appropriate, and remove the raw files when the owner approves the editable extraction. Never substitute speculative local parsing when provider-backed AI is unavailable. The narrower Products analyzer retains its own one-or-two-file policy. | Implemented |
| Long onboarding text becomes visually clumsy when fields overflow | Keep long fields contained and non-resizable, with restrained overflow treatment that preserves keyboard scrolling and accessible editing. | Implemented checkpoint |
| Business colors need a compact control that does not save accidental picker changes | Let the picker prepare one pending color and require **Add color** before it joins the saved swatches. Allow up to seven editable/removable colors, including clearly labeled visual inferences from documents. | Implemented checkpoint |

**Checkpoint — 2026-09-01:** Onboarding is closed until explicitly reopened. The minimal greeting offers equal document-assisted and manual CTAs. The manual path keeps seven stable steps, two essentials, explicit optional skips, structured offering rows, bounded fields, contextual help, direct-edit information check, bilingual profile review, and Campaigns handoff. The full document path stages up to five supported text/visual files, uses provider-native multimodal analysis, maps an editable proposal into the same seven areas, exposes issues and visual color inferences, and requires extraction approval before the separate Business Profile approval. The focused Products/Services analyzer remains available inside that step. Focused source, provider, persistence, isolation, retention, export, erasure, client, and browser checks pass locally; full Railway proof remains open. `docs/prototypes/onboarding-pass-0-field-contract.html` is historical design evidence and is superseded by production behavior and the decision registers.

## Overview

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| The page should communicate the next useful task instead of exposing system terminology | Reframe cards and actions around current workspace state, upcoming content, required attention, and the next decision. | Accepted direction |
| Duplicate shell and page chrome consumes the first viewport | Keep one page-owned heading, remove the redundant authenticated desktop header, and place locale/account controls in Settings. Retain a compact header only where the desktop sidebar is unavailable. | Accepted direction |
| Decorative or duplicated metrics can crowd out work | Keep only data backed by the workspace and tied to a useful action. Use honest empty states instead of placeholder success. | Accepted direction |

## Campaigns

| Problem or goal | Interpreted direction | State |
| --- | --- | --- |
| Raw day counts are not the easiest planning language | Keep the current 30, 60, and 90-day API contract until changed deliberately. Prototype human-readable duration labels and decide separately whether a custom duration is worth the contract and quota complexity. | Product decision |
| Long Campaigns are difficult to scan | Keep a compact Campaign overview, then let the user select one week and read that week's goals and day-level actions. Never show more than one week of full detail at once. | Accepted direction |
| The structure should scale beyond exactly four weeks | Generate navigation from the actual Campaign duration and sections rather than hard-coding Week 1 through Week 4. | Accepted direction |

## Create

The already accepted Create information architecture remains: an action hub first, followed by a focused Draft Editor after a blank or AI-assisted draft is created or selected.

### Reviewed Create daily-workflow prototype

- Status: interactive prototype reviewed; focused production implementation pending
- Opened: 2026-08-27
- Primary user: solo workspace owner or social-media marketer managing one Instagram account
- Primary viewport: desktop `1440x900 @ 1x`; compact checkpoint `1366x768 @ 1x`
- Locales: English and Arabic/RTL in the same pass

**User job and outcome**

Move from an idea or manual starting point to a reviewable Instagram post, then deliberately mark it Ready and schedule it, without requiring AI, losing unsaved work, or confusing an intended Calendar time with an active publishing schedule.

**In scope**

- Audit and prototype the action hub, one focused Draft Editor, optional AI entry points, media and copy hierarchy, follower-style preview, explicit save state, Ready transition, and scheduling handoff.
- Preserve a blank working copy in the browser until meaningful work is deliberately saved. Preserve the existing Save draft, Discard changes, and Keep editing exit choices.
- Keep manual creation and upload first-class. Treat AI copy and image generation as optional, visibly metered actions.
- Use existing Instagram-only content types and current APIs honestly; focus the first reviewed path on one standard Post without claiming complete Reel, Story, or Carousel editing.
- Keep a draft with no planned time in Unscheduled. A planned time may place Draft or Ready content on Calendar, but only explicit scheduling enters the publishing queue.

**Out of scope for the first prototype**

- New backend contracts, auto-save, collaborative approval UI, a complete Media Library, advanced carousel/reel editing, drag-and-drop, mobile creation, or production token/font migration.
- Provider-backed AI or Instagram readiness claims. The prototype may represent only behavior supported by the mounted application and documented contracts.

**Prototype and review gate**

- Show the default action hub, untouched blank editor, meaningful unsaved editor with exit confirmation, saved draft with media, Ready state, and scheduling handoff as connected states rather than unrelated screens.
- Keep the primary next action and save state clear at every step; remove repeated or disabled controls that do not help the current state.
- Validate the accepted structure in Focus view at both desktop checkpoints, then inspect English, Arabic/RTL, keyboard order, contrast, and one failure or blocked state before implementation.

**Mounted staging audit — 2026-08-27**

- The manual path is genuinely first-class: opening a blank post creates only a browser working copy. Leaving it untouched does not prompt or persist; leaving after a meaningful edit offers Keep editing, Discard changes, and Save draft. Keep editing preserved the entered caption and Discard returned to a zero-draft hub without a write.
- The same persistent confirmation message appears after untouched and discarded exits, even though nothing was saved. Feedback must describe the action that actually occurred rather than implying a successful persistence event.
- The action hub nearly fits the compact desktop checkpoint, but its permanently empty, phone-framed preview carries as much visual weight as the starting choices and introduces avoidable scrolling.
- The blank editor is approximately 1,933 px tall at both desktop checkpoints. At `1440x900`, Caption, Hashtags, and the start of Call to action are visible; at `1366x768`, only Caption and Hashtags are visible. Planned time, media, readiness, scheduling, and final actions sit below the initial viewport.
- Caption, hashtags, call to action, and planned time each expose a separate Save control. This makes persistence look field-scoped even though the user is composing one draft and obscures the draft's overall saved or unsaved state.
- Manual upload and AI image generation are both blocked until the first save. The current API can support selecting and previewing a local JPEG before persistence, but AI image generation requires a saved content item. The cheapest honest prototype is therefore local-only manual media before Save and a clearly explained Save-first gate for AI image generation.
- The AI and idea routes remain optional and do not save until generation. Idea selection usefully seeds the AI prompt, but the generation surface does not explain metering or quota at the point of action.
- A published item correctly opens as locked content with state-specific actions, but it inherits the same long-form editor structure despite most controls being unavailable.
- The Arabic route is visually mirrored, but the mounted document still reports `lang="en"`, `dir="ltr"`, and left-to-right body semantics. Significant editor and preview strings remain English. Correct document semantics and complete localization are prototype acceptance requirements, not later polish.
- No functional console errors appeared during the audit. One non-blocking stylesheet preload warning was present.

**Onboarding dependency audit — 2026-08-27**

- Create may rely on the approved bilingual Business Profile for business name, offer summary, ideal customer, market position, brand voice, and marketing focus. The grounded AI path may retrieve deeper raw Company, Story, Products, Audience, Competitors, Brand, Tone, and Objectives Vault entries.
- The Create UI should not ask the user to re-enter onboarding facts. Optional AI entry points may state that they use the approved Business Profile and link to Business Profile when context needs review.
- Missing or incomplete grounding may block a grounded AI request with a specific recovery route, but it must not block Start a blank post, manual copy, or local manual media selection.
- Logo and guideline files are not dependable Create inputs yet because the active onboarding UI does not upload them. The first prototype therefore uses no claimed brand asset or automatic brand-template behavior.

**Focused reference findings**

- [Buffer's current composer](https://support.buffer.com/article/642-scheduling-posts) keeps a live channel preview but allows Focus Mode to hide the preview and extra panels while writing. It offers one final publishing choice instead of section-level save controls.
- [Buffer's Instagram workflow](https://support.buffer.com/en-us/articles/scheduling-instagram-posts-reels-stories-and-notifications-3XA98S9Q5p) presents the Instagram sequence as format, media, caption, publishing mode, and schedule. This supports moving media before long copy without turning the editor into a rigid wizard.
- [Buffer's AI assistant](https://support.buffer.com/en-us/articles/using-buffers-ai-assistant-qbBulfw9sn) opens beside the composer and requires the user to insert a result. This is a useful pattern for optional assistance that does not silently replace manual work.
- [Sprout Social's desktop Compose guidance](https://support.sproutsocial.com/hc/en-us/articles/360000095183-How-can-I-customize-my-social-posts-using-Compose) uses a real-time preview in fullscreen and an on-demand preview in compact composition. Its Draft, schedule, queue, and approval choices are distinct actions.
- [Sprout's Instagram scheduling guidance](https://sproutsocial.com/insights/how-to-schedule-instagram-posts/) reserves Submit for Approval for an actual approver workflow. This reinforces Ready as the clearer solo-workspace guard while preserving approval terminology for future collaborative plans.
- [Buffer's current Instagram composer guidance](https://support.buffer.com/en-us/articles/scheduling-instagram-posts-reels-stories-and-notifications-3XA98S9Q5p) explicitly selects Post, Reel, or Story before upload, then changes the supported media and publishing options for that format. [Sprout's Story workflow](https://support.sproutsocial.com/hc/en-us/articles/115000683263-How-do-I-use-the-Instagram-mobile-publishing-workflow) similarly chooses the Instagram profile and Story mode before media. MARKOS should therefore choose content type before media rather than infer the type late from an uploaded file.
- [Later's supported-post inventory](https://help.later.com/hc/en-us/articles/360060842914-Supported-Social-Platforms-Post-Types) separates single image, Reel, Story, and multi-photo/Carousel capabilities and calls out format-specific limitations. This supports one visible format selector with capability-specific controls, not one generic editor that silently accepts incompatible media.

**Accepted prototype decisions — 2026-08-27**

Khalid approved these five defaults as the baseline for the first connected prototype. Visual review may refine their composition without reopening the underlying interaction model.

1. Remove the empty permanent preview from the action hub. Let the hub prioritize Start blank, continue recent work, and optional AI or idea entry; introduce preview only after an editor exists.
2. Replace the long stack of independent cards with one composition workspace: media first, primary caption second, optional enhancements under progressive disclosure, and publication state in a compact adjacent panel or drawer.
3. Replace section-level Save buttons with one persistent draft-status and action bar showing Untouched, Unsaved changes, Saving, Saved, Ready, or Scheduled as appropriate.
4. Keep a manual JPEG local until the first explicit Save, then create the draft, upload, and attach it. Keep AI image generation unavailable until a saved draft exists and explain that dependency beside the action.
5. Use one publication control to express Unscheduled, planned for Calendar, Ready, and actively scheduled states. Reuse the chosen date and time when the user deliberately schedules instead of presenting separate distant date fields.

**Prototype checkpoint — 2026-08-27**

- `docs/prototypes/create-workflow-prototype.html` connects Action hub, Untouched, Unsaved changes, Saved draft, Ready, scheduling review, and Scheduled states in one browser-rendered artifact. It performs no API calls or workspace writes and visibly labels its sample content as prototype data.
- The prototype carries the accepted shared-shell behavior: the desktop sidebar starts expanded, uses one explicit edge control, collapses to a stable icon rail without hover expansion, persists the prototype preference locally, and mirrors the control in Arabic/RTL.
- The real interaction path passed through Start blank, local media selection, caption and planned time entry, unsaved-exit confirmation, Keep editing, Save draft, Mark Ready, schedule review, and Confirm schedule.
- Focus view fits without document overflow at `1440x900 @ 1x` in English and `1366x768 @ 1x` in Arabic/RTL. The light Tangerine Slate and dark companion editor states both fit at `1440x900 @ 1x`.
- Lighthouse snapshot accessibility passed at 100 for the English dark companion and Arabic light candidate after strengthening the Draft/Unscheduled slate token. Keyboard tab order reaches the primary navigation, Back, and editor controls in a predictable sequence.
- The prototype carries IBM Plex Sans plus IBM Plex Sans Arabic and Tangerine Slate only as the provisional shared-foundation candidate. It does not migrate production fonts or tokens.
- Instagram options currently demonstrate Alt text and AI-content disclosure as a narrow capability-backed exploration. Their final product policy, request fields, and provider version compatibility remain a separate decision before implementation.
- The first feedback revision adds a format selector before media. Post and Carousel use one fixed feed-preview shell; Reel and Story use one fixed full-screen shell. Uploaded dimensions do not resize the shell, no decorative phone frame is used, and exact Instagram chrome and safe areas remain provisional until real mobile references are reviewed.
- The format selector is a compact segmented control rather than four explanatory cards. A single constant outer preview viewport is the leading next experiment, but its screen ratio and whether feed mode should reveal the next item remain deferred until real Instagram mobile references are available.
- Optional AI explanations now use one non-modal contextual callout. Modal dialogs remain only for consequential confirmations such as leaving meaningful unsaved work; routine quota and AI-use guidance should stay inline, expandable, or non-blocking.
- Ready now provides an explicit Return to Draft action. The small drop zone and reusable Media Library entry remain prototype explorations, and saving generated media without attaching it to a content item remains an open product/API decision.
- Known limits: the functional contract remains one standard Instagram Post/JPEG path; Carousel, Reel, and Story currently demonstrate selection and preview architecture only. The prototype still uses CSS sample media, has no provider proof or backend changes, and does not compose mobile creation.

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

1. Keep the Onboarding checkpoint frozen except for focused defects; its remaining onboarding-specific gate is deployed-provider validation of the full-business document path.
2. Preserve the independent Products/Services analyzer and keep future Instagram evidence reconciliation separate from onboarding closure.
3. Implement the reviewed Create action hub and Draft Editor as one standard Post/JPEG production slice; do not present the prototype-only formats or Media Library as live.
4. Revisit broader shared palette, bilingual typography, and dark-theme adoption as a separate production-foundation decision. IBM Plex and Tangerine Slate remain prototype candidates.
5. Refine Campaign duration/review and connect approved Campaign posts into Create and Calendar.
6. Refine Overview around the recurring planning habit, then apply accepted patterns to Insights, Business Profile, and Settings.
7. Complete responsive capability decisions, Arabic/RTL, accessibility, and cross-browser hardening across each connected journey.
