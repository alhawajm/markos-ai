# MARKOS AI UI + Functionality Checklist

> Active redesign foundation: `docs/ui-design-foundation.md`
>
> This file records historical implementation and behavioral coverage for the older UI passes. The previous dark command-center tracker is also historical. Preserve its verified behavior during migration, but use the Sunlit Social Studio foundation for new visual work.

Source of truth:
- Product behavior: `docs/source/MARKOS_BUILD_SPEC. 2.pdf`
- Experience and behavioral flows: `docs/source/MARKOS_EXPERIENCE_FLOWS.md`
- Superseded Figma export: `C:\Users\mohamed.yusuf\Downloads\Design AI Marketing Platform`
- Active final design export: `C:\Users\mohamed.yusuf\Downloads\AI-Powered Marketing OS MVP`
- Active implementation: `apps/web/app/[locale]/_components`

Use this file as the working tracker for design parity, user journey, and frontend functionality. Only tick an item when the implementation is present, routes work, and the relevant verification gate passes. If a screen is visually close but missing an expected interaction, leave it unchecked and add a note.

Legend:
- `[x]` Done and verified
- `[ ]` Not done, partial, or not yet proven

## Current Snapshot

- Active UI parity phase: superseded by final command-center design plan
- Completed parity passes: Global UI Rules, App Shell desktop shell, Dashboard, Content Creator, Publishing Queue, Analytics, Audience, Channels, Vault, Strategy, AI Assistant, Settings, Admin, quota/limit states, Vault grounding/gap states, publishing readiness/recovery states, analytics learning loop, manual Figma export review, full behavioral state audit
- Current next UI focus: execute `docs/final-ui-implementation-checklist.md` from UI-M0 onward
- Current functional pass: final command-center dashboard, Campaign Builder, and final Content Studio now read/write through the workspace API for content loading, generation, edit, approval, and scheduling; public landing, login/signup portal, app-route session guard, and register/verify/login smoke are now tracked in the final checklist.
- Remaining major UI journey: continue feature-depth passes from the milestone checklist
- Last confirmed gates after latest UI work: `corepack pnpm verify` and `corepack pnpm build`

## Behavioral Flow Rules

- [x] No primary screen shows a blank canvas; each screen proposes the next action or AI-generated starting point.
- [x] Every core screen has explicit empty, loading, error, success, and limit-reached states.
- [x] Every AI action visibly uses Vault/context grounding or blocks with a Vault gap prompt instead of generic output.
- [x] Metered actions show quota warning at 80% and contextual upgrade block at 100%.
- [x] Publishing and scheduling never proceed without approval, publish readiness, Instagram health, and clear failure recovery.
- [x] Dashboard reinforces the weekly habit loop: upcoming content, AI insight, empty-calendar nudge, and quick actions.
- [x] Analytics insight can write learning back to the Vault and make the next content cycle smarter.
- [x] Arabic remains the first-class/default product surface with natural Arabic copy, RTL layout, and locale-formatted dates/numbers.

## Global UI Rules

- [x] Figma font stack is loaded: Inter for body and Space Grotesk for display text.
- [x] App shell uses Figma-style dark sidebar and fixed 60px topbar.
- [x] Dashboard route renders the dashboard surface directly without generic milestone overview cards.
- [x] Content route renders the content creator surface directly without generic milestone overview cards.
- [x] Publishing route renders the publishing queue surface directly without generic milestone overview cards.
- [x] Onboarding route has a dedicated full-screen wizard entry path.
- [x] All Figma primary colors are mapped consistently: navy, midnavy, accent pink, canvas, card, muted, success, warning.
- [x] All main screens use Figma density: 24px page padding, 16px section gaps, compact 11-15px utility text, 17px topbar title, 13px nav text.
- [x] No screen relies on a generic scaffold card when a Figma screen exists.
- [x] Desktop layout verified at 1440px and 1920px widths.
- [x] Tablet layout verified around 1024px width.
- [x] Mobile layout verified around 390px width.
- [x] Visual regression screenshots are captured for `/en`, `/en/content`, `/en/schedule`, and onboarding.
- [x] Visual regression screenshots are captured for `/en/analytics`.
- [x] Visual regression screenshots are captured for `/en/audience` and `/en/channels`.
- [x] Visual regression screenshots are captured for `/en/vault` and `/en/strategy`.
- [x] Visual regression screenshots are captured for `/en/ai`.
- [x] Visual regression screenshots are captured for `/en/settings` and `/en/admin`.
- [x] Arabic/RTL visual screenshot pass is captured for matching routes.

## App Shell

