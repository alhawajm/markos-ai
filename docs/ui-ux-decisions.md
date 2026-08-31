# MARKOS UI/UX Decisions

- Status: active decision register
- Started: 2026-08-25
- Last updated: 2026-08-30
- Workflow: `docs/ui-ux-workflow.md`
- Visual foundation: `docs/ui-design-foundation.md`

This register records accepted presentation, interaction, naming, density, and viewport decisions for MARKOS. It exists so focused frontend decisions remain easy to find without turning `AGENTS.md` into a page-specific checklist.

Product behavior, lifecycle rules, data contracts, security, permissions, and infrastructure still belong in `docs/decisions.md` when the authoritative specification and experience flows are silent. Open design questions and prototypes remain in `docs/ui-ux-improvement-plan.md`. An entry here must not override the build specification, experience flows, or a durable product decision.

Each surface entry should state what is accepted, what remains deferred or open, and the observable consequence for implementation and review.

## Create

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

- Document-assisted extraction, upload retention, processing quotas, and a future whole-business automatic path remain a separate pipeline with their own policy and validation pass.
- The product-wide notification redesign and final shared font and palette selection remain outside this Onboarding checkpoint.
