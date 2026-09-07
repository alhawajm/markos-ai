import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { processConversationRuns } from "../src/content/conversation-service";
import { respondToConversation } from "../src/ai/conversation-client";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";

vi.mock("../src/ai/conversation-client", async (original) => ({
  ...(await original<typeof import("../src/ai/conversation-client")>()),
  respondToConversation: vi.fn()
}));
const respond = vi.mocked(respondToConversation);
let app: Awaited<ReturnType<typeof buildApp>>;
const caption = "  Citrus 🍊\n\nبرتقال\n\nTry it today. جرّبه اليوم.\n\n#Bahrain\n";
const output = (changes: object | null = null) => ({
  model: "test-conversation",
  prompt_version: "test.v1",
  tokens_in: 20,
  tokens_out: 30,
  result: { reply: changes ? "Updated your draft." : "Hello! What would you like to work on?", summary: "Owner is preparing a citrus post.", changes }
});
const patch = (value = caption) => ({ caption: value, brief: null, visualDirection: null, carousel: null, reelScript: null });
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
  it("saves a greeting and reply without modifying content; reopens the same thread", async () => {
    const f = await fixture();
    expect((await f.get()).id).toBeNull();
    expect((await f.send()).statusCode).toBe(202);
    expect((await f.get()).messages).toHaveLength(1);
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.messages.map((m: { role: string }) => m.role)).toEqual(["user", "assistant"]);
    expect(saved.latestRun.status).toBe("SUCCEEDED");
    expect(saved.contentItem).toMatchObject({ caption: "Original", revision: 1 });
    expect((await f.get()).id).toBe(saved.id);
  });

  it("applies one exact bilingual caption and uses saved/manual state plus history on the next turn", async () => {
    const f = await fixture();
    respond.mockResolvedValue(output(patch()) as Awaited<ReturnType<typeof respond>>);
    await f.send({ ...f.input, message: "Write a bilingual caption" });
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.contentItem).toMatchObject({ caption, revision: 2 });
    const edit = await app.inject({
      method: "PATCH",
      url: `/v1/content/${f.item.id}`,
      headers: f.headers,
      payload: { caption: "Owner edited this", expectedRevision: 2, visualDirection: "Orange slices on a white table" }
    });
    expect(edit.statusCode).toBe(200);
    respond.mockResolvedValue(output() as Awaited<ReturnType<typeof respond>>);
    await f.send({ ...f.input, requestId: randomUUID(), expectedRevision: 3, message: "What did we choose?" });
    await processConversationRuns(f.session.workspace.id);
    expect(respond.mock.lastCall?.[0]).toMatchObject({
      current: { caption: "Owner edited this", visualDirection: "Orange slices on a white table" },
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
    const edit = await app.inject({ method: "PATCH", url: `/v1/content/${f.item.id}`, headers: f.headers, payload: { caption: "Newer", expectedRevision: 1 } });
    expect(edit.statusCode).toBe(200);
    const stale = await app.inject({
      method: "PATCH",
      url: `/v1/content/${f.item.id}`,
      headers: f.headers,
      payload: { caption: "Old tab", expectedRevision: 1 }
    });
    expect(stale.json().error.code).toBe("CONTENT_REVISION_CONFLICT");
    await processConversationRuns(f.session.workspace.id);
    expect(respond).not.toHaveBeenCalled();
    expect((await f.get()).latestRun.status).toBe("CONFLICT");
  });

  it.each(["caption", "approval", "media"])("retains the proposed result without overwriting a concurrent %s change", async (kind) => {
    const f = await fixture();
    respond.mockImplementation(async () => {
      await prisma.contentItem.update({
        where: { id: f.item.id },
        data: kind === "caption" ? { caption: "Newer edit" } : kind === "approval" ? { status: "APPROVED" } : { mediaIds: [randomUUID()] }
      });
      return output(patch()) as Awaited<ReturnType<typeof respond>>;
    });
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.latestRun).toMatchObject({ status: "CONFLICT", proposedCaption: caption });
    expect(saved.contentItem.caption).toBe(kind === "caption" ? "Newer edit" : "Original");
    expect(saved.messages[1].text).toContain("did not apply");
    expect(saved.messages[1].text).toContain(caption);
  });

  it("rejects unapproved actions and malformed captions without partially saving the result", async () => {
    const f = await fixture();
    respond.mockResolvedValue(output({ ...patch(), caption: "x".repeat(2201), status: "PUBLISHED" }) as Awaited<ReturnType<typeof respond>>);
    await f.send();
    await processConversationRuns(f.session.workspace.id);
    const saved = await f.get();
    expect(saved.latestRun.status).toBe("FAILED");
    expect(saved.contentItem).toMatchObject({ caption: "Original", status: "DRAFT", revision: 1 });
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
      payload: { status: "IN_REVIEW", expectedRevision: 1 }
    });
    expect(response.statusCode).toBe(409);
    expect((await f.get()).contentItem.status).toBe("DRAFT");
  });
});
