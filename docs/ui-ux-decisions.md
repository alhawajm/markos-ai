# MARKOS UI/UX Decisions

- Status: active decision register
- Started: 2026-08-25
- Last updated: 2026-09-10
- Workflow: `docs/ui-ux-workflow.md`
- Visual foundation: `docs/ui-design-foundation.md`

This register records accepted presentation, interaction, naming, density, and viewport decisions for MARKOS. It exists so focused frontend decisions remain easy to find without turning `AGENTS.md` into a page-specific checklist.

Product behavior, lifecycle rules, data contracts, security, permissions, and infrastructure still belong in `docs/decisions.md` when the authoritative specification and experience flows are silent. Open design questions and prototypes remain in `docs/ui-ux-improvement-plan.md`. An entry here must not override the build specification, experience flows, or a durable product decision.

Each surface entry should state what is accepted, what remains deferred or open, and the observable consequence for implementation and review.

## Shared visual foundation

### 2026-09-10 — Adopt the light and dark site palette

**Approved by Khalid for direct application to the project**

| Token | Light | Dark |
| --- | --- | --- |
| `--text` | `#20212b` | `#f2faf7` |
| `--background` | `#f7fafa` | `#151821` |
| `--primary` | `#d88fa3` | `#8fe3da` |
| `--secondary` | `#81d8d0` | `#7b6af0` |
| `--accent` | `#6c3ce8` | `#d9a0b1` |

- Apply both palettes to the real public and authenticated site, including shared controls, forms, cards, dialogs, navigation, and data displays. A sandbox or prototype-only update does not satisfy this decision.
- Preserve these base values and derive the supporting semantic roles centrally. Map surviving Sunlit and legacy aliases to the same theme so older components do not retain unrelated brand colors.
- Use the supplied dark dashboard image as a reference for quiet dark surfaces, violet support panels, aqua emphasis, and rose highlights. It does not approve new dashboard content, navigation, or product behavior.
- Preserve readable typography, generous controls, English/Arabic parity, and keyboard focus. Use contrasting on-color labels; do not put white normal text on pastel actions or assume the dark secondary violet is a suitable normal-text link.
- Keep status labels, icons, and semantic success/warning/error distinctions. Theme selection must change presentation consistently without altering business data or application state.
- This decision supersedes earlier light-only instructions, coral/yellow brand treatments, and the deferred palette/dark-mode status in the August foundation experiments. The follow-up below records the separately approved font and refinement choices; the retired dark-luxury layout remains superseded.

**Verification boundary:** palette choice is approved. Implementation must still be checked in the actual application for both themes, across representative public/authenticated forms and dense working surfaces, including Arabic/RTL. Record completed checks separately; the supplied screenshot and this decision are not runtime evidence.

**Local implementation checkpoint, 2026-09-10:** the mounted site now uses `apps/web/app/theme-tokens.css`, with persistent Light/Dark/System controls and a pre-paint theme initializer. Web typecheck, ESLint, formatting, 41 unit tests, and 21 focused browser tests passed. Browser checks cover the exact palettes, readable primary-action contrast, keyboard switching, refresh/locale persistence, system changes, and existing presentation/authentication/public/legal journeys. Additional dark-mode screenshots reviewed Overview, Create and its caption editor, Business Profile, Settings, login, and Arabic signup, including Create at 390px. Authenticated visual checks used browser-local API fixtures; this checkpoint does not establish live backend or deployment behavior. Local screenshots and diagnostics are in the ignored `docs_khalid/ui-evidence/theme-20260910/` folder.

### 2026-09-10 — Readable bilingual typography and coherent page refinement

**Approved for direct implementation**

- Replace Inter with IBM Plex Sans for English and IBM Plex Sans Arabic for Arabic. Both use local normal-weight 400/500/600/700 WOFF2 files, loaded through `next/font/local`; source and license evidence is in [the asset README](../apps/web/app/fonts/README.md). Readex Pro is only the fallback proposal if maintaining the two families proves impractical.
- Use a fixed 16px root across viewports, 16px body, 15px controls, 14px labels, and 13px metadata. Reserve occasional 12px text for secondary metadata; remove normal UI at 10px or 11px. Prefer 400–600 weights and occasional 700, with readable Arabic line height and normal Arabic tracking.
- Remove decorative eyebrows, redundant captions, repeated state narration, and excessively small all-caps labels. Keep instructions that change a user's decision, honest unavailable states, illustrative-data labels, security requirements, destructive consequences, and recovery actions.
- Make Settings the primary home of Appearance. Any visitor/user-menu quick access is compact and secondary; Light/Dark/System preference and refresh/locale/system-change behavior remain available.
- Correct dark primary text to `#f2faf7`, superseding the initial `#f2f4f7` used in the earlier palette checkpoint. Keep all other approved base values. Use Draft neutral, Ready teal, Scheduled violet/blue, Published green, Failed red, and review/attention amber with shared semantic foreground/background/border roles and text labels.
- Preserve the existing backend, workspace records, approvals, publishing, sessions, onboarding behavior, and manual-only Business Profile increment. This refinement does not activate deferred commercial limits, provider features, or learning-loop functionality.

