# MARKOS AI Final UI Source Inventory

> **Historical reference:** This inventory describes the previous dark "AI Marketing Command Center" direction. It was superseded on 2026-08-11 by the approved [Sunlit Social Studio UI foundation](../../../ui-design-foundation.md), and PR #19 later removed or redirected several recorded surfaces. Retain this document as implementation history; do not treat its routes/components as current or use its luxury token system for new work.

Historical design export:
`C:\Users\mohamed.yusuf\Downloads\AI-Powered Marketing OS MVP`

Original Figma file noted by the export:
`https://www.figma.com/design/1DXeHscKXuAcKfp5VLJ5vs/AI-Powered-Marketing-OS-MVP`

Target app at the time of the audit:
`apps/web/app/[locale]`

## Export Summary

The historical export is a Vite React bundle using React Router, Tailwind CSS v4, Lucide icons, Radix primitives, Motion, and Recharts. The wired application is not the older white/red dashboard. It is the darker "AI Marketing Command Center" direction with:

- 80px icon-only glass sidebar
- dark charcoal/midnight canvas
- glass/luxury panels
- turquoise, gold, and amber accents
- Inter body typography and Space Grotesk display headings
- AI-first routes: command center, briefing, opportunities, campaign builder, and content studio

## Wired Routes In The Export

| Export route | Export component | Target Next.js route |
| --- | --- | --- |
| `/login` | `FutureLogin` | `/[locale]/login` or existing auth entry |
| `/onboarding` | `Welcome` | `/[locale]/onboarding` |
| `/onboarding/business` | `BusinessSetup` | `/[locale]/onboarding/business` or wizard state |
| `/onboarding/audience` | `AudienceDefinition` | `/[locale]/onboarding/audience` or wizard state |
| `/onboarding/brand-voice` | `BrandVoice` | `/[locale]/onboarding/brand-voice` or wizard state |
| `/onboarding/goals` | `BusinessGoals` | `/[locale]/onboarding/goals` or wizard state |
| `/onboarding/platforms` | `PlatformConnection` | `/[locale]/onboarding/platforms` or wizard state |
| `/onboarding/analyzing` | `AIAnalysis` | `/[locale]/onboarding/analyzing` or wizard state |
| `/onboarding/strategy` | `StrategyReveal` | `/[locale]/onboarding/strategy` or wizard state |
| `/` | `AICommandCenter` | `/[locale]` |
| `/briefing` | `DailyBriefing` | `/[locale]/briefing` |
| `/opportunities` | `ContentOpportunities` | `/[locale]/opportunities` |
| `/campaign-builder` | `AICampaignBuilder` | `/[locale]/campaign-builder` |
| `/content-studio` | `AIContentStudio` | `/[locale]/content-studio` |
| `/knowledge` | `KnowledgeVault` | `/[locale]/knowledge` or `/[locale]/vault` |
| `/strategy` | `Strategy` | `/[locale]/strategy` |
| `/content` | `ContentCalendar` | `/[locale]/content` or legacy route alias |
| `/publishing` | `PublishingQueue` | `/[locale]/publishing` or legacy route alias |
| `/media` | `Placeholder` | `/[locale]/media` |
| `/analytics` | `Analytics` | `/[locale]/analytics` |
| `/ai-consultant` | `AIConsultant` | `/[locale]/ai-consultant` or assistant route |
| `/settings` | `Placeholder` | `/[locale]/settings` |

## Final Components To Port First

- `src/app/components/Layout/FutureSidebar.tsx`
- `src/app/components/Auth/FutureLogin.tsx`
- `src/app/components/CommandCenter/AICommandCenter.tsx`
- `src/app/components/CommandCenter/DailyBriefing.tsx`
- `src/app/components/CommandCenter/ContentOpportunities.tsx`
- `src/app/components/CommandCenter/AICampaignBuilder.tsx`
- `src/app/components/CommandCenter/AIContentStudio.tsx`
- `src/app/components/Profile/ProfileDropdown.tsx`

## Components To Treat As Secondary Or Legacy Reference

- `src/app/components/Layout/NewSidebar.tsx`
- `src/app/components/Layout/NewTopBar.tsx`
- `src/app/components/Dashboard/NewDashboard.tsx`
- `src/app/components/Dashboard/Dashboard.tsx`
- Older non-future auth/login variants
- At the time of this inventory, `ContentCalendar`, `PublishingQueue`, `Analytics`, `KnowledgeVault`, `Strategy`, and `AIConsultant` had backend-aware implementations. Some were later removed during the Sunlit cutover; consult the current source and restoration register instead of assuming they still exist.

## Onboarding Decision Area

The export contains two onboarding directions:

- Wired route set: `Welcome`, `BusinessSetup`, `AudienceDefinition`, `BrandVoice`, `BusinessGoals`, `PlatformConnection`, `AIAnalysis`, `StrategyReveal`
- Unused future direction: `FutureWelcome`, `FutureBusinessSetup`, `FutureCustomer`, `FuturePersonality`, `FuturePlatforms`, `FutureGoals`, `FutureAnalyzing`, `FutureBlueprint`

The milestone plan keeps this as an explicit open decision before UI-M3 implementation. The production path must preserve the existing MARKOS experience flow requirements: business memory capture, Vault persistence, loading/retry behavior, and onboarding completion routing.

## Token Inventory

Final luxury tokens found in `src/styles/theme.css`:

- `--luxury-turquoise`: `#81D8D0`
- `--luxury-turquoise-light`: `#A3E5DE`
- `--luxury-turquoise-dark`: `#5FC4BA`
- `--luxury-gold`: `#D4AF37`
- `--luxury-gold-light`: `#E8C968`
- `--luxury-amber`: `#F4A460`
- `--luxury-charcoal`: `#0F1419`
- `--luxury-midnight`: `#1A1F2E`
- `--luxury-midnight-blue`: `#1E2738`
- `--luxury-deep-navy`: `#14192B`
- `--foreground`: `#F5F5F7`
- `--foreground-light`: `#C7CDD8`
- `--foreground-muted`: `#8B95A8`
- `--status-success`: `#00C9A7`
- `--status-warning`: `#F4A460`
- `--status-error`: `#FF6B6B`
- `--status-info`: `#81D8D0`

Typography:

- Body: Inter
- Display: Space Grotesk

Effects:

- `.glass`
- `.glass-dark`
- `.glass-luxury`
- `.glow-turquoise`
- `.glow-gold`
- `.glow-amber`
- `.float-animation`
- `.pulse-glow`

## Token Mismatch To Resolve Before Porting

Several final-looking components still reference older `quantum-*` classes, especially:

- `FutureLogin`
- `AIContentStudio`
- unused `Future*` onboarding components

The current theme file does not define `quantum-purple`, `quantum-pink`, `quantum-blue`, `quantum-cyan`, `quantum-emerald`, or `quantum-gold`. UI-M1 must either:

- replace these with the luxury token family, or
- add deliberate compatibility aliases if the final visual direction needs selected purple/pink accent moments.

Do not port these classes into the Next.js app as-is.

## Implementation Rules From Inspection

- Do not wholesale copy the Vite app into Next.js; adapt screen by screen into the existing `apps/web/app/[locale]` routes.
- Keep the current backend-aware behavior, state handling, metering, and workspace scoping.
- Replace hard-coded sample names, dates, currencies, KPIs, and business examples with API data or explicitly named preview fixtures.
- Preserve Arabic/RTL from the first implementation pass.
- Use the final export for visual composition, not for production data contracts.
