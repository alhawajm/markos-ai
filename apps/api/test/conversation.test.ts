import type { AssistantResult } from "@markos/validation";
import { generateImageForContent } from "../src/media/media-service";
import { queueVideoGeneration } from "../src/media/video-generation-service";
import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { processConversationRuns } from "../src/content/conversation-service";
import { respondToConversation } from "../src/ai/conversation-client";
import { mutateContentAggregate, convertContentAggregate } from "../src/content/content-aggregate";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";

vi.mock("../src/ai/conversation-client", async (original) => ({
  ...(await original<typeof import("../src/ai/conversation-client")>()),
  respondToConversation: vi.fn()
}));
vi.mock("../src/media/media-service", async (original) => ({
  ...(await original<typeof import("../src/media/media-service")>()),
  generateImageForContent: vi.fn()
}));
vi.mock("../src/media/video-generation-service", async (original) => ({
  ...(await original<typeof import("../src/media/video-generation-service")>()),
  queueVideoGeneration: vi.fn()
}));
const imageGeneration = vi.mocked(generateImageForContent);
const videoGeneration = vi.mocked(queueVideoGeneration);
const respond = vi.mocked(respondToConversation);
let app: Awaited<ReturnType<typeof buildApp>>;
const caption = "  Citrus 🍊\n\nبرتقال\n\nTry it today. جرّبه اليوم.\n\n#Bahrain\n";
const output = (changes: object | null = null) => ({
  model: "test-conversation",
  prompt_version: "test.v1",
  tokens_in: 20,
  tokens_out: 30,
  result: {
    reply: changes ? "Updated your draft." : "Hello! What would you like to work on?",
    summary: "Owner is preparing a citrus post.",
    conversion: null,
    generation: [],
    operations: Object.entries(changes ?? {})
      .filter(([, value]) => value !== null)
      .map(([field, value]) => ({ type: "updateContent" as const, field, value }))
  }
});
const patch = (value = caption) => ({ caption: value });
beforeAll(async () => {
  if (!validateInstagramDatabaseTarget(process.env)) throw new Error("Conversation tests require an explicit disposable loopback database.");
  app = await buildApp();
});
afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});
beforeEach(() => {
  respond.mockReset();
  imageGeneration.mockReset();
  videoGeneration.mockReset();
  respond.mockResolvedValue(output() as Awaited<ReturnType<typeof respond>>);
});