**Local implementation checkpoint:** bounded passes 0–6 are complete, covering the audit, foundation, shell, shared patterns, core pages, and remaining Settings/onboarding/public/auth/legal surfaces. Routine feedback is temporary, unsupported billing/provider claims are removed, and native dialogs use shared focus and scroll handling. Final review corrected page-level negative tracking on Arabic headings. The earlier palette test totals above remain evidence for that earlier checkpoint; the [refinement audit and execution record](analysis/ui-refinement-audit-2026-09-10.md) records current checks and limitations. Final QA is complete: the full browser suite passed against the production build. The audit records exact outcomes and evidence boundaries. These are local UI checks, including fictional browser fixtures, not evidence of live database, provider, Instagram, or deployment readiness.

## Create

### 2026-09-10 — Retain the refined Create workspace

**Accepted by Khalid**

- Keep the refined composition with manual editing alongside the MARKOS companion. Caption, media, and post-detail controls remain available without requiring an AI action.
- Show the preview only when media is present and preserve the `6:19` outer preview ratio. Content type changes the media presentation within that consistent canvas.
- Preserve saved conversations, the unified final caption, existing draft records, Save/Leave handling, readiness, scheduling, and publication contracts. This is a UI refinement; it does not introduce backend or learning-loop behavior.
- This accepted composition supersedes earlier ratios and editor arrangements below where they conflict. Final browser/build verification is tracked in the September 10 refinement audit.

### 2026-09-06 — Conversation and Instagram preview workspace

**Accepted by Khalid for implementation**

- Supersede the earlier action hub and separate manual/AI entry surfaces. Keep two desktop halves: an open MARKOS conversation and an Instagram follower preview. All standalone, Campaign, and saved-post entry points share this workspace.
- Use open assistant text with a small coral identity icon, quiet warm user messages, and one textarea composer with an attachment action, explicit existing-AI action selector, and send control. Do not imply retained conversational context.
- Keep one outer preview viewport at `360:730`, scaled uniformly to available width and height. Media proportions (`1:1`, `4:5`, `9:16`) affect the content inside it. Include feed, carousel navigation, Reel, and Story treatments with no device hardware, invented engagement counts, or publication timestamps. The preview approximates Instagram; it is not provider-rendered output.
- Follow-up refinement: place Caption, Media, and Details controls beside the preview, with Save/readiness controls in that same narrow column. Opening a focused editor temporarily replaces the preview; Done restores it. Keep the conversation visible throughout.
- Show saved/unsaved state in the header with Open, New, and Leave. Use a focus-managed dialog for unsaved exits and destructive actions. Ready exposes **Return to Draft** and separate scheduling/publishing controls.
- Use existing Sunlit tokens and Lucide icons. Give Create a readable local `16px` body baseline without migrating shared typography. Mirror the workspace and controls for Arabic/RTL.
- Validate desktop at `1440x900`, `1366x768`, and `1920x1080`, DPR 1. Preserve a stacked narrow fallback; dedicated mobile capabilities and composition remain deferred.
- Following Khalid's rendered feedback, remove the outer preview card and horizontal toolbars, remove the simulated Posts/back header, and raise the preview width ceiling from 360 to 480 CSS pixels while preserving its `360:730` proportions. The available viewport still governs uniform scaling. Keep the larger readable text and button sizes.
- Routine Create feedback uses a neutral floating notice with a dismiss action and 4.5-second expiry. It must not occupy layout space or move the conversation/preview. Actionable errors remain available for dismissal/retry; they also avoid layout shifts.

Khalid subsequently approved caption consolidation: one editable final text, no EN/AR toggle or separate CTA/hashtag fields. Keep the complete text and ordering through Save, AI revision and preview; changing UI locale must not change it. The preview column now fits its height and action controls, giving surplus desktop width to the conversation. `docs/content-campaign-model-proposal.md` records the implemented caption slice and the remaining proposed ownership work.

The older entries below retain their historical rationale. Their action-hub, separate-preview-shell, and media-save gates are superseded by this decision and the September 6 persistence decision in `docs/decisions.md`.

### 2026-08-25 — Unsaved working drafts and exit behavior

**Accepted**

- Opening **Start a blank post** must not immediately create a persisted `ContentItem`.
- A new blank editor begins as an unsaved working copy. Leaving it without a meaningful user change returns to Create without a prompt and without leaving an empty draft in the workspace.
- When meaningful unsaved changes exist, an in-application attempt to leave the editor must offer three clear outcomes: **Save draft**, **Discard changes**, and **Keep editing**.
- Saving preserves the work as `DRAFT`; it does not mark the content Ready. **Mark as ready** persists current valid changes and performs the separate readiness transition.
- An existing saved draft should prompt on exit only when its current working copy differs from the last confirmed server version.
- Browser refresh, tab close, and browser-window close use the platform's native unsaved-changes warning where available. MARKOS must not imply that a custom asynchronous save dialog can be guaranteed after the browser begins unloading.
- For the least-cost AI path, submitting a valid **Generate draft** request is an explicit first-persistence action. The interface must state that successful generation creates a saved workspace draft and consumes the applicable metered AI allowance.
- After successful AI generation, leaving without further edits does not show the unsaved-changes prompt. Later local edits do; discarding those edits returns to the last saved generated version rather than deleting the draft.
- Deleting a generated draft remains a separate deliberate action and does not refund already consumed AI usage.

