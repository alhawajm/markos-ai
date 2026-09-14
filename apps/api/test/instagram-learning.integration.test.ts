import { randomUUID } from "node:crypto";
import { beforeEach, expect, it, vi } from "vitest";
import { describeInstagramDatabase } from "./helpers/instagram-database";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { getBusinessKnowledge, saveBusinessKnowledge } from "../src/business-profile/knowledge-service";
import {
  analyzeInstagramLearning,
  approveInstagramLearning,
  getInstagramLearning,
  skipInstagramLearning,
  startInstagramLearning
} from "../src/instagram-learning/service";
import { getContentToneLock } from "../src/content/content-service";
import { generateWorkspaceCampaign } from "../src/campaign/campaign-service";
import type { InstagramLearningSuggestion } from "@markos/shared-types";

const mocks = vi.hoisted(() => ({ collect: vi.fn(), generate: vi.fn(), campaign: vi.fn() }));
vi.mock("../src/config/env", async (original) => {
  const { env } = await original<typeof import("../src/config/env")>();
  return { env: { ...env, INSTAGRAM_ANALYTICS_SYNC_MODE: "live" } };
});
vi.mock("../src/workspace/instagram-connection-service", async (original) => ({
  ...(await original<typeof import("../src/workspace/instagram-connection-service")>()),
  getDecryptedCredential: async () => ({
    providerAccountId: "17840000001",
    username: "test_business",
    tokenExpiresAt: new Date(Date.now() + 600000),
    accessToken: "mock-token"
  })
}));
vi.mock("../src/instagram-learning/evidence", () => ({ collectInstagramEvidence: mocks.collect }));
vi.mock("../src/ai/instagram-learning-client", () => ({ generateInstagramLearning: mocks.generate }));
vi.mock("../src/ai/campaign-client", () => ({ generateCampaignPlan: mocks.campaign }));
vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({ embeddings: texts.map(() => [1, ...Array<number>(1535).fill(0)]) })
}));

const suggestions: InstagramLearningSuggestion[] = [
  { field: "voiceNotes", value: "  العربية أولاً\nThen English.  ", reasoning: "The captions use both languages.", sourcePostIds: ["post-1"] },
  {
    field: "contentDirection",
    value: "Show the preparation process alongside product introductions.",
    reasoning: "Process posts attracted more saves in the sample.",
    sourcePostIds: ["post-1"]
  }
];
beforeEach(() => {
  mocks.collect
    .mockReset()
    .mockResolvedValue({
      evidence: {
        accountId: "17840000001",
        username: "test_business",
        profile: {},
        discovered: 1,
        historyComplete: true,
        metricsCovered: 1,
        warnings: [],
        posts: [
          { id: "post-1", caption: "Owner post", mediaType: "REELS", timestamp: "2026-01-01T00:00:00Z", metrics: { likes: 0, saves: 2 }, selection: "LATEST" }
        ]
      },
      visuals: []
    });
  mocks.generate
    .mockReset()
    .mockResolvedValue({
      model: "mock-model",
      prompt_version: "test-v1",
      tokens_in: 10,
      tokens_out: 20,
      result: { summary: "Bilingual process content", limitations: ["Small sample"], suggestions }
    });
  mocks.campaign.mockReset().mockRejectedValue(new Error("STOP_AFTER_CONTEXT_CAPTURE"));
});

