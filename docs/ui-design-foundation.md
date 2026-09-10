# MARKOS AI UI Design Foundation

- Status: adopted MARKOS visual and interaction foundation
- Working name: **Sunlit Social Studio**
- Last updated: 2026-09-10

This document is the active visual and interaction reference for MARKOS. The September 10 light/dark palette replaces the earlier Sunlit colors and light-only guidance. It does not restore the retired "AI Marketing Command Center" composition. The canonical marketing, authentication, onboarding, legal, and application routes are the coded reference; there is no separate design-preview route family.

Product behavior still comes from:

- `docs/source/MARKOS_BUILD_SPEC. 2.pdf` for structure and requirements.
- `docs/source/MARKOS_EXPERIENCE_FLOWS.md` for journeys, state transitions, and failure behavior.

If this visual document conflicts with either source on product behavior, follow those sources. The mounted components under `apps/web/app/[locale]/_components` are the most accurate coded reference for the adopted visual direction.

Use `docs/ui-ux-workflow.md` for reference gathering, prototyping, implementation, and visual QA. Use `docs/ui-ux-improvement-plan.md` for interpreted design problems that have not yet become durable product decisions. Meeting notes, screenshots, templates, and stakeholder suggestions are challengeable inputs; they become active direction only after the product team records the problem, intended outcome, and decision state.

## Product idea

MARKOS should feel like a dedicated social-media marketing firm that learns each business and stays available across the full workflow:

1. **Plan** — turn goals and business context into a clear direction.
2. **Create** — prepare content that is ready for review.
3. **Publish** — schedule or publish only with the required approval.
4. **Insights** — explain what is working and recommend the next step.

MARKOS is adaptable by default. The interface must not imply that users need to choose a fixed working mode before MARKOS can help. A user may use one part of the workflow or let MARKOS stay involved throughout it.

## Experience principles

### Clear, capable, and human

- Support the approved light and dark themes across the same product surfaces, with consistent hierarchy, readable contrast, and user control.
- Use rose, aqua, and violet in the semantic roles below. Preserve the quiet canvas and distinguish adjacent surfaces without adding decorative complexity.
- Keep the interface polished without making it feel futuristic, robotic, or overly "AI."
- Prefer purposeful examples and lightweight interaction over decorative complexity.

### Clear before clever

- Lead with what the user can do or understand next.
- Use plain language and short supporting copy.
- Do not place a promotional paragraph under every heading.
- Omit decorative eyebrows, repeated section captions, and all-caps micro-labels when a heading or control already communicates the task. Keep useful instructions, consequences, security requirements, availability disclosures, and recovery guidance.
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

### Core palette — approved 2026-09-10

Khalid explicitly selected both palettes for the actual site. These exact base values supersede the former coral/berry/yellow palette and the unimplemented Tangerine Slate experiments.

| Role | Token reference | Light | Dark | Primary use |
| --- | --- | --- | --- | --- |
| Text | `--text` | `#20212b` | `#f2faf7` | Primary text and readable hierarchy |
| Background | `--background` | `#f7fafa` | `#151821` | Application and public-page canvas |
| Primary | `--primary` | `#d88fa3` | `#8fe3da` | Primary actions and key emphasis |
| Secondary | `--secondary` | `#81d8d0` | `#7b6af0` | Supporting accents, selected surfaces, and charts |
| Accent | `--accent` | `#6c3ce8` | `#d9a0b1` | Focus, emphasis, and supporting highlights |

Keep the exact base tokens. Derive semantic surfaces, borders, muted text, links, focus, overlays, and on-color text centrally; do not scatter independent replacements across components. Preserve separate warning, error, success, disabled, and lifecycle roles so brand color changes do not erase status meaning.

The latest September 10 refinement changes dark text from the initial `#f2f4f7` to `#f2faf7`. The other approved base colors remain unchanged.

Use dark labels on the light primary and secondary fills and on the dark primary and accent fills. Light-theme violet supports white labels and readable links. Do not assume that white text works on every brand fill: white on the dark secondary violet is only about `4.07:1`, below the normal-text target. Use an appropriately contrasting on-color or a tinted surface with regular text. Light primary and secondary are also too pale to serve as ordinary text links or the sole focus indicator against the light canvas.