**Meaningful-change baseline**

- User-entered or deliberately accepted caption text, hashtags, CTA, content-type changes, planned publication date/time, media selection, upload/generation results, and deliberately accepted AI output count as changes.
- Merely opening the editor, changing the active language tab, expanding a preview, or moving focus does not count as a change.

**Accepted first-pass implementation boundary**

- Keep edits after the first intentional save explicit until the user saves again, marks the item Ready, or chooses Save draft while leaving. Do not introduce background autosave in this pass.
- Require an already persisted draft before media upload, attachment, or AI image generation. Keep those controls unavailable on a new unsaved working copy and explain why; defer temporary-asset architecture until a later media-first Create redesign demonstrates enough value.

### 2026-08-27 — Daily Create workflow prototype baseline

**Accepted**

- Keep an action hub before the Draft Editor. Remove its permanently empty preview so Start blank, recent work, optional AI drafting, ideas, and Calendar remain the clear starting choices. Introduce the follower-style preview only after an editor exists.
- Use one media-first composition workspace rather than a tall stack of independently saved cards. Put primary caption work after media, keep optional enhancements behind progressive disclosure, and keep publication intent in a compact adjacent control or review drawer.
- Replace section-level Save controls with one persistent draft-status and action area. It must distinguish Untouched, Unsaved changes, Saved draft, Ready, and Scheduled without implying background autosave.
- Permit a manually selected JPEG to remain local in the browser before the first explicit Save. On Save, create the draft, upload the selected file, and attach it through the existing APIs as one recoverable UI operation. This supersedes only the 2026-08-25 persisted-first restriction for **manual media**; AI image generation still requires a persisted content item.
- Keep Unscheduled, planned Calendar time, Ready, and active scheduling visibly distinct. Reuse a complete planned date/time as the default in the explicit scheduling review, but never treat that planned value as an active queue entry.
- Use the existing content contracts for the first implementation slice. Do not add a temporary-media backend contract merely to support this browser-local manual selection.

**Still open**

- The exact final placement and supported inventory of Instagram-specific options.
- Production adoption of the provisional IBM Plex and Tangerine Slate prototype foundation.
- Complete Carousel, Reel, Story, Media Library, mobile-creation, and collaborative approval compositions.

### 2026-08-27 — Create format and preview feedback pass

**Accepted for the connected prototype**

- Put an explicit Post, Carousel, Reel, or Story selector before media. Do not infer the user's intended format only after upload. Keep the first implementation slice limited to the current standard Post/JPEG contract, and label the other format paths as structural exploration until their workflows are supported.
- Use one fixed, device-frame-free Instagram preview family. Post and Carousel use the feed-post shell; Reel and Story use the full-screen shell. Source media may be cropped within that shell but must not resize the surrounding preview. Exact mobile chrome, controls, and safe areas remain open pending real Instagram screenshots.
- Reserve modal dialogs for consequential confirmations. Present AI metering, usage guidance, and generated suggestions through inline helper text, an expandable disclosure, a popover, or another non-blocking contextual surface.
- Give Ready content an explicit Return to Draft action. Returning preserves the saved content and planned values while removing readiness; it must not schedule or publish anything.
- Keep one visible Caption section label. Preserve an accessible field label without repeating the same visual heading.

**Still open**

- Whether generated media can be saved directly to a reusable Media Library without first attaching it to a content item. The current attachment contract does not establish this behavior.
- Final drop-zone size and accepted file rules for each content type.
- Whether every format should occupy one fixed outer Instagram viewport. The leading option is a device-frame-free, screen-proportioned viewport: Reel and Story fill it, while Post and Carousel render a normal feed card from the top and may reveal the beginning of the next feed item below.
- Exact Carousel ordering, Reel/Story controls, outer viewport ratio, preview crops, and publishing limitations. Review real Instagram mobile screenshots before fixing these values.

## Calendar

### 2026-08-25 — First redesign scope and connected hierarchy

**Accepted**

- Treat Week, Month, Day Focus, and Post Focus as states of one connected Calendar experience: `Week/Month → Day Focus → Post Focus`.
- Keep the Calendar and application shell recognizably visible behind Day/Post Focus, but make the background inert while the focus layer is open.
- Back from Post Focus returns to Day Focus; Back from Day Focus returns to Calendar. A separate explicit Back to Calendar action may close both focus levels.
- Encode the selected view, date, and item in URL-backed state so refresh, sharing, and browser Back preserve the hierarchy.
- Limit the first deliberate pass to the active workspace and its current Instagram account. Do not aggregate multiple workspaces or accounts.
- Design for desktop first at `1440x900 @ 1x` and `1366x768 @ 1x`, with English and Arabic/RTL in the same pass. Keep narrower layouts non-broken without treating a dedicated mobile Calendar redesign as part of this pass.

### 2026-08-25 — Truthful date placement and Unscheduled

**Accepted**

