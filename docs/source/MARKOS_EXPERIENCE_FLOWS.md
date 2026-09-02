# MARKOS AI — Experience and Behavioral Flows

Status date: 2026-08-30.

> **Purpose:** explain how MARKOS moves end to end: what the user does, what the interface shows, which application boundary acts, what changes, what comes next, and how failure is recovered.
>
> This is the behavioral companion to `MARKOS_BUILD_SPEC. 2.pdf`. Where they conflict on behavior, this document wins; where they conflict on structure, the build specification wins. `../project-status.md` is the dated implementation/evidence overlay and must not be mistaken for target behavior.

## 0. How to use this document

- Each flow follows **user action → UI → application/API → AI/provider when applicable → data → next step → failure behavior**.
- Screen IDs such as `OB-04` and `AN-02` are stable final-system labels inherited from the retired design source. They help preserve product scope; they do not prove that a page is mounted today.
- Endpoint names describe current repository contracts where those contracts exist. A target-only capability is labeled as such instead of being given an invented endpoint.
- Read every **Current implementation note** before modifying an existing flow. The final product target and current `main` are intentionally kept distinct.
- MARKOS is Bahrain-first: Arabic/RTL and English are first-class, currency is BHD, local payment rails are primary, and VAT behavior follows the reviewed Bahrain runbooks.

## 1. The mental model

### 1.1 What MARKOS is

A small-business owner teaches MARKOS about the business through onboarding. MARKOS stores that knowledge in a workspace-scoped Knowledge Vault, where the durable marketing strategy belongs. It then helps the owner plan time-bound Campaigns, create and approve content, schedule and publish it to Instagram, understand performance, and feed useful learning back into future work. The final system offers eight public AI-agent capabilities, but implementation and provider maturity may advance one typed vertical slice at a time.

### 1.2 The closed loop

```text
Onboarding -> Knowledge Vault
  -> Campaigns -> Content plan -> Content creation -> Review and approval
  -> Schedule -> Instagram publish -> Analytics sync
  -> Interpretation and learning -> Knowledge Vault -> better next cycle
```

Every feature should strengthen this loop or remove friction from it.

### 1.3 Golden behavioral rules

1. **Never leave a non-marketer at a blank dead end.** Offer a starting point, example, useful empty state, or clear next action. Do not store a suggestion as a business fact until the user selects or enters it.
2. **Ground generative work in the active workspace's Vault.** When context is insufficient, explain the gap and link to the relevant Business Profile/Vault action instead of inventing generic facts.
3. **Make the whole journey bilingual and RTL-safe.** Content and approved business profiles may contain paired Arabic/English fields. Campaigns currently generate in the explicitly requested locale; bilingual product support does not require duplicating every field in one response.
4. **Check quota before every metered action.** Warn near the limit and block at the limit with a contextual next step. Never charge or consume quota for a failed generation without the documented reservation/refund behavior.
5. **Nothing publishes without a preview, an explicit approval state, and a clear schedule/publish action.** Provider failures are visible and recoverable, never silent.
6. **Every consequential surface covers empty, loading, error, success, and limit/blocked states.** Loading copy should describe useful progress; errors must explain what the user can do next.
7. **Everything is workspace-scoped.** The active workspace governs every read, write, credential, usage counter, and provider action.
8. **External readiness is never inferred from code or configuration.** Dry-run adapters, mocks, dashboard labels, and environment-variable presence do not prove a live provider permission or production behavior.

### 1.4 Services in motion

- **Web** renders the localized journey and calls the typed API client.
- **API gateway** owns authentication, workspace context, authorization, data, quota, billing, provider credentials, Vault retrieval, and orchestration.
- **AI service** receives a bounded, authenticated request and returns a validated result plus usage. Current Campaign and onboarding-profile paths can call OpenAI when explicitly configured; content, image, embedding, and generic-agent paths remain deterministic.
- **Worker** runs API-owned maintenance loops for publishing, analytics sync/email, token refresh, and usage reset. Current interval workers are not evidence of production queue availability or retries.

## 2. Actors and entry states

