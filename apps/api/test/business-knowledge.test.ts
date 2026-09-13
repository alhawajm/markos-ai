import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { indexVaultEntries, searchVaultContext } from "../src/vault/vault-service";
import { getBusinessKnowledge, saveBusinessKnowledge } from "../src/business-profile/knowledge-service";

const { embed } = vi.hoisted(() => ({ embed: vi.fn() }));
vi.mock("../src/ai/embeddings-client", () => ({ embedVaultTexts: embed }));
beforeEach(() => {
  embed.mockReset().mockImplementation(async (texts: string[]) => ({ embeddings: texts.map(() => [1, ...Array<number>(1535).fill(0)]) }));
});

describe("business knowledge maintenance", () => {
  it("saves exact facts without AI, preserves completed onboarding and protects revisions and historical content", async () => {
    const { app, session, headers } = await setup();
    const historical = await prisma.aiInteraction.create({
      data: {
        workspaceId: session.workspace.id,
        agent: "ONBOARDING_PROFILE_RESOLVER",
        promptVersion: "test",
        prompt: {},
        response: { approvedProfile: { businessName: "Historical name" } },
        model: "test",
        tokensIn: 0,
        tokensOut: 0,
        costMinor: 0
      }
    });
    embed.mockRejectedValue(new Error("Embedding service unavailable"));
    const value = "  Owner wording: Bahrain / البحرين\nSecond line.  ";
    const result = await app.inject({
      method: "PATCH",
      url: "/v1/business-profile",
      headers,
      payload: { expectedVersion: 0, module: "company", changes: { name: "Owner business", description: value, establishment: "ESTABLISHED" } }
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().data).toMatchObject({ approved: true, version: 1, modules: { company: { description: value } } });
    expect(embed).not.toHaveBeenCalled();
    const chunks = await searchVaultContext(session.workspace.id, { query: "business", topK: 10 });
    expect(chunks.some((chunk) => chunk.value.description === value)).toBe(true);
    expect(chunks.some((chunk) => chunk.key === "authoritative-profile")).toBe(false);
    expect((await app.inject({ method: "GET", url: "/v1/onboarding", headers })).json().data).toMatchObject({
      status: "COMPLETE",
      businessProfile: { status: "APPROVED", profile: { businessName: "Owner business" } }
    });
    const conflict = await app.inject({
      method: "PATCH",
      url: "/v1/business-profile",
      headers,
      payload: { expectedVersion: 0, module: "company", changes: { name: "Stale overwrite" } }
    });
    expect(conflict.statusCode).toBe(409);
    expect((await prisma.aiInteraction.findUniqueOrThrow({ where: { id: historical.id } })).response).toEqual(historical.response);
    await app.close();
  });

  it("keeps focused edits atomic, clears optional brand data, and preserves fields omitted by onboarding", async () => {
    const { app, session, headers } = await setup();
    await saveBusinessKnowledge(session.workspace.id, {
      module: "company",
      expectedVersion: 0,
      changes: { name: "Owner business", industry: "Bakery", website: "https://example.com", languages: ["ar", "en"] }
    });
    await saveBusinessKnowledge(session.workspace.id, { module: "brand", expectedVersion: 1, changes: { colors: ["#123456"], toneWords: ["Warm"] } });
    await saveBusinessKnowledge(session.workspace.id, { module: "brand", expectedVersion: 2, changes: { colors: [], toneWords: [] } });
    expect(await prisma.knowledgeVault.count({ where: { workspaceId: session.workspace.id, section: { in: ["BRAND", "TONE"] }, deletedAt: null } })).toBe(0);
    const invalid = await app.inject({
      method: "PATCH",
      url: "/v1/business-profile",
      headers,
      payload: { module: "company", expectedVersion: 3, changes: { name: "Changed", website: "bad url" } }
    });
    expect(invalid.statusCode).toBe(400);
    expect((await getBusinessKnowledge(session.workspace.id)).modules.company.name).toBe("Owner business");
    const edited = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company?preserveApprovedProfile=true",
      headers,
      payload: { name: "Updated from onboarding" }
    });
    expect(edited.statusCode).toBe(200);
    expect((await getBusinessKnowledge(session.workspace.id)).modules.company).toMatchObject({
      name: "Updated from onboarding",
      website: "https://example.com",
      languages: ["ar", "en"]
    });
    const cleared = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company?preserveApprovedProfile=true",
      headers,
      payload: { name: "Updated from onboarding", clearFields: ["industry"] }
    });
    expect(cleared.statusCode).toBe(200);
    const afterClear = await getBusinessKnowledge(session.workspace.id);
    expect(afterClear.modules.company.industry).toBeUndefined();
    expect(afterClear.modules.company.website).toBe("https://example.com");
    const invalidClear = await app.inject({
      method: "PUT",
      url: "/v1/onboarding/company",
      headers,
      payload: { name: "Should not save", clearFields: ["name"] }
    });
    expect(invalidClear.statusCode).toBe(400);
    const bypass = await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers,
      payload: { entries: [{ key: "profile", value: { name: "Bypass" } }] }
    });
    expect(bypass.statusCode).toBe(409);
    await app.close();
  });

  it("serializes concurrent owner saves and ignores embeddings from an older revision", async () => {
    const { app, session } = await setup();
    const results = await Promise.allSettled(
      ["First owner", "Second owner"].map((name) => saveBusinessKnowledge(session.workspace.id, { expectedVersion: 0, module: "company", changes: { name } }))
    );
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    const before = (await app.inject({ method: "GET", url: "/v1/vault/company", headers: { authorization: `Bearer ${session.tokens.accessToken}` } })).json()
      .data[0];
    await saveBusinessKnowledge(session.workspace.id, { expectedVersion: 1, module: "company", changes: { name: "Latest owner" } });
    await indexVaultEntries([before]);
    const rows = await prisma.$queryRaw<
      Array<{ unindexed: boolean }>
    >`SELECT embedding IS NULL AS unindexed FROM knowledge_vault WHERE id = ${before.id}::uuid`;
    expect(rows[0]?.unindexed).toBe(true);
    await app.close();
  });

  it("renames by stable ID, keeps price types, excludes paused offerings, and rejects cross-workspace edits", async () => {
    const { app, session, headers } = await setup();
    const offering = {
      kind: "SERVICE",
      name: "Consultation",
      priceType: "RANGE",
      minPriceMinor: 10000,
      maxPriceMinor: 20000,
      currency: "BHD",
      status: "ACTIVE"
    };
    const created = await app.inject({ method: "PUT", url: "/v1/business-profile/offerings", headers, payload: { expectedVersion: 0, offering } });
    expect(created.statusCode).toBe(200);
    const catalog = created.json().data.catalog;
    const id = catalog.offerings[0].id;
    const changed = await app.inject({
      method: "PUT",
      url: "/v1/business-profile/offerings",
      headers,
      payload: { expectedVersion: catalog.version, id, offering: { ...offering, name: "Private consultation", status: "PAUSED" } }
    });
    expect(changed.statusCode).toBe(200);
    expect(changed.json().data.catalog.offerings[0]).toMatchObject({ id, name: "Private consultation", priceType: "RANGE", minPriceMinor: 10000, version: 2 });
    const projections = await prisma.knowledgeVault.findMany({ where: { workspaceId: session.workspace.id, section: "PRODUCTS", deletedAt: null } });
    expect(JSON.stringify(projections)).not.toContain("Private consultation");
    const other = await setup();
    const denied = await other.app.inject({
      method: "PUT",
      url: "/v1/business-profile/offerings",
      headers: other.headers,
      payload: { expectedVersion: 0, id, offering }
    });
    expect(denied.statusCode).toBe(409);
    expect((await getBusinessKnowledge(other.session.workspace.id)).catalog).toBeNull();
    await other.app.close();
    await app.close();
  });
});

async function setup() {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `knowledge-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Profile owner",
      workspaceName: `Knowledge ${randomUUID()}`,
      locale: "en"
    }
  });
  expect(response.statusCode).toBe(201);
  const session = response.json().data;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  await prisma.workspace.update({ where: { id: session.workspace.id }, data: { onboardingStatus: "COMPLETE" } });
  return { app, session, headers: { authorization: `Bearer ${session.tokens.accessToken}` } };
}
