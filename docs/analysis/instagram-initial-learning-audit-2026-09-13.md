# Instagram initial learning — focused audit and implementation plan

> This technical audit predates the approved guided-onboarding and Business Profile approval model. See [the September 14 implementation checkpoint](instagram-initial-learning-implementation-2026-09-14.md) for the implemented scope and deferred decisions.

## Objective

After a professional Instagram account is connected, MARKOS should build a bounded, evidence-backed baseline of the business's existing Instagram practice. The baseline can inform future Campaign and Create work only after the owner reviews it. It must not rewrite owner-controlled Business Profile facts.

This is the first Instagram-learning increment. It is not the continuous learning loop, an eight-agent deployment, or autonomous marketing-strategy optimization.

## Current path

`OAuth callback -> encrypted connection -> six-item recent-media cache -> periodic/manual Insights sync -> Instagram analytics rows -> deterministic analytics Vault entry -> Campaign/content retrieval`

- OAuth retrieves the account identity and at most six recent media items. It saves the connection and cache atomically, then returns to Settings with only a connected/error result. No learning run is created and there is no progress or review state.
- The live Insights provider already discovers `/media` and `/stories`, follows bounded cursor pagination, identifies Post/Carousel/Reel/Story, requests type-appropriate metrics, preserves partial results, and links MarkOS content only by its final Instagram media ID.
- A complete analytics sync automatically writes `ANALYTICS_PERFORMANCE_LEARNING` into a date-keyed `OBJECTIVES` Vault entry.
- Campaign generation and ordinary content generation search the complete retrievable Vault. Create conversations assemble a narrower context from Company, Audience, Tone, active offerings, the current Campaign, and the current draft.
- Business Profile uses `COMPANY/authoritative-profile` as owner-controlled storage. That record is excluded from retrieval; readable section projections provide current grounding. Establishment stage is already stored in the Company module.
- The generic `ANALYTICS_CONSULTANT` route receives the current analytics summary, but the AI service currently returns a deterministic local response for `/ai/agents/run`. It is not a provider-backed structured interpretation pipeline.
- The maintenance worker owns periodic Insights synchronization. It has role isolation and one in-process running guard, but there is no durable initial-learning queue or review lifecycle.

## Findings that affect the design

### 1. Reporting data and learning evidence are related but not identical

The Insights provider discovers useful media metadata, but it currently emits a media snapshot only when at least one requested metric is available. A caption or format with unavailable metrics therefore disappears from persisted analytics, even though it remains useful learning evidence. The OAuth cache retains only six items.

The provider also walks up to twenty 100-item pages and then requests metrics for every discovered media item, independent of the requested reporting window. That can turn an initial scan of an established account into a large, slow burst of provider calls.

The first learning pass needs an explicit bounded evidence contract instead of treating a normal 30-day report sync as an account crawl.

### 2. The connected account is missing from persisted analytics identity

Analytics rows retain the Instagram media ID for media snapshots, but account totals and the row identity do not retain the provider account ID. If a workspace disconnects one account and later connects another, preserved analytics and learning can be mixed or overwritten without a reliable active-source filter.

New snapshots and learning records must carry the provider account ID. Summaries and grounding must select the current connected account. Existing historical records may remain stored, but must not become active evidence for a different connection.

### 3. Current analytics learning is automatically retrievable and accumulates

`writeAnalyticsLearningToVault` creates a key from the reporting dates. As the reporting window moves, these entries accumulate in `OBJECTIVES`. Vault retrieval has no source-kind, account, approval, expiry, or recency filter; it ranks all active entries together. Old analytics observations can therefore compete with current approved objectives.

Automatic measured evidence and AI-inferred preferences need separate treatment:

- measured evidence may be used without becoming a Business Profile edit;
- inferred themes, voice, or preferences require owner review before they become active learned context;
- neither may masquerade as a canonical fact or silently update Marketing Strategy fields.