| Actor | Intended entry | First useful goal |
| --- | --- | --- |
| Visitor | Localized marketing site | Understand the product and sign up |
| Newly registered user | Email verification | Verify identity and resume onboarding |
| Verified new user | Onboarding | Teach MARKOS the real business |
| Onboarded owner | Overview or Campaigns | Generate the first business-specific Campaign |
| Returning user | Overview | Continue planned work and review performance |
| Team member | Role-scoped app | Create, review, or observe within permission |
| Platform staff | Separate admin portal | Operate users, plans, prompts, health, and revenue |

Routing uses the browser session plus verified-user and onboarding state. Instagram connection state comes from the active encrypted credential record, not from legacy workspace token columns. A user who is not verified is sent to verification; an incomplete workspace resumes onboarding; an approved profile proceeds to Campaigns.

### 2.1 Current implementation overlay

| Area | Current `main` | Final-system work still open |
| --- | --- | --- |
| Authentication | Email registration/login, verification, cookie-backed refresh, and MFA are mounted. A backend Google ID-token exchange exists, but Google/Apple controls and password recovery remain honest unavailable states. | Complete and live-verify the provider/recovery journeys before presenting them as active. |
| Onboarding | A minimal greeting offers two first-run paths: analyze business files or enter details manually. The document-assisted path extracts a reviewable draft across the same seven modules; the manual path presents those modules directly. Company and Products remain essential, the other modules remain skippable, and both paths converge on the information check and editable bilingual Business Profile before Campaigns. | Permanent brand-asset storage, approved competitor verification, plan placement, additional recovery refinement, and deployed-provider evidence for the full document path. |
| Campaigns | The Sunlit UI lists and generates time-bound Campaign records. The owner chooses a 3-, 7-, 14-, 30-, 60-, or 90-day duration, start date, objective, and publishing intensity from one to five publishes per day. | Multiple-Campaign management, week-layered review, high-level overview, per-post approval, Create/Calendar draft registration, lifecycle controls, and mounted PDF export. |
| Content/media | Create can start a manual or AI-assisted persisted draft, edit bilingual captions and core fields, approve, upload or provider-generate and attach validated JPEGs, preview the selected asset, schedule, and cancel a schedule. Calendar adds a bilingual week/month view, an unscheduled queue, and atomic schedule/reschedule/cancel management over existing content records. | Planned slots before draft creation, full queue/recovery states, deployed image-provider proof, and all final content-type states. |
| Instagram | The canonical basic, publish, and insights scope set is connected in staging, and the Railway worker completed a follower-visible automated JPEG publish on 2026-08-20. Source defaults remain `dry_run`, while the unreleased staging environment is deliberately exercising live modes. | Confirm persisted account and media insights, complete durable attempt/restart/cancellation proof, and later obtain App Review/Advanced Access. |
| Insights | An API-backed 7/30-day summary, top-content view, empty/error/loading states, and monthly PDF download are mounted. | Full `AN-01`–`AN-06`, live permission-backed sync, 28/90 comparisons, provider-backed interpretation, digest/chat, and learning evidence. |
| Operations | Sunlit Settings covers account/workspace summary, Instagram, MFA, billing summary, data export, and audit history. | Dedicated queue/recovery, complete Vault editor/history, team and notification management, and the separate `ADMIN-01`–`ADMIN-10` portal. |

The complete restoration inventory is maintained in `../ui-design-foundation.md`.

## 3. End-to-end flows

### Flow A — Sign up, verify, and teach MARKOS

**Goal:** create a verified owner and a workspace whose approved business profile is grounded in disclosed answers.

**A1. Register and verify**

- User enters name, email, password, and required consent on `AUTH-02`.
- Web calls `POST /v1/auth/register`; the API creates the user, workspace, and owner membership and initiates verification delivery.
- The user is routed to `AUTH-04`. Verification uses `POST /v1/auth/verify-email`; resend uses `POST /v1/auth/verification/request`.
- Duplicate/invalid input stays inline. An unverified account is not allowed to continue into protected generation or Instagram changes.
- Google is a target sign-in option and has a backend `POST /v1/auth/google` exchange, but the current Sunlit provider button deliberately does not authenticate. Apple and password recovery have no complete application contract yet.

**A2. Plan and trial**