- [x] Sidebar width is 240px and uses Figma dark vertical gradient.
- [x] Sidebar brand lockup matches Figma scale: 36px mark, MARKOS label, AI Marketing OS subtitle.
- [x] Workspace switcher matches Figma compact Zain Arabia treatment.
- [x] Primary nav uses Figma order for core app routes: Dashboard, Content Creator, Publishing Queue, Analytics, Vault/Strategy or equivalent product modules.
- [x] Active nav item uses pink accent fill, border, and left indicator.
- [x] Content and schedule nav badges render as AI and 14.
- [x] Bottom nav includes AI Assistant, Help & Docs, and Settings.
- [x] User profile block matches Figma compact AK card.
- [x] Topbar uses Figma 60px height, breadcrumb, title, search, language buttons, and Ask MARKOS CTA.
- [x] Notification bell and AK avatar are present in the topbar, matching the Figma export.
- [x] Topbar breadcrumbs match each Figma screen exactly: Dashboard, Create > Content Creator, Schedule > Publishing Queue.
- [x] Sidebar route labels match final product naming across all screens.
- [x] Mobile sidebar/navigation pattern is designed and verified.

## Dashboard

- [x] Dashboard route uses Figma dashboard composition instead of foundation overview cards.
- [x] Greeting hero uses Figma gradient, dot pattern, 26px Space Grotesk heading, streak pill, quick stats, and brand score ring.
- [x] Brand score ring is Figma scale: 96px ring with compact score label.
- [x] KPI cards render in four desktop columns at normal desktop width.
- [x] KPI card typography matches Figma scale: 12px label, 30px value, 11px subtext, 34px icon tile.
- [x] Weekly Reach Trend and Channel Performance use Figma `1fr + 340px` composition.
- [x] AI Insight and Upcoming Content use Figma `320px + 1fr` composition.
- [x] Platform icons are platform-specific for Instagram, Facebook, and X/Twitter.
- [x] AI Quick Actions banner matches Figma dark action strip.
- [x] Dashboard charts are upgraded from static SVG approximations to production chart behavior or approved static equivalent.
- [x] Dashboard cards are connected to real analytics API data when available.
- [x] Dashboard empty/loading/error states are implemented.
- [x] Dashboard Arabic/RTL visual parity is verified.

## Content Creator

- [x] Content route renders the Figma content creator directly.
- [x] Content type selector matches Figma: Reel Script, Image Post, Carousel, Story.
- [x] Active content type uses Figma pink border, soft fill, and compact icon tile.
- [x] AI Prompt panel matches Figma scale, tone selector, prompt textarea, presets, and Generate with AI CTA.
- [x] Empty state matches Figma Ready to create block.
- [x] Generating state shows an AI writing/loading treatment.
- [x] Generated output state supports preview, edit, regenerate, accept, and hashtag library.
- [x] Live Instagram-style phone preview matches Figma shell, status/header, content area, action bar, and caption area.
- [x] Publish controls match Figma: IG/FB/X selector and disabled/accepted schedule CTA.
- [x] If signed in, generation still uses the backend content API; without a session, preview mode still demonstrates the journey.
- [x] Generated carousel and story preview variants are fully matched to Figma.
- [x] Post-accept Schedule Post action routes to queue/schedule flow.
- [x] Copy/share/editor actions are fully functional.
- [x] Content Creator Arabic/RTL visual parity is verified.
- [x] Content Creator mobile layout is verified.

## Publishing Queue

- [x] Publishing route renders the Figma publishing queue directly.
- [x] List/calendar segmented control matches Figma.
- [x] Status filters match Figma: All, Scheduled, In Review, Draft, Approved.
- [x] AI Best Times and New Post buttons match Figma sizing and hierarchy.
- [x] List table matches Figma columns: Content, Platform, Scheduled, Status, Estimated Reach, Engagement Rate, Actions.
- [x] List rows match Figma item structure, platform icon colors, AI badge, status pill, and engagement formatting.
- [x] Calendar view matches Figma June 2026 grid.
- [x] Calendar content chips match Figma truncation, platform color, AI badge, and scheduled time.
- [x] List/calendar toggle persists state during the session.
- [x] Filters change visible rows.
- [x] New Post opens or routes to Content Creator.
- [x] AI Best Times displays an insight/recommendation state.
- [x] Publishing Queue Arabic/RTL visual parity is verified.
- [x] Publishing Queue mobile layout is verified.

## Onboarding Wizard

- [x] Full-screen onboarding route exists before app shell entry.
- [x] Dark onboarding background and left step rail match Figma.
- [x] Progress bar and percentage match each step.
- [x] Step 1 Company Info matches Figma fields and defaults.
- [x] Step 2 Brand Identity matches upload zone, tone cards, and brand color swatches.
- [x] Step 3 Target Audience matches age range, gender focus, location, pain points, and language preferences.
- [x] Step 4 Competitors matches competitor list, add/remove behavior, and progress.
- [x] Step 5 Social Channels matches connected/disconnected channel cards.
- [x] Step 6 Content Goals matches selectable goal cards and Build My AI CTA.
- [x] Step 7 AI Setup completion screen matches Figma stats and Launch Dashboard CTA.
- [x] Step rail completed/current/future states match Figma.
- [x] Back/continue navigation works across all steps.
- [x] Onboarding values persist to Vault/business memory APIs.
- [x] Onboarding completion routes to Dashboard.
- [x] Onboarding Arabic/RTL visual parity is verified.
- [x] Onboarding mobile layout is verified.