### 4. Downstream consumers are inconsistent

Campaign and generated-content paths can retrieve analytics learning through general Vault search. Create conversations cannot currently see `OBJECTIVES` analytics learning because they load a hand-selected Company/Audience/Tone context. An approved Instagram baseline therefore needs an explicit shared grounding contract rather than relying on whichever Vault chunks happen to rank in the top eight or ten.

### 5. A durable lifecycle cannot be represented by the current records alone

The Instagram connection row describes credentials. `InstagramAnalytics` describes measurements. `AiInteraction` is created around an AI result but has no queued/running/lease/retry/review lifecycle. A small learning-run record is justified so connection success remains fast while background work is recoverable and visible.

## Recommended first-increment contract

### Evidence boundary

- Use the current connected account identity.
- Discover at most the latest **50 feed media items**, plus currently available Stories.
- Use current account reporting totals and lifetime metrics returned for those media items.
- Select at most **24 caption/metric examples** for interpretation: recent items, strongest measured items, and format-diverse items, deduplicated.
- Preserve caption, format, publication time, permalink, provider media ID, metric availability, and numeric metrics. Preserve measured zero separately from unavailable data.
- Do not download or analyze image/video bytes in this increment. Visual-style learning becomes a later bounded multimodal pass after the ingestion and approval lifecycle is proven.
- Treat captions and all remote text as untrusted evidence, never as instructions.

This limit is deliberately count-based. It remains useful for a low-frequency established account while preventing an unbounded historical crawl.

### Structured interpretation

Add one provider-backed structured Instagram-baseline analysis operation using the existing OpenAI structured-request infrastructure. Record it as an `ANALYTICS_CONSULTANT` `AiInteraction`; do not create or deploy a separate autonomous agent service.

The result should contain:

- observed content themes, each with supporting media IDs;
- caption and language patterns;
- CTA, hashtag, emoji, and caption-length tendencies;
- format mix and posting cadence;
- evidence-backed performance observations with metrics and supporting media IDs;
- proposed content/voice preferences that the owner may approve;
- limitations and data gaps.

The model must not infer or propose changes to business identity, location, website, offerings, prices, story, establishment stage, or other owner-only facts. Low-data accounts must receive explicit limitations rather than invented patterns.

### Owner review and activation

- Connection succeeds independently of learning.
- Settings shows a compact learning state for the connected account: learning, ready to review, incomplete/failed, or learned.
- A ready result opens a focused review surface associated with Business Profile's Marketing Strategy area. It shows evidence and editable proposed preferences without turning the whole profile into an AI form.
- The owner can approve the reviewed baseline or dismiss it. Failure preserves the proposal and input state needed for an intentional retry.
- Approval writes fixed, source-labelled learned-context projections. It does not update `COMPANY/authoritative-profile` or the Offering Catalog.
- One fixed current projection replaces the previous active baseline for that workspace/account while Vault history preserves revisions. Date-keyed active learning entries must not accumulate.
- Connecting a different account supersedes the former account's active learned projections. Historical analytics may remain, but current summaries and grounding use only the active provider account.

### Shared grounding

Provide one application-owned grounding reader that returns:

1. current approved Business Profile projections;
2. current active offerings;
3. current owner-approved Instagram baseline, if one exists;
4. current measured performance evidence where relevant.

Campaign generation, generated content, and Create conversations should consume the relevant parts of that contract. Prompts must label learned observations as evidence/preferences and owner-entered profile values as authoritative facts. Retrieval score alone must not decide which source wins.

## Minimal data and API changes

### One new durable record

Add an `InstagramLearningRun` model with workspace and provider-account scope, status, attempt/lease fields, evidence fingerprint, structured result, safe failure code, linked `AiInteraction`, timestamps, and approval/dismissal state. Recommended lifecycle:

`QUEUED -> RUNNING -> READY -> APPROVED`

