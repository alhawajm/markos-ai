# Create relational authoring — Phase 1 checkpoint

Implemented on 2026-09-16. This is a foundation checkpoint, **not a deployable application release**. Generation, publishing, MARKOS conversation, and the Create editor still need their approved later-phase migrations.

## Model and mutation contract

- `ContentItem` owns ordered `ContentMediaItem` rows and an optional `ContentReelScript`, which owns ordered `ContentReelBeat` rows. Assets remain reusable files; replacing an attachment preserves the logical item ID.
- Media items hold purpose/title/body/direction, aspect ratio, and individual generation duration. Script intended duration is separate from generation duration and actual asset duration.
- New drafts receive one empty logical item. Story may leave its image/video kind unset until chosen. Carousel drafts allow 1–10 items; publication readiness remains later-phase work.
- `GET /v1/content/:contentItemId` returns the typed aggregate. `POST /:contentItemId/mutate` accepts an expected root revision and targeted operations. `POST /:contentItemId/convert` previews or accepts conversion. Shared-field PATCH, deletion, and draft/review status writes also require the expected revision.
- Authoring operations lock the root, check its revision, and mutate within one transaction. Database child-write triggers advance the root revision, including direct child writes. Revision is opaque and may advance more than once per request. Reorders target complete ordered ID lists, never asset IDs or mutable titles.
- Conversion previews identify retained/removed items, detached assets, and reset fields. Multiple populated items require an explicit retained ID when reducing to one item. Destructive conversion requires confirmation with a current revision. Empty conversions proceed directly. Incompatible active media and Reel script state are removed/reset; Library assets are retained.
- Composite foreign keys enforce workspace ownership; RLS covers all new tables. Partial unique indexes enforce active positions and attachments. Deferred constraints validate format/count/order/attachment compatibility at commit. Attachment locks and asset-update checks prevent concurrent deletion from invalidating a new attachment.

## Clean schema break

Migration `20260916160000_relational_content_aggregate` removes root `mediaIds`, `visualDirection`, `carousel`, and `reelScript` columns. It deletes disposable content, calendars, publication/generation jobs, and content-linked analytics/AI interactions first. It does not delete Library assets or business profiles. Stop old writers before applying it; do not deploy this intermediate checkpoint.

No backfill, dual storage, or compatibility API was introduced. Manual, campaign, and generated-batch creation use relational aggregates. The existing transient AI generation response is mapped to rows at creation; it is not authoritative JSON storage. Campaign review and Calendar receive only the minimal relational read adaptations.

## Verification

- Fresh migration deployment and seed passed on the designated disposable loopback database `markos_local_test`, including its normal initialization SQL. The ordinary `markos` database was not reset.
- `vitest run test/content-aggregate.test.ts test/content-caption.test.ts`: **35 passed**. Covers validation, aggregate routes and writers, stable IDs, revision propagation, concurrent conflicts, rollback, order, conversion, foreign ownership, database constraints, and attachment/deletion races.
- `vitest run test/workspace-isolation.test.ts -t 'covers every Prisma|ContentMediaItem|ContentReelScript|ContentReelBeat'`: **4 passed, 33 intentionally skipped**. Includes schema inventory and all three new table isolation cases.
- Prisma validation and client generation passed. Shared-types and validation package typechecks passed. A targeted TypeScript configuration including `content-aggregate.ts` and its imports passed.
- API-wide typecheck was attempted and failed with **70 diagnostics** in deferred consumers/fixtures: conversation, media integrity/generation, publishing, workspace deletion, and their old content fixtures. No diagnostics were reported in the new aggregate or migrated content/campaign/Calendar paths. These failures are not suppressed.
- No full repository suite, build, browser, or visual checks were run.

## Explicit later-phase boundaries

Media generation/job targeting, publishing/readiness, workspace media cleanup, MARKOS's action/context contract, and Create/autosave remain unfinished consumers of the schema break. Their legacy fixtures also need migration. Shared `ContentRecord` now exposes the relational representation; old frontend callers have not been adapted.

Removed whole-draft AI mutation entry points and Mark Ready currently return `CREATE_PHASE_PENDING` rather than mutate retired storage or approve content without migrated readiness validation. Generation and publishing modules still contain incompatible legacy references; this checkpoint must not be presented as working end-to-end. Existing scheduling behavior is not redesigned here.

All backend `contentItem.create/createMany/upsert` creation sites now converge on `createContentAggregate`. Remaining removed-field references are in the explicitly deferred consumers, not an alternative authoring store. Later phases must complete those consumers before deployment and broader regression verification.