## Analytics

- [x] Analytics route design is reconciled with Figma or final product spec.
- [x] Top metrics/cards match the dashboard visual system.
- [x] Graphs, channel breakdowns, and AI interpretation use consistent Figma styling.
- [x] Loading, empty, and no-connected-Instagram states are implemented.
- [x] Arabic/RTL visual parity is verified.

## Audience

- [x] Audience route exists if kept in final navigation.
- [x] Audience route design is defined from Figma/product spec.
- [x] Audience segmentation and insights have working states.
- [x] Arabic/RTL visual parity is verified.

## Channels

- [x] Channels route exists if kept in final navigation.
- [x] Social connection cards match Figma channel visual language.
- [x] Instagram connection state is wired to backend readiness/connection APIs.
- [x] Disconnected, connected, expired token, and review-required states are implemented.
- [x] Arabic/RTL visual parity is verified.

## Vault

- [x] Vault route is redesigned to match the Figma shell density and card style.
- [x] Vault modules use the same visual language as onboarding knowledge modules.
- [x] Completeness score and gaps are clear and action-oriented.
- [x] Version history UI matches the product workflow.
- [x] Arabic/RTL visual parity is verified.

## Strategy

- [x] Strategy route is redesigned to match the Figma shell density and card style.
- [x] Strategy generation flow has prompt, output, export, and refresh states.
- [x] 30/60/90 plan and content pillars are easy to scan.
- [x] Arabic/RTL visual parity is verified.

## AI Assistant

- [x] AI Assistant route matches Figma shell visual language.
- [x] Chat layout includes grounded source/context indicators.
- [x] Suggested actions route into content, schedule, analytics, or vault where relevant.
- [x] Empty/loading/error states are implemented.
- [x] Arabic/RTL visual parity is verified.

## Settings + Admin

- [x] Settings route is redesigned to match the Figma shell density and card style.
- [x] Account, workspace, language, billing, channels, and security settings are grouped clearly.
- [x] Admin route keeps dense operational UI but adopts the Figma shell design system.
- [x] Admin sensitive actions preserve RBAC/audit requirements.
- [x] Arabic/RTL visual parity is verified.

## Verification Gates

- [x] `corepack pnpm --filter web typecheck`
- [x] `corepack pnpm --filter web lint`
- [x] `corepack pnpm rtl:qa`
- [x] `corepack pnpm verify`
- [x] `corepack pnpm build`
- [x] Playwright screenshot capture for desktop dashboard.
- [x] Playwright screenshot capture for desktop content creator.
- [x] Playwright screenshot capture for desktop publishing queue.
- [x] Playwright screenshot capture for desktop onboarding.
- [x] Playwright screenshot capture for desktop analytics.
- [x] Playwright screenshot capture for desktop audience.
- [x] Playwright screenshot capture for desktop channels.
- [x] Playwright screenshot capture for desktop vault.
- [x] Playwright screenshot capture for desktop strategy.
- [x] Playwright screenshot capture for desktop AI Assistant.
- [x] Playwright screenshot capture for desktop settings.
- [x] Playwright screenshot capture for desktop admin.
- [x] Playwright screenshot capture for mobile dashboard.
- [x] Playwright screenshot capture for mobile content creator.
- [x] Playwright screenshot capture for mobile publishing queue.
- [x] Playwright screenshot capture for mobile onboarding.
- [x] Playwright screenshot capture for mobile analytics.
- [x] Playwright screenshot capture for mobile audience.
- [x] Playwright screenshot capture for mobile channels.
- [x] Playwright screenshot capture for mobile vault.
- [x] Playwright screenshot capture for mobile strategy.
- [x] Playwright screenshot capture for mobile AI Assistant.
- [x] Playwright screenshot capture for mobile settings.
- [x] Playwright screenshot capture for mobile admin.
- [x] Playwright screenshot capture for quota warning and limit-reached states.
- [x] Playwright screenshot capture for Vault-gap states.
- [x] Playwright screenshot capture for publishing readiness blocked and recovery states.
- [x] Playwright screenshot capture for analytics learning-to-Vault state.
- [x] Playwright screenshot capture for behavioral state audit routes.
- [x] Manual review against the exported Figma folder completed by screen.

## Open Design Decisions

- [ ] Decide whether Vault and Strategy remain primary sidebar items or move behind a business memory/strategy area like the later Figma shell.
- [ ] Decide whether Dashboard uses static SVG charts or adds a charting library for production-grade responsive charts.
- [ ] Decide final mobile navigation pattern: drawer, bottom nav, or compact sidebar.
- [ ] Decide whether onboarding is always first-run gated or available as a relaunchable setup flow from Settings/Vault.
