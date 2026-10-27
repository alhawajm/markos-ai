# Create authoring invariants

Current: September 16, 2026.

- `ContentItem` is the aggregate root. Shared caption, Details, campaign/lifecycle and publication state remain there.
- `ContentMediaItem` is a stable creative slot, not a file. Replacement/regeneration preserves its ID and position. Nullable attachment permits planning before generation. Post uses one image item; Carousel uses ordered image items; Reel one video; Story one image or video.
- `ContentReelScript` belongs to content and owns ordered stable `ContentReelBeat` rows. Script intended duration, requested item generation duration and actual asset duration are independent.
- All authoring writes lock/check the root revision transactionally. Child changes advance it; clients treat it as an opaque monotonic token. Database ownership/order/kind constraints complement aggregate validation.
- Generation snapshots item intent/settings and targets its stable ID. An internal intent token prevents late results overwriting replacement, changed direction/settings, conversion or newer generation. Unrelated caption edits do not invalidate output. Rejected attachments remain Library assets. Job progress does not change authoring revision; attachment does.
- MARKOS uses the same aggregate via stable-ID operations, atomic batches and idempotent receipts. Confirmation is bound to a destructive proposal and root revision. It cannot Ready/schedule/publish/delete Library assets. See [assistant contract](create-assistant-authoring-contract.md).
- Create serializes debounced text saves and immediate structural operations. It flushes before dependent actions, preserves newer local input and exposes recoverable conflicts. Assistant/Preview share the same editor state.
- Central readiness validates every active item and ordered publishing consumes that same set. Carousel requires 2–10 complete images and one shared caption. Story hides Caption, requires no caption and never sends it to Instagram. Other formats retain normal caption validation. Human Mark Ready can transition directly from Draft to Ready after those checks; the intermediate review status remains supported.
- Ordinary detach/delete does not delete reusable files. Physical content deletion cascades logical items, scripts/beats, jobs and conversations. Workspace erasure clears owned authoring/conversation execution data and soft-deletes assets.

## Migration and boundaries

The September 16 migrations intentionally discard disposable content test data. There is no backfill or dual-read/write path. Stop old application/worker writers before deployment, apply migrations, then run the matching API/AI/web/worker versions together. Do not apply this reset migration to valuable content without a separate preservation plan.

Bulk AI draft responses may contain creation-only structured input; the API immediately constructs relational rows. They are not the persisted authoring model. Historical migrations and dated audit records intentionally retain old names.

Local verification uses `markos_local_test`, deterministic providers and mocked Instagram transports. It does not establish hosted migration, paid generation or real Instagram publishing success.
