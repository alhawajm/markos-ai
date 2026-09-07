# Create conversation backend

Status: implemented for the private development stage, September 6, 2026.

## Product behavior

Each ContentItem has one workspace-owned conversation. Create, Campaign and Calendar entry points use that same post identity. Opening a blank Create page creates nothing; its first sent message saves a draft and creates the conversation. Messages survive refresh and reopening.

MARKOS can discuss ideas, ask questions, offer alternatives, and apply clearly requested text edits. Suggestions stay in the conversation until selected. The editable fields are the unified caption, brief, visual direction, carousel text and Reel script. Format and media changes use their existing controls. Ready, Return to Draft, scheduling, publishing, deletion and Business Profile edits remain explicit owner actions enforced by application code.

Sending saves outstanding manual edits first. A successful AI edit saves automatically. Leave/Discard affects unsaved manual fields, not sent messages or already saved AI changes. The user can leave while a submitted conversation run continues. Routine feedback does not shift the page.

## Persistence and processing

- `ContentConversation` links a post and workspace and stores a compact conversation summary.
- `ConversationMessage` stores ordered user and assistant messages, linked to their run. The run identifies the author.
- `ConversationRun` persists the client request ID, user, instruction, locale, base revision, state, lease, result and sanitized failure code. A partial unique index permits one queued/running request per conversation. A duplicate request returns the same run; reusing its ID with different input is rejected.
- An API-owned processor checks the durable queue every 750 ms. It operates independently of the browser request and does not start the broader maintenance worker. Multiple API instances claim runs conditionally. Each instance executes one conversation run at a time.
- Queued work survives an API restart. Expired in-progress work becomes visibly interrupted without automatically repeating an ambiguous provider request. A late result cannot commit after losing its lease. New user messages can retry failed work deliberately.
- The browser loads conversation state on opening and polls every two seconds. It preserves unsaved fields while receiving background updates. Replies are displayed as successful edits only after the database transaction commits. Streaming tokens is deferred.

## Content safety and context

`ContentItem.revision` increments in a PostgreSQL trigger for every write, including media and publishing workers. Create sends its baseline revision when saving and reviewing. An AI edit applies only to the exact revision it read, while the post is editable. A conflict leaves newer content intact and retains the result; the owner can inspect an unapplied caption. This is concurrency protection, not an Undo/history feature.

The older generate/revise endpoints also compare their input revision when applying results. Unversioned older clients retain request-time checks; Create supplies the explicit revision to detect stale browser drafts. Full immutable publication snapshots remain separate publishing work.

The AI receives the latest saved post, recent messages, an updated compact summary, approved profile/tone context, active offerings and Campaign intent. The current draft takes precedence over historical text. Context retrieval currently includes up to eight profile entries, twenty offerings and twenty recent messages; the offerings list is flagged when it may be partial. Chat statements never automatically update business knowledge. Media bytes are not supplied, so the assistant cannot claim visual inspection.

The Python service uses the existing configured text model and Responses structured-output integration, with prompt `create-conversation.v1`. A typical turn uses one model call returning a reply, allowed field changes or null, and an updated summary. Both services validate the result. The conversation provider disables automatic SDK retries. Safe local mode gives deterministic, explicitly limited replies; natural conversation edits require live text mode.

Every new table has workspace RLS and restricted-role grants. Database triggers reject child records linked to another workspace or conversation. The processor rechecks the author's membership and write permission before applying a result. Conversation data participates in workspace export and erasure. No provider credentials or signed media URLs are stored in conversation records.

## Commercial restrictions

Khalid deferred commercial quotas and billing eligibility gates until functionality is established. Existing counters remain diagnostic; they no longer block AI, Campaigns, storage or publication because of a MARKOS allowance, trial expiry or plan status. The old frontend Campaign quota simulation is removed. No replacement billing or cost-reporting system is introduced. Provider-imposed constraints and content/media validation remain operational requirements.

## Migration and remaining work

Migrations `20260906170000_content_conversations` and `20260906171000_conversation_access` add conversations, revision protection, persisted visual direction, interaction provenance and access constraints. They were applied to local `markos_local_test` and `markos`, preserving existing records. No hosted migration, deployment or reset was performed.

Media generation through chat, Campaign plan editing/stable idea records, immutable publication snapshots, Business Profile conversation, transcript pagination, streaming, mobile design and the learning loop remain future work. The summary is conversational context and is not a learned business preference.

## Verification — September 6

- **API:** 87 focused cases passed across conversation (13), usage (8), content, Campaign, media, RLS and publishing. All persistent automated checks used loopback `markos_local_test`. Provider publishing transport was mocked; this is not live Instagram evidence.
- **AI service:** 31 unique cases passed across conversation, content provider and health tests. Provider responses were mocked or deterministic in these automated cases.
- **Browser:** 13 Create cases and three relevant Overview/Campaign/Calendar handoffs passed using system Chrome and fixture API responses. These cover saved history, refresh during an active run without resending, direct edits, explicit media controls, Save/Leave, preview layout and Arabic/RTL caption editing. Four draft-state unit cases also passed.
- **Live text:** a separate three-turn smoke check passed against the configured `gpt-5.6-terra` role: greeting without mutation, three alternatives without mutation, then applying the second option as one Arabic-first bilingual caption. Provider-call durations were 6.1, 4.8 and 4.6 seconds. This exercised the actual Python provider with fixture business context, not the complete authenticated browser-to-database journey.
- API, web, shared validation and API-client typechecks passed. Focused web ESLint, Python Ruff/mypy, source formatting and diff whitespace checks passed. No repository-wide suite was run.
- Both conversation migrations were applied to local `markos_local_test` and `markos`. Existing development data and volumes were preserved. Local web, API and AI health returned HTTP 200 after safe-mode startup. No hosted changes were made.
