# MARKOS UI/UX Workflow

- Status: active working method
- Adopted: 2026-08-23
- Updated: 2026-08-27
- Visual foundation: docs/ui-design-foundation.md
- UI decisions: docs/ui-ux-decisions.md

This workflow keeps visual exploration useful without allowing a screenshot, template, meeting note, or design export to silently redefine MARKOS behavior.

## Authority and evidence

Use the following order when UI inputs disagree:

1. docs/source/MARKOS_EXPERIENCE_FLOWS.md governs journeys, state transitions, approval boundaries, and failure behavior.
2. docs/source/MARKOS_BUILD_SPEC. 2.pdf governs product structure and target surface area.
3. docs/decisions.md records later explicit product and implementation decisions.
4. docs/ui-ux-decisions.md records accepted UI-specific presentation and interaction choices that stay within those product contracts.
5. docs/ui-design-foundation.md governs the adopted Sunlit visual and interaction direction.
6. Mounted application source is evidence of what users can see and use now.
7. Research, templates, screenshots, Figma files, and stakeholder feedback are inputs to interpret, not requirements by themselves.

The product team may accept, reframe, defer, or reject feedback. A suggestion earns its place through a clear user problem, fit with the MARKOS journey, and an implementable acceptance criterion.

## Documentation rule

Keep raw meeting notes and unprocessed feedback outside the active repository documentation. Promote only an interpreted record containing:

- the user problem or opportunity;
- the proposed direction;
- whether it is accepted, exploratory, deferred, or rejected;
- the behavior and data contracts that must remain true;
- the observable acceptance criteria.

Record accepted presentation, interaction, naming, density, and viewport choices in docs/ui-ux-decisions.md. Record product behavior, lifecycle, data-contract, security, permission, or infrastructure decisions in docs/decisions.md. Keep unresolved design problems and prototypes in docs/ui-ux-improvement-plan.md.

Handle an obsolete UI document once: extract what remains useful into an active document, move the original to docs/archive/ui, repair references, and do not leave a second active-looking checklist behind.

## Reference intake

For each surface or interaction:

1. State the user job and the point in the journey.
2. Name the important states, data, actions, locale, and viewport.
3. Collect a small set of focused references rather than one whole product to copy.
4. Annotate each reference with what to borrow, what to avoid, and why.
5. Check the direction against Sunlit, the experience flows, accessibility, Arabic/RTL, and current application contracts.

Useful user input can be informal. A screenshot plus what feels wrong, what should remain, and what the user expected is enough; the implementation record should translate that into precise UI terms.

Do not copy template code, sample data, brand identity, or interaction behavior wholesale. References may inform hierarchy, composition, density, component treatment, or motion while MARKOS retains its own contracts and identity.

## Pass lifecycle and checkpoints

Use one lightweight lifecycle for each consequential surface or connected workflow:

1. Write a short initiative brief: user, job, outcome, scope, exclusions, important states, data dependencies, viewport, locale, and acceptance criteria.
2. Audit the mounted experience and current contracts before collecting references.
3. Time-box focused workflow and reference research around the unresolved decisions.
4. Prototype the risky information architecture or interaction and pass the review gate below.
5. Implement one connected vertical slice without silently expanding its product or backend scope.
6. Run focused automated checks and browser-visible validation for the changed slice.
7. Create a checkpoint: record the accepted baseline, evidence, known limitations, deferred work, and next handoff before committing it.

A checkpoint may be intentionally good enough rather than final. Once a surface is frozen, do not keep making opportunistic corrections while another initiative is active. Reopen it through a new scoped pass with its own acceptance criteria. Urgent regressions and data-loss, accessibility, security, or broken-journey defects may interrupt a freeze; ordinary polish belongs in the deferred list.

## Figma review model

The shared MarkOS AI Figma workspace currently reflects the superseded dark-luxury direction. Treat those frames as historical reference only. They do not define the active palette, typography, shell, navigation, components, or layout. New work must be clearly separated and labeled as Sunlit, then checked against the authority order above before review.

Use one shared MARKOS Sunlit UI Lab file or clearly separated page set when Figma write access is available:

- 00 Decisions — short links to accepted repository decisions.
- 01 References — annotated screenshots and source links.
- 02 Explorations — disposable alternatives and wireframes.
- 03 Review — the current candidate with numbered frames.
- 04 Approved — visually reviewed frames ready for implementation.
- 05 Comparison — implementation screenshots beside the approved frames.

Khalid may review, comment where enabled, provide feedback, and approve through a View seat. Codex may create or update frames only when the active Figma connection has write permission; Khalid's viewer access does not itself grant that permission. Verify the connected identity's access before promising a Figma deliverable. If write access is unavailable, use a browser-rendered prototype or annotated screenshots without making Figma a blocker.

For material navigation, information-architecture, or product-direction decisions, include Mohamed's review before moving a candidate to Approved. Figma approval confirms the visual direction; it does not override product behavior or data contracts.

Never describe a Figma preview as complete until the intended frames exist and have been visually inspected. If Figma access is unavailable, use a browser-rendered prototype or annotated screenshots and follow the same review states.

