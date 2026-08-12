# MARKOS AI UI Design Foundation

- Status: adopted MARKOS visual and interaction foundation
- Working name: **Sunlit Social Studio**
- Last updated: 2026-08-12

This document is the active visual and interaction reference for MARKOS. It replaces the dark "AI Marketing Command Center" export. The canonical marketing, authentication, onboarding, legal, and application routes are now the coded reference; there is no separate design-preview route family.

Product behavior still comes from:

- `docs/source/MARKOS_BUILD_SPEC. 2.pdf` for structure and requirements.
- `docs/source/MARKOS_EXPERIENCE_FLOWS.md` for journeys, state transitions, and failure behavior.

If this visual document conflicts with either source on product behavior, follow those sources. The mounted components under `apps/web/app/[locale]/_components` are the most accurate coded reference for the adopted visual direction.

## Product idea

MARKOS should feel like a dedicated social-media marketing firm that learns each business and stays available across the full workflow:

1. **Plan** — turn goals and business context into a clear direction.
2. **Create** — prepare content that is ready for review.
3. **Publish** — schedule or publish only with the required approval.
4. **Insights** — explain what is working and recommend the next step.

MARKOS is adaptable by default. The interface must not imply that users need to choose a fixed working mode before MARKOS can help. A user may use one part of the workflow or let MARKOS stay involved throughout it.

## Experience principles

### Bright, capable, and human

- Use a warm, bright canvas rather than the former dark command-center theme.
- Balance coral and pink energy with aqua trust, yellow warmth, and dark ink for clarity.
- Keep the interface polished without making it feel futuristic, robotic, or overly "AI."
- Prefer purposeful examples and lightweight interaction over decorative complexity.

### Clear before clever

- Lead with what the user can do or understand next.
- Use plain language and short supporting copy.
- Do not place a promotional paragraph under every heading.
- Avoid vague AI phrases, exaggerated claims, and repetitive slogans.
- Prefer **insights** to **results** when describing analysis and learning.

### Control without configuration burden

- Make approval boundaries visible where publishing or sensitive changes are involved.
- Show conditions and locked states before a feature becomes available.
- Do not turn MARKOS's inherent flexibility into a separate "How would you like to work?" setup choice.
- Use progressive disclosure for advanced or infrequent controls.

### Honest product states

- A preview may illustrate the intended final product, but production surfaces must distinguish live data, fixtures, unavailable features, and future functionality.
- Google and Apple authentication buttons in the preview communicate the intended UI only; they do not claim that provider authentication is wired.
- Terms and Privacy pages are structural placeholders until approved legal content exists.

## Visual foundation

### Core palette

| Role | Token reference | Value | Primary use |
| --- | --- | --- | --- |
| Ink | `--ink` | `#20212B` | Primary text, dark surfaces, strong secondary actions |
| Ink soft | `--ink-soft` | `#4D4853` | Supporting text with strong contrast |
| Muted | `--muted` | `#625B66` | Secondary metadata; avoid beside oversized headings when too small |
| Paper | `--paper` | `#FFFAF5` | Main warm page canvas |
| Paper deep | `--paper-deep` | `#FFF0E5` | Warm secondary surfaces and hover states |
| White | `--white` | `#FFFFFF` | Cards, fields, and high-contrast text on dark surfaces |
| Coral | `--coral` | `#FF665A` | Primary-action gradients and energetic accents |
| Coral deep | `--coral-deep` | `#DC3F64` | Strong accent text and gradient depth |
| Pink | `--pink` | `#D93F7A` | Brand emphasis, links, selected states |
| Aqua | `--aqua` | `#21BFAE` | Success, progress, focus, and insight accents |
| Aqua dark | `--aqua-dark` | `#087D71` | Accessible text on pale aqua surfaces |
| Aqua soft | `--aqua-soft` | `#DFF8F2` | Success and informational backgrounds |
| Yellow | `--yellow` | `#F6C453` | Warm highlights, attention, and selected accents |

Use semantic roles in shared production tokens instead of copying these raw values into every component. Warning, error, disabled, border, focus, and overlay roles must also be centralized during migration.

### Runtime token scope

The coded preview's canonical runtime palette lives in `apps/web/app/sunlit-theme.css` under the `.sunlit-theme` class. Every preview root opts into that class. Keep Sunlit variables scoped while the old and new interfaces coexist; do not move them onto `:root` or reuse the legacy `luxury-*` names. This prevents the current production theme from changing before a surface is deliberately migrated.