with `FAILED`, `DISMISSED`, and `SUPERSEDED` terminal/recovery states.

Only one active initial run should exist for the same workspace/account/evidence fingerprint. All reads, claims, approval, dismissal, export, erasure, and tests must be workspace-scoped.

### Existing records

- Reuse `InstagramRecentMedia` as the bounded raw metadata cache where practical; do not create a second full Instagram-media catalogue.
- Keep measurements in `InstagramAnalytics`, adding provider account identity to new snapshot metadata and persistence identity.
- Keep the AI request/response and token record in `AiInteraction`.
- Keep canonical facts in the existing authoritative Business Profile and Offering Catalog.
- Keep approved learned context in fixed Vault projections with explicit kind, source account, observation period, run ID, approval timestamp, and evidence references.

### Endpoints

Add focused workspace routes for:

- current learning state/result;
- intentional retry when failed;
- approve reviewed result with expected revision/state;
- dismiss a ready result.

OAuth completion should enqueue idempotently after credential persistence. Queue failure must not roll back a valid Instagram connection; the state endpoint/manual retry provides recovery.

## Worker ownership

The existing maintenance worker should claim due Instagram learning runs on its current timer. Do not add another service, scheduler, Redis queue, or polling loop.

- Claim with a database lease before provider work.
- Process a small bounded batch so one account cannot monopolize the worker.
- Isolate failures per workspace.
- Retry only clearly pre-acceptance/transient failures with bounded backoff.
- Never run two analyses for the same run or approve a result automatically.
- A normal periodic Insights sync and initial learning may both read Meta safely, but persistence must remain idempotent and the learning job should reuse a sufficiently fresh sync rather than immediately duplicating it.

This remains comfortably within the three-active-user target.

## Implementation passes

1. **Data and evidence safety**
   - add the learning-run lifecycle and workspace policies;
   - source-scope new analytics records;
   - bound media discovery and preserve useful metricless metadata;
   - replace accumulating active analytics-learning keys with one current source-scoped projection.

2. **Structured analysis and worker execution**
   - add the dedicated schema/prompt/provider operation;
   - enqueue after connection;
   - claim, lease, retry, and complete through the maintenance worker;
   - record the linked `AiInteraction` only for the actual provider attempt/result.

3. **Review and activation**
   - expose status/result/approve/dismiss/retry APIs;
   - add the compact Settings state and focused Marketing Strategy review surface;
   - activate fixed learned-context projections only after approval.

4. **Shared grounding**
   - add the application-owned reader;
   - use it in Campaign, generated content, and Create conversation context;
   - ensure unapproved, dismissed, failed, superseded, and wrong-account learning is excluded.

5. **Focused verification**
   - bounded pagination and mixed Post/Carousel/Reel/Story fixtures;
   - missing metrics, measured zero, low-data account, partial Meta failure, and malicious caption text;
   - idempotent OAuth enqueue, lease recovery, retry, approval conflict, account replacement, and three concurrent workspaces;
   - workspace isolation, export, erasure, and no canonical-profile mutation;
   - approved context reaches Campaign/Create while unapproved context does not;
   - targeted EN/AR browser coverage for connection state and review only.

## Live verification boundary

The audit made no production, Railway, database, or Meta calls. After automated verification and deployment, use the designated established business account for one read-only connection/learning proof. Record discovered, selected, analyzed, and metric-covered counts; inspect the proposed baseline; approve it deliberately; then confirm that a new Campaign and Create request receive the approved baseline. Do not publish content as part of this proof.

## Explicit exclusions

- continuous or scheduled re-learning;
- autonomous Marketing Strategy edits;
- automatic recommendation approval;
- visual analysis of image/video bytes;
- follower identity or individual-user analysis;
- competitor discovery;
- retroactive rewriting of posts or Campaigns;
- a generalized knowledge graph;
- eight separately deployed AI agents;
- a broad Insights or Business Profile redesign.