- Add an optional `plannedAt` (or equivalently named) timestamp for a saved `DRAFT`, transient `IN_REVIEW`, or Ready item backed by `APPROVED`.
- Treat the planned publication date and time as one value: both are supplied together or neither is supplied.
- A saved Draft/Ready item without `plannedAt` belongs in Unscheduled. A saved Draft/Ready item with `plannedAt` appears on that Calendar date at that time.
- Setting `plannedAt` expresses intent only. It must not change lifecycle status, enter the publishing queue, or cause automatic publication.
- Place `SCHEDULED` and recoverable `FAILED` content by `scheduledAt`, and place `PUBLISHED` content by `publishedAt`.
- Never use `createdAt` or `updatedAt` as a substitute publication date.
- Scheduling may default its confirmation control from `plannedAt`, but only the explicit scheduling action writes `scheduledAt`. Cancelling a schedule clears the planned value as well, returns the item to Ready, and moves it to Unscheduled.

**Deferred**

- Revisit creating content from a selected Calendar day with `plannedAt` prefilled.

### 2026-08-25 — Compact display titles

**Accepted for the least-cost first pass**

- Do not add dedicated title fields yet.
- Derive a compact display title from the first two or three meaningful words of the locale-preferred caption, followed by an ellipsis when more text exists.
- Fall back to the other-language caption, then content pillar, then localized content type when no suitable caption exists.

**Deferred**

- Revisit explicit bilingual content-title fields if derived labels become ambiguous or unstable in Calendar, Create, notifications, or analytics.

### 2026-08-25 — Solo-workspace lifecycle presentation

**Accepted**

- Optimize the first Calendar pass for one user, one active workspace, and one Instagram account.
- Keep `IN_REVIEW` available in the underlying lifecycle but do not promote it as a primary Calendar filter in the solo-workspace experience.
- Keep the readiness action in Create during this pass. Calendar owns schedule, reschedule, confirmed schedule cancellation, and legitimate failed-item recovery.
- Use a separate Needs attention treatment for `FAILED`; do not hide failure inside the ordinary Scheduled filter.
- Keep the backend `APPROVED` state unchanged, but present it as **Ready** in the solo-workspace interface. Use **Mark as ready** for the action that intentionally makes a draft eligible for scheduling.

**Terminology rule**

- **Save** means persist the user's work without changing its lifecycle eligibility; it must not replace **Mark as ready**.
- Reserve **Approve**, **Approval**, and **In review** for a real validation process, such as an authorized reviewer accepting another contributor's work or an explicit user decision on an AI-generated proposal.
- A future multi-user approval workflow may expose `IN_REVIEW` and `APPROVED` directly, but its roles, permissions, and transitions require a separate product decision.

### 2026-08-25 — Scale, filters, density, and metrics

**Accepted**

- Add a workspace-scoped Calendar read contract that can retrieve a requested date range, apply supported server-side filters, return truthful summary counts, and paginate Unscheduled content. Do not build the redesigned Calendar on the current newest-50-content limit.
- Primary filters are All, Draft, Ready, Scheduled, and Published, with Needs attention available for failed content.
- Add content-type filtering in the first pass. Defer Campaign filtering until a real campaign read/name contract exists.
- Preserve active filters when entering Day/Post Focus and provide a clear way to show all content.
- Week shows three or four compact items per day followed by `+N more`. Day Focus exposes the complete day collection and remains usable with approximately five to ten items.
- Month is a distribution view and does not show content titles. Each occupied day groups its content into compact status markers with distinct icon/color treatment and a count. The persistent status-filter row provides the visible color key, so Month does not need a second legend that consumes grid height. This keeps status and volume legible without turning each cell into a miniature content list.
- Month cells show the day's total volume separately. When a dense day cannot expose every status marker, prioritize Needs attention, Scheduled, and Ready before lower-action states and summarize the hidden remainder without introducing titles.
- Keep only actionable counts backed by the Calendar read contract. Do not show week-over-week trends until real historical aggregates support them.

### 2026-08-25 — Unscheduled placement

**Accepted**

- Keep Unscheduled as a separate expandable panel below the Week or Month calendar rather than between the calendar controls and grid.
- Expanding Unscheduled may extend the page downward, but it must not move the calendar grid away from its controls or obscure the active calendar view.
- Preserve the same filters when reviewing Unscheduled content, and keep each item linked to the existing Create editor.

### 2026-08-25 — Calendar action feedback

**Accepted**

- Do not reserve persistent page space for transient success or error messages after scheduling, rescheduling, or cancelling a schedule.
- Present Calendar action feedback as a compact dismissible toast. Success feedback disappears automatically after a short interval; errors remain slightly longer while still allowing immediate dismissal.
- Keep confirmation dialogs only for consequential actions that require a deliberate decision, such as cancelling a schedule.
- Cancelling from Post Focus returns one level to the originating Day Focus and uses timed feedback to state that the Ready post moved to Unscheduled. Keep Unscheduled expanded for the user's eventual return to Calendar, and clear a Scheduled-only filter because it can no longer represent the moved item.

### 2026-08-25 — Post Focus scope and actions

**Accepted for the first pass**

- Keep the selected day list stable while the selected Post Detail pane changes.
- On desktop, keep the Day context and Post Detail as independent scroll regions so reviewing long details does not remove the selected date or neighbouring posts from view.
- Use only real existing data: media, derived title, status, content type, truthful date/time, created/updated timestamps, captions, hashtags, CTA, content pillar, and failure information.
- Edit opens the existing Create editor. For Ready content backed by `APPROVED`, copy must explain that reopening invalidates readiness before editing.
- Published content may link only to an insights destination genuinely supported by the current application; do not imply that a dedicated post-insights view exists.