- Final target: explain the available plans in BHD, state VAT treatment, and make trial/payment requirements explicit before a paid commitment.
- Current implementation note: plan/billing foundations exist, but plan selection is not a completed onboarding step. Do not imply that a displayed/default plan is a completed live purchase.

**A3. Choose a document-assisted or manual start**

- After verification, a minimal greeting offers two equally prominent choices: **Use business documents** or **Enter details myself**. Neither choice changes the seven-module knowledge contract or bypasses owner review.
- The document-assisted path stages one to five PDF, DOCX, UTF-8 TXT, JPEG, PNG, or WebP files before the owner explicitly starts analysis. Each file is limited to 8 MB and the batch to 20 MB. Images and image-bearing PDFs are sent through the provider's multimodal file/image inputs; MARKOS does not claim a separate backend OCR implementation.
- A focused provider-backed document analyst treats uploaded content as untrusted evidence, extracts only supported business facts, records source evidence and review issues, and may infer up to seven prominent brand colors from visual material only when it labels that inference for owner confirmation. Local deterministic parsing is not a user-facing fallback.
- The extracted result is an editable proposal across Company, Products, Story, Audience, Competitors, Brand/Tone, and Objectives. Nothing becomes canonical business knowledge until the owner reviews the information check and explicitly approves the document analysis. Approval writes the reviewed modules, attributes the Offering Catalog revision to the analysis, and removes the temporary source files; source files also expire within 24 hours if the analysis is not approved.
- A failed analysis preserves an honest sanitized failure state, temporary files within their retention window, and retry or discard/manual recovery as appropriate. Only one full onboarding analysis may remain active per workspace.
- The manual path opens the same seven-module wizard without requiring a document upload.
- `OB-03`–`OB-09` collect Company, Products, Story, Audience, Competitors, Brand, and Objectives. Products follows Company because those two essentials are enough to unlock the first profile; the remaining context stays skippable.
- Each save calls `PUT /v1/onboarding/:module`, writes the matching Vault section(s), creates deterministic embeddings through the current AI boundary, updates completeness, invalidates any previously resolved profile, and leaves onboarding `IN_PROGRESS`.
- Company and Products are essential because they identify the business and its offer. Story, Audience, Competitors, Brand/Tone, and Objectives are useful but optional; `POST /v1/onboarding/:module/skip` persists an optional skip so the journey can resume without asking the same question again. Essential modules cannot be skipped.
- Brand writes `BRAND` only when visual-identity facts are supplied and `TONE` only when voice facts are supplied. Guidance, placeholders, palettes, and options are suggestions only; only selected or entered facts are persisted.
- The browser keeps the current draft locally until the API confirms saves. Validation or API failure blocks forward progress without discarding the user's typed work.
- Optional steps offer explicit skip actions; the information-check rows are clickable and return directly to the corresponding step for editing.
- Products/Services retains its narrower optional document shortcut for one or two PDF, DOCX, or UTF-8 TXT files. It produces the same structured offering correction surface and remains independent from the full-business entry path.

**A4. Completeness and gaps**

- `GET /v1/vault/score` returns the workspace score and missing sections.
- Journey readiness and Vault completeness are separate signals. `readyForProfile` becomes true after Company and Products are saved, while the Vault score and missing-section list continue to report the context that is actually present.
- The information check labels the two essentials, shows each optional gap without blocking progress, and allows the owner to add or edit context before generation.

**A5. Resolve, approve, and hand off**

- `POST /v1/onboarding/profile/generate` produces a bilingual draft from the available raw module entries and records the interaction/usage. It must not invent optional facts; unsupported profile fields use honest, editable wording that indicates they are not defined yet.
- In the document-assisted path, approving the reviewed extraction first persists its seven-module proposal and removes the temporary files, then invokes the same bilingual profile-generation step. The owner still reviews and approves that profile separately.
- The owner can edit or regenerate the draft. `POST /v1/onboarding/profile/approve` writes the approved result to `COMPANY/business-profile`, preserves generation history, marks the workspace `COMPLETE`, preserves the real Vault completeness score, clears the browser draft, and routes to `/{locale}/app/campaigns`.
- Approval does **not** automatically generate a Campaign. The user sees the Campaigns surface and chooses the objective, duration, start date, and publishing intensity explicitly.
- An ordinary visit to `/{locale}/onboarding` still redirects a complete, approved workspace to Campaigns. The Business Profile's **Review and edit profile** action opens explicit edit mode instead, hydrates the seven onboarding modules from their current workspace Vault entries, and starts with the existing answers rather than an empty wizard.
- In explicit edit mode, saving already approved module changes preserves the approved profile interaction and `COMPLETE` status, does not spend another profile-generation call, and returns to Business Profile. This is an interim editor until the dedicated business-knowledge editor defines how bilingual profile summaries are refreshed.

