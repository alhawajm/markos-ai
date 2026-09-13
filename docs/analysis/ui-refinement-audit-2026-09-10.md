# MARKOS UI refinement: audit and implementation plan

Date: 2026-09-10. Branch: `feat/business-profile`. Scope: the mounted application, preserving the existing backend, records, approvals, sessions, publishing and onboarding contracts. This pass builds on the uncommitted palette checkpoint and preserves the separate Business Profile prototype work.

## Audit method and coverage

Inspected route dispatch, shared styles/components, current user journeys and browser fixtures. Baseline browser captures use the actual Next application with isolated, explicitly fictional API/session fixtures. They are presentation evidence, not proof of live services. Public routes are inspected directly. Evidence is kept in ignored `docs_khalid/ui-evidence/refinement-20260910/before/`; named baseline desktop is 1440×900, DPR 1, with light/dark and relevant Arabic/RTL and compact states.

| Area | Meaningful surfaces included |
| --- | --- |
| Shell | Desktop expanded/collapsed sidebar, mobile navigation, language switching, notifications drawer, session loading/failure |
| Overview and secondary app routes | Dashboard, Insights and empty data, Business Profile, Briefing, Opportunities, legacy Campaign Builder |
| Create | Blank and existing drafts, conversation, caption/media/details editors, post/carousel/Reel/Story preview, media library, Open/New/Leave, unsaved exit, readiness, schedule/publish confirmation, generation states |
| Campaigns | Empty/list/selected campaign, overview/daily plan, week/day/idea cards, composer, loading/error, linked Create handoff |
| Calendar | Week, Month, status/type filters, empty day, populated day, record details, Unscheduled bucket/pagination, schedule/reschedule/cancellation, media and failure states |
| Settings | Account/workspace, connected/disconnected Instagram, security lock/unverified/MFA states, QR/manual key, session verification, billing unavailable, export/audit states |
| Onboarding | Greeting, staged business documents and proposal, seven modules, offering rows/document review, information check, bilingual profile review, back/discard guard |
| Public and authentication | Landing workflow tabs, login/MFA, signup/validation, email verification/cooldown/errors, recovery unavailable states, legal drafts/section navigation, locale handoffs |
| Shared patterns | Buttons, fields/selects, badges/statuses, tabs, cards, page headers, empty/error/loading states, drawers/modals, focus handling and semantic color roles |

Media Library is currently a modal inside Create, not a separate route. Account/workspace details are currently read-only. The proposed dedicated Business Profile editing page is still a separate prototype; this task will refine the mounted profile without pretending that editor is implemented.

## 1. Recurring global problems

- The application has several generations of visual conventions: Sunlit components, legacy `lux-*` wrappers, page-specific CSS and duplicated utility strings. Palette values are now linked, but hierarchy and density are still inconsistent.
- Excessive framing stacks a panel, eyebrow, title, subtitle, metadata and another card around the same task. Overview repeats its next action; Insights repeats empty-data explanations across metrics, charts and comparison cards.
- Dense pages compensate for small text with many labels and badges. Spacious pages keep those same tiny labels, creating a mismatch between available space and readability.

## 2. Typography problems

- `globals.css` reduces the root font to 12.5px at 1440px width and 12px below 1180px. Standard `text-sm` and `text-xs` therefore become approximately 10.9px and 9.4px at the main desktop viewport.
- Calendar explicitly uses 9–10px labels; Campaigns uses 8–11px badges; section navigation has sub-0.8rem statuses. Create alone overrides much of this with a 16px baseline.
- Inter is loaded through a remote CSS import. Several styles request 800–950 weights, producing excessive emphasis and inconsistent Arabic fallback.
- Adopt self-hosted IBM Plex Sans and IBM Plex Sans Arabic, with 400/500/600/700 weights. Use a stable 16px root, 15–16px body, 14–15px controls, 13–14px labels, and 12px only for genuinely secondary metadata. Use language-appropriate line height and preserve mixed-language caption content.

## 3. Spacing and density problems

