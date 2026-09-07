# MARKOS UI State Audit

Historical evidence date: 2026-06-17.

Status: archived pre-Sunlit evidence inventory. It is not proof of current browser-visible coverage.

Purpose at capture time: verify that every then-mounted MARKOS surface avoided blank canvases and exposed empty, loading, error, success, and limit states with a next action.

Evidence folder: `evidence/ui/2026-06-17`

PR #19 later replaced the previous UI with Sunlit and retired the temporary design-preview URLs. Several pages represented below were removed or redirected even though the underlying capabilities remain part of the final system. Do not use this matrix to claim that the current Sunlit UI includes the full publishing queue, analytics suite, Vault editor/history, AI assistant, audience/channels surfaces, or admin console. The restoration register is in `docs/ui-design-foundation.md`, and the scope decision is in `docs/decisions.md`.

## Historical State Coverage Matrix

| Screen | Empty or starting state | Loading state | Error state | Success state | Limit or blocked state | Next action |
| --- | --- | --- | --- | --- | --- | --- |
| Dashboard | Greeting, KPIs, upcoming content, AI insight, quick actions | Analytics/API cards render loading or preview data | Analytics failure banner keeps preview data visible | API-backed dashboard data and habit loop | AI credits sidebar and quick-action gating | Create content, view queue, ask MARKOS |
| Content Creator | Ready-to-create canvas and prompt presets | AI writing treatment while generating | Prompt/API/Vault error notice | Generated output with edit, regenerate, accept, hashtags | Quota warning/block and Vault gap prompt | Generate, accept, schedule |
| Publishing Queue | Seeded queue/list/calendar and AI Best Times | Publish readiness/dry-run actions disable with feedback | Failed publish recovery and blocked readiness states | Ready/dry-run and retry states | Readiness blocked, approval required, health gate | Check, retry, create post |
| Analytics | Demo analytics plus no-live/readiness prompt | Summary/report/chat actions show loading | Analytics/readiness/API error banner | Saved learning banner and digest/export results | Live-readiness blocks publishing intelligence when missing | Save learning, ask analytics, export |
| Audience | Preview segments, pain points, message angles | `audience-state-loading-*` screenshots | `audience-state-error-*` screenshots | Refreshed audience state and Vault-grounded badge | `audience-state-limit-*` screenshots | Refresh, open Settings, create targeted content |
| Channels | Channel cards and publish path | `channels-state-loading-*` screenshots | `channels-state-error-*` screenshots | Channel-ready state and readiness checklist | `channels-state-limit-*` screenshots | Connect Instagram, refresh, open Settings |
| Vault | Business-memory modules and gap list | History/API loading state | Save/load error message | Preview/live Vault entry saved | Vault completeness gaps block dependent AI actions | Save module, complete gaps |
| Strategy | 30/60/90 plan, pillars, strategy prompt | Strategy generation pending state | Strategy API or Vault error notice | Generated/updated strategy output | Quota block and Vault gap prompt | Generate, export, refresh |
| AI Assistant | Suggested prompts and context panel | Running assistant state | Assistant/API/Vault error notice | Grounded response with source list | Quota block and Vault gap prompt | Ask, use suggested action |
| Settings | Account/workspace/billing/security panels | Settings refresh state | `settings-state-error-*` screenshots | Settings ready state | `settings-state-limit-*` screenshots | Refresh, open Admin, open Vault |
| Admin | Preview operational console | Admin refresh state | `admin-state-error-*` screenshots | Admin ready state | `admin-state-limit-*` screenshots | Refresh, review plans, inspect audit |
| Onboarding | Step 1 starts immediately with company info | Step transitions remain in wizard shell | Required fields and connection errors stay in-step | Step completion and final launch state | Future gated features route to setup completion | Continue, back, launch dashboard |

## Historical Evidence Routes

- `/en/audience?state=loading`, `/en/audience?state=error`, `/en/audience?state=limit`
- `/en/channels?state=loading`, `/en/channels?state=error`, `/en/channels?state=limit`
- `/en/settings?state=error`, `/en/settings?state=limit`
- `/en/admin?state=error`, `/en/admin?state=limit`
- Arabic equivalents under `/ar/...`

These routes were captured at desktop `1440x1000` and mobile `390x844` on 2026-06-17. Current legacy routes redirect to Sunlit equivalents; for example, `/admin` redirects to Settings and therefore does not validate a current admin console.

Create a new dated evidence set after the missing final-system Sunlit surfaces are restored. The new matrix must cover current routes, both locales, desktop/mobile layouts, and empty/loading/error/success/limit or blocked states.
