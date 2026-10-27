import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { saveBusinessKnowledge } from "../src/business-profile/knowledge-service";

vi.mock("../src/ai/embeddings-client", () => ({ embedVaultTexts: vi.fn().mockRejectedValue(new Error("offline indexing")) }));

async function setup() {
  const app = await buildApp();
  const registered = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `history-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "History owner",
      workspaceName: "History workspace",
      locale: "en"
    }
  });
  expect(registered.statusCode).toBe(201);
  const session = registered.json().data;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  await prisma.workspace.update({ where: { id: session.workspace.id }, data: { onboardingStatus: "COMPLETE" } });
  return { app, session, headers: { authorization: `Bearer ${session.tokens.accessToken}` } };
}

describe("reviewing business profile versions", () => {
  it("returns only the selected module, folds unchanged snapshots and restores through the canonical writer", async () => {
    const { app, session, headers } = await setup();
    try {
      await saveBusinessKnowledge(session.workspace.id, {
        expectedVersion: 0,
        module: "company",
        changes: { name: "Original business", description: "Exact wording / البحرين" }
      });
      await saveBusinessKnowledge(session.workspace.id, { expectedVersion: 1, module: "story", changes: { origin: "A story that stays current" } });
      await saveBusinessKnowledge(session.workspace.id, { expectedVersion: 2, module: "company", changes: { name: "Updated business" } });
      const response = await app.inject({ method: "GET", url: "/v1/business-profile/history/company", headers });
      expect(response.statusCode).toBe(200);
      const rows = response.json().data;
      expect(rows).toHaveLength(2);
      expect(rows[0]).toMatchObject({ version: 3, values: { name: "Updated business" } });
      expect(rows[1]).toMatchObject({ version: 2, values: { name: "Original business", description: "Exact wording / البحرين" } });
      expect(response.body).not.toContain("A story that stays current");
      expect(response.body).not.toContain("interactionId");
      const restored = await app.inject({
        method: "PATCH",
        url: "/v1/business-profile",
        headers,
        payload: { expectedVersion: 3, module: "company", changes: rows[1].values }
      });
      expect(restored.statusCode).toBe(200);
      expect(restored.json().data).toMatchObject({
        version: 4,
        modules: { company: { name: "Original business" }, story: { origin: "A story that stays current" } }
      });
      const projection = await prisma.knowledgeVault.findFirstOrThrow({
        where: { workspaceId: session.workspace.id, section: "COMPANY", key: "profile", deletedAt: null }
      });
      expect(projection.value).toMatchObject({ name: "Original business" });
      const stale = await app.inject({
        method: "PATCH",
        url: "/v1/business-profile",
        headers,
        payload: { expectedVersion: 3, module: "company", changes: rows[0].values }
      });
      expect(stale.statusCode).toBe(409);
      expect(stale.json().error.code).toBe("KNOWLEDGE_REVISION_CONFLICT");
    } finally {
      await app.close();
    }
  });

  it("keeps history isolated and rejects unsupported modules and anonymous reads", async () => {
    const first = await setup(),
      second = await setup();
    try {
      await saveBusinessKnowledge(first.session.workspace.id, { expectedVersion: 0, module: "company", changes: { name: "Private first workspace" } });
      const own = await first.app.inject({ method: "GET", url: "/v1/business-profile/history/company", headers: first.headers });
      expect(own.json().data).toHaveLength(1);
      const foreign = await second.app.inject({ method: "GET", url: "/v1/business-profile/history/company", headers: second.headers });
      expect(foreign.statusCode).toBe(200);
      expect(foreign.json().data).toEqual([]);
      expect((await second.app.inject({ method: "GET", url: "/v1/business-profile/history/products", headers: second.headers })).statusCode).toBe(400);
      expect((await first.app.inject({ method: "GET", url: "/v1/business-profile/history/company" })).statusCode).toBe(401);
    } finally {
      await first.app.close();
      await second.app.close();
    }
  });
});