async function fixture() {
  const registered = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `conversation-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Conversation Test",
      workspaceName: `Conversation ${randomUUID()}`,
      locale: "en"
    }
  });
  expect(registered.statusCode).toBe(201);
  const session = registered.json().data;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  const headers = { authorization: `Bearer ${session.tokens.accessToken}` };
  const post = await app.inject({ method: "POST", url: "/v1/content", headers, payload: { caption: "Original", brief: "Citrus post" } });
  const item = post.json().data;
  const path = `/v1/content/${item.id}/conversation`;
  const input = { requestId: randomUUID(), expectedRevision: item.revision, message: "Hello", locale: "en" };
  return {
    item,
    session,
    headers,
    path,
    input,
    get: async () => (await app.inject({ method: "GET", url: path, headers })).json().data,
    send: (payload = input) => app.inject({ method: "POST", url: path, headers, payload })
  };
}

describe("durable post conversations", () => {
  it("saves each Details field separately and preserves unrelated copy on later edits", async () => {
    const f = await fixture();
    const details = {
      contentPillar: "Behind the scenes",
      campaignGoal: "Encourage bakery enquiries",
      tone: "Warm and conversational",
      brief: "Show the morning bake."
    };
    respond.mockResolvedValue(output({ ...patch(), caption: null, ...details }) as Awaited<ReturnType<typeof respond>>);
    await f.send({ ...f.input, message: "Apply the agreed pillar, objective, tone and brief to this post." });
    await processConversationRuns(f.session.workspace.id);
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: f.item.id } })).toMatchObject({
      ...details,
      caption: "Original",
      revision: expect.any(Number)
    });
    const saved = await f.get();
    expect(saved.contentItem.revision).toBeGreaterThan(f.item.revision);
    expect(saved.contentItem).toMatchObject(details);
    expect(saved.messages.at(-1).text).toContain("Authoring changes saved");
    respond.mockResolvedValue(output({ ...patch(), caption: null, contentPillar: null, campaignGoal: null, tone: "" }) as Awaited<ReturnType<typeof respond>>);
    await f.send({ ...f.input, requestId: randomUUID(), expectedRevision: (await f.get()).contentItem.revision, message: "Clear only the tone." });
    await processConversationRuns(f.session.workspace.id);
    expect((await f.get()).contentItem.revision).toBeGreaterThan(saved.contentItem.revision);
    expect(respond.mock.lastCall?.[0].current).toMatchObject(details);
    expect((await f.get()).contentItem).toMatchObject({
      contentPillar: details.contentPillar,
      campaignGoal: details.campaignGoal,
      brief: details.brief,
      caption: "Original",
      revision: expect.any(Number)
    });
    expect((await prisma.contentItem.findUniqueOrThrow({ where: { id: f.item.id } })).tone).toBe("");
  });

  it.each([
    ["contentPillar", 160],
    ["campaignGoal", 500],
    ["tone", 200]
  ] as const)("rejects oversized %s without saving any of the edit", async (field, limit) => {
    const f = await fixture();
    respond.mockResolvedValue(output({ ...patch(), [field]: "x".repeat(limit + 1) }) as Awaited<ReturnType<typeof respond>>);
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.latestRun.status).toBe("FAILED");
    expect(saved.contentItem).toMatchObject({ caption: "Original", brief: "Citrus post", revision: f.item.revision });
    expect(saved.messages.at(-1).text).toContain("No changes from it were saved");
  });

  it("does not relay a false saved-edit claim without operations", async () => {
    const f = await fixture();
    const response = output();
    response.result.reply = "Updated your draft.";
    respond.mockResolvedValue(response as Awaited<ReturnType<typeof respond>>);
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.latestRun.status).toBe("SUCCEEDED");
    expect(saved.messages.at(-1).text).toContain("I have not changed");
    expect(saved.contentItem.revision).toBe(f.item.revision);
  });

  it("saves a greeting and reply without modifying content; reopens the same thread", async () => {
    const f = await fixture();
    expect((await f.get()).id).toBeNull();
    expect((await f.send()).statusCode).toBe(202);
    expect((await f.get()).messages).toHaveLength(1);
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(saved.latestRun.status).toBe("SUCCEEDED");
    expect(saved.contentItem).toMatchObject({ caption: "Original", revision: f.item.revision });
    expect((await f.get()).id).toBe(saved.id);
  });

  it("applies one exact bilingual caption and uses saved/manual state plus history on the next turn", async () => {
    const f = await fixture();
    respond.mockResolvedValue(output(patch()) as Awaited<ReturnType<typeof respond>>);
    await f.send({ ...f.input, message: "Write a bilingual caption" });
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.contentItem).toMatchObject({ caption });
    expect(saved.contentItem.revision).toBeGreaterThan(f.item.revision);
    const edit = await app.inject({
      method: "PATCH",
      url: `/v1/content/${f.item.id}`,
      headers: f.headers,
      payload: { caption: "Owner edited this", expectedRevision: (await f.get()).contentItem.revision }
    });
    expect(edit.statusCode).toBe(200);
    respond.mockResolvedValue(output() as Awaited<ReturnType<typeof respond>>);
    await f.send({ ...f.input, requestId: randomUUID(), expectedRevision: (await f.get()).contentItem.revision, message: "What did we choose?" });
    await processConversationRuns(f.session.workspace.id);
    expect(respond.mock.lastCall?.[0]).toMatchObject({
      current: { caption: "Owner edited this" },
      summary: "Owner is preparing a citrus post."
    });
    expect(respond.mock.lastCall?.[0].history).toHaveLength(2);
    expect((await f.get()).messages).toHaveLength(4);
  });

  it("deduplicates simultaneous sends and retries after completion; rejects reuse for a different message", async () => {
    const f = await fixture();
    const sent = await Promise.all([f.send(), f.send()]);
    expect(sent.map((r) => r.statusCode)).toEqual([202, 202]);
    await Promise.all([processConversationRuns(f.session.workspace.id), processConversationRuns(f.session.workspace.id)]);
    expect(respond).toHaveBeenCalledTimes(1);
    expect((await f.send()).statusCode).toBe(202);
    expect((await f.get()).messages).toHaveLength(2);
    expect((await f.send({ ...f.input, message: "Something else" })).statusCode).toBe(409);
    expect(await prisma.aiInteraction.count({ where: { contentItemId: f.item.id } })).toBe(1);
  });

  it("blocks another active turn and stale manual saves", async () => {
    const f = await fixture();
    await f.send();
    expect((await f.send({ ...f.input, requestId: randomUUID() })).json().error.code).toBe("CONVERSATION_BUSY");
    const edit = await app.inject({
      method: "PATCH",
      url: `/v1/content/${f.item.id}`,
      headers: f.headers,
      payload: { caption: "Newer", expectedRevision: f.item.revision }
    });
    expect(edit.statusCode).toBe(200);
    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/content/${f.item.id}`,
      headers: f.headers,
      payload: { caption: "Old tab", expectedRevision: f.item.revision }
    });
    expect(stale.json().error.code).toBe("CONTENT_REVISION_CONFLICT");
    await processConversationRuns(f.session.workspace.id);
    expect(respond).not.toHaveBeenCalled();
    expect((await f.get()).latestRun.status).toBe("CONFLICT");
  });

  it.each(["caption", "approval", "media"])("retains the proposed result without overwriting a concurrent %s change", async (kind) => {
    const f = await fixture();
    respond.mockImplementation(async () => {
      if (kind === "media")
        await mutateContentAggregate(f.session.workspace.id, f.item.id, {
          expectedRevision: f.item.revision,
          operations: [{ type: "updateMediaItem", itemId: f.item.mediaItems[0].id, fields: { visualDirection: "New media plan" } }]
        });
      else
        await prisma.contentItem.update({
          where: { id: f.item.id },
          data: kind === "caption" ? { caption: "Newer edit" } : kind === "approval" ? { status: "APPROVED" } : { brief: "New media plan" }
        });
      return output(patch()) as Awaited<ReturnType<typeof respond>>;
    });
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.latestRun).toMatchObject({ status: "CONFLICT", proposedCaption: caption });
    expect(saved.contentItem.caption).toBe(kind === "caption" ? "Newer edit" : "Original");
    expect(saved.messages[1].text).toContain("did not apply");
    expect(saved.latestRun.proposedCaption).toBe(caption);
  });

  it("rejects unapproved actions and malformed captions without partially saving the result", async () => {
    const f = await fixture();
    respond.mockResolvedValue(output({ ...patch(), caption: "x".repeat(2201), status: "PUBLISHED" }) as Awaited<ReturnType<typeof respond>>);
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.latestRun.status).toBe("FAILED");
    expect(saved.contentItem).toMatchObject({ caption: "Original", status: "DRAFT", revision: f.item.revision });
  });

  it("persists provider failure, never automatically retries it, and permits a new turn", async () => {
    const f = await fixture();
    respond.mockRejectedValueOnce(new Error("provider unavailable"));
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    await processConversationRuns(f.session.workspace.id);
    expect(respond).toHaveBeenCalledTimes(1);
    expect((await f.get()).latestRun.status).toBe("FAILED");
    expect((await f.send({ ...f.input, requestId: randomUUID() })).statusCode).toBe(202);
    await processConversationRuns(f.session.workspace.id);
    expect((await f.get()).latestRun.status).toBe("SUCCEEDED");
  });

  it("recovers interrupted runs after their lease expires without repeating paid work", async () => {
    const f = await fixture();
    await f.send();
    const run = (await f.get()).latestRun;
    await prisma.conversationRun.update({ where: { id: run.id }, data: { status: "RUNNING", leaseExpiresAt: new Date(0) } });
    await processConversationRuns(f.session.workspace.id);
    expect((await f.get()).latestRun).toMatchObject({ status: "FAILED", errorCode: "CONVERSATION_INTERRUPTED" });
    expect(respond).not.toHaveBeenCalled();
  });

  it("isolates conversation reads and writes and rechecks access before applying an AI result", async () => {
    const f = await fixture();
    const other = await fixture();
    for (const method of ["GET", "POST"] as const) {
      const response = await app.inject({ method, url: f.path, headers: other.headers, ...(method === "POST" ? { payload: f.input } : {}) });
      expect(response.statusCode).toBe(404);
    }
    respond.mockImplementation(async () => {
      await prisma.workspaceMember.updateMany({ where: { workspaceId: f.session.workspace.id, userId: f.session.user.id }, data: { deletedAt: new Date() } });
      return output(patch()) as Awaited<ReturnType<typeof respond>>;
    });
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    expect(await prisma.contentItem.findUniqueOrThrow({ where: { id: f.item.id } })).toMatchObject({ caption: "Original" });
    expect((await prisma.conversationRun.findFirstOrThrow({ where: { workspaceId: f.session.workspace.id } })).status).toBe("FAILED");
  });

  it("enforces database isolation for all conversation tables and rejects mismatched parents", async () => {
    const f = await fixture();
    const other = await fixture();
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    const own = await f.get();
    const counts = await prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE markos_app`;
      await tx.$executeRaw`SELECT set_config('app.current_workspace', ${other.session.workspace.id}, true)`;
      return Promise.all([
        tx.contentConversation.count({ where: { id: own.id } }),
        tx.conversationRun.count({ where: { conversationId: own.id } }),
        tx.conversationMessage.count({ where: { conversationId: own.id } })
      ]);
    });
    expect(counts).toEqual([0, 0, 0]);
    await expect(prisma.contentConversation.create({ data: { workspaceId: f.session.workspace.id, contentItemId: other.item.id } })).rejects.toThrow();
    await expect(
      prisma.conversationRun.create({
        data: {
          workspaceId: other.session.workspace.id,
          conversationId: own.id,
          userId: other.session.user.id,
          requestId: randomUUID(),
          instruction: "forged",
          baseRevision: 1
        }
      })
    ).rejects.toThrow();
    await expect(
      prisma.conversationMessage.create({
        data: { workspaceId: other.session.workspace.id, conversationId: own.id, runId: own.latestRun.id, role: "assistant", text: "forged" }
      })
    ).rejects.toThrow();
  });

  it("rejects approval of a revision that changed after review", async () => {
    const f = await fixture();
    await prisma.contentItem.update({ where: { id: f.item.id }, data: { caption: "New content" } });
    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${f.item.id}/status`,
      headers: f.headers,
      payload: { status: "IN_REVIEW", expectedRevision: f.item.revision }
    });
    expect(response.statusCode).toBe(409);
    expect((await f.get()).contentItem.status).toBe("DRAFT");
  });
});

