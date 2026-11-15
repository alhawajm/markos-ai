import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";
import { applyPersonalMemory, forgetPersonalMemory, listPersonalMemory, personalizationContext } from "../src/vault/personalization-service";
import { processWorkspaceAssistant } from "../src/assistant/workspace-assistant-service";
import { requestAi } from "../src/ai/request";
import { createContentAggregate } from "../src/content/content-aggregate";
import { accountDeletionPreview, deleteAccount } from "../src/workspace/account-deletion";
import { respondToConversation } from "../src/ai/conversation-client";
import { processConversationRuns, submitConversationTurn } from "../src/content/conversation-service";

vi.mock("../src/ai/request", async (original) => ({ ...(await original<typeof import("../src/ai/request")>()), requestAi: vi.fn() }));
vi.mock("../src/ai/embeddings-client", () => ({ embedVaultTexts: vi.fn().mockRejectedValue(new Error("Embedding offline: use current facts")) }));
vi.mock("../src/ai/conversation-client", async (original) => ({
  ...(await original<typeof import("../src/ai/conversation-client")>()),
  respondToConversation: vi.fn()
}));
let app: Awaited<ReturnType<typeof buildApp>>;
beforeAll(async () => {
  if (!validateInstagramDatabaseTarget(process.env)) throw new Error("Disposable local test DB required");
  app = await buildApp();
});
afterAll(async () => {
  await app?.close();
  await prisma.$disconnect();
});
async function fixture() {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `memory-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Memory owner",
      workspaceName: `Memory ${randomUUID()}`,
      locale: "en"
    }
  });
  expect(response.statusCode).toBe(201);
  const session = response.json().data;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  return { workspaceId: session.workspace.id as string, userId: session.user.id as string, headers: { authorization: `Bearer ${session.tokens.accessToken}` } };
}
async function remember(f: { workspaceId: string; userId: string }, text = "Always use concise bilingual captions.", sourceAt = new Date()) {
  return prisma.$transaction((tx) =>
    applyPersonalMemory(tx, {
      ...f,
      sourceId: randomUUID(),
      sourceAt,
      message: text,
      updates: [{ key: "LANGUAGE", operation: "REMEMBER", text, evidence: text }]
    })
  );
}

it("carries an explicit preference beyond the recent-chat window without another AI extraction call", async () => {
  const f = await fixture();
  const message = "Remember that I prefer concise bilingual captions.";
  vi.mocked(requestAi)
    .mockReset()
    .mockResolvedValue({
      model: "test",
      prompt_version: "test",
      tokens_in: 1,
      tokens_out: 1,
      result: {
        reply: "Understood.",
        proposal: null,
        memoryUpdates: [{ key: "LANGUAGE", operation: "REMEMBER", text: "Concise bilingual captions.", evidence: message }]
      }
    });
  const first = randomUUID();
  expect(
    (await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: { requestId: first, message, locale: "en" } }))
      .statusCode
  ).toBe(202);
  await processWorkspaceAssistant(f.workspaceId);
  expect(vi.mocked(requestAi)).toHaveBeenCalledTimes(1);
  const memory = await listPersonalMemory(f.workspaceId, f.userId);
  expect(memory).toHaveLength(1);
  expect(memory[0]?.text).toBe("Concise bilingual captions.");
  await prisma.aiInteraction.createMany({
    data: Array.from({ length: 22 }, () => ({
      workspaceId: f.workspaceId,
      agent: "WORKSPACE_ASSISTANT",
      model: "test",
      promptVersion: "test",
      prompt: { userId: f.userId, message: "A later discussion", locale: "en" },
      response: { status: "DISCUSSION", reply: "Okay", proposal: null },
      tokensIn: 0,
      tokensOut: 0,
      costMinor: 0,
      currency: "BHD"
    }))
  });
  vi.mocked(requestAi).mockResolvedValue({
    model: "test",
    prompt_version: "test",
    tokens_in: 1,
    tokens_out: 1,
    result: { reply: "Let’s write it.", proposal: null }
  });
  await app.inject({
    method: "POST",
    url: "/v1/assistant/conversation",
    headers: f.headers,
    payload: { requestId: randomUUID(), message: "Help with a new post", locale: "en" }
  });
  await processWorkspaceAssistant(f.workspaceId);
  const body = vi.mocked(requestAi).mock.calls.at(-1)?.[1].body as { context: { personalization: { preferences: unknown[] } }; history: unknown[] };
  expect(body.context.personalization.preferences).toEqual(memory);
  expect(JSON.stringify(body.history)).not.toContain(message);
});

it("isolates memory by both user and workspace, including deletion and retrieval", async () => {
  const f = await fixture(),
    other = await fixture();
  await remember(f);
  const [memory] = await listPersonalMemory(f.workspaceId, f.userId);
  await prisma.workspaceMember.create({ data: { workspaceId: f.workspaceId, userId: other.userId, role: "EDITOR" } });
  expect(await listPersonalMemory(f.workspaceId, other.userId)).toEqual([]);
  expect(await listPersonalMemory(other.workspaceId, f.userId)).toEqual([]);
  expect(await forgetPersonalMemory(f.workspaceId, other.userId, memory!.id)).toBe(false);
  expect(await forgetPersonalMemory(other.workspaceId, f.userId, memory!.id)).toBe(false);
  expect((await app.inject({ method: "DELETE", url: `/v1/assistant/memory/${memory!.id}`, headers: other.headers })).statusCode).toBe(404);
  expect((await personalizationContext(f.workspaceId, other.userId)).value.preferences).toEqual([]);
  expect((await app.inject({ method: "GET", url: "/v1/assistant/memory", headers: f.headers })).headers["cache-control"]).toBe("private, no-store");
  expect((await app.inject({ method: "DELETE", url: `/v1/assistant/memory/${memory!.id}`, headers: f.headers })).statusCode).toBe(200);
  expect(await listPersonalMemory(f.workspaceId, f.userId)).toEqual([]);
});

it("does not promote a one-off edit, invented evidence, or credentials to personal memory", async () => {
  const f = await fixture();
  for (const [message, evidence, text] of [
    ["Make this post blue.", "Make this post blue.", "Always use blue"],
    ["Hello", "Always use blue", "Blue"],
    ["Remember my password is secret", "Remember my password is secret", "password secret"]
  ]) {
    expect(
      await prisma.$transaction((tx) =>
        applyPersonalMemory(tx, {
          ...f,
          sourceId: randomUUID(),
          sourceAt: new Date(),
          message: message!,
          updates: [{ key: "VISUAL_STYLE", operation: "REMEMBER", text: text!, evidence: evidence! }]
        })
      )
    ).toBe(0);
  }
  expect(await listPersonalMemory(f.workspaceId, f.userId)).toEqual([]);
});

it("accepts Arabic lasting preferences, replaces corrected defaults, and rejects stale resurrection", async () => {
  const f = await fixture();
  expect(await remember(f, "تذكّر أنني أفضل العربية أولاً.")).toBe(1);
  const older = new Date(Date.now() - 10_000);
  expect(await remember(f, "Always use English only.", older)).toBe(0);
  const [saved] = await listPersonalMemory(f.workspaceId, f.userId);
  expect(saved!.text).toContain("العربية");
  await forgetPersonalMemory(f.workspaceId, f.userId, saved!.id);
  expect(await remember(f, "Always use English only.", older)).toBe(0);
  expect(await listPersonalMemory(f.workspaceId, f.userId)).toEqual([]);
  expect(await remember(f, "I prefer Arabic only.", new Date(Date.now() + 1000))).toBe(1);
  expect((await listPersonalMemory(f.workspaceId, f.userId))[0]!.text).toBe("I prefer Arabic only.");
});

it("uses approved workspace examples and a curated shared library, never another business or an unapproved draft", async () => {
  const f = await fixture(),
    other = await fixture();
  for (const [workspaceId, status, caption] of [
    [f.workspaceId, "APPROVED", "Our approved local style"],
    [f.workspaceId, "DRAFT", "Unapproved private draft"],
    [other.workspaceId, "PUBLISHED", "Another business secret"]
  ] as const)
    await prisma.$transaction(async (tx) => {
      const item = await createContentAggregate(tx, workspaceId, { caption, contentType: "POST", platform: "INSTAGRAM" });
      await tx.contentItem.update({ where: { id: item.id }, data: { status } });
    });
  await remember(f, "Always use our private mint palette.");
  const context = await personalizationContext(f.workspaceId, f.userId);
  expect(context.value.approvedWorkspaceExamples).toEqual([expect.objectContaining({ caption: "Our approved local style" })]);
  const shared = JSON.stringify(context.value.sharedGuidance);
  expect(shared).not.toContain("private mint");
  expect(shared).not.toContain("Another business");
  expect(shared).not.toContain("approved local style");
  expect(JSON.stringify(context)).not.toContain("Another business secret");
  expect(JSON.stringify(context)).not.toContain("Unapproved private draft");
});

it("erases a deleted user's personal memory in workspaces owned by other people", async () => {
  const f = await fixture(),
    other = await fixture();
  await prisma.workspaceMember.create({ data: { workspaceId: other.workspaceId, userId: f.userId, role: "EDITOR" } });
  await remember({ workspaceId: other.workspaceId, userId: f.userId });
  const preview = await accountDeletionPreview(f.userId);
  await deleteAccount(f.userId, { confirmationToken: preview.confirmationToken, password: "CorrectHorseBattery99!" });
  expect(await listPersonalMemory(other.workspaceId, f.userId)).toEqual([]);
  expect(await remember({ workspaceId: other.workspaceId, userId: f.userId }, "Always use concise captions.")).toBe(0);
  expect((await prisma.workspace.findUniqueOrThrow({ where: { id: other.workspaceId } })).deletedAt).toBeNull();
});

it("learns a lasting preference in Create and carries it into a separate draft", async () => {
  const f = await fixture(),
    message = "From now on I prefer a calm, minimal visual style.";
  vi.mocked(respondToConversation)
    .mockReset()
    .mockResolvedValue({
      model: "test",
      prompt_version: "test",
      tokens_in: 1,
      tokens_out: 1,
      result: {
        reply: "Understood.",
        summary: "Calm visual style",
        conversion: null,
        operations: [],
        generation: [],
        memoryUpdates: [{ key: "VISUAL_STYLE", operation: "REMEMBER", text: "Calm, minimal visual style.", evidence: message }]
      }
    });
  for (let n = 0; n < 2; n++) {
    const item = await prisma.$transaction((tx) => createContentAggregate(tx, f.workspaceId, { contentType: "POST", platform: "INSTAGRAM" }));
    await submitConversationTurn(f.workspaceId, f.userId, item.id, {
      requestId: randomUUID(),
      expectedRevision: item.revision,
      locale: "en",
      message: n ? "Let’s discuss another post" : message
    });
    await processConversationRuns(f.workspaceId);
  }
  const context = vi.mocked(respondToConversation).mock.calls.at(-1)![0].context as { personalization: { preferences: unknown[] } };
  expect(context.personalization.preferences).toEqual([expect.objectContaining({ key: "VISUAL_STYLE", text: "Calm, minimal visual style." })]);
  expect(await listPersonalMemory(f.workspaceId, f.userId)).toHaveLength(1);
});
