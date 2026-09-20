# Create relational authoring — Phase 2 checkpoint

Implemented 2026-09-16, following Phase 1 (`ff31ff4`). Local-only checkpoint. No assistant actions, Create frontend, autosave UI, browser checks, or live-provider calls were introduced.

## Media and generation

- Attachment/replacement requires `contentMediaItemId`, asset ID, and expected root revision. Detachment addresses the logical item and requires revision in the body. Media reordering accepts `orderedIds` of logical items with expected revision. All retain slot identity and use the aggregate lock and workspace validation. Detachment never deletes Library files.
- `ContentMediaItem.generationIntent` is an internal UUID, omitted from authoring responses. Dispatch rotates it; relevant setting/attachment/deletion changes invalidate it through database triggers. Format conversion and entering a noneditable lifecycle invalidate outstanding intent. Caption, tone, brief, and reorder changes do not invalidate it.
- `MediaGenerationJob` has a composite workspace/content/item foreign key, captured intent, requested root revision, immutable prompt/ratio/duration/provider request fields, and nullable `attachmentApplied`. Image executions now also have job records, but images still execute synchronously. The worker claims VIDEO jobs only.
- Explicit generation settings are saved to the logical item; omitted prompt/settings resolve from that item. An empty direction is rejected rather than replaced by a caption-derived fallback. Each Carousel slide has its own target and direction.
- Completion holds the root lock and checks target intent, ownership, active state, kind, and editable lifecycle. A valid result replaces the attached asset without changing item identity or position. Stale output remains in Library, with a COMPLETED execution and `attachmentApplied: false`; the image API returns a conflict identifying the saved asset. Video worker progress does not advance authoring revision; attachment does.
- Video leases, ambiguous-start handling, polling, and completion fencing remain intact. Intentional retry creates a new execution of current item intent rather than rewriting the failed request's snapshot. A stale duplicate dispatch fails the root revision check; a deliberate new request supersedes an earlier execution's right to attach.
- Requested video duration, script intended duration, and actual asset duration remain independent. Provider progress no longer overwrites requested duration.

## Readiness and publishing

Backend Mark Ready is restored using centralized relational readiness checks. Existing DRAFT → IN_REVIEW → APPROVED transitions remain. Non-Story formats require their shared caption. Story requires no caption, and its provider payload excludes caption even if root text exists.

Publishing reads active items in position order. Every Carousel slide must be attached and compatible; unfinished slides block publication rather than being filtered out. Existing provider container creation, processing polls, leases, idempotency, retries, and stored publish errors are preserved. Technical provider metadata/account constraints remain in the existing publishing validators.

## Verification

- Prisma validation/client generation passed. All 19 migrations and seed passed from a fresh **markos_local_test** database. Only that disposable local database was reset; ordinary `markos` and Docker volumes were preserved.
- Focused aggregate/media/image/video/publishing/provider/maintenance-worker tests: **147 tests passed across the final relevant runs**. The combined run had 143 passing and one test import failure; restoring the missing import and running the two affected media files passed all 41 tests, including three additional caption requirements tests. No remaining failure in those targets.
- Targeted workspace schema inventory and MediaGenerationJob isolation checks passed, along with the two focused worker regression checks (4 passed, 53 intentionally skipped).
- Shared-types and validation typechecks passed. A targeted TypeScript project covering media, publishing, and relational media tests passed.
- API-wide typechecking remains blocked only by deferred conversation/workspace consumers and old content/analytics/workspace fixtures. No Phase 2 media/generation/publishing type errors remain. Full repository verification/build and browser tests were not run.

Tests cover stable attachment identity, ownership, kind compatibility, revision conflicts, reorder validation, full-capacity Carousel regeneration, saved direction, provider failure, caption changes during generation, supersession, manual replacement, removed/converted targets, lifecycle changes, Library retention, immutable execution settings, duration separation, all four readiness formats, ordered Carousel publishing, incomplete-slide rejection, captionless Stories, provider polling, and worker lease/duplicate protection.

## Scope notes and remaining work

Generation records for synchronous images are a small extension of the existing execution table, not a new polling mechanism. Accepted conversion may now proceed while generation runs because completion can safely retain stale output. These support the approved Phase 2 intent protection.

Conversation/MARKOS authoring remains Phase 3. Create/frontend contracts and autosave remain Phase 4. Existing workspace cleanup still references legacy storage and is explicitly left outside this phase, as requested. The intermediate branch is not yet a deployable end-to-end Create release. No push or external deployment was performed.
