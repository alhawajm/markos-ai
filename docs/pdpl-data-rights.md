# Bahrain PDPL Data Export And Erasure

Status date: 2026-08-16.

This runbook defines the M6 Bahrain PDPL data export and erasure verification gate for workspace-level data rights. Implementation and tests do not replace staging erasure evidence for a release candidate.

## Scope

MARKOS supports workspace-owner or workspace-admin initiated:

- Data export through `GET /v1/workspace/data-export`
- Data erasure through `POST /v1/workspace/data-erasure`

The routes require:

- `workspace:data:export` for export
- `workspace:data:erase` for erasure

Owners and workspace admins receive these permissions. Editors and viewers do not.

## Export

Request:

```bash
curl -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  http://localhost:4000/v1/workspace/data-export
```

The export returns JSON with:

- Workspace profile.
- Owner profile.
- Active workspace members.
- Vault records and Vault history.
- Strategies, calendars, campaigns, content items, and media assets.
- Instagram analytics.
- AI interactions.
- Subscriptions, invoices, payments, and usage counters.
- Prompt templates.
- Notifications.
- Workspace audit logs.

The response includes a `content-disposition` filename for evidence capture.

## Erasure

Request:

```bash
curl -X POST \
  -H "Authorization: Bearer <access-token>" \
  -H "X-Workspace-Id: <workspace-id>" \
  -H "Content-Type: application/json" \
  -d '{"confirm":"ERASE_WORKSPACE_DATA"}' \
  http://localhost:4000/v1/workspace/data-erasure
```

Erasure behavior:

- Soft-deletes workspace-owned operational tables that have `deletedAt`.
- Hard-deletes `usage_counters`, `knowledge_vault_history`, `instagram_recent_media`, `instagram_connection_credentials`, and `oauth_state_nonces`, because those records are not retained through the workspace soft-delete path.
- Clears the legacy Instagram account ID, access token, and token expiry fields from the workspace in addition to deleting the encrypted credential row.
- Soft-deletes workspace membership rows.
- Anonymizes the owner user only when the owner has no remaining active workspace memberships.
- Preserves audit logs as compliance evidence and writes `WORKSPACE_DATA_ERASED`.

The response includes per-table counts.

## Verification Evidence

Save:

- Export API response before erasure.
- Erasure API response with counts.
- Audit log row for `WORKSPACE_DATA_ERASED`.
- Database proof that active workspace rows have `deletedAt` or are removed where hard-delete is required.
- Proof that the erased workspace can no longer be accessed through normal workspace-authenticated routes.

## Automated Coverage

`apps/api/test/workspace.test.ts` verifies:

- Export is scoped to the active workspace and does not leak another workspace.
- Viewer access to export is rejected.
- Erasure requires the exact confirmation string.
- Erasure soft-deletes/hard-deletes expected workspace data.
- Sole-owner erasure anonymizes the user.
- Erasure writes audit evidence.

Current coverage does not explicitly assert deletion counts and post-erasure absence for all three Instagram-specific tables. Keep the implementation claim source-backed, and add focused assertions before treating the Instagram erasure path as release evidence.

Run:

```bash
corepack pnpm verify
corepack pnpm build
```