### Flow B — Generate the first Campaign

**Goal:** demonstrate that MARKOS understands this business and give the user a concrete next direction.

**B1. Generate**

- On the Campaigns surface, the user chooses an objective, start date, duration, and publishing intensity and calls `POST /v1/campaigns/generate`.
- The current contract offers exactly 3, 7, 14, 30, 60, or 90 days, defaults to 30, and accepts one to five publishes per day. Plan availability remains undecided.
- The API checks the Campaign quota, retrieves workspace Vault context, selects the configured prompt/model, calls the protected AI service, validates strict output, persists a versioned `Campaign` and `ai_interaction`, and records provider token use when available.
- The current plan shape is `{ summary, durationDays, publishesPerDay, objectives, pillars, weeklyCadence, kpis, risks, nextActions, retrievedContext }`.
- Provider/schema failure receives only bounded retries and a sanitized recoverable message. A failed attempt follows the quota refund contract.

**B2. Review and export**

- The Campaigns surface lists the workspace's Campaigns, presents a compact overview for the selected Campaign, and limits detailed cadence review to one week at a time. The owner can move among weeks or return to the high-level Campaign map before approving an idea.
- The selected Campaign still exposes its source-informed summary, objectives, pillars, cadence, KPIs, risks, and next actions through progressive disclosure.
- The backend PDF contract is `GET /v1/campaigns/:campaignId/pdf`. It is not currently mounted as a Campaigns-page control, so the UI must not advertise a dead export action.

**B3. Turn a Campaign into a content plan**

- Final target: generate a monthly calendar whose slots map to objectives, pillars, content type, topic, and best time, then allow deliberate rescheduling.
- Each exact weekly Campaign action has a small approval control. Approval is workspace-scoped and idempotently creates one minimal Campaign-linked `DRAFT` carrying its brief, weekly goal, week number, and suggestion index.
- The new draft opens directly in Create and appears in Calendar's Unscheduled collection. Approval does not invent a publication time, generate finished copy or media, mark the item Ready, or schedule it.
- The dedicated Calendar can subsequently plan, schedule, atomically reschedule, cancel, and open existing content for editing. No standalone `/v1/calendar/plan` contract or pre-draft slot model exists; Campaign Builder and `POST /v1/content/generate-for-slot` cover a narrower persisted generation/scheduling slice. Do not call this the complete `CONT-01` calendar.

### Flow C — Create, review, and approve content

**Goal:** turn a grounded topic or planned slot into a saved, reviewable content item.

**C1. Start from Create or a campaign**

- With no item selected, Create opens as a compact action hub rather than an empty editor. Primary actions are **Start a blank post**, **Draft with MARKOS AI**, **Explore content ideas**, **Continue a draft**, and **Open Calendar**.
- A Campaign suggestion approved during weekly review opens as a saved Campaign draft. Create identifies its Campaign and week while preserving the suggestion as the editable brief; the owner still supplies or generates the actual post content deliberately.
- **Start a blank post** opens an unpersisted browser working copy without calling AI, retrieving Vault context, or consuming AI quota. It creates a workspace-owned `DRAFT` only when the user deliberately saves meaningful work. **Draft with MARKOS AI** remains the grounded generation path. Ideas are not persisted until the user deliberately selects one.
- Supporting account-readiness or performance cards may appear only from real workspace/provider data. Missing data receives an honest empty state.
- Current APIs are `POST /v1/content/generate` and `POST /v1/content/generate-for-slot`. The locked manual path requires the build-spec-aligned blank `POST /v1/content` contract and is not implemented merely by this documentation decision.