- Arbitrary card padding, oversized hero wrappers, fixed onboarding/auth heights, and tiny Calendar cells fight one another once text is readable.
- Use a small spacing scale (4/8/12/16/24/32), approximately 24–32px desktop gutters, 20–24px card/dialog padding, and 16–24px field/section grouping. Preserve compact icon actions and comfortable primary controls.
- Reflow dense content instead of shrinking the entire document. Calendar must remain usable at 1440×900 and 1366×768; details belong in day/detail views rather than increasingly small Month labels.

## 4. Unnecessary copy and hierarchy

- Remove redundant page eyebrows such as “Instagram performance,” “Workspace settings,” “Profile sections,” and repeated “Next up” narration where the heading/action already communicates the job.
- Remove duplicate post status text and explanations immediately repeated by controls. Promote real section titles to clear sentence-case headings.
- Keep publication/approval consequences, unsaved changes, security requirements, destructive confirmations, actual constraints, errors and useful first-use guidance.
- Preserve legal draft/availability labels and illustrative-data disclosures. Shorten implementation language such as “Connect OAuth” and “workspace-scoped.”

## 5. Theme and color problems

- Appearance currently occupies primary navigation space and multiple prominent headers. Make Settings → Appearance its main home; use only compact secondary access before sign-in where needed.
- Retain the approved palette and Light/Dark/System persistence. The latest requested dark text is `#f2faf7`, superseding the first pass's `#f2f4f7`.
- Existing surfaces, on-colors and feedback roles are useful. Extend them only for interactive/selected states, clearer text levels, shared spacing and complete status foreground/background/border roles.
- Redesign post status roles: Draft neutral; Ready teal; Scheduled violet/blue; Published green; Failed red; review/attention amber where distinct from failure. Keep labels visible and colors independent of brand accents.

## 6. Inconsistent component patterns

- Notification placement and lifetime differ. Settings Refresh leaves an in-flow success panel; routine feedback should be transient and should not move the page. Errors need a visible recovery path.
- Existing day/record dialogs manage focus, while Campaign composer, Unscheduled, notifications and onboarding discard use incomplete variations. Reuse a small focus/restore/scroll-lock helper rather than a new UI dependency.
- Status labels vary across Dashboard, Create and Calendar. Consolidate label/tone mapping and reuse the existing component structure.
- Section navigation mixes CSS rem offsets with a JavaScript pixel calculation. Fix positioning without redesigning the navigation model.

## 7. Page-specific structural issues

| Page | Planned bounded correction |
| --- | --- |
| Overview | One clear greeting/action area; remove repeated next-action narration/status; consolidate metrics and meaningful work cards. |
| Insights | Retain reporting period and sync context; show one useful no-data state instead of a grid of repeated unavailable content; simplify chart/card headings. |
| Create | Refine manual editing, media controls and conversation as one workflow. Preview should require media; keep caption/media actions available without AI. Resolve the discrepancy below before structural changes. Preserve Save/Leave, persistent conversation, readiness and publishing controls. |
| Campaigns | Remove redundant title wrappers and tiny badges; tighten list/detail relationship; readable daily ideas; visible refresh failures; accessible composer; honor the existing campaign backlink. |
| Media Library | Keep the existing modal/attachment contract; use readable asset rows with thumbnails, filename and type, plus modest search/filtering of loaded assets. Do not invent another library service or route. |
| Calendar | Clear status legend/filter grouping; readable Week entries and restrained Month summaries; useful empty states; concise record metadata; explain cancellation returning the item to Ready/Unscheduled; show video media correctly. |
| Settings | Add Appearance, remove intrusive routine banners, readable section rows, honest unavailable billing/provider state, concise security guidance, reliable section navigation. No new account editing. |
| Onboarding | Readable fields and offering rows; reduce repeated explanations; preserve useful contextual help, required/optional rules and review consequences; improve discard focus and compact-desktop fit. |
| Public/auth/legal | Apply the same typography and compact appearance access; remove decorative micro-labels; retain necessary onboarding/availability/legal guidance; correct misleading public links without inventing commercial pages. |
| Secondary routes | Apply shared headings/type/spacing and simplify existing unavailable states. Document deeper product gaps instead of implementing new functionality. |

### Create direction