### Gradients and surfaces

- Primary actions use coral-to-yellow or coral-to-pink gradients with dark readable text where appropriate.
- Dark ink panels are reserved for contrast moments, demonstrations, and important calls to action; they must not take over the whole application canvas.
- Cards use white or near-white surfaces, subtle borders, generous radii, and restrained shadows.
- Ambient radial gradients may add warmth or freshness, but must not reduce text contrast or compete with content.
- Large effects should remain uncommon so important panels retain emphasis.

### Typography

- Inter is the current baseline because the preview inherits the application font stack.
- Headings are bold, compact, and high contrast.
- Body copy should normally remain around 1rem with comfortable line height.
- Small utility text must retain sufficient size and contrast; muted gray text must not disappear beside large headings.
- Keep readable line lengths, generally around 45–70 characters for explanatory copy.
- A separate display typeface is not yet part of the approved foundation.

### Shape and spacing

- Use medium radii for controls and cards, with larger radii for major composed surfaces.
- Keep compact controls comfortable to click or tap; primary controls should generally provide at least a 44px target.
- Prefer clear spacing groups over extra dividers.
- Use pill shapes for status labels and compact filters, not for every control.
- Shadows should communicate elevation or focus, not decorate every surface.

## Layout patterns

### Public landing page

- Use a simple header, direct hero, primary and secondary actions, and an interactive workspace example.
- Explain the Plan → Create → Publish → Insights workflow progressively.
- Place examples after the product promise rather than at the very top.
- Keep Plans as a separate destination instead of a large pricing section on the landing page.
- Finish with useful footer navigation, legal links, FAQs, and Ra'edat attribution.

### Authentication

- Use a composed two-panel desktop layout and a focused single-panel mobile layout.
- Keep provider buttons visually neutral and use official Google and Apple marks.
- Support signup, login, forgot password, reset password, and verification states.
- Require explicit Terms and Privacy consent during signup.
- Keep autofill, selected text, focus, errors, and password visibility readable.
- Provider buttons may remain non-functional until their backend integrations are prioritized.

### Settings

- Use one persistent section menu as the top-level navigation on desktop and a select control on narrow screens.
- Render one selected section at a time; do not combine this menu with top-level accordions.
- Keep nested disclosures only for local details such as MFA setup steps or advanced data controls.
- Show gated sections, such as Instagram connection before MFA, in a visible but clearly locked state.
- Explain the requirement and route the user to the action that unlocks it.
- Treat the current settings contents as a foundation, not a final inventory of configurable features.

### Authenticated application

- MARKOS is desktop-first during the current product-definition stage. Use the available width to keep planning context, working controls, and previews visible together.
- At large breakpoints, keep the labeled sidebar pinned to the viewport while the page canvas scrolls, with a restrained sticky workspace header. The primary navigation is **Overview**, **Strategy**, **Create**, **Insights**, **Business Profile**, and **Settings**.
- Keep the main canvas warm and bright. Reserve dark ink surfaces for high-priority summaries and contrast moments rather than using a dark application background.
- Use a generous content ceiling, currently about 1500px, so dense planning and creation pages do not collapse into narrow mobile-like columns on desktop.
- Keep narrow layouts functional and non-broken, but defer detailed mobile optimization until the desktop workflow and main feature inventory are stable. Mobile support remains required before launch.
- Give each page one authoritative heading. The workspace header may repeat the active destination visually, but it must not introduce a second page-level heading in the accessibility tree.

### Legal documents

- Use a sticky on-page menu on desktop and a compact selector on mobile.
- The current Terms and Privacy copy is deliberately provisional and must receive legal review before launch.
- Automatic section selection is not considered final while document lengths and headings are placeholders. The known behavior where short penultimate sections may be skipped is deferred until final legal content is available.

## Interaction patterns

- Use real buttons, links, tabs, and form controls so previews can demonstrate expected behavior.
- Make hover, focus, selected, loading, disabled, locked, success, warning, and error states visually distinct.
- Keep motion short and functional; honor `prefers-reduced-motion`.
- Do not hide critical controls behind hover-only behavior.
- Keep the active section or tab obvious without relying on color alone.
- Disabled controls should remain legible and should explain the unmet condition nearby.

## Accessibility and localization