**C2. Generate copy**

- The API checks Vault presence and quota, retrieves relevant workspace context and tone, selects a prompt, and calls `POST /ai/content/generate` through the internal bearer boundary.
- It persists `ContentItem` drafts and an `ai_interaction`, then records token usage.
- Submitting a valid **Generate draft** request is an explicit first-persistence boundary for the least-cost implementation. The UI states before submission that successful generation creates a saved workspace draft and consumes metered AI usage. Leaving that saved result without later edits requires no unsaved-changes prompt; deleting it remains a separate deliberate action and does not refund consumed usage.
- AI generation is optional assistance, not a prerequisite for opening or saving a post draft. It must not overwrite manual text without a deliberate user action.
- Current implementation note: the content AI route now supports the configured OpenAI provider through a strict bilingual structured contract while preserving deterministic local development behavior. The source capability is not staging proof; a browser-to-API-to-AI request and stored OpenAI dashboard response still need external verification.

**C3. Edit and attach media**

- Selecting a saved draft or starting an unsaved working copy moves Create into one focused Draft Editor. That editor owns the editable bilingual copy, hashtags, CTA, optional planned publication date/time, media, follower-style preview, readiness, schedule/cancel, and eligible delete actions for that item.
- Leaving an untouched new working copy returns to the action hub without creating a record. In-app navigation away from meaningful unsaved changes offers Save draft, Discard changes, and Keep editing. A saved draft may omit `plannedAt` and appear in Unscheduled, or include `plannedAt` and appear on that Calendar date without becoming scheduled. Confirmed saves are preserved; browser unload uses the native unsaved-changes warning where available.
- Core edits use `PATCH /v1/content/:contentItemId`.
- Upload uses `POST /v1/media/upload`; AI image generation uses `POST /v1/content/:contentItemId/generate-image`; attachment uses the content media routes.
- The mounted Create surface sends JPEGs through the authenticated API, records browser-decoded dimensions for uploads, attaches them to the saved item, and preserves the current edits if upload/generation fails. Generated images use the separately configured provider path, reserve quota before the request, validate exact JPEG bytes/dimensions, meter provider usage, and persist through workspace-owned storage; local mode remains an explicit development fallback.
- Current working source has workspace-scoped local and S3-compatible storage drivers. The Milestone A live path requires a durable `s3:` key and mints a provider-only signed GET immediately before container creation. Sarah reports Railway provisioning and API credential wiring complete; deployment of the reviewed code plus application-path and external signed-GET validation remain open.
- Final target includes the rich editor, per-section regeneration, carousel/reel tools, content history/comments, media library, asset detail, storage meter, and a complete Instagram preview.

**C4. Review and approve**

- `PATCH /v1/content/:contentItemId/status` enforces valid transitions from `DRAFT` to `IN_REVIEW` to `APPROVED`.
- Missing required material or an invalid transition stays blocked with a concrete checklist. Approval never implies that the item has been scheduled or published.

### Flow D — Connect Instagram safely

**Goal:** connect the owner's chosen Instagram professional account through the approved least-privilege contract.

- Settings calls `POST /v1/workspace/instagram/oauth/start`; the public return path is `GET /v1/workspace/instagram/oauth/callback`.
- The API issues signed expiring state bound to the user, workspace, return path, and a single-use persisted transaction.
- It exchanges the code, retrieves the token-authenticated profile, stores `/me.user_id` as the professional-account identity, encrypts the token in `instagram_connection_credentials`, replaces bounded recent media, and writes the audit record atomically.
- This is Instagram Login. Do not introduce Facebook Login or Facebook Page discovery into this flow unless a separately reviewed provider contract requires it.
- Current working source uses one constrained Instagram Login contract for account, publishing, and insights calls: versioned requests use `graph.instagram.com/v25.0`, while OAuth/token endpoints remain separately constrained to their documented Instagram hosts.
- `INSTAGRAM_OAUTH_SCOPES` is parsed through the canonical allowlist and drives authorization plus requested-scope persistence. Milestone A requests exactly `instagram_business_basic`, `instagram_business_content_publish`, and `instagram_business_manage_insights`; a deployment and fresh connection are still required before a new token can carry that request, and requested scopes are not provider-grant evidence.
- A verified user with the required MFA step-up may connect, reconnect, refresh, or disconnect. Expired/missing credentials block provider actions with a reconnect action; MARKOS never attempts a publish using a known-invalid credential.