const actionOutput = (operations: AssistantResult["operations"], extra: Partial<AssistantResult> = {}) => ({
  ...output(),
  result: { reply: "Prepared the requested edits.", summary: "Creative plan", conversion: null, generation: [], operations, ...extra }
});
type Fixture = Awaited<ReturnType<typeof fixture>>;
async function execute(f: Fixture, operations: AssistantResult["operations"], extra: Partial<AssistantResult> = {}) {
  respond.mockResolvedValue(actionOutput(operations, extra));
  const current = await f.get();
  expect((await f.send({ ...f.input, requestId: randomUUID(), expectedRevision: current.contentItem.revision })).statusCode).toBe(202);
  await processConversationRuns(f.session.workspace.id);
  return f.get();
}
async function format(f: Fixture, contentType: "CAROUSEL" | "REEL" | "STORY") {
  await convertContentAggregate(f.session.workspace.id, f.item.id, {
    expectedRevision: (await f.get()).contentItem.revision,
    contentType,
    confirmDestructive: true
  });
  return (await f.get()).contentItem;
}
async function acknowledge(f: Fixture, run: any, overrides: object = {}) {
  return app.inject({
    method: "POST",
    url: f.path + "/" + run.id + "/confirm",
    headers: f.headers,
    payload: { confirmationToken: run.confirmation.token, expectedRevision: run.confirmation.revision, ...overrides }
  });
}
const addSlide = (ref: string): AssistantResult["operations"][number] => ({
  type: "addMediaItem",
  ref,
  purpose: "Benefits",
  title: "Pastries",
  body: "Freshly baked",
  visualDirection: "Warm bakery"
});
describe("relational assistant authoring", () => {
  it("constructs a sanitized typed snapshot and edits a stable item without changing its neighbour", async () => {
    const f = await fixture();
    const initial = await format(f, "CAROUSEL");
    const saved = await execute(f, [addSlide("$second")]);
    const second = saved.contentItem.mediaItems[1];
    const final = await execute(f, [{ type: "updateMediaItem", itemId: second.id, field: "visualDirection", value: "Warmer lighting" }]);
    expect(final.contentItem.mediaItems[0]).toEqual(saved.contentItem.mediaItems[0]);
    expect(final.contentItem.mediaItems[1]).toMatchObject({ id: second.id, visualDirection: "Warmer lighting" });
    expect(final.contentItem.revision).toBeGreaterThan(saved.contentItem.revision);
    const snapshot = respond.mock.lastCall![0].current;
    expect(snapshot).toMatchObject({ id: f.item.id, contentType: "CAROUSEL", revision: saved.contentItem.revision, editable: true });
    expect(snapshot.mediaItems.map((item) => item.id)).toEqual([initial.mediaItems[0].id, second.id]);
    expect(JSON.stringify(snapshot)).not.toMatch(/storageKey|deletedAt|generationIntent|publishJob|workspaceId/);
  });
  it("creates five persistent slides with deterministic dependent references and final ID ordering", async () => {
    const f = await fixture();
    const initial = await format(f, "CAROUSEL");
    const first = initial.mediaItems[0].id;
    const saved = await execute(f, [
      ...["$s2", "$s3", "$s4", "$s5"].map(addSlide),
      { type: "updateMediaItem", itemId: "$s3", field: "title", value: "Updated third" },
      { type: "reorderMediaItems", orderedIds: ["$s5", first, "$s2", "$s3", "$s4"] }
    ]);
    expect(saved.latestRun.status).toBe("SUCCEEDED");
    const ids = saved.latestRun.actions.bindings;
    expect(saved.contentItem.mediaItems.map((item: any) => item.id)).toEqual([ids.$s5, first, ids.$s2, ids.$s3, ids.$s4]);
    expect(saved.contentItem.mediaItems[3]).toMatchObject({ title: "Updated third" });
    expect(saved.contentItem.mediaItems.every((item: any) => !item.mediaAssetId)).toBe(true);
    const before = saved.contentItem.revision;
    const original = await prisma.conversationRun.findUniqueOrThrow({ where: { id: saved.latestRun.id } });
    await f.send({ ...f.input, requestId: original.requestId as ReturnType<typeof randomUUID>, expectedRevision: original.baseRevision });
    await processConversationRuns(f.session.workspace.id);
    expect((await f.get()).contentItem.revision).toBe(before);
    expect(respond).toHaveBeenCalledTimes(1);
  });
  it.each(["missing", "foreign", "duplicate-ref", "forward-ref", "incomplete-order"])("rolls back a coherent batch on %s target failure", async (kind) => {
    const f = await fixture();
    const other = await fixture();
    const initial = await format(f, "CAROUSEL");
    const bad: AssistantResult["operations"] =
      kind === "duplicate-ref"
        ? [addSlide("$a"), addSlide("$a")]
        : kind === "forward-ref"
          ? [{ type: "updateMediaItem", itemId: "$later", field: "title", value: "Invalid" }, addSlide("$later")]
          : kind === "incomplete-order"
            ? [addSlide("$a"), { type: "reorderMediaItems", orderedIds: ["$a"] }]
            : [{ type: "updateMediaItem", itemId: kind === "foreign" ? other.item.mediaItems[0].id : randomUUID(), field: "title", value: "Invalid" }];
    const saved = await execute(f, [{ type: "updateContent", field: "caption", value: "Must roll back" }, ...bad]);
    expect(saved.latestRun.status).toBe("FAILED");
    expect(saved.contentItem).toEqual(initial);
  });
  it("requires exact destructive confirmation, rejects stale approval, and deduplicates acknowledgement", async () => {
    const f = await fixture();
    await format(f, "CAROUSEL");
    const first = await execute(f, [addSlide("$second")]);
    const target = first.contentItem.mediaItems[1].id;
    const proposed = await execute(f, [
      { type: "removeMediaItem", itemId: target },
      { type: "updateContent", field: "caption", value: "After removal" }
    ]);
    expect(proposed.latestRun.status).toBe("AWAITING_CONFIRMATION");
    expect(proposed.contentItem).toEqual(first.contentItem);
    expect((await acknowledge(f, proposed.latestRun, { confirmationToken: randomUUID() })).statusCode).toBe(409);
    const foreign = await fixture();
    expect(
      (
        await app.inject({
          method: "POST",
          url: f.path + "/" + proposed.latestRun.id + "/confirm",
          headers: foreign.headers,
          payload: { confirmationToken: proposed.latestRun.confirmation.token, expectedRevision: proposed.latestRun.confirmation.revision }
        })
      ).statusCode
    ).toBe(404);
    await mutateContentAggregate(f.session.workspace.id, f.item.id, {
      expectedRevision: first.contentItem.revision,
      operations: [{ type: "updateContent", fields: { tone: "New owner choice" } }]
    });
    expect((await acknowledge(f, proposed.latestRun)).statusCode).toBe(409);
    const renewed = await execute(f, [{ type: "removeMediaItem", itemId: target }]);
    const responses = await Promise.all([acknowledge(f, renewed.latestRun), acknowledge(f, renewed.latestRun)]);
    expect(responses.map((r) => r.statusCode)).toEqual([200, 200]);
    const saved = await f.get();
    expect(saved.contentItem.mediaItems).toHaveLength(1);
    expect(saved.latestRun.confirmation).toBeNull();
    const revision = saved.contentItem.revision;
    await acknowledge(f, renewed.latestRun);
    expect((await f.get()).contentItem.revision).toBe(revision);
  });
  it("keeps Reel script duration separate and supports stable beat creation, edits, order and confirmed removal", async () => {
    const f = await fixture();
    const initial = await format(f, "REEL");
    const saved = await execute(f, [
      { type: "updateReelScript", field: "hook", value: "Fresh every morning" },
      { type: "updateReelScript", field: "intendedDurationSeconds", value: 30 },
      { type: "updateMediaItem", itemId: initial.mediaItems[0].id, field: "generationDurationSeconds", value: 8 },
      { type: "updateMediaItem", itemId: initial.mediaItems[0].id, field: "visualDirection", value: "Show mixing then baking" },
      { type: "addReelBeat", ref: "$mix", text: "Mix ingredients" },
      { type: "addReelBeat", ref: "$bake", text: "Bake pastries" },
      { type: "updateReelBeat", beatId: "$mix", text: "Mix fresh ingredients" },
      { type: "reorderReelBeats", orderedIds: ["$bake", "$mix"] }
    ]);
    expect(saved.latestRun.status).toBe("SUCCEEDED");
    expect(saved.contentItem.reelScript).toMatchObject({ hook: "Fresh every morning", intendedDurationSeconds: 30 });
    expect(saved.contentItem.mediaItems[0]).toMatchObject({ generationDurationSeconds: 8, visualDirection: "Show mixing then baking" });
    expect(saved.contentItem.reelScript.beats.map((b: any) => b.text)).toEqual(["Bake pastries", "Mix fresh ingredients"]);
    const ids = saved.contentItem.reelScript.beats.map((b: any) => b.id);
    const edited = await execute(f, [{ type: "updateReelBeat", beatId: ids[1], text: "Mix carefully" }]);
    expect(edited.contentItem.reelScript.beats[0]).toEqual(saved.contentItem.reelScript.beats[0]);
    const removed = await execute(f, [
      { type: "removeReelBeat", beatId: ids[0] },
      { type: "updateReelScript", field: "hook", value: "" }
    ]);
    expect(removed.latestRun.status).toBe("AWAITING_CONFIRMATION");
    expect((await acknowledge(f, removed.latestRun)).statusCode).toBe(200);
    expect((await f.get()).contentItem.reelScript.beats.map((b: any) => b.id)).toEqual([ids[1]]);
  });
  it("uses conversion summaries to gate populated conversion and clears incompatible Reel state", async () => {
    const f = await fixture();
    await format(f, "REEL");
    await execute(f, [
      { type: "updateReelScript", field: "hook", value: "Significant script" },
      { type: "addReelBeat", ref: "$beat", text: "Opening scene" }
    ]);
    const proposed = await execute(f, [], { conversion: { contentType: "POST", retainMediaItemId: null } });
    expect(proposed.latestRun.status).toBe("AWAITING_CONFIRMATION");
    expect(proposed.latestRun.confirmation.consequences[0]).toContain("Convert to POST");
    await acknowledge(f, proposed.latestRun);
    const saved = await f.get();
    expect(saved.contentItem.contentType).toBe("POST");
    expect(saved.contentItem.reelScript).toBeNull();
  });
  it("persists direction before targeted image dispatch and never dispatches twice on retry/poll", async () => {
    const f = await fixture();
    const target = f.item.mediaItems[0].id;
    imageGeneration.mockImplementation(async (workspace, id, input) => {
      const item = await prisma.contentMediaItem.findUniqueOrThrow({ where: { id: target } });
      expect(item.visualDirection).toBe("Warm lighting");
      expect(input.contentMediaItemId).toBe(target);
      const saved = (await f.get()).contentItem;
      return { contentItem: saved, mediaAsset: { id: randomUUID() } } as Awaited<ReturnType<typeof generateImageForContent>>;
    });
    const saved = await execute(f, [{ type: "updateMediaItem", itemId: target, field: "visualDirection", value: "Warm lighting" }], {
      generation: [{ itemId: target }]
    });
    expect(saved.latestRun.actions.generation[0].status).toBe("ATTACHED");
    const run = await prisma.conversationRun.findUniqueOrThrow({ where: { id: saved.latestRun.id } });
    await f.send({ ...f.input, requestId: run.requestId as ReturnType<typeof randomUUID>, expectedRevision: run.baseRevision });
    await Promise.all([processConversationRuns(f.session.workspace.id), f.get(), f.get()]);
    expect(imageGeneration).toHaveBeenCalledTimes(1);
    expect(saved.messages.at(-1).text).toContain("completed and attached");
  });
  it.each(["FAILED", "LIBRARY_ONLY"])("reports image outcome %s while preserving saved edits", async (status) => {
    const f = await fixture();
    const target = f.item.mediaItems[0].id;
    imageGeneration.mockRejectedValue(Object.assign(new Error("Generation failed"), status === "LIBRARY_ONLY" ? { mediaAssetId: randomUUID() } : {}));
    const saved = await execute(f, [{ type: "updateMediaItem", itemId: target, field: "visualDirection", value: "Warm lighting" }], {
      generation: [{ itemId: target }]
    });
    expect(saved.latestRun.actions.generation[0].status).toBe(status);
    expect(saved.contentItem.mediaItems[0].visualDirection).toBe("Warm lighting");
    expect(saved.messages.at(-1).text).not.toContain("completed and attached");
  });
  it("queues video once and exposes later job outcomes without repeat dispatch or authoring writes", async () => {
    const f = await fixture();
    const initial = await format(f, "REEL");
    const target = initial.mediaItems[0].id;
    // Use the real durable queue; no provider or worker is called.
    videoGeneration.mockImplementation(
      (await vi.importActual<typeof import("../src/media/video-generation-service")>("../src/media/video-generation-service")).queueVideoGeneration
    );
    const saved = await execute(f, [{ type: "updateMediaItem", itemId: target, field: "visualDirection", value: "Bake pastries" }], {
      generation: [{ itemId: target }]
    });
    expect(saved.latestRun.actions.generation[0].status).toBe("QUEUED");
    expect(saved.messages.at(-1).text).toContain("queued; not attached");
    const run = await prisma.conversationRun.findUniqueOrThrow({ where: { id: saved.latestRun.id } });
    await f.send({ ...f.input, requestId: run.requestId as ReturnType<typeof randomUUID>, expectedRevision: run.baseRevision });
    const jobId = saved.latestRun.actions.generation[0].jobId;
    const rev = saved.contentItem.revision;
    for (const [status, attachmentApplied, expected] of [
      ["GENERATING", null, "RUNNING"],
      ["COMPLETED", false, "LIBRARY_ONLY"],
      ["COMPLETED", true, "ATTACHED"],
      ["FAILED", null, "FAILED"]
    ] as const) {
      await prisma.mediaGenerationJob.update({ where: { id: jobId }, data: { status, attachmentApplied } });
      expect((await f.get()).latestRun.actions.generation[0].status).toBe(expected);
    }
    await processConversationRuns(f.session.workspace.id);
    expect(videoGeneration).toHaveBeenCalledTimes(1);
    expect((await f.get()).contentItem.revision).toBe(rev);
  });
});

