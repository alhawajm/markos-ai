# Content and Campaign data model

Status: the one-caption contract, persisted Create conversations, creative direction and content revision checks are implemented in the September 6 development passes. Stable Campaign ideas, media associations, immutable publication snapshots and learning rules remain proposed. See `docs/create-conversation-backend.md`.

Date: 2026-09-06

## Problem and evidence before the caption migration

Owners compose one Instagram post. Before this migration, MARKOS treated its English caption, Arabic caption, CTA, and hashtags as four editable fields, and the consuming paths disagree:

- `ContentItem` stores `captionEn`, `captionAr`, `callToAction`, and `hashtags` separately (`apps/api/prisma/schema.prisma`).
- Create previews its selected language, adds a separate CTA when not already present, then adds hashtags (`content-studio-panel.tsx`, `content-studio-preview.tsx`).
- `buildCaption` chooses English when non-null, otherwise Arabic, then adds hashtags. It does not append the separate CTA (`apps/api/src/publishing/instagram-publisher.ts`). An empty English string also prevents the Arabic fallback.
- The AI contract requires separate bilingual captions, hashtags, and CTA. Revision requires those pieces to be populated, so removing an optional piece can disable revision (`services/ai/app/contracts/content.py`, `apps/api/src/content/content-service.ts`).
- Campaigns store a typed plan in JSON. A suggested post is located by week and flattened action index. Its registered ContentItem retains that identity, but indexes are not suitable identifiers if plans become reorderable (`apps/api/src/campaign/campaign-service.ts`).

These were repository findings, not observations of a live Instagram publication. The caption migration replaces the split contract across persistence, client, AI, Create, Calendar, media context, analytics summaries and publishing.

## Proposed ownership

| Object | Owns | Must not own |
| --- | --- | --- |
| Campaign | Title, objective, dates, audience/offer references, pillars, KPIs, plan version and lifecycle | A second copy of a post's final caption or publication state |
| Campaign idea | Stable ID, parent Campaign/plan version, intended day, title/brief, format, goal and pillar | Finished copy, generated media, or an implied publishing approval |
| ContentItem | One deliverable: final caption, format, ordered media, working revision, approval and planning state; optional Campaign/idea links | An independently editable duplicate for each UI page or language |
| MediaAsset | Workspace-owned file identity, immutable storage reference, MIME type and dimensions | Caption text or a permanent signed delivery URL |
| Content media association | ContentItem, MediaAsset, position; later explicit crop/cover settings where supported | Shared asset mutation when changing a single post |
| PublishJob and attempts | The approved content revision to send, due time, execution/retry state and resulting provider ID | Unreviewed changes to the working draft while publication is underway |
| AiInteraction and content events | Which action affected which content revision, its model/prompt/context provenance, usage, owner acceptance and later edits | The authoritative current caption or invented evidence of business performance |

Every object and association is workspace-scoped. A Campaign can have many ideas and posts; a post may be standalone. Each registered idea maps to one content item in the initial model. Creating another variant must be an explicit future operation.

Calendar remains a view of the same ContentItems and their dates. It must not create another draft model. Business Profile/offerings remain the source of approved business facts, rather than copied, independently editable catalogs inside each Campaign.

## One final caption

Implemented owner-facing model: one editable plain-text caption. It contains the exact text and order intended for the Instagram caption field. English, Arabic, CTA and hashtags can all appear there. They are optional portions of that text, not competing publication sources.

For example:

```text
Flaky layers. Citrus glaze. A little cardamom.

طبقات هشة، ونكهة الحمضيات، ولمسة من الهيل.

Try it with your next coffee. جرّبه مع قهوتك القادمة.

#SnackLab #Bahrain
```

For Posts, Carousels and Reels, the contract is:

**saved final caption = full preview caption = publication caption**

Display truncation in the simulated Instagram screen must not alter the saved string. Expanding the preview reveals the whole caption. The publisher must not append another CTA, translate, choose a language, or add hashtags after approval.

- Store one authoritative `caption` string on ContentItem. Preserve owner line breaks and ordering.
- Support English-only, Arabic-only, and bilingual copy. A generation preference can describe languages and ordering; the interface locale must not decide publication language.
- AI generation and revision return a complete proposed caption. Revision receives the current final caption, instruction, approved business context, and Campaign/post intent.
- Structured AI reasoning or extracted language/hashtag annotations may support analysis. They are derived metadata, never a second source from which publishing rebuilds the caption.
- Apply the existing MARKOS limits to the complete caption: 2,200 Unicode code points and 30 hashtag tokens, with the same counting policy in TypeScript and Python. The editor, API, AI output validation and publisher reject invalid results without truncating saved copy. The Meta reference returned HTTP 429 during verification; these are retained application limits, not a new claim about live provider acceptance. Reverify provider limits during the live publishing V&V pass.
- A mixed-language editor needs paragraph direction support without inserting hidden direction characters into the publication payload as a cosmetic fix.
- Story overlays and stickers are separate media composition capabilities. A text caption must not silently become burned-in Story text, a sticker, or an unsupported publishing field.