### Flow E — Schedule and publish

**Goal:** move approved content to Instagram without silent loss or false success.

**E1. Schedule**

- `GET /v1/calendar` reads one inclusive, bounded Bahrain date range for the active workspace and returns lifecycle-timestamped Calendar items, referenced media, a summary, and a paginated Unscheduled queue. Status and content-type filters are server-backed. Draft/Review/Ready use `plannedAt`, Scheduled/Failed use `scheduledAt`, and Published use `publishedAt`; records without the relevant placement timestamp must not be placed by `createdAt` or hidden behind a newest-content limit.
- `POST /v1/content/:contentItemId/schedule` accepts only an approved item and sets a future schedule. `POST /v1/content/:contentItemId/unschedule` reverses an eligible schedule, clears both scheduled and planned publication time, and places the Ready item in Unscheduled.
- `plannedAt` on a Draft/Review/Ready item is an intended Calendar time only. It does not enter the publishing queue. The explicit schedule action may propose that value, but only a confirmed scheduling request writes `scheduledAt` and moves the item to `SCHEDULED`.
- Create keeps approval explicit: scheduling does not silently approve a draft. A scheduled item exposes a cancel action that returns it to `APPROVED` without deleting the item. Cancelling from Calendar Post Focus returns to the originating Day Focus and gives timed notice that the item moved to Unscheduled.
- Calendar rescheduling uses the workspace-scoped `POST /v1/content/:contentItemId/reschedule` contract for scheduled or failed items and keeps the monthly content index consistent. The dedicated operator queue is read through `GET /v1/publishing/queue`; its existing publishing reschedule route remains the narrower failed-item recovery path.
- Final UI must expose the chosen time, approval, account, media readiness, provider cap, failure, and recovery. The current Sunlit app does not yet mount the complete queue/recovery surface.

**E2. Publish**

- The final worker selects due `SCHEDULED` items, checks plan and provider readiness, obtains provider-fetchable media for the full processing window, creates a media container, polls until the provider reports a terminal result, and publishes only after readiness.
- Success stores the provider media ID and `publishedAt` and moves the item to `PUBLISHED`. A provider error moves it to `FAILED` with a safe reason and an explicit reschedule path.
- Never mark a dry run or container creation as published. Never retry the same failed container indefinitely.
- Query the provider's current publishing-limit contract when live rather than hardcoding an old approximate post count. Exact cap, host, per-format behavior, and Story/Reel upload requirements must be revalidated during the permission/API research phase.
- Current source retains the MFA-protected item-specific path and also lets the Railway worker select due scheduled items. Both require a private S3-backed object key, mint a just-in-time signed GET, check the live quota response, and perform create → poll → publish through Instagram Login. On 2026-08-20, Khalid supplied follower-visible screenshots of the first automated JPEG result. Durable attempt/container persistence, multi-worker leases, restart reconciliation, App Review/Advanced Access, and Reel evidence remain open.

### Flow F — Sync and explain Insights

**Goal:** show what happened, explain why it matters, and improve the next cycle.

**F1. Sync**

- `POST /v1/analytics/sync` runs a workspace-scoped sync through the selected provider; `GET /v1/analytics` returns the summarized range.
- Current live-readiness requires the canonical three-scope Milestone A request, a fresh appropriately requested credential, live mode, and Instagram Login configuration. A configured or requested scope is still not evidence that Meta granted it.
- The live provider uses separate account `reach,profile_views` and media `shares,comments` requests and preserves unavailable data separately from explicit zero. Local provider and workspace-isolation tests pass, but live metrics are not externally verified and `INSTAGRAM_ANALYTICS_SYNC_MODE` defaults to `dry_run`.

**F2. View and interpret**

