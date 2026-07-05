# MARKOS AI — Experience & Behavioral Flows (Context for Codex)

> **Audience:** an autonomous coding agent (Codex / Claude) in VS Code.
> **Purpose:** give you the *mental model* of how MARKOS AI behaves end-to-end — the sequence of what
> the user does, what each screen shows, what the API and AI do, what data changes, and what happens
> when things go wrong. This is the **behavioral companion** to the structural specs:
> `MARKOS_BUILD_SPEC.md` (architecture/data/endpoints) and `MARKOS_ADMIN_BUILD_SPEC.md` (admin), and
> the screen IDs come from the Figma Design Document.
>
> **Read this to understand how the product moves.** When you build a feature, this document tells you
> the correct sequence, the state transitions, and the failure behavior; the build spec tells you the
> schema and signatures. Where they conflict on behavior, this document wins; where they conflict on
> structure, the build spec wins.

---

## 0. How to use this document
- Each flow below uses one template: **User action → UI (screen) → API (endpoint) → AI (agent, if any) → Data (entities written) → Result/next → Failure behavior.**
- Screen IDs (e.g. `OB-04`, `CONT-02`) reference the Figma Design Document. Endpoints (`/v1/...`), agents, and entities reference `MARKOS_BUILD_SPEC.md`.
- This is Bahrain-first: default locale **Arabic (RTL)**, currency **BHD**, payments **CrediMax/BENEFIT**, **10% VAT**.
- The golden behavioral rules in Section 1.3 apply to every flow.

---

## 1. The Mental Model

### 1.1 What MARKOS is, in one paragraph
A small-business owner signs up, answers a guided interview about her business (onboarding), which MARKOS stores permanently as a **Knowledge Vault**. From then on, eight AI agents use that Vault to generate a marketing **strategy**, a monthly **content plan**, and ready-to-post **content** (captions, hashtags, carousels, reels, AI images) — all in her brand voice, in Arabic and English. She reviews, approves, and **schedules** it; MARKOS **publishes** it to her Instagram automatically; then it **syncs analytics**, **interprets** them in plain language, and **feeds the results back** into the Vault so the next round is smarter. The loop repeats weekly.

### 1.2 The closed loop (memorize this — every flow serves it)
```
Onboarding ──> Knowledge Vault (permanent memory)
   └─> Strategy ─> Content Plan ─> Content Creation ─> Review/Approve
        └─> Schedule ─> Publish to Instagram ─> Analytics sync
             └─> AI interprets ─> writes insight back to Vault ─> (loop tightens)
```

### 1.3 Golden behavioral rules (true in every flow)
1. **Never show a blank canvas.** The AI always proposes first; the user accepts, edits, or regenerates. A non-marketer must never face an empty box.
2. **Every AI output is grounded in the Vault.** If the Vault is too sparse to ground a request, the app says so kindly and points the user to fill the gap — it does not produce generic output.
3. **Every AI output is bilingual and tone-locked** to the workspace's brand voice; Arabic is the default surface.
4. **Every metered action checks quota first** (AI generation, AI image, publish, strategy). At 80% warn; at 100% block with a contextual upgrade prompt — never a dead end.
5. **Nothing publishes without an explicit preview and the user's approval** the first time; failures are always surfaced with a fix, never silent.
6. **Every screen has five states:** empty, loading (branded AI "thinking", not a bare spinner), error (in-voice, fixable), success (loud confirmation), and limit-reached (invitation to upgrade).
7. **Everything is workspace-scoped.** The active workspace is the lens for every read and write.

### 1.4 The three services in motion
- **Web** renders screens and calls the **API gateway**.
- The **gateway** owns auth, data, quotas, billing, Instagram, and orchestration; for anything generative it calls the **AI service**.
- The **AI service** retrieves Vault context, runs the relevant agent, calls the model, returns structured JSON + a usage block; the gateway persists the result, writes an `ai_interaction`, and decrements the quota.
- **Workers** do the slow things off the request path: publishing to Instagram, syncing analytics, generating report PDFs, sending email, processing renewals.

---

