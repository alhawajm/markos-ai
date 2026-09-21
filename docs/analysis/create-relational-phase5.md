# Create relational migration — final integration gate

September 16, 2026. Completes Phases 1–4; their dated reports remain historical checkpoints. Current invariants: [Create authoring](../features/create-authoring.md).

## Cleanup

Removed retired single-draft generate/revise/slot endpoints, their schemas/client methods, the asset-ID Carousel helper and obsolete explicit-Save state helpers. Migrated workspace readiness, export/erasure, API fixtures, RLS inventories and browser handoff fixtures. Bulk provider draft input remains only a creation boundary that constructs relational rows.

Integration fixes: Delete now flushes and sends the current revision through the serialized coordinator; aggregate route errors retain their structured codes; the existing Campaign helper supplies revisions; explicit human Mark Ready supports Draft → Ready with centralized media/caption validation. Scheduled deletion still requires cancellation.

Tests establish physical child/job/conversation cascades, reusable-asset retention on ordinary deletion, relational export and workspace erasure of scripts/beats/jobs/action receipts. No compatibility path, new feature, live provider operation or visual redesign was added.

## Verification

- Fresh loopback `markos_local_test`: database initialization, all migrations, seed; repeated seed, migration status and Prisma validation.
- `pnpm verify`: 32 tasks passed, including format/RTL checks, shared/API/web/AI typechecks, lint, 525 API tests (61 files), 72 web tests (13 files), and 77 Python tests. API compilation includes the worker.
- `pnpm build`: all nine tasks passed, including production Next.js build and API/AI checks.
- Focused cleanup and regression tests passed before the final gate.
- System Chrome against the built local web application with mocked API: six Create journeys and two Campaign/Calendar handoffs passed. No screenshots or broad visual audit. Temporary web server stopped afterward.

The first broad gate exposed legacy fixtures and one Python fixture annotation; failed targets were repaired before the final complete gate. No known schema-break/type/test failures remain.

## Deployment boundary

Review-ready locally. Hosted deployment and live OpenAI/Instagram behavior have not been exercised in this phase. The intentional reset migration deletes disposable content; deploy API, AI, web and worker together after stopping old writers and applying migrations. No extra external test was needed for repository verification. An operator-controlled staging generation/publish smoke remains deployment evidence, not something these mocked tests prove.

No push or hosted change was performed.
