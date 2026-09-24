import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { env } from "../src/config/env";
import { processCampaignGenerations, queueCampaignGeneration, readCampaignGeneration } from "../src/campaign/campaign-generation-service";
import { AiServiceRequestError } from "../src/ai/request";
import { createContentAggregate } from "../src/content/content-aggregate";

const provider = vi.hoisted(() => vi.fn());
vi.mock("../src/ai/campaign-client", () => ({ generateCampaignPlan: provider }));
vi.mock("../src/vault/vault-service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getVaultScore: async () => ({ entryCount: 1 }),
  searchVaultContext: async () => []
}));
vi.mock("../src/content/content-service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  getContentToneLock: async () => ({ context: [] })
}));
vi.mock("../src/prompts/prompt-service", async (importOriginal) => ({
  ...(await importOriginal<object>()),
  selectPromptTemplateForRun: async () => undefined
}));

// Refuse to run these persistence tests against an ordinary or hosted database.
const db = new URL(process.env.DATABASE_URL!);
if (db.hostname !== "localhost" || db.pathname !== "/markos_mobile_jobs_test")
  throw new Error("Use the named local disposable database markos_mobile_jobs_test");
const input = {
  objective: "Blooms event",
  description: "Pink flowers and Arabic typography",
  durationDays: 3 as const,
  publishesPerDay: 1,
  startsAt: "2026-10-04T00:00:00.000Z",
  locale: "en" as const,
  referenceFiles: [{ filename: "event.txt", mimeType: "text/plain" as const, base64Data: Buffer.from("Event details تفاصيل الفعالية").toString("base64") }]
};
function output() {
  return {
    model: "test-model",
    prompt_version: "test.v1",
    tokens_in: 12,
    tokens_out: 34,
    campaign: {
      summary: "Event campaign",
      referenceSummary: "Pink flowers; event details",
      durationDays: 3,
      publishesPerDay: 1,
      objectives: ["Awareness"],
      pillars: [],
      weeklyCadence: [],
      kpis: [],
      risks: [],
      nextActions: []
    }
  };
}
async function fixture() {
  const user = await prisma.user.create({ data: { email: `${randomUUID()}@jobs.markos.test`, fullName: "Campaign Job Test", isVerified: true } });
  const workspace = await prisma.workspace.create({ data: { ownerUserId: user.id, name: "Job Test", slug: randomUUID() } });
  await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
  const token = await new SignJWT({ workspaceId: workspace.id, roles: ["OWNER"] })
    .setProtectedHeader({ alg: "HS256" })
    .setSubject(user.id)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(new TextEncoder().encode(env.JWT_ACCESS_SECRET));
  return { userId: user.id, workspaceId: workspace.id, headers: { authorization: `Bearer ${token}` } };
}
beforeEach(() => {
  provider.mockReset().mockResolvedValue(output());
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("durable campaign generation", () => {
  it("requires explicit readiness and the reviewed revision before scheduling, and scopes schedule changes", async () => {
    const f = await fixture();
    const other = await fixture();
    const app = await buildApp();
    const draft = await prisma.$transaction((tx) =>
      createContentAggregate(tx, f.workspaceId, { platform: "INSTAGRAM", contentType: "POST", caption: "Reviewed event caption" })
    );
    const scheduledAt = new Date(Math.ceil((Date.now() + 86400_000) / 1800_000) * 1800_000).toISOString();
    const url = `/v1/content/${draft.id}`;
    expect(
      (await app.inject({ method: "POST", url: `${url}/schedule`, headers: f.headers, payload: { scheduledAt, expectedRevision: draft.revision } })).statusCode
    ).toBe(409);
    expect(
      (await app.inject({ method: "POST", url: `${url}/status`, headers: f.headers, payload: { status: "APPROVED", expectedRevision: draft.revision } }))
        .statusCode
    ).toBe(409);
    const media = await prisma.mediaAsset.create({
      data: {
        workspaceId: f.workspaceId,
        type: "IMAGE",
        filename: "event.jpg",
        s3Key: "fixture/event.jpg",
        cdnUrl: "https://example.test/event.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 10
      }
    });
    const attached = await app.inject({
      method: "POST",
      url: `${url}/media`,
      headers: f.headers,
      payload: { contentMediaItemId: draft.mediaItems[0]!.id, mediaAssetId: media.id, expectedRevision: draft.revision }
    });
    expect(attached.statusCode).toBe(200);
    const ready = await app.inject({
      method: "POST",
      url: `${url}/status`,
      headers: f.headers,
      payload: { status: "APPROVED", expectedRevision: attached.json().data.revision }
    });
    expect(ready.statusCode).toBe(200);
    expect(
      (await app.inject({ method: "POST", url: `${url}/schedule`, headers: f.headers, payload: { scheduledAt, expectedRevision: draft.revision } })).json()
        .error.code
    ).toBe("CONTENT_REVISION_CONFLICT");
    const scheduled = await app.inject({
      method: "POST",
      url: `${url}/schedule`,
      headers: f.headers,
      payload: { scheduledAt, expectedRevision: ready.json().data.revision }
    });
    expect(scheduled.statusCode).toBe(200);
    expect(scheduled.json().data.status).toBe("SCHEDULED");
    expect((await app.inject({ method: "POST", url: `${url}/reschedule`, headers: other.headers, payload: { scheduledAt } })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "POST", url: `${url}/reschedule`, headers: f.headers, payload: { scheduledAt, expectedRevision: draft.revision } })).json()
        .error.code
    ).toBe("CONTENT_REVISION_CONFLICT");
    const cancelled = await app.inject({ method: "POST", url: `${url}/unschedule`, headers: f.headers, payload: {} });
    expect(cancelled.statusCode).toBe(200);
    expect(cancelled.json().data.status).toBe("APPROVED");
    expect(await prisma.publishJob.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    await app.close();
  });
  it("accepts once, returns immediately, survives closing the request server and commits one campaign plus receipt", async () => {
    const f = await fixture();
    const app = await buildApp();
    const requestId = randomUUID();
    const submit = () =>
      app.inject({ method: "POST", url: "/v1/campaigns/generations", headers: { ...f.headers, "idempotency-key": requestId }, payload: input });
    const responses = await Promise.all([submit(), submit()]);
    expect(responses.map((r) => r.statusCode)).toEqual([202, 202]);
    expect(responses[0]!.json().data.id).toBe(responses[1]!.json().data.id);
    expect(provider).not.toHaveBeenCalled();
    expect(JSON.stringify(responses[0]!.json())).not.toContain("base64Data");
    await app.close();
    await Promise.all([processCampaignGenerations(f.workspaceId), processCampaignGenerations(f.workspaceId)]);
    const job = await readCampaignGeneration(f.workspaceId, requestId);
    expect(job.status).toBe("COMPLETED");
    expect(provider).toHaveBeenCalledTimes(1);
    expect(await prisma.campaign.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    expect(await prisma.campaignGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ input: null, campaignId: job.campaignId });
    expect(await queueCampaignGeneration(f.workspaceId, f.userId, requestId, input)).toEqual(job);
    expect(await prisma.aiInteraction.findFirst({ where: { workspaceId: f.workspaceId } })).toMatchObject({ tokensIn: 12, tokensOut: 34 });
    expect(await prisma.usageCounter.findFirst({ where: { workspaceId: f.workspaceId, metric: "AI_GENERATION" } })).toMatchObject({ used: 1n });
  });

  it("isolates status and payload by workspace, rejects changed briefs and enforces SQL RLS", async () => {
    const a = await fixture();
    const b = await fixture();
    const requestId = randomUUID();
    const app = await buildApp();
    const job = await queueCampaignGeneration(a.workspaceId, a.userId, requestId, input);
    expect((await app.inject({ method: "GET", url: `/v1/campaigns/generations/${requestId}`, headers: b.headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "GET", url: "/v1/campaigns/generations", headers: b.headers })).json().data).toEqual([]);
    await expect(queueCampaignGeneration(a.workspaceId, a.userId, requestId, { ...input, description: "Changed" })).rejects.toMatchObject({
      code: "CAMPAIGN_REQUEST_MISMATCH"
    });
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE markos_app");
      await tx.$executeRaw`SELECT set_config('app.current_workspace', ${b.workspaceId}, true)`;
      expect(await tx.campaignGenerationJob.findMany({ where: { id: job.id } })).toEqual([]);
      expect((await tx.campaignGenerationJob.updateMany({ where: { id: job.id }, data: { status: "FAILED" } })).count).toBe(0);
    });
    await app.close();
  });

  it("never replays interrupted provider calls and clears temporary document bytes", async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const job = await queueCampaignGeneration(f.workspaceId, f.userId, requestId, input);
    await prisma.campaignGenerationJob.update({ where: { id: job.id }, data: { status: "RUNNING", leaseExpiresAt: new Date(0) } });
    await processCampaignGenerations(f.workspaceId);
    expect(await readCampaignGeneration(f.workspaceId, requestId)).toMatchObject({ status: "FAILED", errorCode: "CAMPAIGN_INTERRUPTED" });
    expect(provider).not.toHaveBeenCalled();
    expect(await prisma.campaignGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ input: null });
    expect(await queueCampaignGeneration(f.workspaceId, f.userId, requestId, input)).toMatchObject({ status: "FAILED" });
  });

  it("rejects stale completion and removed access without creating a campaign", async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const job = await queueCampaignGeneration(f.workspaceId, f.userId, requestId, input);
    provider.mockImplementationOnce(async () => {
      await prisma.campaignGenerationJob.update({ where: { id: job.id }, data: { status: "FAILED", errorCode: "CAMPAIGN_INTERRUPTED", input: Prisma.DbNull } });
      return output();
    });
    await processCampaignGenerations(f.workspaceId);
    expect(await prisma.campaign.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    const another = await queueCampaignGeneration(f.workspaceId, f.userId, randomUUID(), input);
    await prisma.workspaceMember.updateMany({ where: { workspaceId: f.workspaceId }, data: { deletedAt: new Date() } });
    await processCampaignGenerations(f.workspaceId);
    expect(await readCampaignGeneration(f.workspaceId, another.requestId)).toMatchObject({ status: "FAILED", errorCode: "CAMPAIGN_ACCESS_CHANGED" });
    expect(provider).toHaveBeenCalledTimes(1);
  });

  it("retains a sanitized failure and only runs a deliberate new attempt", async () => {
    const f = await fixture();
    const requestId = randomUUID();
    await queueCampaignGeneration(f.workspaceId, f.userId, requestId, input);
    provider.mockRejectedValueOnce(
      new AiServiceRequestError({ code: "AI_PROVIDER_TIMEOUT", message: "private provider data", retryable: true, statusCode: 504 })
    );
    await processCampaignGenerations(f.workspaceId);
    expect(await readCampaignGeneration(f.workspaceId, requestId)).toMatchObject({ status: "FAILED", errorCode: "AI_PROVIDER_TIMEOUT" });
    expect(JSON.stringify(await readCampaignGeneration(f.workspaceId, requestId))).not.toContain("private");
    await processCampaignGenerations(f.workspaceId);
    expect(provider).toHaveBeenCalledTimes(1);
    const next = await queueCampaignGeneration(f.workspaceId, f.userId, randomUUID(), input);
    await processCampaignGenerations(f.workspaceId);
    expect(await readCampaignGeneration(f.workspaceId, next.requestId)).toMatchObject({ status: "COMPLETED" });
  });
});
