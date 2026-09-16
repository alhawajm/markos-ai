# Create conversation backend

Current architecture: September 16, 2026. See [authoring invariants](create-authoring.md) and [targeted assistant contract](create-assistant-authoring-contract.md).

Each ContentItem owns one workspace-scoped conversation. The typed snapshot includes shared content, stable media-item IDs and creative fields, attached-file metadata, and content-owned Reel script/beats. Media bytes are not supplied: MARKOS cannot claim visual inspection.

Create flushes coordinated autosave before sending against the current root revision. A coherent targeted edit batch commits atomically through aggregate services. Replies confirm persistence only after success. New human input is preserved when assistant results arrive; conflicts require deliberate review.

ConversationRun persists request identity, base revision, lease, result and action receipts. Retries do not replay saved actions or generation dispatch. Destructive proposals require server-issued, revision-bound confirmation. Generation dispatch follows the successful edit transaction and reports queued, attached, Library-only, failed or unknown outcomes truthfully.

Ready, scheduling, publishing and underlying Library-asset deletion remain human-controlled. MARKOS cannot search/select Library assets or alter business knowledge through Create.

Workspace export includes conversation history and relational authoring state. Erasure removes conversations, runs/action receipts, scripts/beats and generation jobs, and soft-deletes content, logical items and assets. Physical content deletion cascades owned rows; ordinary draft deletion retains reusable Library assets and execution history.

The API-owned durable conversation processor and workspace access checks remain in place. The retired single-draft generate/revise/slot endpoints have been removed; bulk generation is a separate provider boundary that constructs relational aggregates, not a second editable representation.

## Historical verification

The following September 6 evidence describes the former interface, not the current authoring contract.

### September 6

- **API:** 87 focused cases passed across conversation (13), usage (8), content, Campaign, media, RLS and publishing. All persistent automated checks used loopback `markos_local_test`. Provider publishing transport was mocked; this is not live Instagram evidence.
- **AI service:** 31 unique cases passed across conversation, content provider and health tests. Provider responses were mocked or deterministic in these automated cases.
- **Browser:** 13 Create cases and three relevant Overview/Campaign/Calendar handoffs passed using system Chrome and fixture API responses. These cover saved history, refresh during an active run without resending, direct edits, explicit media controls, Save/Leave, preview layout and Arabic/RTL caption editing. Four draft-state unit cases also passed.
- **Live text:** a separate three-turn smoke check passed against the configured `gpt-5.6-terra` role: greeting without mutation, three alternatives without mutation, then applying the second option as one Arabic-first bilingual caption. Provider-call durations were 6.1, 4.8 and 4.6 seconds. This exercised the actual Python provider with fixture business context, not the complete authenticated browser-to-database journey.
- API, web, shared validation and API-client typechecks passed. Focused web ESLint, Python Ruff/mypy, source formatting and diff whitespace checks passed. No repository-wide suite was run.
- Both conversation migrations were applied to local `markos_local_test` and `markos`. Existing development data and volumes were preserved. Local web, API and AI health returned HTTP 200 after safe-mode startup. No hosted changes were made.
