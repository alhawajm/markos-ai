# UI Prototype Status

Files in this directory are browser-rendered decision aids. They do not call MARKOS APIs, prove mounted application behavior, replace the build specification or experience flows, or authorize dependencies and backend contracts.

| Artifact | Current role | Status boundary |
| --- | --- | --- |
| `campaign-review.html` | Campaign summaries and a full-screen Overview/Week/Month reviewer with day/post detail and a simulated Create handoff. | Approved by Khalid and Mohamed on September 10; mounted integration implemented; owner visual check pending. Fictional 3-, 14-, and 90-day plans; the 90-day sample tests review navigation only. No APIs, generation, or application persistence in this artifact. |
| `business-profile.html` | Interactive manual Business Profile draft: five sections, focused modals, offering catalog, establishment stage, and recovery states. | Ready for visual review. Fictional in-memory data, English/Arabic desktop checks; no application APIs, database persistence, or AI. |
| `shared-foundation-comparison.html` | Compares bilingual typography, semantic palettes, density, shell behavior, and a dark companion. | Exploratory. IBM Plex and Tangerine Slate are leading lab candidates, not production fonts or tokens. |
| `create-workflow-prototype.html` | Connects the reviewed action hub, media-first editor, preview, Ready, and scheduling concepts. | Active design reference only. The mounted Create page has not yet adopted this composition; Carousel, Reel, Story, and Media Library elements are structural exploration. |
| `onboarding-pass-0-field-contract.html` | Records the Pass 0 field and navigation exploration that preceded implementation. | Historical/superseded as a behavior source. Use `docs/source/MARKOS_EXPERIENCE_FLOWS.md`, `docs/decisions.md`, `docs/ui-ux-decisions.md`, and current source for the implemented Onboarding contract. |

When a prototype is implemented, update this table instead of silently treating the HTML artifact as current application evidence. Preserve useful historical artifacts unless they expose secrets, customer data, or licensed source that the repository may not retain.

## Campaign review draft

Run `node scripts/campaign-review-preview.mjs` from the repository root and open `http://127.0.0.1:3101`. The loopback server serves only the prototype, the existing Lucide sprite, current theme tokens, and local IBM Plex Sans/Arabic font files. It loads no environment files or application services. Stop the foreground server with Ctrl+C when finished.

The main page lists fictional campaign objectives, dates, and counts derived from sample ideas and linked content. Open a campaign to review it in a full-screen native dialog. Overview, Week, and Month change the plan's scale; day rows and date cells reveal posts. Select a post to see its brief, goal, pillar, and sample media state, then use Previous/Next or return to the plan. Close and reopen a campaign to inspect selection retention and focus return. Short plans open directly in Week; there is no forced month hierarchy.

Reading and navigation do not change content state. **Create draft** explicitly creates a fictional in-memory Draft; **Open draft / Open in Create** only explains the existing same-record handoff. Repeated opening does not create duplicate fixtures. No content Review state is added. Sample changes reset on refresh. The 90-day fixture is labeled as review-layout exploration; working Campaign generation remains 3/7/14 days and is not implemented by this prototype.

Use **Preview tools** on the index or inside the reviewer for English/Arabic, light/dark, empty/loading/failure states, and a failed next draft action. Convenient review URLs include `/?locale=ar&theme=dark&campaign=autumn`, `/?campaign=weekend`, `/?campaign=season`, and `/?state=empty`. Campaign names in the URL select the 14-, 3-, and 90-day fixtures respectively.

Browser checks on 2026-09-10 passed all eight English/Arabic × light/dark × 1440×900/1366×768 combinations, with 144 captures and 1,076 assertions. Coverage includes the three plan lengths, every review scale, day/post navigation and period boundaries, selected-day visibility, close/reopen selection and keyboard focus, empty/loading/failure recovery, and explicit same-record sample draft actions. Reading and navigation preserved fixture records. No horizontal overflow, clipped controls, ordinary text below 13px, page errors, failed requests, or external/API requests were observed in the checked views. Local IBM Plex glyph rendering was confirmed for both languages. This is prototype evidence; mobile layout, mounted application integration, persistence, generation, and provider behavior remain unverified. Khalid and Mohamed subsequently approved this direction, with stable navigation actions, panel scrolling, and restrained status/count colors to be refined in the mounted page. See [the focused follow-up plan](../analysis/focused-product-followups-2026-09-10.md).

## Business Profile draft

Run `node scripts/business-profile-preview.mjs` from the repository root and open `http://127.0.0.1:3100`. The server listens only on loopback and serves an explicit allowlist of prototype files plus the current `apps/web/app/sunlit-theme.css`. It requires no app servers, database, package install, or environment files. Stop the foreground server with Ctrl+C when finished.

The HTML, CSS, JavaScript, and Lucide SVG sprite are an isolated design aid. They reuse runtime Sunlit styling and the installed Lucide icon artwork; they do not mount React application components. Sample edits last until refresh. Use **Preview tools** to inspect incomplete, loading, and load-error states, or simulate a failed/conflicting next save. UI controls outside Business Profile explain that the destination is outside this draft.

Review Business, Products & Services, Audience & market, Brand & voice, and **Marketing strategy**. Try a section edit, discard/keep editing, adding or renaming an offering, each price type, archiving/restoring, search/filters, and switching to Arabic. The prototype uses BHD pricing. Optional translated names are edited alongside the same offering; it makes no AI translation request.

Browser review on 2026-09-07 covered English/Arabic desktop at 1440×900, 1366×768, and 1920×1080, with focused interaction checks for save/discard, simulated failure/conflict recovery, catalog operations, empty/loading/error states, and modal keyboard focus. Mobile composition and actual backend behavior remain unverified. See [the implementation plan](../business-profile-plan.md) for the proposed production contract and scope.
