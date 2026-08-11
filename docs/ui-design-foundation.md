# MARKOS AI UI Design Foundation

- Status: approved visual direction for future MARKOS UI work
- Working name: **Sunlit Social Studio**
- Last updated: 2026-08-11

This document is the active visual and interaction reference for the MARKOS redesign. It replaces the dark "AI Marketing Command Center" export as the direction for new UI work. The existing production UI remains in place until it is replaced and verified route by route.

Product behavior still comes from:

- `docs/source/MARKOS_BUILD_SPEC. 2.pdf` for structure and requirements.
- `docs/source/MARKOS_EXPERIENCE_FLOWS.md` for journeys, state transitions, and failure behavior.

If this visual document conflicts with either source on product behavior, follow those sources. The coded preview under `apps/web/app/[locale]/design-preview` is the most accurate reference for the approved visual direction.

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

## Coded reference routes

Each route is available in English and Arabic beneath `/{locale}/design-preview`.

| Surface | Route |
| --- | --- |
| Landing | `/design-preview` |
| Login | `/design-preview/login` |
| Signup | `/design-preview/signup` |
| Email verification | `/design-preview/verify` |
| Forgot password | `/design-preview/forgot-password` |
| Reset password | `/design-preview/reset-password` |
| Settings | `/design-preview/settings` |
| Terms | `/design-preview/terms` |
| Privacy | `/design-preview/privacy` |

These routes are isolated design references. They must not be mistaken for proof that the corresponding production route or backend integration has been replaced.

## Production migration rules

1. Preserve product behavior, API contracts, session handling, workspace isolation, approval gates, metering, and failure recovery.
2. Extract shared semantic tokens and components before copying preview CSS into multiple production surfaces.
3. Migrate one coherent surface at a time and keep each pull request reviewable.
4. Replace fixtures with API-backed data or explicit empty/preview states.
5. Preserve English and Arabic behavior in the same change.
6. Verify source tests, browser interaction, typecheck, lint, responsive layouts, keyboard operation, and RTL before retiring the old surface.
7. Do not remove an old route until its replacement covers the real journey and recovery states.

Suggested migration sequence after this preview is accepted:

1. Shared tokens, public header/footer, buttons, cards, and fields.
2. Landing and authentication surfaces.
3. Settings and account-related surfaces.
4. App shell and navigation after their information architecture is agreed.
5. Onboarding and the first Strategy handoff.
6. Remaining production modules in small, behavior-preserving slices.

## Deferred decisions

- Final app-shell navigation and page names.
- New onboarding composition and detailed recovery states.
- Plans page structure and commercial copy.
- Insights graphs and analytics examples after feature planning.
- Final Terms and Privacy content and scroll-navigation tuning.
- Production Google and Apple authentication integrations.
- Whether a dedicated display typeface is needed.
- The complete long-term Settings inventory.