Khalid approved the single-text caption migration. The editor preserves ordering and whitespace and uses paragraph direction for mixed Arabic/English without inserting direction-control characters. Interface locale changes labels and layout, never the caption.

## Stable relationships and revision boundaries

Give Campaign ideas stable IDs before introducing plan reordering or regeneration. Keep their original plan version and brief available for provenance. A future plan version must not silently rewrite already accepted drafts or published posts. Existing week/index keys can be mapped to stable IDs through a compatibility adapter during migration.

Use a monotonically increasing ContentItem revision for saved changes. Manual save and AI application submit the revision they read. If another tab or operation has changed it, retain the result for review rather than applying an unconditional overwrite. This provides a concurrency boundary without requiring an Undo feature or a complete revision-history UI.

Ready identifies an approved revision. Returning to Draft invalidates that approval. Queuing publication pins an immutable payload snapshot or revision reference, including the exact caption and ordered asset identities. Execution and retries use that approved content consistently. Resolve delivery URLs at execution time; do not persist temporary signed URLs in the snapshot.

Keep `plannedAt`, `scheduledAt` and `publishedAt` distinct. An idea's intended day is planning context; scheduling is a deliberate publishing action; provider confirmation supplies publication evidence.

For the learning loop, retain links from generated action → content revision → owner action → publish result → observed metrics. A user edit is preference evidence, and approval is acceptance evidence. Neither independently proves that the content performed better. No learning behavior is introduced by this model alone.

## Caption implementation and rollout

- `ContentItem.caption` is a required string with an empty default. The API rejects retired `captionEn`, `captionAr`, `callToAction` and `hashtags` request keys. Empty, English-only, Arabic-only and bilingual captions are valid; Ready in Create still requires reviewable copy and media.
- Content generation uses prompt `content.v3` and returns one complete caption. The API validates the AI response before persistence. Revisions accept manually authored captions without requiring an AI origin, a pillar, CTA, hashtags, or a second language.
- The tone contract uses ordered `preferredLanguages`, normally English then Arabic. The owner's generation/revision instruction can override language choice and order. Deterministic local text remains a test provider; it does not provide general instruction following.
- Caption, Media and Details are focused editors beside the preview. The complete caption has a visible count and recoverable validation errors. Surplus desktop width is assigned to the conversation while the preview keeps its mobile ratio.
- Story supporting copy remains on the draft and is explained in the editor; it is neither sent as a caption nor automatically rendered into the media.

### Fresh-data decision

Khalid explicitly waived preservation of database content for this stage and plans later resets of local and Railway data. Migration `20260906150000_unified_content_caption` adds `caption` with an empty default and drops the four split copy columns. It intentionally discards their values without a compatibility/backfill layer. It does not delete databases, accounts, Campaigns, media, or volumes.

The migration has been applied to loopback `markos_local_test` and local development `markos`. No hosted migration or Railway reset was run. Existing local posts have empty captions and need new copy if reused before the planned reset.

The API, AI service, frontend and schema form one breaking release. Deploy them together during the planned hosted fresh-data transition; old clients/prompts are incompatible. A code-only rollback after dropping the old fields cannot restore their text. Historical interaction JSON is provenance only and is not rehydrated as an authoritative caption.

## Remaining model work

1. **Stable idea and media relationships.** Map existing Campaign/week/action identities to stable idea IDs, preserve ordered media, and keep one registered draft per idea.
2. **Revision-aware writes and publication snapshots.** Reject stale application without losing the working result; pin the approved publication text and asset identities for execution/retries. The conversation pass now implements revision-aware writes. Immutable publication snapshots remain proposed.
3. **Explicit intelligence evidence.** Extend interactions with target-content/revision links and owner events. Add learning rules only after evaluation criteria are agreed.

## Verification boundaries

The caption slice covers exact save/reload and publisher payload equality, combined limits, invalid AI output rejection, manually authored revision, Campaign reuse, workspace isolation, English/Arabic UI parity and retained Save/Leave/readiness behavior. Automated database checks use `markos_local_test`; browser fixture checks do not establish live provider behavior. Broader revision, snapshot and relationship isolation tests belong to the remaining model work above.

September 6 focused verification passed:

- API: 86 cases across `content-caption.test.ts`, `content.test.ts`, `instagram-publisher.test.ts`, `publishing.test.ts`, `media.test.ts`, `m2-acceptance.test.ts` and `maintenance-worker.test.ts`. Persistent cases used `localhost/markos_local_test`; provider transport was mocked.
- AI: 26 cases in `test_content_provider.py` and `test_health.py`, using the deterministic provider or mocked OpenAI transport.
- Browser: 12 Create cases plus the three relevant Overview/Campaign/Calendar handoff cases, using fixture API responses and system Chrome at the documented desktop sizes, including Arabic/RTL.
- Draft state: four focused unit cases. API, web and shared-validation typechecks, focused ESLint, Python mypy/Ruff, formatting and diff whitespace checks passed.
- Local web, API and AI health endpoints returned HTTP 200 after the safe-mode restart. No live OpenAI generation, live Instagram publication, hosted deployment, full database reset or repository-wide verification was performed.