The September 10 semantic lifecycle roles supersede the earlier Calendar palette: Draft neutral, Ready teal, Scheduled violet/blue, Published green, Failed red, and review/attention amber where distinct from failure. Shared foreground, background, and border tokens support each status in both themes. Preserve labels, icons, counts, and accessible names; color never replaces those cues and must not change lifecycle meaning.

The IBM Plex plus Tangerine Slate compositions under `docs/prototypes/` remain historical experiments. The approved palette above and the typography below govern implementation. An approval does not by itself constitute completed browser or accessibility verification.

### Runtime token scope

The canonical palette lives in `apps/web/app/theme-tokens.css`, with root light/dark tokens selected through `data-theme`. `apps/web/app/sunlit-theme.css` imports those tokens, and the shared Sunlit stylesheet and surviving legacy/Tailwind aliases stay connected to that one palette, including public pages, authentication, onboarding, Settings, and the authenticated shell. Existing alias names are compatibility layers, not permission to maintain separate old palettes. New components should use semantic roles instead of adding `luxury-*` values.

The shared Appearance control offers Light, Dark, and System. Settings is its primary home; any quick access before sign-in or in a user menu should remain compact and secondary. Do not give appearance the same prominence as the user's main task. Preserve the browser-local preference across navigation and refresh; System follows the operating system. Apply the saved choice before the page paints, and keep explicit switching available when browser storage cannot persist it.

### Gradients and surfaces

- Primary actions use the theme's primary fill and a contrasting label. Reserve gradients for a small number of intentional brand or summary surfaces.
- Light mode uses the approved near-white canvas with clear card and input surfaces. Dark mode uses the approved dark canvas with slightly raised neutral surfaces and restrained violet, aqua, or rose accents.
- Cards use theme-aware surfaces, visible borders, generous radii, and restrained shadows. Dark surfaces must remain distinguishable from the page and from modal backdrops.
- Ambient gradients may use the approved palette, but must not reduce text contrast or compete with content.
- Large effects should remain uncommon so important panels retain emphasis.

### Typography

- Use **IBM Plex Sans** for English and **IBM Plex Sans Arabic** for Arabic, including script-appropriate fallback for mixed content. Inter is superseded. Readex Pro was only a fallback option if the two-family setup proved impractical; it is not the adopted font.
- `apps/web/app/fonts.ts` loads the pinned local WOFF2 files through `next/font/local`. Normal weights 400, 500, 600, and 700 are included; use these real faces rather than requesting synthetic 800–950 weights. Source revision and the included OFL license are recorded in [the font asset README](../apps/web/app/fonts/README.md).
- Keep the root at **16px** at every viewport. Use **16px body**, **15px controls**, **14px labels**, and **13px secondary metadata** as the default scale. Occasional 12px text is reserved for genuinely secondary metadata; 10px or 11px text is unsuitable for normal UI.
- Use 400 for ordinary body text, 500 for labels or moderate emphasis, 600 for headings and actions, and 700 sparingly for stronger emphasis. Create hierarchy through spacing, size, and contrast rather than making every label bold.
- Keep comfortable line heights, with more vertical room for Arabic. Do not force Latin tracking onto Arabic. Reduce content density or reflow a surface instead of shrinking the whole document.
- Small utility text must retain sufficient size and contrast; muted text must not disappear beside large headings.
- Keep readable line lengths, generally around 45–70 characters for explanatory copy.
- A separate display typeface is not yet part of the approved foundation.

**Local implementation checkpoint, September 10:** bounded passes 0–6 are complete: the audit, local font and token foundation, shell and Appearance placement, shared controls/status/feedback/dialog patterns, core pages, and remaining Settings/onboarding/public/auth/legal surfaces. Arabic headings explicitly retain normal tracking where page styles previously overrode the RTL ancestor. Final visual QA, the complete browser suite against the production build, and the build itself passed. The [refinement audit and execution record](analysis/ui-refinement-audit-2026-09-10.md) owns current check totals and verification boundaries.

This is mounted-frontend evidence, with fictional browser-local sessions, API responses, and media where needed. It does not establish live database, AI provider, Instagram, or Railway behavior. The separate Business Profile editor prototype and larger architectural work remain outside this refinement checkpoint.

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

