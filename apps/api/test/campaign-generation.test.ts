import { randomUUID } from "node:crypto";
import { SignJWT } from "jose";
import { afterAll, beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@prisma/client";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { env } from "../src/config/env";
import { requireDisposableDatabase } from "./disposable-database";
import { processCampaignGenerations, queueCampaignGeneration, readCampaignGeneration } from "../src/campaign/campaign-generation-service";
import { resumeCampaignGeneration } from "../src/campaign/campaign-generation-service";
import type { CampaignPlan } from "@markos/shared-types";
import { AiServiceRequestError } from "../src/ai/request";
import { createContentAggregate } from "../src/content/content-aggregate";

const provider = vi.hoisted(() => vi.fn());
const segments = vi.hoisted(() => vi.fn());
vi.mock("../src/ai/campaign-client", () => ({ generateCampaignPlan: provider, generateCampaignSegment: segments }));
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
requireDisposableDatabase("markos_mobile_jobs_test");
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
  segments.mockReset().mockImplementation(async (request, planning) => ({
    ...output(),
    campaign: {
      ...output().campaign,
      durationDays: request.durationDays,
      publishesPerDay: request.publishesPerDay,
      pillars: [{ name: "Awareness", rationale: "Source-informed event awareness", contentAngles: ["Event details"] }],
      objectives: ["Event awareness"],
      kpis: [{ name: "Inquiries", target: "Track actual inquiries" }],
      risks: ["Review event dates"],
      nextActions: ["Review plan"],
      weeklyCadence: [
        {
          week: 1,
          focus: `Window ${planning.start_day}`,
          days: Array.from({ length: request.durationDays }, (_, i) => ({
            day: i + 1,
            posts: Array.from({ length: request.publishesPerDay }, (_, j) => ({
              contentType: "POST",
              title: `Day ${planning.start_day + i} idea ${j}`,
              description: "Use the event proposal",
              goal: "Awareness",
              contentPillar: "Awareness"
            }))
          }))
        }
      ]
    }
  }));
});
afterAll(async () => {
  await prisma.$disconnect();
});