The audited baseline rendered a top Create header and an Instagram shell without media, with a 360:730 outer ratio. The brief requested a removed header, media-only preview and approximately 6:19. The final user direction is to retain the refined layout: manual editing remains available, the assistant and media preview share the companion area, and all data/save/approval contracts remain intact.

## 8. Implementation passes

| Pass | Work | Completion check |
| --- | --- | --- |
| 0 — Audit | Route/state inventory, source evidence, baseline captures, this plan shown before application edits. | Review recurring and page-specific problems; distinguish fixture presentation from live behavior. |
| 1 — Foundations | Local Plex fonts, stable type scale, concise semantic/spacing tokens, status colors, latest dark text. | Web lint/typecheck, relevant theme tests, both-theme desktop/Arabic font and layout check. |
| 2 — Shell | Navigation typography/gutters, primary Appearance location, compact visitor access, remove duplicate shell labels. | Theme persistence/system behavior, locale navigation, expanded/collapsed and mobile shell checks. |
| 3 — Shared components | Consistent controls/headings/statuses/feedback; small shared dialog interaction helper; accessible section navigation. | Focus/escape/return tests, notice behavior, shared components in both themes. |
| 4 — Core pages | Overview/Insights, Create, Calendar Week/Month, Campaigns/details and Media Library using the refined foundation. | Focused journey tests and visual checks after each page group; preserve all write payloads/lifecycle transitions. |
| 5 — Remaining pages | Settings, onboarding, account/workspace, public/auth/legal and secondary routes. | Focused existing tests, both-theme forms, Arabic and compact desktop layouts; honest unavailable states. |
| 6 — Visual QA | Revisit the route/state matrix; fix regressions; document final evidence and remaining architectural debt. | Web lint/typecheck/tests/build; light/dark, EN/AR, desktop/compact/mobile comparisons with no unintended overflow. |

No database migration, backend redesign, new commercial gates, AI/learning-loop work, provider activation or deployment is included. Large page-module decomposition and the dedicated Business Profile editor remain separate work.

## Execution record

- Pass 0 complete: source audit and baseline rendered checks cover the route/state matrix, including Calendar drawers, Campaign composer, Media Library and onboarding discard. No application code changed before presenting this plan.
- Pass 1: locally hosted IBM Plex Sans and IBM Plex Sans Arabic; fixed 16px root, readable Tailwind scale, semantic status colors and shared spacing roles. Web typecheck, focused lint, 14 unit tests and the theme browser test passed. Browser-computed status text/background contrast is 5.28:1–6.14:1 in light and 6.42:1–8.13:1 in dark. Arabic login renders the Arabic family without horizontal overflow at 1440×900. Follow-up page captures are fixture-backed UI evidence, not live service verification.
- Pass 2: Appearance now lives in Settings, with a compact visitor control. Shell typography and gutters are consistent across expanded/collapsed desktop and mobile navigation. Theme preference, system changes and persistence passed 7 unit and 2 browser checks; 10 shell/Appearance captures cover English, Arabic and both themes.
- Pass 3: consolidated content-status labels and colors; quieter shared controls, surface states and transient notifications; corrected section-navigation offsets. Native modal handling now restores focus, contains keyboard navigation and preserves scroll position/width. Focused notification-drawer, legal navigation and status checks passed. Ordinary success notices no longer restart their timer when a parent rerenders; errors remain dismissible and visible.
- Pass 4: Overview has one action area and useful work/status cards. Insights has one empty state and keeps genuine reporting data/filter/export behavior. Create, Campaigns and Calendar use the shared foundation; Campaign deep links and modal error/retry behavior are covered. Calendar retains Week, Month and Unscheduled, adds visible Week status labels, and explains cancellation consequences before confirmation. Media Library remains inside Create with local filtering and deliberate selection. The final verification below supersedes intermediate layout captures.
- Pass 5: Settings and onboarding use readable labels, concise copy and accessible dialogs; unavailable billing and authentication features are stated honestly. Public navigation no longer links to nonexistent commercial pages. Legal draft warnings and security consequences remain. Focused Settings/onboarding/profile-review checks passed (10 unit and 19 browser tests), with 38 captures; public/auth/legal and overview/Insights checks passed (10 unit and 13 browser tests). Final review also corrected negative Arabic heading tracking overridden by page styles.
- Pass 6 complete: reviewed the final route/state matrix in light/dark, relevant English/Arabic states, desktop, compact desktop and mobile. The retained Create layout passed its lifecycle tests, including an always-visible working state while Preview is selected. Final regression exposed an authentication initialization race: a fast form submission could run before client handlers attached. Shared auth fieldsets now wait until interactive; recovery coverage checks the notice, retained email and unchanged URL. The final complete browser suite passed against the production build.