- Settings is a standalone workspace-management route, not a child canvas inside the primary application shell. Its header provides a back action to the last main application page, with Overview as the safe fallback.
- Use one persistent section menu as the top-level navigation on desktop and a select control on narrow screens.
- Render one selected section at a time; do not combine this menu with top-level accordions.
- Keep locale switching in the standalone Settings header; language does not need its own settings section or a repeated control above every authenticated page.
- Keep Appearance in Settings as a deliberate preference, with Light, Dark, and System choices. Avoid a prominent appearance selector in every page header.
- Order sections by the user's likely job: Account, Connected accounts, Security, Plan and billing, then Data and activity.
- Keep nested disclosures only for local details such as MFA setup steps or advanced data controls.
- Show gated sections, such as Instagram connection before MFA, in a visible but clearly locked state.
- Explain the requirement and route the user to the action that unlocks it.
- Represent Instagram as one connected business account with compact status details and, when available, one latest-post preview. The connection screen is not a replacement Instagram feed.
- Treat the current settings contents as a foundation, not a final inventory of configurable features.

### Authenticated application

- MARKOS is desktop-first during the current product-definition stage. Use the available width to keep planning context, working controls, and previews visible together.
- At large breakpoints, keep the desktop sidebar pinned to the viewport while the page canvas scrolls. It starts as a labeled navigation surface and may be collapsed explicitly into a compact icon rail; never make hover the only way to reveal or control it. Preserve accessible link names and keyboard/focus tooltips in the compact state, keep the active-language switch directly above **Settings** at the bottom, and store both display preferences locally. Do not add a second desktop workspace header above every page. The primary navigation is **Overview**, **Campaigns**, **Create**, **Calendar**, **Insights**, and **Business Profile**.
- Compose pages around the user's next decision or action. Overview should surface live state and the next useful task; Campaigns should put generation controls beside the current time-bound Campaign; Create should lead with the creation controls; Insights should put the performance pulse and time range first.
- Retain the September 10 refined Create composition: manual editing alongside the MARKOS companion, with the preview shown only when media is present and a consistent `6:19` outer preview ratio. Keep caption, media, and post-detail controls available without requiring AI. The final validation record must cover this retained composition; historical Create ratios and editor arrangements are not its implementation baseline.
- Do not use oversized static welcome or description panels. A page introduction should normally be a compact header or action strip, leaving the first viewport for live data and working controls.
- Keep the main canvas and all ordinary working surfaces consistent with the selected light or dark theme. Preserve the same hierarchy, density, and readable controls in both.
- Use a generous content ceiling, currently about 1500px, so dense planning and creation pages do not collapse into narrow mobile-like columns on desktop.
- Keep narrow layouts functional and non-broken, but defer detailed mobile optimization until the desktop workflow and main feature inventory are stable. Mobile support remains required before launch.
- Give each page one authoritative heading. Where the desktop sidebar is unavailable, a compact responsive shell header may identify the active destination without becoming a second page-level heading in the accessibility tree.

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
- A successful MFA step-up opens sensitive Instagram settings for one fixed, non-sliding 15-minute window. Session refresh and the external OAuth round trip preserve the original deadline; they never extend it.

## Accessibility and localization

- English and Arabic are first-class from the first implementation pass.
- Use the localized route and set both `lang` and `dir` correctly.
- Mirror directional layout and icons where their meaning changes in RTL.
- Preserve semantic headings, labels, field descriptions, accessible names, and keyboard operation.
- Maintain visible, theme-aware focus treatment. Verify its contrast against the adjacent surface instead of assuming that a brand color is always suitable.
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
| Campaigns | `/app/campaigns` |
| Create | `/app/content-studio` |
| Calendar | `/app/calendar` |
| Insights | `/app/analytics` |
| Business Profile | `/app/knowledge` |
| Settings | `/app/settings` |
| Onboarding and profile review | `/onboarding` |

These routes preserve their existing session, workspace, API, approval, and failure behavior. A mounted screen proves that its UI is connected to the application contract; it does not by itself prove that an external provider or undeveloped feature is live.

## Current implementation boundary