- Final `AN-01`–`AN-06` cover overview, posts, post detail, audience, Stories, and Reels with suitable ranges and empty/insufficient-data states.
- The current Sunlit Insights page covers a 7/30-day aggregate, top content, and monthly PDF. It does not prove the full screen set or live provider data.
- Current supporting API contracts are `/v1/analytics/digest`, `/v1/analytics/learning`, `/v1/analytics/monthly-pdf`, `/v1/analytics/monthly-email`, and `/v1/analytics/chat`.
- The Analytics Consultant and generic agents remain deterministic. Provider-backed interpretation, proactive recommendations, mounted chat/digest, and broader comparisons remain target behavior.

**F3. Learn**

- Accepted learning should be written to the workspace Vault with traceable source context so future Campaign/content retrieval can use it.
- A generated PDF, summary, or deterministic test record is not proof that the complete live learning loop has run against real insights.

### Flow G — Build the weekly habit

**Goal:** make keeping Instagram useful a short, repeatable ritual.

- Overview should summarize the workspace's next meaningful task rather than merely display decorative metrics.
- Typical loop: review Campaigns and upcoming work → generate a small batch → edit/approve → schedule → later review Insights → accept the next recommendation.
- If there is no upcoming content or no synced data, show a precise action to create/connect/sync instead of a fabricated result.

### Flow H — Hit a limit and upgrade honestly

**Goal:** turn a genuine limit into a transparent choice without corrupting billing state.

- A metered action checks plan status and quota before work. Near the limit, explain remaining use; at the limit, block at the action and offer the relevant upgrade path.
- Current billing APIs include `GET /v1/billing/plans`, `GET /v1/billing/summary`, `POST /v1/billing/checkout`, and `POST /v1/billing/upgrade`.
- BHD is stored in fils, VAT behavior follows the reviewed exclusive/inclusive rules, and invoices preserve net/VAT/gross values.
- Current CrediMax, BENEFIT, and Stripe adapters are dry-run boundaries. Do not describe a plan or checkout as live until the owning provider certification and payment evidence exist.

### Flow I — Settings, teams, workspaces, and administration

- Sunlit Settings is standalone and currently covers profile/workspace summary, connected Instagram, security/MFA, billing summary, data export, and recent audit activity.
- Final `SET-01`–`SET-06` also include complete account/workspace editing, billing actions/invoices, team roles, and notification preferences.
- Enterprise workspace switching and roles must preserve the same workspace isolation invariant.
- Final `ADMIN-01`–`ADMIN-10` is a separate platform surface for business metrics, users, workspaces, moderation, AI usage, prompts, plans, health, Instagram status, and revenue. Admin APIs/RBAC exist, but the old UI was removed and the legacy route currently redirects to Settings. That redirect is not completion evidence.

## 4. State machines that matter

### 4.1 Content item status

```text
DRAFT -> IN_REVIEW -> APPROVED -> SCHEDULED -> PUBLISHED
                                   |             (terminal provider success)
                                   -> FAILED -> SCHEDULED after a valid reschedule
```

- Only valid transitions are accepted by the API.
- Only approved items may be scheduled, and only scheduled items are selected for due publishing.
- `PUBLISHED` represents confirmed provider success, not a dry run, queued job, or container ID.
- Deletion uses the workspace-scoped soft-delete contract where the model supports it.

### 4.2 Publish attempt lifecycle

```text
QUEUED -> VALIDATE_APPROVAL_AND_QUOTA -> ENSURE_PUBLIC_MEDIA
  -> CREATE_CONTAINER -> POLL_PROVIDER -> PUBLISH -> PUBLISHED
  -> provider/cap/configuration failure -> HELD or FAILED -> user-visible recovery
```

This is the required behavioral state machine. The exact Story, Reel, carousel, cap, and endpoint contracts must be confirmed against current official provider documentation before live activation.

### 4.3 Onboarding

```text
NOT_STARTED
  -> choose manual entry or document-assisted entry
  -> document proposal reviewed and approved, or manual module saves
  -> IN_PROGRESS after canonical module data exists
  -> Company and Products ready; optional gaps remain explicit
  -> generated profile draft
  -> user edits/regenerates
  -> user approves
  -> COMPLETE and route to Campaigns

explicit edit mode after approval -> approved module updates -> remain COMPLETE -> Business Profile
```