describeInstagramDatabase("Instagram learning approval", () => {
  it("keeps proposals outside Business Profile until one atomic approval, then grounds content and campaigns", async () => {
    const { app, workspaceId } = await setup();
    try {
      const before = await getBusinessKnowledge(workspaceId);
      const run = await startInstagramLearning(workspaceId);
      expect((await startInstagramLearning(workspaceId)).id).toBe(run.id);
      const ready = await analyzeInstagramLearning(workspaceId, run.id, "ar");
      expect(ready.status).toBe("READY");
      expect((await getBusinessKnowledge(workspaceId)).modules).toEqual(before.modules);
      expect(JSON.stringify((await getContentToneLock(workspaceId)).context)).not.toContain(suggestions[1]!.value);
      const approved = await approveInstagramLearning(workspaceId, run.id, { expectedVersion: ready.expectedVersion, changes: suggestions });
      expect(approved.status).toBe("APPROVED");
      const after = await getBusinessKnowledge(workspaceId);
      expect(after.version).toBe(before.version + 1);
      expect(after.modules.brand.voiceNotes).toBe(suggestions[0]!.value);
      expect(after.modules.brand.colors).toEqual(["#123456"]);
      expect(after.modules.objectives.currentPriority).toBe("Owner's current goal");
      expect(after.modules.objectives.contentDirection).toBe(suggestions[1]!.value);
      expect(after.approved).toBe(true);
      const grounding = await getContentToneLock(workspaceId);
      expect(grounding.lock.voiceNotes).toBe(suggestions[0]!.value);
      expect(grounding.context.some((chunk) => chunk.value.contentDirection === suggestions[1]!.value)).toBe(true);
      await expect(
        generateWorkspaceCampaign(workspaceId, { locale: "en", durationDays: 3, publishesPerDay: 1, startsAt: new Date().toISOString(), objective: "Launch" })
      ).rejects.toThrow("STOP_AFTER_CONTEXT_CAPTURE");
      expect(JSON.stringify(mocks.campaign.mock.calls[0]?.[0].context)).toContain(suggestions[1]!.value);
      await approveInstagramLearning(workspaceId, run.id, { expectedVersion: ready.expectedVersion, changes: suggestions });
      expect((await getBusinessKnowledge(workspaceId)).version).toBe(after.version);
      const calls = mocks.generate.mock.calls.length;
      expect((await analyzeInstagramLearning(workspaceId, run.id, "ar")).status).toBe("APPROVED");
      expect(mocks.generate).toHaveBeenCalledTimes(calls);
    } finally {
      await app.close();
    }
  });
  it("rolls back all selected fields when one is invalid and preserves the proposal", async () => {
    const { app, workspaceId } = await setup();
    try {
      const run = await startInstagramLearning(workspaceId);
      await analyzeInstagramLearning(workspaceId, run.id, "en");
      const before = await getBusinessKnowledge(workspaceId);
      await expect(
        approveInstagramLearning(workspaceId, run.id, {
          expectedVersion: run.expectedVersion,
          changes: [
            { field: "voiceNotes", value: "Valid proposed edit" },
            { field: "contentDirection", value: ["Wrong shape"] }
          ]
        })
      ).rejects.toThrow();
      expect((await getBusinessKnowledge(workspaceId)).modules).toEqual(before.modules);
      expect((await getBusinessKnowledge(workspaceId)).version).toBe(before.version);
      expect((await getInstagramLearning(workspaceId))?.status).toBe("READY");
    } finally {
      await app.close();
    }
  });
  it("rejects another workspace's run and stale revisions", async () => {
    const first = await setup();
    const second = await setup();
    try {
      const run = await startInstagramLearning(first.workspaceId);
      await analyzeInstagramLearning(first.workspaceId, run.id, "en");
      expect(await getInstagramLearning(second.workspaceId)).toBeNull();
      await expect(approveInstagramLearning(second.workspaceId, run.id, { expectedVersion: run.expectedVersion, changes: suggestions })).rejects.toMatchObject({
        statusCode: 404
      });
      await saveBusinessKnowledge(first.workspaceId, { expectedVersion: run.expectedVersion, module: "brand", changes: { voiceNotes: "New owner wording" } });
      await expect(approveInstagramLearning(first.workspaceId, run.id, { expectedVersion: run.expectedVersion, changes: suggestions })).rejects.toMatchObject({
        code: "KNOWLEDGE_REVISION_CONFLICT"
      });
      expect((await getBusinessKnowledge(first.workspaceId)).modules.brand.voiceNotes).toBe("New owner wording");
    } finally {
      await first.app.close();
      await second.app.close();
    }
  });
  it("supports skipping without writing facts and reports provider failure truthfully", async () => {
    const { app, workspaceId } = await setup();
    try {
      const before = await getBusinessKnowledge(workspaceId);
      const run = await startInstagramLearning(workspaceId);
      mocks.generate.mockRejectedValueOnce(new Error("provider failed"));
      expect((await analyzeInstagramLearning(workspaceId, run.id, "en")).status).toBe("FAILED");
      expect((await getBusinessKnowledge(workspaceId)).modules).toEqual(before.modules);
      expect((await skipInstagramLearning(workspaceId, run.id)).status).toBe("SKIPPED");
      expect((await getBusinessKnowledge(workspaceId)).version).toBe(before.version);
    } finally {
      await app.close();
    }
  });
});

async function setup() {
  const app = await buildApp();
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `ig-learning-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Test owner",
      workspaceName: `Learning ${randomUUID()}`,
      locale: "en"
    }
  });
  expect(response.statusCode).toBe(201);
  const session = response.json().data;
  const workspaceId = session.workspace.id as string;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  await prisma.workspace.update({ where: { id: workspaceId }, data: { onboardingStatus: "COMPLETE" } });
  await saveBusinessKnowledge(workspaceId, { expectedVersion: 0, module: "company", changes: { name: "Owner business" } });
  await saveBusinessKnowledge(workspaceId, { expectedVersion: 1, module: "brand", changes: { voiceNotes: "Owner wording", colors: ["#123456"] } });
  await saveBusinessKnowledge(workspaceId, { expectedVersion: 2, module: "objectives", changes: { currentPriority: "Owner's current goal" } });
  return { app, workspaceId };
}