- `apps/web/app/theme-tokens.css`, the shared Sunlit stylesheet, and the canonical localized routes are the active visual reference.
- Landing, authentication, verification, legal pages, application shell, onboarding, Overview, Campaigns, Create, Calendar, Insights, Business Profile, and Settings use the adopted UI.
- The former `/design-preview` routes and duplicate dark public/authentication components were removed rather than retained as fallbacks.
- `apps/web/app/globals.css`, `packages/ui-tokens`, and remaining legacy helpers still support surviving product components and states. Keep them until every consumer is identified and deliberately replaced.
- The legacy token package is explicitly labeled as such and must not be extended for new Sunlit work.
- Unmounted duplicate panels and unused global luxury helpers were removed during the pre-migration cleanup pass.
- Historical Figma inventories, dark-theme checklists, state audits, and the completed August presentation runbook live under `docs/archive/ui/` and `docs/archive/presentations/`. They are evidence only, not active instructions.

### Deferred Sunlit product-surface restoration

PR #19 deliberately removed the preview route family and replaced the old visual direction, but it also deleted several mounted operational panels before equivalent Sunlit pages existed. Their deletion is not a product-scope decision. The final-system inventory below comes from the build specification and the reviewed original PRD/design sources; the current column records what is actually mounted now.

| Final-system area | Current Sunlit implementation | Required restoration or completion |
| --- | --- | --- |
| Authentication (`AUTH-01`–`AUTH-05`) | Landing, email signup/login, verification, and honest unavailable states are mounted. The backend Google ID-token exchange exists, but Google and Apple provider controls do not authenticate; password recovery is also unavailable. | Complete and mount approved provider login and password-recovery contracts before calling those paths live. |
| Onboarding (`OB-01`–`OB-10`) | A concise greeting and seven real workspace areas are mounted. Company and Products are the two essentials; the other five areas can be explicitly skipped and resumed. The information check links directly to focused editing, and bilingual profile review/approval completes the journey without claiming 100% Vault completeness. | Build the focused document extraction, issue-reporting, mapping, and owner-confirmation path before exposing upload; restore plan/trial placement if still required and add any approved competitor verification or recovery refinements. |
| Overview and Knowledge Vault (`DASH-01`–`DASH-02`) | Overview loads workspace content, queue summary, analytics, and Vault score. Business Profile loads a summarized Vault view. | Build the complete editable Vault, gaps, per-entry history/versioning, and richer dashboard habit loop. Do not treat the current summary panel as the full Vault screen. |
| Campaigns (`CAMP-01`–`CAMP-03`) | Campaign list/generation is API-backed. Generated plans expose a compact overview and one week at a time; the daily-plan selector is compact, and every dated idea has one existing Create action that idempotently opens the same Campaign-linked draft in Create and Calendar. The duration UI still offers 3/7/14/30/60/90 days, while generation is intentionally optimized only for showcase requests up to 14 days and three posts per day. | Add richer lifecycle/library management, bulk approval, complex long-campaign generation, and mount the existing PDF export contract. |
| Content and calendar (`CONT-01`–`CONT-06`) | Create normally opens a two-choice greeting and Campaign handoff bypasses it with a durable prefilled draft. Generation uses the complete Campaign/form context and enters a bilingual in-place review/revision loop on the same record. The focused editor supports approval, JPEG media, and scheduling. Calendar is a primary bilingual/RTL destination with week/month views, dated Campaign planning drafts, semantic lifecycle colors, URL-backed focus, unscheduled handling, atomic rescheduling, and confirmed cancellation. | Add content revision history/comments, broader planned-slot orchestration, deployed provider evidence, separately hardened Carousel/Reel/Story flows, and queue-recovery states. |
| Media (`MEDIA-01`–`MEDIA-04`) | The mounted Create surface supports authenticated JPEG upload, provider-selected JPEG generation, attachment/removal, thumbnails, and selected-asset preview; workspace media list/upload/read/delete APIs exist. | Live-verify provider generation and define the standalone Media Library, reusable generated-media ownership, asset-detail flows, brand-asset management, storage meter, and richer transformations. A prototype gallery is not implementation proof. |
| Instagram scheduling (`SCHED-01`–`SCHED-04`) | Settings mounts the secure Instagram connection. Create requires explicit approval before scheduling and can return a scheduled item to `APPROVED`; Calendar manages saved times and exposes safe failure detail/recovery. Publishing/readiness and operator queue APIs exist. | Build the durable publishing queue/worker surface, evidence-based time and live-cap guidance, attempt history, close-race cancellation, and complete per-format live-publish behavior. |
| Analytics (`AN-01`–`AN-06`) | Insights mounts an API-backed 7/30-day professional dashboard with compact real metrics, daily trends, prior-period percentages, content-type performance, top content, explicit audience-data availability, empty/loading/error states, and monthly PDF download. | Add the full post-detail and format drill-down views, 90-day/custom ranges, provider-supplied demographic views, and real provider-backed interpretation once permission evidence exists. |
| AI consultant (`AI-01`–`AI-04`) | Digest/chat/report API foundations and deterministic agent-shaped responses exist; no complete consultant surface is mounted. | Restore weekly digest, proactive recommendations, conversational consultant, monthly-report preview, and approved competitor analysis with provider-backed behavior. |
| Settings and team (`SET-01`–`SET-06`) | Account/workspace summary, Instagram connection, MFA, billing summary, export, and audit history are mounted. | Complete editable account/workspace controls, team membership/roles, notification preferences, billing actions/invoices, and any approved password/provider settings. |
| Admin (`ADMIN-01`–`ADMIN-10`) | Admin APIs, permissions, audit, plans, gateways, model config, and prompt foundations exist. The old admin UI was deleted; the legacy `/admin` route currently redirects to Settings. | Build a Sunlit admin portal for business metrics, users, workspaces, moderation, AI usage, prompts, plans, system health, Instagram status, and revenue. A redirect is not replacement evidence. |

