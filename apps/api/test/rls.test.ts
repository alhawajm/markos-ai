import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { prisma } from "../src/db/prisma";
import { withWorkspaceDbContext } from "../src/db/workspace-transaction";
import { buildApp } from "../src/http/app";

const rlsTables = [
  "workspaces",
  "workspace_members",
  "knowledge_vault",
  "knowledge_vault_history",
  "offering_catalogs",
  "offering_catalog_revisions",
  "offerings",
  "offering_revisions",
  "offering_document_analyses",
  "offering_document_files",
  "strategies",
  "content_calendars",
  "campaigns",
  "content_items",
  "media_assets",
  "instagram_analytics",
  "instagram_connection_credentials",
  "instagram_recent_media",
  "oauth_state_nonces",
  "ai_interactions",
  "subscriptions",
  "invoices",
  "payments",
  "usage_counters",
  "prompt_templates",
  "notifications",
  "audit_logs"
];

describe("database row-level security", () => {
  it("enables workspace policies on every workspace-scoped table", async () => {
    const policies = await prisma.$queryRaw<Array<{ tablename: string; policyname: string }>>`
      SELECT tablename, policyname
      FROM pg_policies
      WHERE schemaname = 'public'
        AND policyname LIKE '%_workspace_rls'
      ORDER BY tablename
    `;
    const tables = await prisma.$queryRaw<Array<{ relname: string; relrowsecurity: boolean }>>`
      SELECT relname, relrowsecurity
      FROM pg_class
      WHERE relkind = 'r'
        AND relname = ANY(${rlsTables})
      ORDER BY relname
    `;

    expect(tables).toHaveLength(rlsTables.length);
    expect(tables.every((table) => table.relrowsecurity)).toBe(true);
    expect(policies.map((policy) => policy.tablename).sort()).toEqual([...rlsTables].sort());
  });

  it("fails closed for the app role unless app.current_workspace is set", async () => {
    const first = await createWorkspace("first");
    const second = await createWorkspace("second");

    const firstItem = await prisma.contentItem.create({
      data: { workspaceId: first.workspaceId, contentType: "POST", hashtags: [], mediaIds: [] },
      select: { id: true }
    });
    await prisma.contentItem.create({
      data: { workspaceId: second.workspaceId, contentType: "POST", hashtags: [], mediaIds: [] },
      select: { id: true }
    });

    const noContextRows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE markos_app`;
      return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM content_items`;
    });

    const firstContextRows = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE markos_app`;
      await tx.$executeRaw`SELECT set_config('app.current_workspace', ${first.workspaceId}, true)`;
      return tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM content_items ORDER BY id`;
    });

    expect(noContextRows).toEqual([]);
    expect(firstContextRows).toEqual([{ id: firstItem.id }]);
  });

  it("applies WITH CHECK so app-role writes cannot cross workspaces", async () => {
    const first = await createWorkspace("first");
    const second = await createWorkspace("second");

    await withWorkspaceDbContext(first.workspaceId, async (tx) => {
      await tx.contentItem.create({
        data: { workspaceId: first.workspaceId, contentType: "POST", hashtags: [], mediaIds: [] },
        select: { id: true }
      });
    });

    await expect(
      withWorkspaceDbContext(first.workspaceId, async (tx) => {
        await tx.contentItem.create({
          data: { workspaceId: second.workspaceId, contentType: "POST", hashtags: [], mediaIds: [] },
          select: { id: true }
        });
      })
    ).rejects.toThrow();
  });

  it("grants the app role access to offering catalogue and document-analysis tables and enum types", async () => {
    const privileges = await prisma.$queryRaw<Array<{ table_name: string; privilege_type: string }>>`
      SELECT table_name, privilege_type
      FROM information_schema.role_table_grants
      WHERE grantee = 'markos_app'
        AND table_name = ANY(ARRAY[
          'offering_catalogs',
          'offering_catalog_revisions',
          'offerings',
          'offering_revisions',
          'offering_document_analyses',
          'offering_document_files'
        ])
    `;
    const typePrivileges = await prisma.$queryRaw<Array<{ type_name: string; has_usage: boolean }>>`
      SELECT type_name, has_type_privilege('markos_app', quote_ident(type_name), 'USAGE') AS has_usage
      FROM unnest(ARRAY[
        'OfferingKind',
        'OfferingStatus',
        'OfferingPriceType',
        'OfferingSourceType',
        'OfferingProjectionStatus',
        'OfferingDocumentAnalysisStatus'
      ]) AS types(type_name)
    `;

    for (const tableName of [
      "offering_catalogs",
      "offering_catalog_revisions",
      "offerings",
      "offering_revisions",
      "offering_document_analyses",
      "offering_document_files"
    ]) {
      expect(
        privileges
          .filter((row) => row.table_name === tableName)
          .map((row) => row.privilege_type)
          .sort()
      ).toEqual(["DELETE", "INSERT", "SELECT", "UPDATE"]);
    }
    expect(typePrivileges).toHaveLength(6);
    expect(typePrivileges.every((row) => row.has_usage)).toBe(true);
  });
});

async function createWorkspace(label: string): Promise<{ workspaceId: string }> {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `${label}-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: `${label} User`,
      workspaceName: `${label} Workspace ${randomUUID()}`,
      locale: "en"
    }
  });

  await app.close();

  return {
    workspaceId: response.json().data.workspace.id
  };
}