**Deferred**

- Campaign names, creator attribution, category, general-purpose tags, and any unsupported post-specific insights.

### 2026-08-25 — Motion and later interaction

**Accepted**

- Spatial continuity is essential. Calendar → Day must visibly originate from the selected date and reverse on close. Day → Post must preserve the day context while expanding the detail workspace.
- The first pass may use a restrained origin-aware transform rather than a perfectly interpolated shared-element animation, provided the hierarchy remains visually clear and routine use stays quick.
- Provide a reduced-motion alternative that preserves the same state hierarchy without scale or travel effects.

**Deferred**

- Additional shared-element polish if the initial origin-aware transition cannot achieve the desired fidelity within the focused implementation pass.
- Drag-and-drop, rearrange mode, and scheduling-change confirmation through dragging.
- Dedicated mobile Calendar interaction design.
- Reusing Calendar as the Login product preview until the production Calendar direction is stable enough to represent truthfully.

### 2026-08-25 — Foundation required before motion

**Accepted**

- Status and content-type filters are server-backed, represented in the Calendar URL, and apply consistently to Week, Month, Day Focus, Post Focus, and Unscheduled content. Keep the summary stable under status filtering so it remains an orientation aid rather than changing meaning with each status selection.
- Week day headers and content items are separate controls. Selecting a day enters Day Focus; selecting a post enters Post Focus through a real intermediate Day history state so Back and Escape still unwind Post → Day → Calendar.
- Day Focus and Post Focus use dialog semantics, move initial focus into the focused surface, trap Tab within the active layer, and restore focus to the originating Calendar control when closed. A nested confirmation restores focus to its invoking action when dismissed.
- These data, state, navigation, focus, and responsive-desktop foundations are required before adding spatial animation. Motion must enhance the same state hierarchy rather than define or repair it.

**Still deferred**

- Drag-and-drop scheduling or rescheduling. A later pass must define eligible statuses, require an explicit confirmation before any date/time mutation, make the source and proposed destination unambiguous, and retain non-drag controls as an accessible alternative.

### 2026-08-25 — Calendar motion and drag-and-drop technology research

**Status: superseded on 2026-08-26 by the accepted Motion adoption below; retained as the research record**

- Use a focused **Motion for React** proof as the next motion step. Its shared-layout, presence, coordinated-layout, scroll-measurement, and reduced-motion primitives map directly to `Calendar → Day Focus → Post Focus` while allowing the existing URL, history, focus, and product-state contracts to remain authoritative.
- Keep CSS transitions and the Web Animations API for small local effects such as hover, emphasis, and toasts. Do not continue expanding the current manual geometry orchestration unless the library proof fails.
- Treat **GSAP Flip** as the fallback when Motion cannot reliably handle the Calendar's nested scrolling, overlay geometry, or interruption requirements. Do not adopt both motion libraries in the same pass.
- Do not base this interaction on React or Next.js View Transitions yet because the relevant framework integration remains experimental.
- Use the official Motion App Store and shared-layout modal examples, plus the Motion Primitives morphing-dialog example, as focused behavioral references. Do not replace the custom MarkOS Calendar with a generic calendar or modal template.

**Motion proof gate**

- Cover Week/Month → Day, Day → Post, Post → another Post, and the corresponding reverse transitions.
- Validate interruption, independent scrolling, focus restoration, English, Arabic/RTL, and reduced-motion behavior at the desktop reference viewport before integrating the approach broadly.
- If the proof succeeds, replace the manual morph orchestration without changing scheduling behavior. If it fails on a concrete geometry limitation, evaluate GSAP Flip against the same proof.

**Later drag-and-drop recommendation**

- Evaluate **dnd kit** first for explicit handles, pointer and keyboard sensors, activation constraints, drag overlays, per-item eligibility, and precise date-cell collision detection. Pin the version proven by an isolated prototype before integrating it.
- Keep Atlassian Pragmatic Drag and Drop as the fallback if dnd kit proves unsuitable for the Calendar's grid, accessibility, or future volume requirements.
- Keep drag-and-drop separate from the motion migration. Start with local proposal state only: entering an explicit Rearrange mode enables valid sources and targets, dropping proposes a move, and a confirmation presents the exact source date/time and destination date/time before any API mutation.
- Preserve non-drag Move, Schedule, and Reschedule controls as accessible and safe alternatives. Unscheduled → date must require choosing or confirming a time before saving.

**Primary references**

- Motion layout animation: <https://motion.dev/docs/react-layout-animations>
- Motion LayoutGroup: <https://motion.dev/docs/react-layout-group>
- Motion AnimatePresence: <https://motion.dev/docs/react-animate-presence>
- Motion reduced-motion configuration: <https://motion.dev/docs/react-motion-config>
- Motion App Store example: <https://motion.dev/examples/react-app-store>
- Motion shared-layout modal example: <https://motion.dev/examples/react-modal-shared-layout>
- Motion Primitives morphing dialog: <https://motion-primitives.com/docs/morphing-dialog>
- GSAP Flip: <https://gsap.com/docs/v3/Plugins/Flip/>
- dnd kit sensors: <https://dndkit.com/react/guides/sensors/>
- dnd kit collision detection: <https://dndkit.com/react/guides/collision-detection/>
- Atlassian Pragmatic Drag and Drop accessibility guidance: <https://atlassian.design/components/pragmatic-drag-and-drop/accessibility-guidelines/>

