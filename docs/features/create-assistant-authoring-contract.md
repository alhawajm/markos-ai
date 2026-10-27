# Create assistant authoring contract (Phase 3)

The assistant receives `MarkosAuthoringSnapshot`: the current root revision,
editable content fields, ordered logical media items, basic attached-file metadata,
and the content-owned Reel script and ordered beats. It receives no storage URLs,
generation-intent tokens, or publishing internals. Metadata is not visual input.

`assistantResultSchema` and Python `ConversationResult` replace the previous
whole-object `changes` response. A result contains `operations`, `generation`,
optional `conversion`, conversational `reply`, and `summary`.

- Operations target logical item/beat IDs. New objects declare a local reference
  such as `$slide2`; later operations in the same response can use it. The server
  resolves references to generated IDs. References cannot be reused or forward-referenced.
- Reorder operations contain the complete final ordered ID/reference list.
- Conversion, when requested, executes before other operations. An incompatible
  conversion may create a new slot whose ID is available in the next snapshot;
  subsequent work on that slot uses that returned ID, never a guessed UUID.
- Aspect ratios use the existing authoring enum: `SQUARE`, `PORTRAIT`, `VERTICAL`.
  Reel intended duration is independent of the media item's generation duration.
- No actions exist for Ready, scheduling, publishing, attaching arbitrary Library
  assets, or deleting Library assets. Story has no published-caption requirement.

## Atomicity and confirmation

The conversation run's base revision is the expected aggregate revision. The
server locks the root, applies operations through the existing aggregate services,
and saves the run receipt in the same transaction. Failure rolls back the entire
authoring batch. Generation is a separate execution phase after this commit.

Removing populated items, clearing script text, or destructive conversion creates
an `AWAITING_CONFIRMATION` receipt without applying any of the batch. The response
includes consequences and a server-issued token bound to that run, content, user,
and revision. Phase 4 should render this proposal and submit:

`POST /v1/content/:contentItemId/conversation/:runId/confirm`

```json
{"confirmationToken":"<returned token>","expectedRevision":42}
```

The server applies the stored proposal, not actions supplied by the confirmation
caller. Stale revisions and incorrect tokens are rejected. Repeating an accepted
acknowledgement returns the receipt without applying it again. Conversation text
or a model response cannot authorize confirmation.

## Execution receipts and retries

`ConversationRun.actionState` stores execution bookkeeping, not authoring data.
The existing `(conversationId, requestId)` key deduplicates conversation retries;
a locked run and atomic receipt prevent repeated model-result application.

Generation requests target resolved media-item IDs. Each dispatch is claimed in
the receipt before calling Phase 2 image generation or the durable video queue.
Duplicate targets in one response are rejected. Images remain synchronous; videos
remain queued jobs. Phase 2 guards attachment against superseded item intent.

An interrupted dispatch is not repeated automatically: its outcome becomes
`UNKNOWN` while previously saved edits remain saved. This deliberately chooses
at-most-once dispatch over risking another charged generation. Remaining requests
stop after a failed or superseded request; no automatic retry is implied.

`latestRun.actions.generation` distinguishes pending, dispatching, queued, running,
attached, Library-only, failed, and unknown outcomes. Reads refresh video outcomes
from their scoped jobs without modifying authoring revisions or dispatching work.
`SUCCEEDED` means the authoring/request execution finished, not necessarily that
a queued video finished. The one assistant message per run is updated with
server-produced execution text; model text cannot supply saved-action receipts.

The Create frontend, confirmation controls, autosave, and Assistant/Preview layout
remain Phase 4 work. This checkpoint does not enable those frontend journeys.
