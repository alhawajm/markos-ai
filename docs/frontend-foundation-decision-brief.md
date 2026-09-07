# MARKOS Frontend Decision Brief

- Status: **reviewed checkpoint; broad migrations remain deferred**
- Date: 2026-08-30
- Scope: decisions that could materially affect the next frontend passes
- This file records the outcome of the frontend-foundation challenge. It does not authorize another migration or dependency installation.

## Executive recommendation

Keep the current frontend foundation for now. Do not bundle a Tailwind migration, a component-system adoption, and a new UI workshop into the active redesign work.

The scoped **Motion for React** proof succeeded and is retained for Calendar focus navigation and the Onboarding greeting/step transitions. This is not a mandate to animate every surface or adopt Motion for unrelated controls. Everything else still waits for a concrete trigger.

In the meantime, improve delivery speed with the existing stack: extract reusable pieces around the surface being changed, consolidate browser-test fixtures, and reuse external source selectively after review.

## Adoption test

A migration or dependency should be introduced only when all of these are true:

1. It solves a specific, repeated problem in MARKOS.
2. The current platform or installed stack cannot solve that problem at comparable cost and quality.
3. The benefit will be used in the next one or two development passes.
4. The change can be proven and reversed within a narrow boundary.
5. English, Arabic/RTL, keyboard use, accessibility, reduced motion, and existing behavior can be preserved.

## Challenged decisions

| Topic | Decision now | Why | Revisit when |
| --- | --- | --- | --- |
| **Tailwind CSS 3 → 4** | **Defer.** Keep Tailwind 3.4. | There is no measured Tailwind build or styling bottleneck. Migration would change the PostCSS setup, the JavaScript token bridge, and utility semantics across an already large UI. The current code contains affected patterns such as `shadow-sm`, `outline-none`, `space-y-*`, and implicit border styling. Tailwind 4 also requires a modern-browser support decision. shadcn does not require this migration for an existing Tailwind 3 app. | We intentionally rebuild the design-token layer, establish supported browser versions, or measure Tailwind 3 as a real development bottleneck. |
| **shadcn/ui** | **Do not adopt it wholesale.** Use its open-code model only as a source of individual candidates. | Running an initializer or importing a block can alter files and add transitive dependencies. MARKOS would own every copied component and its future maintenance. This is useful only when a named component saves more work than adapting it costs. | A specific missing or repeatedly custom-built component has been identified. Review the exact source, license, files, dependencies, RTL behavior, and visual fit before adding it. |
| **Radix or React Aria as the primitive base** | **No global choice yet.** Prefer native HTML and tested existing behavior for simple controls. | Replacing working controls or Calendar dialogs merely to standardize them would create churn and regression risk. A headless primitive library becomes valuable for genuinely difficult reusable behavior such as a complex combobox, menu, popover, or layered dialog—not for every button and field. | The first concrete complex primitive is needed. Evaluate Radix and React Aria against that component's real accessibility, RTL, styling, and bundle requirements. |
| **Storybook** | **Defer.** | Storybook would provide useful isolated review, but the current Calendar is dominated by page state and large coupled components. MARKOS already has rendered browser tests with deterministic API interception, screenshots, RTL, focus, and reduced-motion coverage. Adding Storybook now would also introduce a Vite rendering environment and a second set of mocks before the components are ready to benefit from it. | Reusable components are shared across at least two product surfaces, or standalone review becomes frequent enough that running the application is the clear bottleneck. |
| **MSW, Storybook Vitest, and Storybook accessibility addons** | **Do not decide separately.** | They are supporting pieces of a future Storybook workflow. Current Vitest tests and Playwright route interception already cover the immediate test need. | Storybook itself passes its adoption test. |
| **Motion for React** | **Retain the scoped adoption; review new uses case by case.** | The Calendar proof replaced the relevant navigation path, preserves reduced-motion behavior, and is covered by the current focused browser and CI-equivalent checks. Onboarding reuses it for restrained greeting/step transitions. This evidence does not justify animating unrelated controls or coupling motion to scheduling mutations. | A new journey has a demonstrated presence, layout, or interruption problem that CSS cannot solve as clearly. Reuse the existing dependency before adding another animation system. |
| **Drag-and-drop library** | **Defer.** | Drag-and-drop behavior and safeguards are not yet in scope, and motion should not be coupled to scheduling mutations. | Eligibility, rearrange mode, exact date/time confirmation, keyboard alternatives, and product policy are agreed. Then evaluate dnd-kit against that contract. |

## Work that needs no new dependency

- Break large files into focused view components, state hooks, and helpers only along the part currently being changed; avoid a broad rewrite.
- Consolidate repeated browser-test data and route handlers so dense, empty, loading, error, English, and Arabic states are cheaper to exercise.
- Keep CSS and the Web Animations API for local hover, emphasis, toast, and other small effects.
- Use existing semantic Sunlit variables and tokens until the visual-foundation review deliberately challenges them.
- Review external examples for interaction and composition before building. Reuse only the smallest useful source slice, and preserve MARKOS behavior rather than importing an entire page.

## Motion proof outcome

The retained proof is limited to `Calendar → Day Focus → Post Focus` and the reverse transitions, with restrained reuse in Onboarding. It:

1. Uses one Motion path rather than retaining the former manual animation layer beside it.
2. Preserves URL/history behavior, focus management, interruption, independent scrolling, and final rendered state.
3. Covers English, Arabic/RTL, reduced motion, and the named desktop viewports through focused checks.
4. Loads Calendar motion features behind a narrow feature module rather than treating Motion as a global page framework.
5. Leaves drag-and-drop and its scheduling safeguards as a separate product and interaction decision.

## Recorded outcome

1. MARKOS makes **no broad frontend migration now**.
2. Motion is retained only for reviewed journey-level needs; its presence is not automatic approval for every animation.
3. Selective reference use and incremental component extraction remain the working approach.
4. IBM Plex, Tangerine Slate, and the dark companion remain lab candidates until a separate production-foundation pass migrates and validates them.

No Tailwind 4, Storybook, shadcn/Radix foundation, MSW, or drag-and-drop installation is approved at this stage.

## Primary references

- Tailwind CSS 4 upgrade and compatibility: <https://tailwindcss.com/docs/upgrade-guide>
- shadcn Tailwind 3 compatibility: <https://ui.shadcn.com/docs/tailwind-v4>
- shadcn registry safety guidance: <https://ui.shadcn.com/docs/registry/github>
- Radix incremental adoption: <https://www.radix-ui.com/primitives/docs/overview/introduction>
- Storybook for Next.js/Vite: <https://storybook.js.org/docs/get-started/frameworks/nextjs-vite/>
- Motion layout animations: <https://motion.dev/docs/react-layout-animations>
- Motion bundle-size options: <https://motion.dev/docs/react-reduce-bundle-size>
- React ViewTransition status: <https://react.dev/reference/react/ViewTransition>
- Next.js ViewTransition status: <https://nextjs.org/docs/app/api-reference/config/next-config-js/viewTransition>