## 2. Actors & Entry States
| Actor | Enters at | Typical first goal |
|---|---|---|
| New visitor | Marketing site `AUTH-01` | Decide to try; sign up |
| New user (post-signup) | Onboarding `OB-01` | Teach MARKOS the business |
| Returning user (onboarded, no IG) | Dashboard `DASH-01` | Create content; connect Instagram |
| Returning user (steady) | Dashboard `DASH-01` | Weekly batch + check analytics |
| Team member (Enterprise) | Dashboard, scoped by role | Create/review within permissions |
| Admin/staff | Admin console (separate spec) | Operate the business |

Entry state is derived from `workspace.onboardingStatus`, `workspace.instagramAccountId`, and `user.planStatus`. The app routes the user to the right next action automatically (e.g. onboarding-incomplete → resume wizard; no-IG → nudge to connect; empty calendar → nudge to generate).

---

## 3. The End-to-End Flows

### FLOW A — Sign up & onboarding (build the Knowledge Vault)
**Goal:** turn a stranger into a workspace with a populated Vault.

**A1. Sign up**
- User action: enters email/password or taps Google. UI: `AUTH-02`. API: `POST /v1/auth/register` (or `/oauth/google`). Data: creates `User` (planStatus=TRIAL, trialEndsAt set), a `Workspace` (onboardingStatus=NOT_STARTED), a `WorkspaceMember` (role OWNER), sends verification email. Result: route to verify `AUTH-04`. Failure: duplicate email → inline error; unverified login attempts are allowed to browse but blocked from generating.

**A2. Plan + trial**
- UI: `OB-01` plan cards in BHD (+VAT note). API: selecting a trial sets the plan on the user; **no card required** for Starter/Growth trials. Result: enter the wizard `OB-02`.

**A3. The 7-module wizard** (the most important data-collection in the product)
- UI: `OB-03..OB-09`, one module each: Company, Story, Products, Audience, Competitors, Brand, Objectives. A progress bar and a live **profile-strength score** are always visible.
- Per module: API `PUT /v1/onboarding/:module` saves answers → writes `KnowledgeVault` rows (one per `VaultSection`) → calls `POST /ai/vault/embed` so each value gets a 1536-d embedding. Brand module also uploads logo/colors/fonts (presigned `POST /v1/uploads` → `MediaAsset type=BRAND_ASSET`).
- Behavior: smart defaults + Arabic examples; skip-and-resume (state persisted, can leave/return); competitor IG handles are verified live.
- Failure: a save failure keeps the user's input client-side and retries; never lose typed answers.

**A4. Completeness & gaps**
- API: `GET /v1/vault/score` returns completeness; the wizard surfaces gap prompts for weak sections (FR-KV-005). The user may finish with gaps but is encouraged to fill key ones.

**A5. Finish → trigger first value**
- UI: `OB-10` "generating" state. API: `POST /v1/onboarding/complete` sets `workspace.onboardingStatus=COMPLETE`, then kicks **Flow B** automatically. This is the hand-off into the aha moment.

**Vault is now the spine:** every later AI call retrieves from it. If onboarding is skipped/sparse, downstream generation degrades gracefully with a "tell me more about X to improve this" prompt rather than generic output.

---

### FLOW B — First strategy & content plan (the aha moment)
**Goal:** prove MARKOS understands this specific business.

**B1. Generate strategy**
- Trigger: end of onboarding (auto) or `STRAT-03` "generate". UI: branded thinking state (target < 20s). API: `POST /v1/strategies/generate`. AI: **Marketing Strategist** agent → retrieves top-10 Vault chunks (company/story/products/audience/objectives) → assembles the 8-part system prompt → `LLM_LONGFORM_MODEL` → returns `{ horizonDays, pillars[], phases[], kpis[] }`. Data: writes `Strategy` (version 1) + an `ai_interaction`; decrements the STRATEGY quota.
- Result: `STRAT-01/02` show a 30/60/90-day plan + content pillars that visibly reference her real business. PDF export available (`GET /v1/strategies/:id/pdf`, worker-generated).
- Failure: invalid model JSON → one auto-retry → if still bad, a graceful "let's try that again" with the regenerate action. Quota exhausted → upgrade prompt.

**B2. Generate the monthly plan**
- UI: `CONT-01` calendar. API: `POST /v1/calendar/plan`. AI: **Content Planner** → returns `{ month, slots:[{date, contentType, pillar, topic, bestTime}] }`. Data: `ContentCalendar` + draft `ContentItem` stubs per slot (status=DRAFT). Result: a populated calendar — not an empty grid. The user can drag-move slots (`PATCH /v1/calendar/:itemId/move`).