describe("assistant execution boundaries", () => {
  it("exposes only safe attached-media metadata and the saved aspect-ratio contract", async () => {
    const f = await fixture();
    const asset = await prisma.mediaAsset.create({
      data: {
        workspaceId: f.session.workspace.id,
        type: "IMAGE",
        filename: "private.jpg",
        s3Key: "secret-key",
        cdnUrl: "https://private.invalid/file",
        mimeType: "image/jpeg",
        sizeBytes: 10,
        width: 1080,
        height: 1080
      }
    });
    await mutateContentAggregate(f.session.workspace.id, f.item.id, {
      expectedRevision: f.item.revision,
      operations: [{ type: "updateMediaItem", itemId: f.item.mediaItems[0].id, fields: { mediaAssetId: asset.id, aspectRatio: "SQUARE" } }]
    });
    await execute(f, []);
    const snapshot = respond.mock.lastCall![0].current;
    expect(snapshot.mediaItems[0]).toMatchObject({
      aspectRatio: "SQUARE",
      media: { mimeType: "image/jpeg", width: 1080, height: 1080, durationSeconds: null }
    });
    expect(JSON.stringify(snapshot)).not.toMatch(/secret-key|private.invalid|private.jpg|cdnUrl|s3Key/);
  });

  it("allows an empty slide removal without confirmation and keeps Story caption optional", async () => {
    const f = await fixture();
    await format(f, "CAROUSEL");
    const added = await execute(f, [{ type: "addMediaItem", ref: "$empty", purpose: null, title: null, body: null, visualDirection: null }]);
    const removed = await execute(f, [{ type: "removeMediaItem", itemId: added.latestRun.actions.bindings.$empty }]);
    expect(removed.latestRun.status).toBe("SUCCEEDED");
    expect(removed.latestRun.confirmation).toBeNull();
    const converted = await execute(f, [], { conversion: { contentType: "STORY", retainMediaItemId: null } });
    expect(converted.latestRun.status).toBe("SUCCEEDED");
    const story = await execute(f, [
      { type: "updateContent", field: "caption", value: "" },
      { type: "updateMediaItem", itemId: converted.contentItem.mediaItems[0].id, field: "visualDirection", value: "Vertical bakery scene" }
    ]);
    expect(story.latestRun.status).toBe("SUCCEEDED");
    expect(story.contentItem.caption).toBe("");
    expect(respond.mock.lastCall![0].current.contentType).toBe("STORY");
  });
  it("rolls back duplicate generation requests before any dispatch", async () => {
    const f = await fixture();
    const target = f.item.mediaItems[0].id;
    const saved = await execute(f, [{ type: "updateMediaItem", itemId: target, field: "visualDirection", value: "Warm bakery" }], {
      generation: [{ itemId: target }, { itemId: target }]
    });
    expect(saved.latestRun.status).toBe("FAILED");
    expect(saved.contentItem.revision).toBe(f.item.revision);
    expect(imageGeneration).not.toHaveBeenCalled();
  });
  it("rejects cross-content beat IDs and rolls back earlier edits", async () => {
    const f = await fixture();
    const other = await fixture();
    await format(f, "REEL");
    await format(other, "REEL");
    const foreign = await execute(other, [{ type: "addReelBeat", ref: "$beat", text: "Other owner script" }]);
    const initial = (await f.get()).contentItem;
    const saved = await execute(f, [
      { type: "updateReelScript", field: "hook", value: "Must roll back" },
      { type: "updateReelBeat", beatId: foreign.contentItem.reelScript.beats[0].id, text: "Forbidden" }
    ]);
    expect(saved.latestRun.status).toBe("FAILED");
    expect(saved.contentItem).toEqual(initial);
  });
  it("recovers ambiguous dispatch as unknown without replaying it or denying saved edits", async () => {
    const f = await fixture();
    const target = f.item.mediaItems[0].id;
    const saved = await execute(f, [{ type: "updateMediaItem", itemId: target, field: "visualDirection", value: "Warm bakery" }]);
    await prisma.conversationRun.update({
      where: { id: saved.latestRun.id },
      data: {
        status: "DISPATCHING",
        leaseExpiresAt: new Date(0),
        actionState: { ...saved.latestRun.actions, generation: [{ itemId: target, status: "DISPATCHING" }] }
      }
    });
    await processConversationRuns(f.session.workspace.id);
    const recovered = await f.get();
    expect(recovered.latestRun).toMatchObject({ status: "FAILED", errorCode: "GENERATION_DISPATCH_INTERRUPTED" });
    expect(recovered.latestRun.actions.generation[0].status).toBe("UNKNOWN");
    expect(recovered.messages.at(-1).text).toContain("Authoring changes saved");
    expect(recovered.messages.at(-1).text).toContain("outcome is unknown");
    expect(imageGeneration).not.toHaveBeenCalled();
    expect(videoGeneration).not.toHaveBeenCalled();
    expect(recovered.contentItem.revision).toBe(saved.contentItem.revision);
  });
});