### 2026-08-26 — Desktop Calendar density and shell hierarchy

**Accepted**

- Remove the redundant authenticated desktop header. On desktop, the sidebar identifies the active section and each page owns one authoritative heading. Keep a compact section header only where the desktop sidebar is absent.
- Keep language selection and account controls in Settings rather than repeating them above every authenticated page.
- At `1440x900 @ 1x`, Week, Month, and the collapsed Unscheduled panel should fit in the initial viewport. At `1366x768 @ 1x`, the complete Week or Month calendar grid must remain visible; Unscheduled may continue below the fold.
- Keep Month titleless. A dense day shows at most three prioritized status markers plus one `+N` remainder, while its accessible name retains the complete item and status summary.
- Use the persistent filter row as the status color key and remove a separate Month legend.
- Replace the duplicated three-card Calendar summary with a compact title/action row and one persistent filter toolbar. Keep the stable Ready, scheduled-this-week, and needs-attention counts by embedding them in their corresponding filter controls.
- Use larger Month weekday and date typography, with Arabic dates sharing the same `font-bold` treatment as muted outside-month dates. Differentiate outside-month, current-month, selected, and Today states through color and surface treatment rather than switching numeral weight.
- Keep the Calendar canvas and ordinary content surfaces predominantly white. Use restrained brand tint for selection and reserve stronger semantic color for status dots, markers, badges, and logical-edge accents.

**Status palette for this pass**

- Draft uses slate, Ready uses blue, Scheduled uses orange, Published uses green, Needs attention uses rose, and the underlying review state uses violet.
- Color is never the only status cue; labels, icons, counts, and accessible names remain authoritative.
- These are semantic UI tokens rather than a final lock on every MARKOS brand color. Revisit them through the shared design-foundation process if the broader palette changes.

### 2026-08-26 — Motion for React adoption and interaction outcome

**Accepted**

- Adopt the pinned `motion` package for the Calendar focus hierarchy and load its DOM feature bundle lazily inside Calendar rather than making it shell-wide infrastructure.
- Keep URL state, browser history, focus management, dialog semantics, API mutations, and reduced-motion behavior authoritative. Motion explains the hierarchy; it does not own product state.
- Use short tween-based transitions and opacity changes for routine navigation. Avoid persistent backdrop blur and broad layout animation that make the interface feel slow or leave an inert visual layer behind.
- A direct post selection still constructs the logical `Calendar → Day → Post` history chain. Escape, Back, and explicit close actions progressively unwind that chain and restore focus to the originating Calendar control.
- Preserve the Day overview as a distinct state. Direct Post Focus accelerates known-item review, while Day Focus remains the complete date-level overview and the intermediate navigation context.

**Still deferred**

- Drag-and-drop scheduling and rescheduling remain a separate safety-sensitive pass. Do not begin it until explicit eligibility, activation, confirmation, time selection, cancellation, and accessible non-drag alternatives are agreed and tested.
- Further shared-element polish remains optional. Prefer responsive routine interaction over longer or more cinematic motion.

### 2026-08-27 — Calendar desktop checkpoint

**Accepted and frozen**

- Treat the current English and Arabic desktop Calendar as the accepted working baseline while product refinement moves to the shared shell and then Create. Preserve its Week and Month overview, status and content-type filters, Unscheduled collection, Day and Post Focus hierarchy, lifecycle actions, URL/history state, keyboard focus behavior, and reduced-motion path.
- The complete active Week and Month grids remain first-viewport requirements at the named desktop checkpoints. The compact filter toolbar, titleless Month cells, larger localized dates, predominantly white surfaces, semantic status treatments, and separate below-calendar Unscheduled collection are part of this baseline.
- A freeze means no opportunistic Calendar redesign during another surface's pass. Reopen Calendar only through a scoped correction or a separately reviewed motion, accessibility, responsive, or drag-and-drop pass.

**Deferred when this checkpoint closes**

- Refine the source-aware Day/Post transition only in an isolated motion prototype before reintegrating it. Include rapid input, interrupted transitions, reverse navigation, and stale-overlay removal in that pass's acceptance criteria.
- Keep scheduling and rescheduling drag-and-drop deferred with the safeguards already recorded above.
- Mobile Calendar composition remains outside the current desktop-first scope until the mobile companion capability set is decided.

## Shared shell and sidebar

### 2026-08-26 — Explicit desktop sidebar collapse

**Accepted**

- Keep the desktop sidebar expanded by default and provide one explicit edge control that collapses it into a stable icon rail. Do not auto-expand on hover.
- Use one fixed icon column in both expanded and collapsed states so every navigation glyph retains its exact horizontal position. Omit a separate Workspace eyebrow and use slightly larger navigation icons for faster scanning.
- Persist the user's collapsed/expanded preference in browser-local storage. The preference is presentational and does not require a backend or workspace contract.
- Keep navigation routes, labels, active-page semantics, and keyboard access unchanged. In the compact rail, retain accessible link names and show the localized label on hover or keyboard focus.
- Keep the MARKOS brand at the top, the six primary workspace destinations together, and Settings separated at the bottom. Do not add a decorative avatar or an inert profile control.
- Use logical positioning and logical-edge active accents so the rail, collapse control, and tooltips mirror correctly in Arabic/RTL. Respect reduced-motion preferences and let the page canvas reflow rather than covering it.
- Treat the supplied 21st.dev sidebar as a visual reference only. No source was reused; the implementation stays within the existing MARKOS application shell, route, token, icon, and Motion foundations.