---

### FLOW C — Content creation (the daily workhorse)
**Goal:** turn a calendar slot into a ready-to-post, on-brand, bilingual content item.

**C1. Open a slot / start new**
- UI: `CONT-02` creator (or open a calendar stub). The content type (post/carousel/story/reel) is preset from the plan or chosen here.

**C2. Generate copy**
- API: `POST /v1/content/:id/generate-caption` (+ `/generate-hashtags`). AI: **Content Creator** → Vault-grounded, tone-locked → `{ captionEn, captionAr, hashtags:{niche[],mid[],broad[]}, cta }`. For reels: `/generate-reel-script` → **Reel Script** agent → `{ hook, body, cta, shotList[], onScreenText[] }`. Data: updates `ContentItem`; writes `ai_interaction`; decrements AI_GENERATION quota.
- UI behavior: result appears in the **AI generation block** with Accept / Regenerate / Edit. Regenerate per section is allowed (`POST /v1/content/:id/regenerate/:section`). Edits are tracked (sets `ai_interaction.edited=true`, feeding learning).

**C3. Attach media**
- Options: upload (`POST /v1/uploads` → S3 → `MediaAsset`), pick from library (`MEDIA-01`), or **generate an AI image**: `POST /v1/media/generate-ai-image` → **Image Prompt** agent builds a brand-aligned prompt → image model → S3 → `MediaAsset type=AI_GENERATED`; decrements AI_IMAGE quota. Carousels use the carousel builder (`CONT-05`, up to 10 slides).

**C4. Preview & approve**
- UI: `CONT-03` shows a pixel-accurate Instagram preview (feed/carousel/story/reel). The user moves status DRAFT → IN_REVIEW → APPROVED (`POST /v1/content/:id/approve`). Data: `ContentItem.status` transitions (see Section 4.1).
- Failure: missing media or caption blocks approval with a clear checklist.

---

### FLOW D — Connect Instagram (the first trust dip)
**Goal:** link a real Instagram Business account, safely and with guidance.

- UI: `SCHED-02` connection screen with an Arabic, step-by-step, screenshotted walkthrough. API: `GET /v1/instagram/connect` starts Meta OAuth (Facebook Page → Instagram Business); callback `GET /v1/instagram/callback`. Data: stores `workspace.instagramAccountId` and the **encrypted** access token + expiry; sets connection status.
- Behavior: explain each permission in plain language; handle the "I don't have a Business account / not linked to a Page" case with guidance; show connected account + health afterward.
- Failure/edge: token expired later → status shows "reconnect"; publishing is blocked with a clear reconnect CTA until fixed. Never attempt to publish on an expired token.

---

### FLOW E — Schedule & publish (the riskiest mechanic; second trust dip)
**Goal:** get approved content live on Instagram reliably.

**E1. Schedule**
- UI: `SCHED-04` date/time picker with an AI **best-time** overlay and a visible **per-account daily-cap** indicator. API: `POST /v1/content/:id/schedule` → sets `ContentItem.status=SCHEDULED`, `scheduledAt`. Or `POST /v1/content/:id/publish-now`.
- Behavior: if scheduling would exceed Instagram's ~25–100/account/24h ceiling, the slot is queued past the cap and the UI explains it honestly (not a silent drop).

**E2. Publish (worker state machine — see Section 4.2)**
- A `publish` worker owns it. For each type the sequence is: ensure media is at a public CloudFront URL → **create container** (`POST /{ig-user-id}/media`, type-specific) → **poll** container status until `FINISHED` → **publish** (`POST /{ig-user-id}/media_publish`). Reels use the resumable upload host; carousels create children then a parent; stories use the stories type.
- Data: on success → `status=PUBLISHED`, `publishedAt`, `instagramPostId`; notify the user (loud success + link). On failure → retry 1–2× within Meta's window; if still failing → `status=FAILED`, `failureReason`, alert the user with a reschedule option (FR-SCH-009). Never infinite-retry the same container; create a fresh one.
- First-publish behavior: default to "review before it goes live"; make success unmistakable.

---

### FLOW F — Analytics & AI insight (closing the loop)
**Goal:** show it's working, in plain language, and make the product smarter.

**F1. Sync**
- An `analytics-sync` worker pulls account/post/story/reel/audience insights from the Graph API into `instagram_analytics` on a schedule, respecting rate limits.

