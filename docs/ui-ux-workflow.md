# MARKOS UI/UX Workflow

- Status: active working method
- Adopted: 2026-08-23
- Visual foundation: docs/ui-design-foundation.md

This workflow keeps visual exploration useful without allowing a screenshot, template, meeting note, or design export to silently redefine MARKOS behavior.

## Authority and evidence

Use the following order when UI inputs disagree:

1. docs/source/MARKOS_EXPERIENCE_FLOWS.md governs journeys, state transitions, approval boundaries, and failure behavior.
2. docs/source/MARKOS_BUILD_SPEC. 2.pdf governs product structure and target surface area.
3. docs/decisions.md records later explicit product and implementation decisions.
4. docs/ui-design-foundation.md governs the adopted Sunlit visual and interaction direction.
5. Mounted application source is evidence of what users can see and use now.
6. Research, templates, screenshots, Figma files, and stakeholder feedback are inputs to interpret, not requirements by themselves.

The product team may accept, reframe, defer, or reject feedback. A suggestion earns its place through a clear user problem, fit with the MARKOS journey, and an implementable acceptance criterion.

## Documentation rule

Keep raw meeting notes and unprocessed feedback outside the active repository documentation. Promote only an interpreted record containing:

- the user problem or opportunity;
- the proposed direction;
- whether it is accepted, exploratory, deferred, or rejected;
- the behavior and data contracts that must remain true;
- the observable acceptance criteria.

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

## Figma review model

Use one shared MARKOS UI Lab file when Figma access is available:

- 00 Decisions — short links to accepted repository decisions.
- 01 References — annotated screenshots and source links.
- 02 Explorations — disposable alternatives and wireframes.
- 03 Review — the current candidate with numbered frames.
- 04 Approved — visually reviewed frames ready for implementation.
- 05 Comparison — implementation screenshots beside the approved frames.

Khalid may review and comment through a free View seat. Codex may build through the connected design account. Editing access is optional and depends on the owning Figma plan and seat.

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
6. Record a durable decision in docs/decisions.md when the active sources are silent.

## UI acceptance matrix

Validate only the routes and behavior changed by the pass, but cover the dimensions that are relevant to that slice:

| Dimension | Minimum evidence |
| --- | --- |
| Function | Primary action, navigation, form behavior, and recovery path work |
| States | Starting or empty, loading, error, success, and limit or blocked where applicable |
| Desktop | 1440px working layout; use 1920px when density or maximum width matters |
| Tablet | Approximately 1024px when the layout changes |
| Mobile | Approximately 390px when the route is in mobile scope |
| Localization | English and Arabic; verify direction, reading order, truncation, and locale formatting |
| Accessibility | Semantic headings, labels, keyboard operation, visible focus, contrast, and reduced motion |
| Integrity | No invented customer data, provider state, analytics, success, or quota |

Use Playwright Interactive for rapid authenticated exploration and state inspection. Use the repeatable UI screenshot harness for named comparison evidence. Follow the focused testing rules in AGENTS.md; visual work does not automatically justify the complete repository suite.

## Review outcome

Each reviewed item ends in one of four states:

- Accepted — clear enough to implement and validate.
- Explore — needs alternatives or user evidence.
- Deferred — useful but outside the current pass.
- Rejected — conflicts with product behavior, lacks value, or creates unnecessary complexity.

Record the rationale. Do not leave rejected ideas as unchecked tasks in an active checklist.