## Final verification — 2026-09-10

Commands below run from `apps/web`, except formatting and Git checks from the repository root. Installed Chrome was selected through `PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH`, and `SETTINGS_BROWSER_BASE_URL` pointed to the local built web app at `http://127.0.0.1:3000`. Installed binaries were invoked directly to avoid this checkout's known pnpm dependency-preflight issue; no dependency or browser installation was performed.

| Check | Final result |
| --- | --- |
| `node node_modules/eslint/bin/eslint.js .` | Passed for the web app. |
| `node node_modules/typescript/bin/tsc --noEmit --project tsconfig.typecheck.json` | Passed. |
| `node node_modules/vitest/vitest.mjs run --config vitest.config.ts` | 10 files, 43 tests passed. |
| `node node_modules/next/dist/bin/next build` | Passed; 57 static pages generated, with dynamic routes retained. |
| `node node_modules/vitest/vitest.mjs run --config vitest.browser.config.ts --reporter=verbose` | 10 files, 59 tests passed against the production build. |
| Installed Prettier over web source/tests, tokens and refinement docs; `git diff --check` | Passed. |

Final visual evidence remains private under `docs_khalid/ui-evidence/refinement-20260910/`:

- `after/root-audit.json`: 56 public and application captures across English/Arabic and both themes; no horizontal overflow, browser errors, unexpected fixture requests or sampled ordinary text below 13px.
- `after/calendar-before-audit.json`: Week/Month/day/record/Unscheduled, including compact RTL. Visible Week status labels and the complete compact Month grid fit. Chrome's rendered-font inspection confirms the actual Plex families.
- `pass4/final-create/`: eight final Create captures supersede intermediate restoration images. Preview measures approximately 250×792 on desktop and 242.5×768 on mobile, with a 13px caption floor. Campaign detail/composer and media states remain covered by the pass-4 matrix and final browser suite.
- `after-pass5/`, `after-pass6-settings/`, `after-pass6-onboarding/`: Settings, all seven onboarding modules, document/review states and discard dialogs in both themes; relevant Arabic counterparts and compact layouts. No observed clipped fields or unexpected horizontal overflow.
- `after-pass6-rtl/`: public/auth/legal heading checks cover 16 views and 88 Arabic headings with normal tracking. English tracking remains unchanged. Calendar, Campaign and onboarding heading styles also explicitly preserve normal RTL tracking.
- `built-browser/`: screenshots from the final production-build browser regression.

The earlier broad development-server run found two stale Create assertions and the recovery initialization race. The assertions were reconciled with the final layout, the form race was fixed rather than hidden by a longer timeout, and the complete built-app run above is the final result.

## Verification boundaries and deferred debt

- Visual evidence uses the mounted frontend with browser-local fictional sessions, API responses and media. Public pages are rendered directly. It does not certify live accounts, databases, providers, Instagram publishing or Railway.
- No database migration, backend contract, commercial quota or AI behavior was changed. The existing Business Profile editing handoff remains; the separate proposed editor is not represented as complete.
- Briefing, Opportunities and the legacy Campaign Builder still contain illustrative legacy content. Their status is explicit; converting them to live intelligence, fully rewriting their content, or decomposing the large page modules is separate product/architecture work.
- Calendar video details use the video element and controls. Fixture checks cover the rendered branch/source/controls; actual media playback and external provider delivery are not certified by those fixtures.
- Existing uncommitted palette and Business Profile prototype work was preserved. This task does not commit, push or deploy the working tree.