**F2. View + interpret**
- UI: `AN-01..AN-06` (overview with 7/28/90 range, posts table, post detail, audience, stories, reels). API: `GET /v1/analytics/*`.
- AI: **Analytics Consultant** (`GET /v1/ai/digest`, `POST /ai/analytics/interpret`) → `{ summary, insights:[{metric, delta, meaning}], actions[] }` in plain Arabic/English. A weekly digest is generated and emailed. **Recommendation Engine** (`GET /v1/ai/recommendations`) proposes next content/timing.
- Learning loop: high/low performers are tagged and written back so the Content Planner/Creator use them as few-shot exemplars next round.

**F3. Monthly report**
- API: `POST /v1/ai/report/monthly` → a `report` worker builds a PDF (batch model) → emailed + downloadable (`AI-03`).

---

### FLOW G — The weekly habit loop (the retention engine)
**Goal:** make "keep Instagram fed" a 30-minute weekly ritual.
- Returning user lands on `DASH-01` → sees upcoming content, an AI insight, and quick actions. Typical loop: open calendar → bulk-generate the week/month from the plan → review/approve each → schedule the batch → leave.
- Proactive behavior: if the upcoming calendar is empty (the key churn signal), the dashboard and a notification nudge: "your calendar is empty next week — generate now?"

---

### FLOW H — Hitting a limit & upgrading (Bahrain billing)
**Goal:** convert friction into expansion, with correct BHD + VAT.
- Trigger: a metered action would exceed the plan limit (AI generation/image/strategy/publish) or the user wants more workspaces/seats. At 80% the user already got a friendly warning (in-app + email).
- UI: at 100%, the blocked action shows a contextual upgrade prompt (not a wall). `SET-04` billing shows plans in BHD with VAT stated. API: `POST /v1/billing/change-plan`.
- Payments: subscription via **CrediMax (MPGS)** primary (tokenized for auto-renew) or **BENEFIT/BenefitPay**; **Stripe** only for international cards. **10% VAT** added (exclusive pricing) and recorded as net/VAT/gross on the `Invoice`/`Payment`. Upgrade is immediate + prorated; downgrade at period end.
- Lifecycle behavior: failed renewal → 3-day grace → suspend → 30-day hold → delete; webhooks (`/v1/webhooks/credimax|benefit|stripe`) reconcile truth, never the client.

---

### FLOW I — Settings, team & multi-workspace
- Account/workspace/notification settings (`SET-01/02/06`); Instagram integration management (`SET-03`).
- Enterprise: invite team members with roles (OWNER/EDITOR/VIEWER/WORKSPACE_ADMIN); the active workspace is switchable and is the lens for all data. Sara (agency) switches between client workspaces; each is fully isolated.

---

## 4. State Machines That Matter

Implement these exactly; the UI status pills and the workers depend on them.

### 4.1 Content item lifecycle (`ContentItem.status`)
```
DRAFT ──(generate + edit)──> IN_REVIEW ──(approve)──> APPROVED
  APPROVED ──(schedule)──> SCHEDULED ──(publish worker success)──> PUBLISHED
  SCHEDULED ──(publish worker fail, retries exhausted)──> FAILED
  FAILED ──(user reschedules)──> SCHEDULED
  any non-published ──(user deletes)──> soft-deleted (deletedAt)
```
Rules: only APPROVED items can be scheduled; only SCHEDULED items are picked by the publish worker; PUBLISHED is terminal (edits create a new item, never mutate a live post).

### 4.2 Publish lifecycle (worker, per content type)
```
QUEUED ─> ENSURE_PUBLIC_MEDIA ─> CREATE_CONTAINER ─> POLL(status_code)
   POLL == FINISHED ─> PUBLISH ─> PUBLISHED (store instagramPostId)
   POLL == ERROR or timeout ─> RETRY (max 1–2 within window, fresh container)
   retries exhausted ─> FAILED (failureReason, alert user, offer reschedule)
   per-account 24h cap reached ─> HELD (re-queued past the window, user informed)
```
Carousel: create N children (`is_carousel_item=true`) → parent (`media_type=CAROUSEL`, children) → publish parent. Reel: resumable upload → container (`media_type=REELS`) → poll → publish. Story: `media_type=STORIES`.