**Deferred**

- Keep the existing compact narrow-screen navigation for now. A dedicated mobile navigation redesign belongs to the later mobile-management scope decision.

### 2026-08-26 — Web typography weight

**Accepted**

- Remove the 900/`font-black` weight from the active MARKOS web UI because its dense glyphs reduce readability, especially in Arabic and compact controls.
- Use 700/`font-bold` consistently for headings, important values, labels, and emphasized content. Preserve hierarchy through type size, spacing, contrast, and surface treatment rather than introducing a heavier weight.
- This is a readability correction for the current type system, not approval of Inter or any other family as the permanent MARKOS typography. Font-family, bilingual pairing, scale, and role choices remain open to a focused foundation review.

## Onboarding

### 2026-08-30 — Reduced-effort business setup checkpoint

**Accepted**

- Introduce the journey with one concise greeting, then use seven short business modules followed by an information check and an editable bilingual Business Profile. Keep English and Arabic/RTL behavior in the same pass.
- Treat Company and Products as the only essentials for the first profile. Let the owner explicitly skip Story, Audience, Competitors, Brand/Tone, and Objectives without presenting optional context as mandatory setup.
- Replace the clickable module sidebar with a compact Previous, Current, and Next context strip. Leave a missing previous or next label visually blank rather than displaying placeholder punctuation.
- Use open fields for products and services, tone, and current priority. Suggestions may populate or remove values, but they do not replace free-form input. Limit tone to four words and keep one combined products-and-services field rather than requiring item-by-item entry.
- Keep Why this helps as the primary contextual explanation. Advance after a successful save without an overlay toast; show failures as readable inline recovery messages.
- Keep ordinary desktop step panels and their action rows visually stable as content changes. The information check and editable profile may use natural height because their review task is materially denser.
- Make every information-check row a direct edit action, then return the owner to the check after saving or backing out of that focused edit.
- Increase Onboarding's small labels, help text, body copy, and controls locally. Reuse the current Sunlit hierarchy and predominantly white surfaces, but do not import Calendar's lifecycle palette or treat the still-open shared font and color exploration as approved production foundation.

**Deferred**

- Superseded on 2026-09-01: document-assisted extraction, retention, and the whole-business path required a separate policy and validation pass before implementation.
- The product-wide notification redesign and final shared font and palette selection remain outside this Onboarding checkpoint.

### 2026-08-31 — Bounded fields, structured offerings, and desktop review density

**Accepted**

- Supersede the single combined Products/Services field with compact offering rows for type, name, short description, and BHD price. Do not show a redundant overall-summary field above the primary table. Keep document extraction as an optional accelerator and use the same structured correction surface for its proposal.
- Store displayed BHD prices as integer fils at the application boundary. Leave price blank when it varies or is unknown; do not imply support for ranges, starting prices, or quotations until the catalog update contract can preserve those meanings.
- Keep prose fields at a deliberate fixed height. Disable manual resizing and use a narrow, low-contrast vertical scrollbar only when content exceeds the field. Use single-line scrolling for table cells; do not copy Pomelli's horizontal treatment onto ordinary wrapping prose.
- Put **Why this helps** in a separate desktop rail so it no longer reduces the working width of every field. Keep the primary card and action positions stable across ordinary steps.
- Place the Products/Services document-analysis entry point directly below that desktop help rail. Keep active analysis review in the wider working area so extracted rows remain practical to inspect and correct.
- Use a wider two-column information check at desktop reference sizes. Avoid an internal page-sized scroll region for the ordinary review case.
- In explicit edit mode, label the final action **Save changes** and return to Business Profile without presenting another AI-generation step.

**Deferred**

- The narrow-screen contextual-help disclosure and outside-click behavior.
- A dedicated Business Profile knowledge editor that replaces the temporary return through onboarding.
- Rich offering price semantics such as from, range, free, and quotation-required.
- Decorative card fades or more elaborate overflow animation unless browser evidence shows that the simpler bounded surfaces are insufficient.

### 2026-09-01 — Two-path greeting and full-business document assistance

**Accepted**

- Keep the greeting minimal and logo-free in its central content. Present **Use business documents** and **Enter details myself** as equal-size, unmistakable CTA cards beneath the larger, slightly elevated welcome heading.
- Give business-document assistance its own first-run screen rather than forcing it into one of the seven manual steps. Let the owner stage up to five supported files, see a compact filename/type list, remove individual selections, and explicitly choose **Analyze files**. Selecting another file appends to the staged batch instead of replacing it.
- Accept PDF, DOCX, UTF-8 TXT, JPEG, PNG, and WebP in this path. Keep source files temporary and describe the result as information MARKOS found, not as approved truth.
- After analysis, populate the same seven-area draft and take the owner to the ordinary information check. Show review issues and the source-file count, keep every area editable, and retain **Discard and choose different files** until analysis approval.
- Keep the Products/Services-only analyzer inside that step as a separate optional shortcut. The two document paths have different scopes and limits and must not share ambiguous UI state.
- Use a deliberate business-color control in the Brand step: selecting a color creates a pending choice, **Add color** commits it, existing swatches remain editable/removable, duplicate colors are rejected, and the saved list is limited to seven.
- Treat this as the closed Onboarding checkpoint. Future work should be limited to focused defects, deployed-provider evidence, responsive/accessibility hardening, or an explicitly reopened product decision.

