# MARKOS web, Android and iOS — design and architecture plan

Date: 2026-09-22. Status: **proposed direction with an interactive study and editable Figma prototype**. Owner: Mohamed and the project owner. This is a researched implementation plan, not a claim that mobile apps exist or that the proposed navigation has been approved.

Delivery team: **Mohamed and Codex**. Design, web, mobile and backend implementation run as one continuous effort. The phases below are implementation milestones, not handoffs to separate teams; raise concrete product choices or account-access blockers when they affect the next working slice.

[Open the interactive design study](prototypes/markos-mobile-direction.html). It contains illustrative data, works without the MARKOS backend, and cannot generate or publish anything. Use its device, language, theme and state controls; click New campaign, Continue, Review campaign and the navigation destinations.

[Open the Figma design workspace](https://www.figma.com/design/rpxaHSd5RCGo1h7XRk8YEp?node-id=7-53) or [play the campaign journey](https://www.figma.com/proto/rpxaHSd5RCGo1h7XRk8YEp?node-id=7-53&starting-point-node-id=7%3A53). The editable file contains the shared component foundations, mobile screens, Arabic previews and desktop/tablet comparison. Its transitions simulate the journey; form entry and file selection are demonstrated in the HTML study.

## 1. Product outcome and scope

An owner should be able to describe Blooms in Pink, attach up to five references, review a grounded campaign, prepare bilingual posts, and deliberately schedule approved content from a phone. The same account and workspace must show the same saved records on web, Android and iOS.

Keep the existing Next.js web application. Add one React Native/Expo application for Android and iOS in the existing repository. Railway continues to host the authenticated API, AI service, workers and data. Share domain contracts and visual foundations; compose screens for their available space and platform conventions.

The first mobile delivery is a connected campaign workflow. Full user-facing parity remains the target. Platform administration stays a separate web surface; it is not another phone tab. Backend capabilities that are still incomplete on web do not become complete merely by adding a mobile screen.

The current request brings detailed mobile design into active scope, superseding its previous deferral. It does not replace the September 10 brand foundation or the existing content lifecycle. Structural requirements come from [the build spec](source/MARKOS_BUILD_SPEC.%202.pdf); behavioral requirements come from [experience flows](source/MARKOS_EXPERIENCE_FLOWS.md) and later [decisions](decisions.md). The [UI workflow](ui-ux-workflow.md) and [Sunlit foundation](ui-design-foundation.md) govern the design study.

## 2. Research: specific patterns, with evidence

Research date: September 22, 2026. These are selected strong references for MARKOS's tasks, not an objective ranking of all apps. Evidence is public first-party product documentation, published screenshots and demonstration clips. I inspected Linear's navigation image and promotional clip frames, Airbnb's Trips screen, Buffer's mobile screen montage, and Things' Upcoming interaction frames. Canva's web editor page did not render in the research browser; its editing workflow was reviewed from documentation and the developer's App Store listing. This is not a hands-on usability study of authenticated competitor apps.

| Reference and evidence | Observed pattern | Application to MARKOS | Boundary |
| --- | --- | --- | --- |
| [Linear mobile redesign, Oct 2025](https://linear.app/changelog/2025-10-16-mobile-app-redesign) and [navigation customization, Jan 2026](https://linear.app/changelog/2026-01-22-customize-your-navigation-in-linear-mobile) | Compact bottom navigation, clear selection, task lists and quick creation access; later customization allows pinning frequent destinations. | Stable navigation, restrained chrome, persistent location and short routes into work. | Start with fixed labeled destinations. Customizable tabs and decorative glass are unnecessary for the first release. Promotional camera motion is not evidence of actual screen-transition timing. |
| [Airbnb's published 2025 app redesign](https://news.airbnb.com/product-releases/airbnb-2025-summer-release) | Trips groups dated activities beneath one trip identity, with clear time, title and imagery; five labeled bottom destinations. | Campaign identity above a date-grouped content itinerary; readable preview cards and details reached progressively. | Keep MARKOS icons and typography. Large travel imagery, 3D category icons and shopping-style discovery do not fit every operational screen. This is the dated 2025 reference, not a claim about every current Airbnb screen. |
| [Buffer mobile](https://buffer.com/mobile) and [calendar workflow](https://support.buffer.com/en-us/articles/how-to-use-buffers-calendar-feature-FSSKbH32DN) | Published mobile screens separate a focused composer from drafts and the posting queue; calendar guidance links planning to editing and scheduling. | Distinct brief, draft, readiness and schedule steps, plus useful media thumbnails. | MARKOS is Instagram-first and has its own approval rules. Do not copy Buffer's multi-channel controls or treat a plus action as a navigation destination. |
| [Things interaction demonstrations](https://culturedcode.com/things/features/) and [gesture guidance](https://culturedcode.com/things/support/articles/2803582/) | Clear day headings and light hierarchy; the published Upcoming clip shows item movement preserving the surrounding list context. | Agenda-first calendar, readable groups, small context-preserving state transitions. | The reviewed clip is historical, useful as an interaction reference rather than a current styling baseline. Dragging is optional; every change also has a labeled action. |
| [Canva video editor](https://www.canva.com/video-editor/) and [Canva's App Store listing](https://apps.apple.com/us/app/canva-ai-photo-video-editor/id897446215) | Documentation describes importing media, editing, previewing and exporting in a mobile-capable creative workflow. | Put the media preview beside a small, contextual set of editing choices. | No promise of a Canva-scale freeform canvas or timeline editor in MARKOS v1. This recommendation is an interpretation of the workflow, not an observed authenticated Canva session. |
| [Apple tab-bar guidance](https://developer.apple.com/design/human-interface-guidelines/tab-bars), [Android navigation patterns](https://developer.android.com/design/ui/mobile/guides/layout-and-content/layout-and-nav-patterns), [Android system bars](https://developer.android.com/design/ui/mobile/guides/foundations/system-bars) | Top-level navigation has a stable role; navigation adapts to space and must respect system gestures and insets. | Phone tabs, larger-screen rail/sidebar, real back behavior and safe-area-aware controls. | Adapt the pattern through Expo/React Navigation. Android Compose examples do not mean MARKOS needs a Kotlin UI rewrite. |

The resulting direction is a calm working studio: prominent content, readable decisions, consistent symbols, one clear next action, and motion that explains where something went.

## 3. Navigation and information architecture

### Phone: five stable destinations

| Destination | Arabic label | User job | Default contents | Icon |
| --- | --- | --- | --- | --- |
| Overview | نظرة عامة | Know what needs attention | Resume work, pending reviews, upcoming publication, actionable connection errors | Home |
| Campaigns | الحملات | Plan and manage a campaign | Search, draft/active campaign list, New campaign | Target |
| Create | إنشاء | Prepare individual content | New Post/Reel/Story/Carousel, recent drafts, media entry | Palette |
| Calendar | التقويم | See when work is planned or scheduled | Selected week and day agenda, Unscheduled, status filters | CalendarDays |
| Insights | التحليلات | Understand actual performance | Range, real metrics, availability/freshness and next action | BarChart3 |

Create is a real persistent destination with drafts and tools. It does not generate content when tapped. New campaign and New content remain explicit actions inside their destinations. Keep all five tabs in a fixed order; do not move them after personalization or hide empty destinations.

Business Profile and Settings are reachable from the workspace/account control. Overview also links directly to incomplete business information. Notifications use one consistently placed bell. A workspace switch shows the current workspace name; switching clears the prior workspace's visible data before rendering the next. Avoid a duplicate hamburger menu containing the same five tabs.

Each tab preserves its stack, scroll position, filters and selected day. A second tap on the active tab can return to its root; it must not discard dirty work. Back returns to the actual origin, including filtered campaign list or calendar day. Deep links resolve session, membership and permissions before opening the requested record, with a useful fallback if access has changed.

### Tablet, foldables and desktop

Treat available window width as the input, not the device's marketing name. Proposed starting widths, to validate with real text and native layout:

| Usable width | Shell | Working composition |
| --- | --- | --- |
| Under 600 logical units | Five bottom destinations | One focused pane; sheets for short choices; full screens for complex editing |
| 600–839 | Compact labeled rail | One main pane; optional supporting pane only where both remain readable |
| 840–1199 | Rail, optionally expanded | Campaign list/detail or editor/context split where useful |
| 1200+ | Existing expanded desktop sidebar, explicitly collapsible | Wide campaign reviewer, editor and contextual assistant/preview |

Desktop retains Overview, Campaigns, Create, Calendar, Insights and Business Profile in the main sidebar, and the existing secondary Settings/language positions. Preserve the current collapsed-rail behavior while evaluating native tablet density separately. Settings remains a separate screen with a clear return path; it does not create a second nested application shell.

On phones, root screens and ordinary detail pushes retain navigation context. A self-contained full-screen task such as the campaign composer or draft editor may cover the tab bar; it has explicit Back/Close and protected draft state. A modal must not become an invisible new top-level destination. iOS edge-back and Android system/predictive back follow the same save and discard rules.

## 4. Visual and component system

### Preserve MARKOS identity

Use the existing exact base palette:

| Token | Light | Dark |
| --- | --- | --- |
| Text | `#20212b` | `#f2faf7` |
| Canvas | `#f7fafa` | `#151821` |
| Primary | `#d88fa3` | `#8fe3da` |
| Secondary | `#81d8d0` | `#7b6af0` |
| Accent | `#6c3ce8` | `#d9a0b1` |

Use the actual semantic surfaces, borders, focus and lifecycle colors from `apps/web/app/theme-tokens.css`. The shared package currently exports CSS `var(...)` strings and web shadow strings: these cannot serve directly as React Native style values. Introduce platform-neutral token data, with CSS output for web and typed literal values for native. Preserve web token names and exact current colors during that change. Do not hand-maintain a second mobile palette.

Use IBM Plex Sans and IBM Plex Sans Arabic, real 400/500/600/700 weights, and the existing OFL license. Native font loading should use verified matching TTF/OTF assets; existing WOFF2 browser files are not assumed portable. Keep 16-unit body text, 15–16 controls, 14 labels, 13 metadata and roughly 28-unit page titles. Respect OS font scaling; increase space and reflow instead of truncating essential Arabic text or disabling scaling.

Use a 4-unit spacing base with 8/12/16/24/32 groups. Start at 20-unit phone gutters, 16-unit card padding, 48-unit primary controls, 12-unit control radii, 16-unit cards and 24-unit sheet corners. These native geometry values are proposed, not a silent replacement of all web component shapes. Most information should be plain rows or grouped sections; reserve large cards for campaign identity, media and the next meaningful task.

### Icons

Retain the existing Lucide family. [Lucide provides React Native components](https://lucide.dev/guide/react-native) with size and stroke control. Use one semantic icon map across platforms rather than letting each screen pick a new metaphor.

- 24-unit navigation icons, 20-unit inline/action icons; baseline 1.5 stroke to preserve the current spec. Optical adjustment must be documented and applied consistently.
- Active navigation: icon + readable label + selected surface/indicator. Do not rely only on color, and do not pretend every outline icon has a compatible filled variant.
- Additional mappings: Brain = Business Profile, Bell = Notifications, Settings = Settings, Paperclip = attachments, FileText = document, Clapperboard = Reel, Images = carousel, Sparkles = an explicit AI action, CircleAlert = actionable error.
- Mirror back/forward and reading-direction arrows for Arabic. Do not mirror logos, media playback controls or numerals indiscriminately.
- Every standalone icon action has a localized accessible name and at least a 44pt iOS / 48dp Android touch area. Destructive actions include text in their confirmation context.
- Platform-owned pickers and system surfaces use their native icons. App controls retain MARKOS's consistent family.

### Components to establish once

Screen scaffold; phone tabs and larger-screen navigation; page header; account menu; primary/secondary/icon buttons; input and textarea; segmented choice; tabs; campaign card; content row; file row and thumbnail; status badge; date/time selection; action sheet; dialog; toast; inline error; empty state; skeleton; generation status; media preview; assistant composer; save-state indicator; permission explanation.

Every component defines light/dark, English/Arabic, default/focus/pressed/selected/disabled/loading/error states where applicable. Use native primitives and styles for mobile. Share semantics and tokens, not web DOM components, TipTap instances or CSS-specific wrappers.

## 5. Motion specification

These are proposed MARKOS timings, not measured competitor timings. Native stack navigation keeps platform-owned transitions and gestures. Custom motion is interruptible and does not block a user's next input.

| Interaction | Initial direction | Reduced motion |
| --- | --- | --- |
| Button press | Immediate tonal feedback; optional very small compression over 80–120ms | Tonal feedback only |
| Root tab change | Preserve screen state; short 120–180ms fade if needed, no lateral page carousel | Immediate change |
| Drill into campaign/content | Native stack push and interactive Back | Respect platform accessibility settings |
| Action sheet | Short 220–280ms slide with restrained spring; backdrop reveals context | Fade or immediate presentation |
| Expand reference details | 160–220ms local expansion; keep triggering row anchored | Immediate expansion |
| Reorder/reconcile list | 180–240ms movement preserving the item's identity | Immediate layout update with announcement |
| Saved or completed feedback | Static icon/text and one concise announcement; routine toast about 4.5s | Same information; no bounce/confetti |
| AI work in progress | Truthful phase label and elapsed time; indeterminate indicator when percentage is unknown | Static phase label; no shimmer loop |

Observe Reduce Motion and Reduce Transparency, avoid autoplay decorative video, and reserve haptics for deliberate selection or meaningful success/error, never every AI token. [Apple accessibility guidance](https://developer.apple.com/design/human-interface-guidelines/accessibility) and [reduced-motion evaluation](https://developer.apple.com/help/app-store-connect/manage-app-accessibility/reduced-motion-evaluation-criteria) inform these rules.

## 6. Core journeys and screen contracts

### A. Open, authenticate and resume

Launch → restore session → resolve workspace → show the previous valid destination. First-time users go through verified account and existing onboarding requirements. Email links return to the appropriate mobile screen, preserve the destination through login, and never expose tokens in logs. A slow refresh shows a recovery state, not an endless splash or an immediate forced logout. Native session rotation, logout and account switching receive focused integration tests.

### B. Blooms in Pink: references to campaign

1. Campaigns → New campaign. Full-screen composer with two concise steps: **Brief** and **Plan**. Back preserves entries. Closing preserves a device draft by default; Discard is explicit.
2. Brief: objective, description/context, optional files. Owner can add/remove references without losing the brief. Display filenames, type, size, previews where supported and a 0/5 count. Preserve existing limits: five files, 8 MB each, 20 MB combined; PDF, DOCX, TXT, PNG, JPG, WebP.
3. Plan: current supported duration, start date and publishing intensity, plus a brief/files summary with direct Edit links. Preserve current 3/7/14-day generation support; do not expose 30/60/90 as functioning choices merely because a prototype includes planning.
4. Submit once. Show truthful state such as Uploading references, Queued, Drafting campaign, or Needs attention only if the server actually exposes that state. A retry resolves the existing request first. A connection drop does not mean generation failed.
5. Review: campaign overview and date-grouped content itinerary. A separate reference summary shows what the AI understood and identifies conflicts, missing facts or unreadable references. The owner can correct the brief and regenerate deliberately. AI output remains a draft.
6. Open a content slot in Create. Carry the saved campaign description and reference summary into its context. The same campaign should be visible on web after it is saved.

Current uploads pass reference bytes transiently for analysis and save metadata plus a summary. Original source documents are not yet stored as downloadable Library assets. Mobile must not show a fake Open original or imply cloud-backed file retention. The first reliability pass may stage reference bytes privately for a generation job and clean them after completion/expiry; permanent retention is a separate product decision.

### C. Content and Reel preparation

Create → choose format/context → focused editor. Preserve the current conversation-led authoring approach while providing explicit Edit and Preview controls. On a phone, show one main working surface at a time; the MARKOS conversation is a dedicated mode/sheet with the same content identity, not a permanently squeezed second column. Manual caption/media/detail editing remains accessible without asking AI.

Preview shows the real selected media's ratio. Reel assets remain 9:16 where selected; a decorative preview frame must not crop the exported video. English and Arabic captions can be inspected separately. Exact on-screen bilingual copy remains a typeset overlay from the existing Reel pipeline, rather than asking the video model to draw words.

Background job updates never replace dirty manual fields. Save status distinguishes Editing, Saving, Saved, Offline draft and Save failed. A stale revision offers a recoverable conflict rather than last-write-wins data loss. Mark Ready requires current caption/media validation, including at least two assets for a carousel. Readiness does not schedule or publish.

### D. Approve, schedule and recover

Preview → explicit Mark Ready → Schedule → choose date/time and confirm Instagram account → scheduled record. Calendar defaults to an agenda with a week selector; month view remains available without tiny dense tappable cells. Show the workspace timezone explicitly; never silently change a Bahrain publishing time when the owner travels.

`plannedAt` means intended placement, `scheduledAt` means committed scheduling, and `publishedAt` means confirmed provider publication. Use lifecycle labels and icons along with colors. Failed publication has a visible reason and action; reconnect, reschedule and cancel return to the originating day/content. Dragging may propose a move but must not silently approve a draft or bypass API checks.

### E. Return after an interruption

If the app backgrounds, is killed, or changes networks, restore the local draft and query a persisted job. Poll only while needed; reconcile again on foreground. Notifications deep-link to the job/content, but the app refreshes authoritative status before showing completion. If a file permission or cache URI expired before upload, ask to reselect that file while retaining all text and other valid selections.

### F. Weekly owner loop

Overview highlights one useful next task → Campaigns/Calendar → prepare and approve work → schedule → review actual Insights → update business context deliberately. Empty Insights explains missing connection/data; it never displays invented growth numbers. Business Profile remains permanent business knowledge; an event-specific campaign correction does not overwrite it.

## 7. Important UI states

| State | What the owner sees | Required behavior |
| --- | --- | --- |
| First campaign | Clear New campaign action and optional reference explanation | No fabricated history |
| Loading existing data | Stable skeleton matching the content hierarchy | Keep shell usable and expose retry after a failure |
| Upload validation failure | Error beside the affected file with type/size reason | Keep accepted files and description |
| Generation running | Honest phase, elapsed time, Leave/return path | No invented percentage or duplicate request |
| Lost connection after submission | Checking campaign status | Look up the request before offering a new generation |
| Provider failure | Safe reason, preserved brief, Retry/edit action | Keep failed job evidence and meter actual usage |
| Session expired | Sign in to continue | Preserve permitted local work; revalidate access before restoration |
| Workspace changed | New workspace context | Clear/cancel old cache and never restore another workspace's draft into it |
| Missing Instagram/MFA/permission | Plain requirement and direct next step | Enforce on the API as well as UI |
| Empty or unavailable metrics | Connect/sync action or insufficient-data explanation | Distinguish unavailable from zero |

## 8. Implementation architecture and current gaps

```text
Next.js web ─────────┐
                    ├─ HTTPS → MARKOS API → workspace-scoped database + private storage
Expo Android + iOS ─┘                 │
                                     ├─ AI service → configured providers
                                     └─ durable jobs → workers → saved results / notifications
```

Mobile contains presentation, local drafts and API access. Model keys, database credentials, SendGrid and Instagram provider tokens stay on the server. Railway remains the shared service deployment; EAS builds the mobile binaries. Device code never connects directly to PostgreSQL or the internal AI service.

| Concern | Current evidence | Planned change |
| --- | --- | --- |
| Workspace and API contracts | Existing typed client, validation and workspace header | Reuse and add native adapters only where transport differs |
| Session renewal | API refresh/logout require the browser-session header and refresh cookie | Add a first-class native grant/refresh/revoke flow using the same identity, rotation/reuse controls and permissions; securely store native refresh credentials |
| UI tokens | Shared exports contain CSS variables and CSS shadows | Extract literal semantic source plus web/native adapters; validate no web color change |
| Fonts | Local WOFF2 assets for browser | Match the approved families with verified native-compatible assets |
| Campaign generation | Synchronous provider request with reference files | Add persisted generation request/job and idempotent submission before promising background resilience |
| Video generation | Existing persisted jobs and worker processing | Reuse status/cancel semantics, audit recovery on app restart, do not create a parallel mobile video service |
| Attachments | Browser File/FileReader and base64 payload | Native document/photo picker and app-owned temporary files; bound memory and preserve per-file validation |
| Notifications | Existing product surface is not proof of push delivery | Add device registration, scoped notification intent, provider delivery and safe deep links when this slice is built |
| Offline edits | Browser state is not a durable mobile store | Persist device drafts by user + workspace + entity, reconcile revisions, clear on logout/removal |

Proposed repository shape (new folders are a plan):

```text
apps/web/                         existing browser UI
apps/mobile/
  src/app/                        Expo Router layouts and route entries
  src/features/                   auth, onboarding, campaigns, create, calendar, insights, settings
  src/components/                 shared native MARKOS primitives
  src/platform/                   session storage, file picking, links, notifications, lifecycle
  src/state/                      small UI preferences and draft coordination
packages/api-client/              shared transport contract; injectable session renewal
packages/shared-types/            shared domain models
packages/validation/              shared request schemas
packages/i18n/                    shared copy and formatting
packages/ui-tokens/               platform-neutral values and web/native adapters
apps/api/ + services/ai/          existing service boundaries
```

Use Expo Router with native stack navigation, an accessible tab implementation, TanStack Query for server state and a small Zustand store only for UI state. The repository already uses the latter libraries on web. Introduce shared query hooks only when both clients use the same semantics; avoid a speculative abstraction framework. [Expo monorepos](https://docs.expo.dev/guides/monorepos/) and [navigation layouts](https://docs.expo.dev/router/basics/navigation-layouts/) support this structure.

Use Expo SecureStore for credentials, DocumentPicker/ImagePicker for user-selected files, the native video player for media, and the OS share sheet for downloads. Match libraries to the selected stable Expo SDK at initialization; do not copy arbitrary versions or force the current web React version onto React Native. Evaluate native tab APIs against the chosen SDK and Lucide/RTL requirements before selecting them; use the supported tab navigator if a native API is experimental or lacks the needed behavior.

Cache keys include authenticated user and workspace, not just an entity ID. Cancel in-flight requests and discard late responses after a workspace/session change. Native session refresh is single-flight so concurrent API calls cannot rotate the refresh credential twice. Keep unsent device drafts separate from confirmed server data. Draft storage and staged file paths are scoped to the current user/workspace and cleared on logout; never put PDFs or videos inside SecureStore.

### Durable campaign generation contract to build

The names below describe a proposed capability, not currently deployed endpoints. Introduce an authenticated submit/status/cancel interface alongside the existing synchronous route, with backward-compatible web migration. Server-generated request/job IDs and a client-generated idempotency key bind the intent to user/workspace and a normalized input hash. Reusing a key with different input is rejected. A completed replay returns the saved campaign, not a second charge/generation.

Persist queued/running/succeeded/failed/cancelled state and result ID. Workers claim jobs with bounded leases and reconcile interrupted attempts; provider timeouts do not automatically authorize a fresh paid operation. Private staged references have expiry and workspace ownership. Cancellation is best effort once a provider has begun; the UI must distinguish cancel requested from confirmed cancellation and retain actual usage. One terminal result is attached once through a transaction. Keep the server's current content revision rules.

For the first mobile build, use the existing bounded file contract if memory checks pass. A job-scoped signed upload and finalize step is the planned improvement if direct base64 requests prove unreliable on the target devices. Avoid loading five maximum-size files into multiple JavaScript copies. Any new workspace-owned table needs the existing isolation tests.

Backend changes benefit all clients when their contracts remain compatible. UI changes still need web and mobile implementations. Mobile releases may lag server deployments, so additive response fields and backward-compatible request handling are required; breaking changes need an explicit migration window.

## 9. Arabic, accessibility and performance

English and Arabic are delivered together, including picker errors, dates, notifications and empty states. Mirror layout once at the platform boundary and verify actual order; do not reverse arrays and also enable RTL. Keep email addresses, URLs, filenames and mixed-language campaign titles directionally isolated. Do not blindly reverse a time axis or video timeline; test the semantic order and local labels. Arabic glyph shaping must be inspected on devices with the real fonts.

Native direction changes require particular care: React Native's [I18nManager](https://reactnative.dev/docs/i18nmanager) direction settings can take effect on the next application start. Do not assume that the HTML study's immediate language switch proves runtime native RTL. Establish direction before navigation mounts; if the chosen implementation needs a controlled reload, preserve the draft first and explain the change. For [document selection](https://docs.expo.dev/versions/latest/sdk/document-picker/), use a copy accessible to the app when required and verify provider-backed files on both operating systems.

Acceptance targets: no clipped essential content at 200% text scaling, usable primary actions at 320 logical units, accessible VoiceOver/TalkBack names and selection states, visible focus for external keyboards, readable status beyond color, and contrast checked against actual pairs (4.5:1 ordinary text, 3:1 large text and essential UI boundaries). These are implementation targets to verify, not measurements of the study. [WCAG 2.2](https://www.w3.org/TR/WCAG22/) informs the web contrast/resize baseline; native assistive technology needs separate checks.

Performance targets to measure on a representative mid-range Android and supported iPhone: immediate press feedback; smooth 60Hz scrolling/navigation on those devices; cached first usable screen within roughly 1 second after session restoration, excluding required network work; warm root-tab changes without refetch flashes; no unbounded media list; thumbnails rather than full-size video downloads; active-job polling that backs off and pauses in background. These are proposed budgets, not established results. Provider generation time is measured separately from UI responsiveness.

## 10. Delivery sequence and completion criteria

These are mobile work packages layered over M0–M6; they do not reset the existing product milestones. Build one connected slice at a time. No speculative calendar estimate is attached before the native foundation and authentication slice establish actual effort.

| Order | Work package | Concrete completion evidence |
| --- | --- | --- |
| 0 — this pass | Research, architecture and navigation study | This document plus a clickable English/Arabic, light/dark candidate; sample states and desktop/sidebar comparison. Not an Expo app. |
| 1 | Native foundation and account flow | Expo app runs on Android and iPhone; shared token/font primitives; native login/refresh/logout; working deep links; tabs/back/RTL; two-workspace isolation evidence |
| 2 | Campaign vertical slice | Real workspace campaigns; five references; persisted brief; durable/idempotent job; app kill/network recovery; grounded review; same saved campaign on web |
| 3 | Create, media and readiness | Real bilingual editing, image/Reel playback and jobs, exact text overlays, manual path, save/revision recovery, explicit Mark Ready |
| 4 | Calendar and Instagram handoff | Agenda/week/month as appropriate; account/timezone confirmation; schedule/cancel/reschedule; provider failure and reconnect recovery; required live external evidence remains explicit |
| 5 | Full owner journey | Native onboarding/Business Profile, real Insights and empty states, Settings/security/notifications and supported account/team flows; unfinished backend capabilities tracked separately |
| 6 | Team beta and store preparation | EAS Android preview and iOS TestFlight; physical-device checks, icons/splash/links/permissions, store metadata and owner-controlled accounts |

A release candidate must not use the HTML study or mocked API success as integration proof. Test only the changed components and service paths plus their connected journey. Persistent tests use a disposable database. Real provider tests use authorized bounded inputs; provider publishing requires an explicitly intended account/action.

Before broad screen implementation, turn the highest-risk screen into a native working sample to check keyboard, Arabic, file picker and back behavior. The HTML prototype cannot establish those native properties. Per [UI workflow](ui-ux-workflow.md), material navigation moves from Proposed to Approved after Mohamed's review of the concrete candidate; there is no requirement for an extra helper-agent handoff.

## 11. Focused validation plan

- Design study: real browser clicks, phone and desktop composition, English/Arabic, light/dark, navigation and sample error/loading/empty/blocked states, reduced-motion behavior and overflow. Illustrative only.
- Native foundation: iPhone and Android device checks for authentication persistence, biometric preference if later added, keyboard occlusion, Back, RTL, font scaling and safe areas. Biometric login is not required for the initial campaign slice.
- Campaign flow: no files / five mixed files / sixth rejected / file too large / total too large / corrupt file / interrupted upload / background during generation / duplicate submit / completed result recovery / workspace switch / missing profile context.
- Content and schedule: dirty draft plus incoming job result, stale revision, app restart, failed media attachment, missing account/MFA, timezone travel, cancel/reschedule and real provider outcome.
- Accessibility: VoiceOver/TalkBack reading order and focus, text scaling, both themes, reduced motion and clear labels. Automated checks complement device use.

## 12. Decisions to keep explicit

Recommended now: one Expo mobile app, existing web, shared Railway backend; five phone destinations; contextual Business Profile/Settings access; current brand and Lucide; native session handling; recoverable campaign generation; local draft preservation; English/Arabic together.

Candidate visual decisions: exact tab treatment, phone spacing, larger-screen rail width, composer step presentation and custom motion timings. Review using the study before calling these approved.

Owner inputs needed when the implementation reaches them: Expo project/organization ownership, Apple/Google developer access and app identifiers, supported device/OS range, permanent source-file retention if desired, and which currently incomplete backend capabilities are required for public launch. These do not block the research/design plan.

Deferred until warranted: replacing Next.js with Expo web, custom navigation personalization, a second native-language application, a full freeform design canvas, offline publishing, silent automatic approval, offline AI generation and broad new social-channel support.

## 13. Research and study verification record

Public research assets and inspection frames are retained locally under `var/mobile-design-research/` and are not redistributed as MARKOS artwork. First-party links above remain the durable research references. The study uses MARKOS tokens, locally available IBM Plex fonts, Lucide-derived symbols and original vector decorations.

Browser verification on September 22 used headless Chrome with real clicks, file selection and form input. Passed: five phone/tablet/desktop language/theme compositions; brief editing and preservation; file selection/removal; two-step navigation; simulated completion into reference review; caption preservation across editor modes; separate save/readiness actions; empty/loading/error/blocked states; all five root destinations; workspace menu/Business Profile; system reduced motion; outer layout at 390 and 320 CSS pixels. The five captured compositions had no main-content or page horizontal overflow, both embedded font families loaded, and there were no JavaScript page errors. Phone English/light, phone Arabic/dark, tablet Arabic/light and the composer in both languages were visually inspected; desktop screenshots were also reviewed.

Evidence: `var/mobile-design-research/study-verification.json` and the `study-*.png` captures. This is focused browser evidence for the illustrative study. Native devices, real keyboards, back gestures, screen-reader use, text scaling, complete contrast auditing, server integration and performance remain implementation checks. The native save/recovery contract in this plan is stronger than the in-memory HTML demonstration and must be implemented separately.

The study embeds its font and icon assets and their licenses, so the HTML file can be opened directly or shared as one file without a local server. This pass does not modify or redeploy the hosted MARKOS application, create customer campaigns, initialize Expo or publish mobile builds.

## 14. Editable Figma workspace

Created September 22 under Mohamed's delegated Figma authority: **MARKOS Sunlit UI Lab — Web, Android & iOS**, file `rpxaHSd5RCGo1h7XRk8YEp`.

| Location | Delivered candidate |
| --- | --- |
| 00 Decisions | Three-platform architecture, shared Railway backend, implementation order and prototype boundaries |
| 01 References | Linked research principles and motion direction |
| 02 Foundations | 111 variables across primitive, semantic light/dark color and geometry collections; 14 text styles and four shadow styles |
| 02 Components | 30 Lucide symbol components; button, navigation, input, attachment, lifecycle status and campaign-card families; 59 component definitions in total |
| 03 Review · Mobile | 18 English screens: five destinations, campaign brief/plan/generation/review, portrait Reel editor, readiness, scheduling, workspace menu and four recovery/empty states |
| 03 Review · Arabic | Editable RTL Campaigns and Brief previews in dark mode |
| 05 Comparison | Desktop sidebar with campaign review and tablet rail with two panes |

The main flow is Campaigns → Brief with references → Plan → simulated generation → Review → Editor → Ready → Calendar → Schedule → Scheduled. Five labeled tabs connect the root destinations. Generated completion is a timed prototype transition, not provider activity. The Figma form fields and file rows are design instances, not working upload controls. The Arabic click-through covers Campaigns → Brief; the broader bilingual interaction study remains in the standalone HTML file.

**Arabic font dependency:** the connected Figma catalog lacks IBM Plex Sans Arabic and loading it failed. Noto Sans Arabic is used only for the editable Figma previews. The approved app font and the HTML study remain IBM Plex Sans Arabic. Recheck Arabic metrics with the approved font when it becomes available in Figma; this substitution is not a new brand decision.

Focused Figma verification checked the component structures, all 111 variable definitions, semantic alias targets, the two expected font families, 18 mobile frame sizes and 116 navigation links with no dangling destinations. Individual foundations, controls, mobile/RTL screens and larger-screen compositions were rendered and visually inspected. Evidence and returned object IDs are recorded in `var/mobile-design-research/figma-state.json`, `figma-verification.json`, `figma-result-*.json` and the final PNG captures. This is structural and visual design evidence, not a native device test or a full accessibility audit.

At the end of the design pass, no native Code Connect mappings were published because the Expo components had not yet been implemented. Screens remain candidates in Review, with no automatic promotion to Approved.

## Implementation checkpoint — 22 September 2026

`apps/mobile` now contains the Expo SDK 57 application linked to [mo4180/markos](https://expo.dev/accounts/mo4180/projects/markos), with shared API types/client and a generated native adapter for the existing color tokens. The first slice includes secure native sign-in/renewal, verification/onboarding handoff, five phone destinations and a tablet rail, English/Arabic and both themes, workspace campaign search/review, the five-reference composer with persisted device drafts, and revision-aware caption/brief editing. Overview, Calendar and Insights read actual workspace data. Native media editing and scheduling remain explicit links to the corresponding hosted web draft.

Railway API deployment `528b2cb9-b8b9-4ed8-8417-6c3e86785fee` adds native session endpoints while preserving the browser cookie flow. The 28 focused route/session/workspace-response/file/date/browser-renewal tests and TypeScript checks pass; Expo Doctor reports 21/21 checks and both native JavaScript bundles export. Android ARM64 APK `b2dc45fc-926b-47f0-83d7-6e7fba1c3e6c` and iOS Simulator build `0fce1ad2-748d-425c-bb72-b9cc273ad443` finished successfully with the `preview` update channel and runtime `0.1.0`. Native build links and run instructions are in `apps/mobile/README.md`. A simulator build is not an installable iPhone build, and compilation does not substitute for device interaction/RTL/accessibility checks.

The campaign reliability milestone remains **in progress**: this implementation uses the current synchronous generation endpoint. It prevents concurrent submissions in the same signed-in app, retains the brief and reference files, and records an uncertain request so the owner can check campaigns before retrying. A durable, idempotent server job with app-kill recovery is still required to meet the complete phase-2 contract above. Nothing is scheduled or published by creating a campaign.

## Second implementation checkpoint — 22 September 2026, runtime 0.2.0

Following the owner's phone layout check, native campaign generation now submits a durable PostgreSQL job with a persisted request ID. An accepted job continues with the phone locked and can be recovered after app restart. Lost upload responses reuse the same ID and brief; SQL claims and an atomic campaign/usage/receipt transaction prevent duplicate campaigns. An API interruption expires the running lease and asks for an intentional retry rather than replaying ambiguous paid work. Temporary reference bytes are cleared when the job finishes. The existing web generation route remains compatible.

Create now contains a native caption/media/details editor and saved AI conversation, real image and Reel playback, JPEG/MP4 upload, library selection, image/video generation recovery, and carousel slide controls. Revision conflicts retain manual edits for reconciliation. Approval and scheduling are separate actions; scheduling uses Bahrain half-hour slots and the reviewed revision, with native rescheduling/cancellation. The existing Instagram connection flow remains in hosted Settings. Unsaved editor text is still memory-only, while campaign briefs and submitted conversation intents have device recovery.

Railway API deployment `651b2a1f-d1c0-46c9-b3ec-b4ec24f2b87a` succeeded and all 21 migrations are applied. Focused checks passed: 19 mobile tests, six disposable-database campaign/scheduling integration tests, four browser session-renewal tests, three relevant TypeScript checks and Expo Doctor 21/21. Both native JavaScript bundles export. Android build `df2ba5e0-e2f0-4398-af9b-2665c9e971de` and iOS Simulator build `521919bb-61bc-44c9-844e-f3c7899b677c` use runtime 0.2.0 for the newly added native video player; their artifact details, current status and links are in `apps/mobile/README.md`.

Next validation is the owner's physical phone walkthrough of references → campaign recovery → native editor → Ready → Schedule, including Arabic, file providers, keyboard and back gestures. This pass created no live customer campaigns or publishing schedules and made no paid provider calls. iPhone/TestFlight remains dependent on Apple Developer signing. Broader offline editor persistence, push notifications and store release checks remain subsequent work.

## Device recovery and iPhone preparation — 22 September 2026

The next 0.2.0-compatible update saves unfinished native editor fields and unsent Assistant messages on the device. It revalidates content access before restoration, keeps newer server revisions separate for review, recognizes a successful server Save after a lost response, and prevents old conversation receipts from clearing a later message. Explicit logout clears this identity's studio records after pending writes. Save and leave joins the existing Keep editing and Discard controls. Device save status does not imply server synchronization or approval.

Seven new device-store tests and four existing studio-model tests passed, along with mobile TypeScript. Physical app-kill, keyboard, storage failure and assistive-technology checks still require the owner's phone.

The owner completed Apple authentication and signing setup. A separate MARKOS App Store Connect record (`6814797764`, bundle `com.markos.mobile`) was created under the confirmed Apple team. The owner explicitly requires all other apps to remain untouched. A `testflight` store build profile uses the preview update channel, with a separate production channel for public-release builds. Signed iPhone build `524674ac-db18-4421-84cd-e326f1edc4f6` and submission `65e33f8f-262d-4529-844e-17be2710558e` succeeded. At 14:03 Bahrain time Apple reported the processed build VALID and ready for internal testing, with its standard-encryption declaration complete. The actual IPA confirms iPhoneOS, version 0.2.0/build 3, MARKOS's signing profile and preview runtime. The creation-time Expo test-group auto-enrollment was corrected to owner-only access; the internal group now contains exactly the owner's invited account and build 3. Subsequent submissions pin the new app ID and disable automatic tester setup. Details and links are in `apps/mobile/README.md`.

Device recovery update group `c13b59ab-083f-4b96-ab00-39ca2637f38d` is published for Android/iOS runtime 0.2.0. Platform manifest checks returned the expected update IDs. Physical-device recovery and iPhone interaction checks remain necessary.

## Native business setup — 22 September 2026

Added native verification resend/check, seven-module manual setup, five-file document analysis with source/confidence review, explicit extracted-fact approval, editable bilingual profile approval and Instagram/workspace completion choices. Business Profile now opens natively from workspace settings, with the established five groups, focused revision-aware edits and basic offering maintenance. Setup/profile edits and onboarding file copies are isolated from campaign drafts and cleared on explicit logout. Advanced catalog pricing/availability, registration/password recovery and Instagram administration continue on the website.

The 19 focused tests in `business-model`, `business-device-store`, `scoped-fetch` and `brief-recovery` pass, as does mobile TypeScript. They cover clearing contracts, distinct catalog/profile versions, bilingual document approval, lost-analysis-response recovery, identity isolation, cleanup ordering and bounded document upload timeouts. No database migration, live workspace mutation or paid provider generation was needed for this client pass. Native file-provider/keyboard/back-button interaction and full new-workspace setup still need the owner's physical-device walkthrough.

Published preview update group `3524cd3e-63d2-4e6b-aecc-bd517a20ea9c` for runtime `0.2.0`; both native bundles exported and both platform manifest requests returned HTTP 200 with the expected update IDs. This does not replace physical-device verification.

## Native account signup and recovery — 22 September 2026

Signup and password recovery now run natively, using shared validation and the Railway account service. Signup records consent to the displayed draft policy, queues verification and enters the existing verification/setup gate. Recovery uses a ten-minute, eight-digit email code, matching new passwords, bounded attempts and normal login after success. A successful reset invalidates prior sessions and preserves MFA. Codes/passwords remain in memory. The same recovery flow replaces the hosted web placeholder in both languages.

Railway API `8364e766-9073-427a-b129-591c922d7c05` and web `278825ce-04b9-4bcc-8e5e-d4900ed3bbbd` succeeded. All 22 migrations are applied. The hosted recovery pages and API health/invalid-request checks pass. SendGrid sandbox validation returned 200 for both locales using sealed credentials inside the running API container, without sending messages. Focused checks: 41 disposable-database/provider API tests, 10 mobile session tests and three browser tests; relevant TypeScript and web lint checks; both native bundle exports. Test details, security boundaries and rollback requirements are in `docs/decisions.md`.

Published preview update `4b3dde6d-edd2-4161-bdbc-4e998ee853b3` on runtime `0.2.0`. Manifest verification returned Android `01a0c931-50f6-7784-985b-5930d4f65233` and iOS `01a0c931-50f6-7509-9efc-e250464e1908`, both HTTP 200. Other Apple apps and signing credentials were not changed. Remaining acceptance work is a physical-device/mailbox walkthrough, including keyboard/back navigation and assistive technology; public launch also needs approved legal wording and proxy/rate-limit capacity validation. This scoped release is not a declaration that the entire product is ready for public launch.

## Native Instagram and publishing checks — 24 September 2026

Instagram and Authenticator now open from native account settings. The owner can enroll an authenticator, confirm sensitive actions, connect/reconnect Instagram, renew access or confirm disconnection. Completed onboarding waits for the signed-in navigator before opening Instagram. Provider consent stays in the system browser; a bilingual hosted return page opens a fixed app route, and the app reads the actual connection from Railway. Cancelling consent preserves the previous connection. Disconnection does not claim provider permission was revoked when that result is unconfirmed.

Scheduling now checks live-publishing configuration, account connection, caption/media and the reviewed revision, then re-fetches those checks at confirmation. Readiness errors explain the next action in both languages. Cancellation remains available even when publishing is blocked. The publishing worker still checks provider limits and media at execution; a successful preflight is not a delivery guarantee.

Railway API `64ac543d-975a-4470-be96-026688653b2f` and web `0be2a471-a2f6-4d1e-a18c-714c049efe7f` succeeded. Hosted health, authenticated-route rejection and both localized return pages passed. Runtime configuration checks confirm live Instagram mode and the required Instagram/S3 settings without exposing credentials. Focused checks passed: 30 API tests, 25 mobile tests and two browser tests, relevant TypeScript and focused web lint. Tests performed no real Instagram consent, publishing or customer workspace changes. Physical-device consent, authenticator switching and accessibility remain acceptance checks; Meta App Review approval was not verified. See the latest update link in `apps/mobile/README.md` for the compatible 0.2.0 release.

Final preview update `799e8a46-ad01-4ce5-a0f5-0688ca1d8efa` includes the onboarding navigation correction and supersedes the first update from this pass. Both native bundles exported. Manifest verification returned Android `01a0d1f5-493c-7824-94d7-0863b4d0a562` and iOS `01a0d1f5-493c-776a-a4c7-cd6b0e4e0127`, runtime `0.2.0`, HTTP 200. No native dependencies, signing credentials or other Apple applications changed.

## Mobile publishing workflow — 24 September 2026

Calendar now uses the API's inclusive Bahrain date-only range and includes planned drafts, with weekly navigation, lifecycle filters and paginated unscheduled content. Publishing activity opens from Calendar and Overview. Each scheduled, failed or published post has a native status screen with current worker progress, the next retry time and appropriate recovery navigation. An uncertain result requires checking Instagram before rescheduling; schedule changes invalidate the related views.

The notification inbox supports pagination, unread filtering, an unread badge and navigation to the related post. Worker completion creates the owner's success notice in the job transaction; failures retain their existing notices. Both recipient and workspace scope apply to the feed, cursors, count and read action. These are in-app notices. Push notifications remain outside this release.

Insights now has seven- and thirty-day ranges, period comparisons, available daily reach, top content and last-sync information. Partial, failed and missing data are explicit. Refresh reads saved results; no provider figures are invented or claimed to have refreshed when only the saved summary was fetched. Navigation, language, typography and Sunlit components follow the existing native foundation.

Railway API deployment `672de644-24fc-445c-9789-80422adb801a` succeeded. Hosted health returned HTTP 200, and both new protected endpoints returned the expected HTTP 401 without authentication. Focused checks passed: 21 native tests (`publishing.test.ts`, `instagram.test.ts`), three new API activity/feed/calendar tests, the existing notification test and two selected worker tests (18 unrelated worker cases skipped). API, mobile and shared API-client TypeScript checks passed. Persistent tests used only disposable `markos_mobile_publishing_test`, Redis database 13 and mocked/dry-run publishing. No schema migration, real Instagram post or customer workspace mutation was performed. Physical-device interaction and an actual authorized Instagram publishing walkthrough remain acceptance checks.

Published preview update `e7e2334a-e0ed-4719-ab42-d4fdaaa12633`. Both native bundles exported successfully. Manifest verification returned Android `01a0d229-ce3e-790f-85d6-b27d79952625` and iOS `01a0d229-ce3e-78f1-868a-c58b7e05f470`, runtime `0.2.0`, HTTP 200. This supersedes the previous Instagram/security update and retains those features. The existing Android installation and TestFlight build 3 remain compatible. No native dependencies, other Apple apps or signing credentials changed. Release evidence is under `var/mobile-publishing/` and `var/mobile-build/publishing-update.json`.