- English and Arabic are first-class from the first implementation pass.
- Use the localized route and set both `lang` and `dir` correctly.
- Mirror directional layout and icons where their meaning changes in RTL.
- Preserve semantic headings, labels, field descriptions, accessible names, and keyboard operation.
- Maintain visible focus treatment; the current aqua focus ring is the preferred direction.
- Verify text and controls against WCAG AA contrast expectations before production migration.
- Test reduced motion, keyboard navigation, desktop, tablet, and mobile layouts.

## Attribution and naming

- Product name: `MARKOS AI` in formal brand surfaces; `MARKOS` is acceptable in normal product copy.
- Company short attribution: `Ra'edat Software`.
- Legal company attribution: `Ra'edat Software L.L.C.`.
- Do not replace the apostrophe or silently vary the legal company name.

## Canonical routes

Each route is available in English and Arabic beneath `/{locale}`.

| Surface | Route |
| --- | --- |
| Landing | `/` |
| Login | `/login` |
| Signup | `/signup` |
| Email verification | `/verify` |
| Forgot password | `/forgot-password` |
| Reset password | `/reset-password` |
| Terms | `/terms` |
| Privacy | `/privacy` |

Email/password signup, login, session handoff, verification delivery, token verification, and the verified onboarding handoff use the application API. Google and Apple controls remain visibly deferred, and password recovery remains an honest unavailable state until its API contract is implemented. Terms and Privacy remain draft legal content and are excluded from search indexing.

The authenticated Sunlit journey is mounted at the real application routes:

| Surface | Route |
| --- | --- |
| Overview | `/app` |
| Strategy | `/app/strategy` |
| Create | `/app/content-studio` |
| Insights | `/app/analytics` |
| Business Profile | `/app/knowledge` |
| Settings | `/app/settings` |
| Onboarding and profile review | `/onboarding` |

These routes preserve their existing session, workspace, API, approval, and failure behavior. A mounted screen proves that its UI is connected to the application contract; it does not by itself prove that an external provider or undeveloped feature is live.

## Current implementation boundary

- `apps/web/app/sunlit-theme.css` and the canonical localized routes are the active visual reference.
- Landing, authentication, verification, legal pages, application shell, onboarding, Overview, Strategy, Create, Insights, Business Profile, and Settings use the adopted UI.
- The former `/design-preview` routes and duplicate dark public/authentication components were removed rather than retained as fallbacks.
- `apps/web/app/globals.css`, `packages/ui-tokens`, and remaining legacy helpers still support surviving product components and states. Keep them until every consumer is identified and deliberately replaced.
- The legacy token package is explicitly labeled as such and must not be extended for new Sunlit work.
- Unmounted duplicate panels and unused global luxury helpers were removed during the pre-migration cleanup pass.
- Historical Figma inventories and checklists remain only as implementation evidence and are labeled as historical.

## Production migration rules

1. Preserve product behavior, API contracts, session handling, workspace isolation, approval gates, metering, and failure recovery.
2. Extract shared semantic tokens and components before copying page-specific CSS into multiple product surfaces.
3. Migrate one coherent surface at a time and keep each pull request reviewable.
4. Replace fixtures with API-backed data or explicit empty/demo states.
5. Preserve English and Arabic behavior in the same change.
6. Verify source tests, browser interaction, typecheck, lint, responsive layouts, keyboard operation, and RTL before retiring the old surface.
7. Remove an old route only after its replacement covers the real journey and recovery states; do not retain a duplicate route family by default.

Migration sequence:

1. Shared scoped tokens, canonical marketing/authentication routes, legal placeholders, and Settings — complete.
2. App shell, onboarding, Overview, Business Profile, and first Strategy handoff — complete on the redesign branch.
3. Create and Insights presentation surfaces — complete on the redesign branch, using real APIs or explicit empty states.
4. Replace remaining legacy production modules in small, behavior-preserving slices.
5. Revisit each migrated page individually as product features and configuration needs become final.
6. Complete responsive, keyboard, RTL, and cross-browser hardening before launch.

## Deferred decisions

- Detailed mobile and tablet composition beyond basic functional layouts.
- Final onboarding recovery copy and per-step refinement after the presentation journey.
- Plans page structure and commercial copy.
- Advanced Insights comparisons and recommendations beyond the current API-backed summary.
- Final Terms and Privacy content and scroll-navigation tuning.
- Production Google and Apple authentication integrations.
- Whether a dedicated display typeface is needed.
- The complete long-term Settings inventory.