### 4.4 Subscription

```text
TRIAL -> ACTIVE
ACTIVE -> PAST_DUE -> SUSPENDED
ACTIVE or PAST_DUE -> CANCELLED according to the reviewed billing lifecycle
```

Provider webhooks and server-side payment state are authoritative; the browser never declares a payment successful. Retention/deletion timings remain subject to the current billing, PDPL, and legal decisions rather than an obsolete planning estimate.

## 5. Current request lifecycle example — generate content

1. Web calls `POST /v1/content/generate` through the authenticated API client.
2. API validates the access token, resolves workspace context, checks permission and Vault presence, and reserves `AI_GENERATION` usage.
3. API retrieves up to eight relevant Vault chunks, merges the tone lock, and selects the current prompt template and optional Campaign. Content may remain orphaned when no Campaign is selected.
4. API calls protected `POST /ai/content/generate` with the bounded structured request.
5. The AI service currently returns deterministic draft shapes and usage; this step is not provider-backed today.
6. API validates the result, creates workspace-scoped `ContentItem` rows, writes `ai_interaction`, records token usage, and returns the saved records. On failure it follows the quota-refund path.
7. Web renders the saved draft with edit, approve, and schedule actions appropriate to its current state.

## 6. Failure and edge behavior

| Situation | Required behavior | Current limitation to remember |
| --- | --- | --- |
| Vault lacks grounding | Explain the missing section and link to Business Profile/Vault | Do not fill missing facts from placeholders or demo content |
| AI/provider fails or returns invalid output | Bounded retry, sanitized error, preserve user work, refund reserved quota when required | Campaign/profile/content-copy and document-analysis paths are provider-capable; other routes remain deterministic where documented |
| Quota is exhausted | Block at the action and explain the relevant plan/period | Never show invented remaining usage |
| Media generation/upload fails | Preserve content edits and offer retry/manual attachment | Provider image fallback and durable storage are not complete |
| Instagram credential is missing/expired | Block provider actions and route to secure reconnect | A configuration variable cannot repair an old credential's permissions |
| Publish container/provider fails | Never claim success; store safe failure and offer retry/reschedule | Complete Sunlit failure/queue UI is still missing |
| Provider publishing cap is reached | Hold/reschedule transparently using the current provider response | Do not hardcode an obsolete approximate cap |
| Analytics permission/data is missing | Show an honest empty/readiness state and keep live mode off | Dry-run data is not live insights evidence |
| Payment fails | Follow server-side lifecycle and show actionable status | Gateways are not live-certified yet |
| Network/API error | Preserve unsaved browser input and offer retry | Do not clear onboarding/content drafts on an unconfirmed write |
| Arabic locale | Use RTL layout and natural Arabic with locale-aware dates/numbers | Source-level checks do not replace visual review |

## 7. Bahrain-wide behavior

- Arabic and English are first-class from public entry through operational recovery; Arabic layouts are RTL.
- Show BHD and the reviewed 10% VAT treatment clearly. Store BHD in fils and never use floating-point money.
- CrediMax and BENEFIT are the intended Bahrain-primary payment rails; Stripe is an international fallback, subject to current certification and product decisions.
- Planning may account for relevant local seasons and events without inventing facts about the business.
- Workspace data export/erasure and transparent support/admin actions follow Bahrain PDPL-oriented controls and current legal review.

## 8. Active references

| Need | Active document |
| --- | --- |
| Architecture, schema, target product areas, milestones | `MARKOS_BUILD_SPEC. 2.pdf` |
| Current implementation, evidence, roadmap, ownership | `../project-status.md` |
| Active visual direction and deferred product-surface restoration | `../ui-design-foundation.md` |
| Durable implementation/product decisions | `../decisions.md` |
| Detailed milestone state | `../milestone-checklist.md` |
| Railway/configuration operations | `../staging-deploy.md` |
| Instagram permission and external-verification boundary | `../instagram-app-review.md` |
| Retired PRD/design/cost/implementation context | `../archive/source/README.md` |

Build the final system so these sequences, approval boundaries, state transitions, and recovery behaviors remain true. Use the current-status overlay to choose the next safe slice without shrinking the target or overstating what is live.