**Deferred**

- Permanent logos, brand-guideline files, or a reusable brand asset library.
- A conversational assistant that asks follow-up questions about ambiguous extraction; the current proposal/issues/review flow is the implemented boundary.
- The dedicated post-onboarding Business Profile knowledge editor described above.


## 2026-09-06 — Persistent Create conversations and deferred commercial quotas

Khalid selected durable text conversations first, keeping image/video generation in the existing Media controls. Each post owns one saved thread across Create, Campaign and Calendar. Clear draft-text requests apply and save directly; discussion and suggestions remain messages. Messages, request identity, processing state and failed/conflicting outcomes persist. Revision checks protect current copy and approval without adding Undo. The API validates allowed changes and rechecks workspace authorization.

Commercial quotas, including the one-Campaign allowance and billing/trial eligibility gates, are deferred until the product functionality is established. Retain existing diagnostic usage records; remove blocking behavior and simulated quota UI. No new billing or cost-reporting work belongs to this pass. Provider constraints and authorization remain enforced.

The composer now accepts natural messages without the Generate/Revise/Explore selector. Sent messages and applied edits are saved; Leave remains available while a durable conversation run is processing. Visual direction is now a persisted draft field. See `docs/create-conversation-backend.md` for the implemented data contracts and verification boundary.

## 2026-09-07: Business Profile uses focused editing and explicit consequences

Khalid emphasized simplicity, contrast, consistency, low cognitive load, user control, and user understanding. Apply these principles to the planned Business Profile editor: show readable saved knowledge, reveal focused editing in modals, and prevent overlapping editing tasks in the page. Use confirmation for meaningful discard/archive consequences; an ordinary Save does not need another confirmation. Preserve readable typography and comfortable controls, and avoid persistent routine notifications that move page content.

The detailed candidate is recorded in [the Business Profile plan](business-profile-plan.md): a wide profile surface, searchable and filterable offering rows, and one offering editor at a time. Khalid narrowed the first increment to manual editing; remove the earlier assistant panel and AI change-review states from this candidate, and do not reserve empty space or show disabled AI controls. The layout remains a prototype proposal awaiting visual review. Keep crowded forms, nested dialogs, and bulk editing out of the first candidate; preserve keyboard accessibility and Arabic/RTL parity.

Use **Marketing strategy** as the section name. Add a simple owner-reported establishment-stage field to Business basics in Onboarding and the corresponding Business Profile editor. Its wording must describe how established the business is without claiming to score its quality, size, or competence. Prefer stable, readable business information over a page that pressures the owner to keep changing it.

## 2026-09-10 — Focused sidebar, Create, and review follow-ups

- Widen the collapsed rail enough to preserve comfortable icon targets without horizontal scrolling. Keep expanded navigation unchanged and preserve hover/focus labels outside the navigation's clipping area.
- After Khalid's width feedback, settle the collapsed rail at **96px** instead of the first follow-up's 104px. Reduce its inline padding with the rail so icon targets and tooltip behavior retain their usable space.
- Keep Create's conversation primary, including when a saved post already has media. A persistent thumbnail with **View preview** opens the preview deliberately; **Back to MARKOS** returns to the conversation. New attachments briefly emphasize the preview control without changing the view or focus. Replace the earlier narrow 6:19 outer preview with 9:19, bounded to a desktop maximum of 342 × 722px. Preserve the manual editor and existing lifecycle controls.
- Use recognizable icons with visible names for new content-type choices. Emphasize the unset choice briefly, honor reduced motion, and keep an existing type compact. Replace the visible MARKOS working sentence with one accessible spinner in the companion heading.
- Plan Campaign review as a full-screen hierarchy with overview, period, day, and post scales. Do not introduce a saved reviewed state; retain the working 3/7/14-day generation range while developing the interface for longer plans.
- Reuse the existing five-section Business Profile prototype for the manual editing integration. Its approved direction remains relevant; its simulated saves have not yet been connected to the mounted application. See [the focused pass plan](analysis/focused-product-followups-2026-09-10.md) for backend dependencies and verification boundaries.

### Campaign reviewer approved by Khalid and Mohamed

The September 10 full-screen Campaign review prototype is approved for implementation. Preserve its Campaign index → Overview/Week/Month → Day → Post hierarchy and direct short-plan entry. Use independent panel scrolling where useful, without requiring visible panel borders. Frequently used Previous/Next actions must stay visible and in a stable position while navigating or scrolling. Apply restrained semantic color to status/count/category distinctions where the real data benefits; labels remain visible. These refinements do not add a reviewed state, expand generation beyond 3/7/14 days, or change the same-record Create handoff.
