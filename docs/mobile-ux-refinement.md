# MARKOS mobile UX refinement

Date: 12 October 2026. Scope: the existing Expo Android/iPhone app and its shared native controls. The owner requested research and direct implementation because the mobile app exposed too many controls together. This pass retains the website's Sunlit palette, fonts, business data and product lifecycle.

## Research and decisions

The reference set focuses on real composing and work-management tasks rather than copying another app's branding. Official product walkthroughs and design guidance were checked on the date above. Previously collected Buffer mobile screenshots were also inspected. These observations inform MARKOS presentation; they do not prove equivalent usability or change its approval contracts.

| Reference | Relevant finding | Application in MARKOS |
| --- | --- | --- |
| [Buffer: mobile composing and scheduling](https://support.buffer.com/articles/scheduling-posts-on-the-buffer-mobile-app-jbqNo8FyUs) | Compose a caption and attachments first, then proceed to scheduling. | Keep editing, review, approval and scheduling distinct. Give the current task a clear action instead of displaying every lifecycle action together. |
| [Canva: contextual editor and mobile tools](https://www.canva.com/help/glow-up/) | Editing tools depend on the selected element. Additional controls are revealed through panels and More. | Edit one carousel slide at a time. Keep replacement, library, format conversion and optional text tools in focused panels or expandable sections. |
| [Linear: mobile redesign](https://linear.app/changelog/2025-10-16-mobile-app-redesign) | A compact bottom toolbar gives quick access to core workflows. | Retain MARKOS's five familiar destinations with stable labels and restrained selected-icon emphasis. |
| [Linear: mobile navigation customization](https://linear.app/changelog/2026-01-22-customize-your-navigation-in-linear-mobile) | Additional project actions are reached through an overflow menu. | Move format conversion, campaign links, publishing recovery and deletion into Draft options. Customizable navigation is unnecessary for the present scope. |
| [Apple: tab bars](https://developer.apple.com/design/human-interface-guidelines/tab-bars) | Tabs identify top-level sections; labels and stability help users orient themselves. | Navigation stays separate from task actions. Preserve the phone tabs and tablet rail, including Arabic order and mirrored directional icons. |
| [Apple: action sheets](https://developer.apple.com/design/human-interface-guidelines/action-sheets/) | Choices should follow an intentional user action, remain concise and provide dismissal. | Reveal format/source choices when requested. Provide an explicit close control, backdrop dismissal and Android Back handling. Retain confirmations for destructive operations. |
| [Material: bottom sheets](https://m1.material.io/components/bottom-sheets.html) | Sheets offer contextual choices while retaining the originating screen's context. | Use bounded, safe-area-aware sheets for creation, filtering and selection. Detailed forms may scroll; short source menus remain short. The Material 3 pages were available but their text required JavaScript; the readable official guidance was used instead. |
| [Android: accessible touch targets](https://developer.android.com/guide/topics/ui/accessibility/views/apps-views) | Interactive controls should have at least a 48 dp touch target. | Reduce visual emphasis rather than shrinking targets. New actions retain 48 dp minimum height/width; selection and disabled states remain accessible. |
| [Nielsen Norman Group: progressive disclosure](https://www.nngroup.com/articles/progressive-disclosure/) | Defer secondary controls while preserving a discoverable path to them. | Show a selected value or summary when controls are collapsed. Never conceal an error or erase unfinished input simply to make the screen cleaner. |

## Implemented hierarchy

- **Create:** one New content action; four named format choices in its sheet; a selected lifecycle filter instead of five large buttons; search and a quiet content list.
- **Editor:** Edit / Preview / Assistant navigation. Caption / Media / Details appear only while editing. Preview has one contextual preparation/approval action; editing or chatting offers a quiet review handoff. Save appears when there are actual changes. Draft options contains infrequent actions and preserves confirmation/revision checks.
- **Media:** one selected carousel slide, with explicit selection; attached media leads the layout. Upload/library share an Add media sheet. Visual settings, slide copy, reordering/removal and exact Motion Reel text overlays are progressively disclosed. The same parent draft preserves edits across slide changes.
- **Campaigns:** compact creation access and simpler cards. Plan / Strategy remains visible; status, format, day and search live in a filter sheet. Each filter section shows its selection while collapsed, and users can reset or return to the plan.
- **Campaign composer:** retain Brief / Plan, five-file context, Bahrain dates, background generation and recovery. Compact selections replace rows of full buttons for duration and publishing pace.
- **Overview and Calendar:** grouped navigation rows, compact weekly movement, contextual filters and readable status information.
- **Insights:** compact period selection; advice/reports and connection utilities are expandable. Real metrics and incomplete-data states remain visible.
- **Settings:** separate Workspace, Preferences and Account groups. Language/appearance show selected values and reveal choices on request. Updates and advanced controls are grouped together; sign-out retains cleanup.
- **Business and team:** section, offering type, price mode, availability and role selection use focused selectors. Invitations and joining a workspace are expandable, while membership protections and confirmation stay intact.

## Acceptance and evidence

The implementation keeps the existing API, workspace isolation, draft recovery, revision-conflict reconciliation and publishing boundaries. No billing/quota gate, new provider, schema change or native dependency is introduced. This can be delivered to the installed 0.4.0 runtime through Expo Updates.

The actual native components/screens were rendered through a temporary React Native Web harness with explicitly labeled fixture data and platform adapters. This is a local visual test, not a deployed website replacement or a claim about live provider behavior. Chrome DevTools MCP was unavailable in this session, so the installed headless Chrome/Playwright tooling was used.

Checks cover English/light and Arabic/dark at 390 px, plus 320 px phone and 768 px tablet layouts; sheet opening/dismissal, filtering, editor section switching, unfinished-caption preservation, exact Reel text and pricing selection preservation. Before/after captures are under ignored `var/mobile-focus-preview/`. Focused component tests also cover generation → approval → scheduling, format confirmation, campaign idea identity, carousel edit preservation, disclosure accessibility and Android Back dismissal.

Focused validation commands:

- `corepack pnpm --filter @markos/mobile exec vitest run test/create-flow.test.tsx test/ui-controls.test.tsx test/studio-workflow.test.ts test/studio-device-store.test.ts test/offering.test.ts`: **34 tests in five files passed**.
- `corepack pnpm --filter @markos/mobile typecheck`: **passed**.
- `node var/mobile-focus-preview/build.mjs` and `node var/mobile-focus-preview/check.mjs`: **17 layouts passed with no horizontal overflow or JavaScript errors**, rendering actual native screens with fixture data and checking the focused interactions above. The native exports performed by Expo publication are recorded with the release evidence.

Sheets open immediately without a custom animation; existing route transitions continue to respect the device's reduced-motion setting. No repository-wide tests, database-backed checks or live campaign/publishing mutations were needed for this presentation-only pass.

Physical-device keyboard, native document pickers, screen readers and notification/provider delivery are outside this fixture check. A phone walkthrough remains the final evidence for native layout and interaction quality. No Figma frame was claimed approved or required as a blocker for this owner-authorized implementation.