Universal obligations from the retired design source still apply to every restored surface: explicit empty/loading/error/success/limit states, a useful next action, WCAG AA intent, keyboard operation, reduced motion, Arabic/RTL parity, and responsive behavior. Historical components may be inspected for behavior, but they must not be restored wholesale or used as the active visual source.

## Production migration rules

1. Preserve product behavior, API contracts, session handling, workspace isolation, approval gates, metering, and failure recovery.
2. Treat visual references as evidence for composition and hierarchy, not as code, data, brand, or behavior contracts.
3. Prototype consequential navigation, hierarchy, and multi-step journey changes before implementation.
4. Extract shared semantic tokens and components before copying page-specific CSS into multiple product surfaces.
5. Migrate one coherent surface at a time and keep each pull request reviewable.
6. Replace fixtures with API-backed data or explicit empty/demo states.
7. Preserve English and Arabic behavior in the same change.
8. Verify focused source tests, browser interaction, responsive layouts, keyboard operation, and RTL before retiring the old surface.
9. Remove an old route only after its replacement covers the real journey and recovery states; do not retain a duplicate route family by default.

Migration sequence:

1. Shared scoped tokens, canonical marketing/authentication routes, legal placeholders, and Settings — complete.
2. App shell, Overview, Business Profile summary, and first Campaign handoff — mounted in current reviewed source.
3. Calendar and the reduced-effort greeting/Onboarding journey — implemented as current working checkpoints; Onboarding now includes separate full-business document-assisted and manual first-run paths plus the focused Products/Services shortcut.
4. The connected Campaign, Create, Calendar, and Insights presentation slice — mounted using real APIs or explicit unavailable/empty states.
5. Restore the remaining final-system operational modules in small, behavior-preserving Sunlit slices.
6. Revisit each migrated page individually as product features and configuration needs become final.
7. Complete responsive, keyboard, RTL, and cross-browser hardening before launch.

## Deferred decisions

- Detailed mobile and tablet composition beyond basic functional layouts.
- Permanent brand-asset storage, a conversational follow-up analyst, and a dedicated post-onboarding business-knowledge editor. Making business onboarding wholly optional or relocating major areas still requires Mohamed's product approval and is not part of the closed checkpoint.
- Plans page structure and commercial copy.
- Advanced Insights drill-downs, custom/90-day ranges, provider-supplied demographics, and recommendations beyond the current API-backed dashboard.
- Final Terms and Privacy content and scroll-navigation tuning.
- Production Google and Apple authentication integrations.
- Whether a dedicated display typeface is needed.
- The complete long-term Settings inventory.