describe("durable campaign generation", () => {
  it.each([30, 60, 90] as const)("saves a complete %i-day plan in bounded windows, removes document bytes and records each call once", async (durationDays) => {
    const f = await fixture();
    const requestId = randomUUID();
    const brief = { ...input, durationDays, publishesPerDay: 3 };
    await queueCampaignGeneration(f.workspaceId, f.userId, requestId, brief);
    await processCampaignGenerations(f.workspaceId);
    const first = await readCampaignGeneration(f.workspaceId, requestId);
    const total = Math.ceil(durationDays / 7);
    expect(first).toMatchObject({ status: "QUEUED", progress: { completedWeeks: 1, totalWeeks: total } });
    const temporary = await prisma.campaignGenerationJob.findUniqueOrThrow({ where: { id: first.id } });
    expect(JSON.stringify(temporary.input)).not.toContain("base64Data");
    expect(JSON.stringify(temporary.checkpoint)).not.toContain("base64Data");
    for (let i = 1; i <= total; i++) await processCampaignGenerations(f.workspaceId);
    const completed = await readCampaignGeneration(f.workspaceId, requestId);
    expect(completed.status).toBe("COMPLETED");
    const saved = await prisma.campaign.findUniqueOrThrow({ where: { id: completed.campaignId! } });
    const plan = saved.content as unknown as CampaignPlan;
    expect(plan.weeklyCadence.flatMap((week) => week.days.map((day) => day.day))).toEqual(Array.from({ length: durationDays }, (_, i) => i + 1));
    expect(plan.weeklyCadence.flatMap((week) => week.days.flatMap((day) => day.posts))).toHaveLength(durationDays * 3);
    expect(plan.referenceFiles).toHaveLength(1);
    expect(segments).toHaveBeenCalledTimes(total);
    expect(segments.mock.calls[0]![0].referenceFiles).toHaveLength(1);
    expect(segments.mock.calls.slice(1).every((call) => call[0].referenceFiles.length === 0)).toBe(true);
    expect(segments.mock.calls[1]![1].outline.referenceSummary).toContain("event details");
    const usage = await prisma.aiInteraction.aggregate({ where: { workspaceId: f.workspaceId }, _sum: { tokensIn: true, tokensOut: true } });
    expect(usage._sum).toEqual({ tokensIn: 12 * total, tokensOut: 34 * total });
    expect(await prisma.campaignGenerationJob.findUniqueOrThrow({ where: { id: completed.id } })).toMatchObject({ input: null, checkpoint: null });
    expect(await queueCampaignGeneration(f.workspaceId, f.userId, requestId, brief)).toEqual(completed);
    if (durationDays === 90) {
      const app = await buildApp();
      const lastWeek = plan.weeklyCadence.at(-1)!;
      const actionIndex = (lastWeek.days.length - 1) * brief.publishesPerDay;
      const handoff = await app.inject({
        method: "POST",
        url: `/v1/campaigns/${saved.id}/suggestions/approve`,
        headers: f.headers,
        payload: { week: lastWeek.week, actionIndex }
      });
      expect(handoff.statusCode).toBe(200);
      const planned = new Date(input.startsAt);
      planned.setUTCDate(planned.getUTCDate() + 89);
      expect(handoff.json().data).toMatchObject({ status: "DRAFT", campaignId: saved.id, plannedAt: planned.toISOString(), caption: "" });
      await app.close();
    }
  });

  it("resumes only unfinished work after an explicit retry and rejects another workspace", async () => {
    const f = await fixture(),
      other = await fixture();
    const requestId = randomUUID();
    await queueCampaignGeneration(f.workspaceId, f.userId, requestId, { ...input, durationDays: 30 });
    await processCampaignGenerations(f.workspaceId);
    const savedJob = await readCampaignGeneration(f.workspaceId, requestId);
    await prisma.$transaction(async (tx) => {
      await tx.$executeRawUnsafe("SET LOCAL ROLE markos_app");
      await tx.$executeRaw`SELECT set_config('app.current_workspace', ${other.workspaceId}, true)`;
      expect(await tx.campaignGenerationJob.findMany({ where: { id: savedJob.id }, select: { checkpoint: true } })).toEqual([]);
      expect((await tx.campaignGenerationJob.updateMany({ where: { id: savedJob.id }, data: { checkpoint: {} } })).count).toBe(0);
    });
    segments.mockRejectedValueOnce(
      new AiServiceRequestError({ code: "AI_PROVIDER_TIMEOUT", message: "PRIVATE_PROVIDER_BODY", retryable: true, statusCode: 504 })
    );
    await processCampaignGenerations(f.workspaceId);
    expect(await readCampaignGeneration(f.workspaceId, requestId)).toMatchObject({
      status: "FAILED",
      canResume: true,
      progress: { completedWeeks: 1, totalWeeks: 5 }
    });
    expect((await readCampaignGeneration(f.workspaceId, requestId, { userId: other.userId, mayGenerate: true })).canResume).toBe(false);
    expect((await readCampaignGeneration(f.workspaceId, requestId, { userId: f.userId, mayGenerate: false })).canResume).toBe(false);
    await processCampaignGenerations(f.workspaceId);
    expect(segments).toHaveBeenCalledTimes(2);
    const app = await buildApp();
    const url = `/v1/campaigns/generations/${requestId}/resume`;
    expect((await app.inject({ method: "POST", url, headers: other.headers })).statusCode).toBe(404);
    const replies = await Promise.all([app.inject({ method: "POST", url, headers: f.headers }), app.inject({ method: "POST", url, headers: f.headers })]);
    expect(replies.map((r) => r.statusCode)).toEqual([202, 202]);
    expect(JSON.stringify(replies[0]!.json())).not.toMatch(/PRIVATE_PROVIDER_BODY|base64Data|checkpoint|referenceFiles/);
    for (let i = 0; i < 5; i++) await processCampaignGenerations(f.workspaceId);
    expect(await readCampaignGeneration(f.workspaceId, requestId)).toMatchObject({ status: "COMPLETED" });
    expect(segments).toHaveBeenCalledTimes(6);
    expect(await prisma.campaign.count({ where: { workspaceId: f.workspaceId } })).toBe(1);
    await app.close();
  });

  it("does not replay a committed window from a stale queued-job read", async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const job = await queueCampaignGeneration(f.workspaceId, f.userId, requestId, { ...input, durationDays: 30 });
    const stale = await prisma.campaignGenerationJob.findUniqueOrThrow({ where: { id: job.id } });
    await processCampaignGenerations(f.workspaceId);
    const read = vi.spyOn(prisma.campaignGenerationJob, "findFirst").mockResolvedValueOnce(stale);
    try {
      await processCampaignGenerations(f.workspaceId);
    } finally {
      read.mockRestore();
    }
    expect(segments).toHaveBeenCalledTimes(1);
    expect((await readCampaignGeneration(f.workspaceId, requestId)).progress?.completedWeeks).toBe(1);
    for (let i = 0; i < 5; i++) await processCampaignGenerations(f.workspaceId);
    expect((await readCampaignGeneration(f.workspaceId, requestId)).status).toBe("COMPLETED");
  });

  it("fences a late window response after its expired lease has been resumed", async () => {
    const f = await fixture();
    const requestId = randomUUID();
    const job = await queueCampaignGeneration(f.workspaceId, f.userId, requestId, { ...input, durationDays: 30 });
    await processCampaignGenerations(f.workspaceId);
    const normal = segments.getMockImplementation()!;
    const nextLease = new Date(Date.now() + 20 * 60_000);
    segments.mockImplementationOnce(async (...args) => {
      await prisma.campaignGenerationJob.update({ where: { id: job.id }, data: { leaseExpiresAt: new Date(0) } });
      await processCampaignGenerations(f.workspaceId);
      await resumeCampaignGeneration(f.workspaceId, f.userId, requestId);
      await prisma.campaignGenerationJob.update({ where: { id: job.id }, data: { status: "RUNNING", leaseExpiresAt: nextLease } });
      return normal(...args);
    });
    await processCampaignGenerations(f.workspaceId);
    expect(await prisma.campaignGenerationJob.findUniqueOrThrow({ where: { id: job.id } })).toMatchObject({ status: "RUNNING", leaseExpiresAt: nextLease });
    expect((await readCampaignGeneration(f.workspaceId, requestId)).progress?.completedWeeks).toBe(1);
    expect(await prisma.campaign.count({ where: { workspaceId: f.workspaceId } })).toBe(0);
    await prisma.campaignGenerationJob.update({
      where: { id: job.id },
      data: { status: "FAILED", checkpoint: Prisma.DbNull, input: Prisma.DbNull, leaseExpiresAt: null }
    });
  });
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