## Prototype gate

Prototype before implementation when a change materially affects navigation, information hierarchy, a multi-step journey, or a dense working surface.

A review candidate should show:

- the default or populated state;
- the most important empty, loading, error, and blocked state;
- the primary desktop layout;
- the narrow/mobile composition when it changes the interaction;
- Arabic/RTL when direction or copy length could change the result.

Small visual corrections may proceed directly to code when their intended result is unambiguous.

## Implementation pass

Implement one connected user slice at a time:

1. Preserve session, workspace, API, approval, quota, accessibility, and recovery behavior.
2. Reuse or extend semantic Sunlit tokens and shared components before adding page-specific values.
3. Keep manual and AI-assisted paths distinct wherever AI is optional.
4. Replace examples with real data, honest empty states, or explicitly marked fixtures.
5. Keep English and Arabic behavior in the same pass.
6. Record accepted UI-specific choices in docs/ui-ux-decisions.md, and record durable product or data-contract decisions in docs/decisions.md when the active sources are silent.

## Chrome DevTools MCP desktop workflow

Use the existing persistent Chrome DevTools MCP for browser-visible investigation and implementation feedback. Reuse the current authenticated tab and browser context instead of opening a fresh session unless isolation is required. If authentication expires, open the sign-in page and pause for Khalid to sign in interactively; never request pasted credentials.

At the start of each desktop pass:

1. Select the existing mounted application tab.
2. Emulate a `1440x900` viewport at device-pixel ratio `1`; do not rely on resizing the outer browser window.
3. Verify the effective viewport and document direction in the page:

```js
() => ({
  url: location.href,
  width: innerWidth,
  height: innerHeight,
  dpr: devicePixelRatio,
  lang: document.documentElement.lang,
  dir:
    document.documentElement.dir ||
    getComputedStyle(document.documentElement).direction,
  horizontalOverflow:
    document.documentElement.scrollWidth >
    document.documentElement.clientWidth,
})
```

4. Capture one accessibility snapshot and keep the viewport fixed until testing a named breakpoint.

Keep iteration fast and reproducible:

- Batch predictable dependent actions in one orchestration call, such as select tab -> emulate -> verify -> snapshot, or fill form -> click -> wait for outcome.
- Include the resulting snapshot with navigational or state-changing clicks. Use only identifiers from the latest snapshot because a render may invalidate earlier ones.
- Prefer explicit waits for known UI outcomes over arbitrary delays. Let hot reload update the current tab; reload only when the application state requires it.
- Use real clicks, keyboard input, and form filling for workflow validation. Page evaluation is diagnostic only; do not inject DOM, storage, API responses, or application state to manufacture a successful journey.
- Inspect console or network details when a visible symptom calls for them, rather than on every pass.
- Take screenshots only at meaningful checkpoints: the original state, the principal candidate state, an important workflow boundary, and the Arabic/RTL counterpart. Prefer viewport captures; use full-page captures for overflow or density and element captures for focused components.

Desktop is the default refinement scope. Validate `1440x900 @ 1x` throughout a pass, then use `1366x768 @ 1x` as the compact desktop checkpoint and `1920x1080 @ 1x` when wide-screen density or maximum width matters. Verify Arabic/RTL at the same named desktop viewport. Tablet and mobile are required only when the task or agreed product scope includes that route; this working rule does not permanently exclude either surface.

Before completing a pass, validate the changed screen and its nearest handoff through the real UI. For Create, that connected boundary is action hub -> editor -> approval -> scheduling; a complete product-wide browser run is not required for every visual edit.

## UI acceptance matrix

Validate only the routes and behavior changed by the pass, but cover the dimensions that are relevant to that slice:

| Dimension | Minimum evidence |
| --- | --- |
| Function | Primary action, navigation, form behavior, and recovery path work |
| States | Starting or empty, loading, error, success, and limit or blocked where applicable |
| Desktop | `1440x900 @ 1x` throughout; `1366x768 @ 1x` compact checkpoint; `1920x1080 @ 1x` when density or maximum width matters |
| Tablet | Approximately 1024px only when the route or task is in tablet scope |
| Mobile | Approximately 390px only when the route or task is in mobile scope |
| Localization | English and Arabic; verify direction, reading order, truncation, and locale formatting |
| Accessibility | Semantic headings, labels, keyboard operation, visible focus, contrast, and reduced motion |
| Integrity | No invented customer data, provider state, analytics, success, or quota |

Use the Chrome DevTools MCP workflow above for rapid authenticated exploration, state inspection, and final real-interaction validation. Use the repeatable UI screenshot harness for named comparison evidence when it is available and in scope. Follow the focused testing rules in AGENTS.md; visual work does not automatically justify the complete repository suite.

## Review outcome

Each reviewed item ends in one of four states:

- Accepted — clear enough to implement and validate.
- Explore — needs alternatives or user evidence.
- Deferred — useful but outside the current pass.
- Rejected — conflicts with product behavior, lacks value, or creates unnecessary complexity.

Record the rationale. Do not leave rejected ideas as unchecked tasks in an active checklist.