### 4.3 Onboarding (`workspace.onboardingStatus`)
```
NOT_STARTED ─> IN_PROGRESS (any module saved) ─> COMPLETE (complete endpoint) ─> triggers Flow B
```

### 4.4 Subscription (`user.planStatus` / `Subscription.status`)
```
TRIAL ─(subscribe)─> ACTIVE ─(renewal ok)─> ACTIVE
ACTIVE ─(payment fails)─> PAST_DUE ─(grace 3d, retries)─> SUSPENDED ─(30d hold)─> deleted
ACTIVE/PAST_DUE ─(user cancels)─> CANCELLED (service to period end, 90d data retention)
```

---

## 5. Request Lifecycle (worked example — "generate a caption")
1. Web: `POST /v1/content/:id/generate-caption` with the access token; the active `workspaceId` travels in context.
2. Gateway: `AuthGuard` validates token → `WorkspaceContext` set → `PermissionGuard` checks `content.create` → **quota check** on AI_GENERATION (block at 100% with upgrade prompt).
3. Gateway → AI service `POST /ai/content/caption { workspaceId, contentItemId, contentType, brief, pillar }` (internal service token).
4. AI service: RAG retrieves top-10 Vault chunks for the workspace → assembles the 8-part system prompt (caching parts 1–5) → calls `LLM_PRIMARY_MODEL` → validates output JSON against the Content Creator schema (one auto-retry if invalid) → returns `{ captionEn, captionAr, hashtags, cta, usage }`.
5. Gateway: persists onto `ContentItem`, writes an `ai_interaction` (prompt, response, tokens, costMinor, model, promptVersion), **increments the AI_GENERATION usage counter**.
6. Web: renders the result in the AI block with Accept/Regenerate/Edit. Accepting/editing updates `ai_interaction.accepted/edited` (learning signal).

---

## 6. Failure & Edge Behaviors (important context — build these, don't assume happy path)
| Situation | Behavior |
|---|---|
| Vault too sparse to ground a request | Don't produce generic output; show "tell me more about {section}" and link to the Vault editor |
| AI returns invalid JSON | One automatic retry; then a graceful "try again" with regenerate; never crash the screen |
| AI quota at 100% | Block the action with a contextual, non-punitive upgrade prompt at the exact button |
| Image generation fails (primary model) | Fall back to the Replicate SDXL provider; if both fail, let the user retry or upload manually |
| Instagram token expired | Block publish; show reconnect CTA on `SCHED`/`SET-03`; queued items wait, not fail silently |
| Publish container errors | Retry 1–2× with a fresh container within Meta's window; then FAILED + alert + reschedule |
| Daily publish cap reached | Hold overflow past the 24h window; explain honestly; never silently drop |
| Payment/renewal fails | PAST_DUE → 3-day grace + retries → suspend; email the user at each step; webhooks reconcile |
| Network/API error | In-voice error state with a retry; preserve the user's unsaved input client-side |
| Empty states (new workspace, no IG, empty calendar) | Invitation to act with a primary action, never a dead end |
| Locale = Arabic | Whole UI is RTL; generated copy defaults to natural Arabic; dates/numbers locale-formatted |

---

## 7. Bahrain Behaviors (apply across all flows)
- **Arabic-first / RTL** everywhere; English is the toggle, not the baseline. AI-generated Arabic must read naturally, not translated.
- **BHD pricing + 10% VAT** shown clearly; VAT-correct invoices; local cultural-calendar awareness (Ramadan/Eid/National Day) in planning and content suggestions.
- **Local payments** (CrediMax/BENEFIT) are the default checkout; Stripe is the international fallback.
- **PDPL**: data export/erasure available; support sessions (impersonation) are transparent to the user.

---

## 8. Cross-reference
| Need | Document |
|---|---|
| Architecture, schema, endpoints, agents | `MARKOS_BUILD_SPEC.md` |
| Admin/operator behavior | `MARKOS_ADMIN_BUILD_SPEC.md` |
| Screen IDs, components, states, visual design | Figma Design Document |
| Human/UX journey (personas, emotions, moments of truth) | User Journey document |
| Costs / unit economics | Cost Model document |

---

*Use this as the behavioral map. Build features so that the sequences, state machines, and failure behaviors above hold true — that is what "MARKOS works correctly" means. When in doubt about how something should behave, this document is the answer; when in doubt about how something is structured, the build spec is.*
