import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { validateInstagramDatabaseTarget } from "./helpers/instagram-database";
import { processWorkspaceAssistant } from "../src/assistant/workspace-assistant-service";
import { processConversationRuns } from "../src/content/conversation-service";
import { respondToConversation } from "../src/ai/conversation-client";
import { requestAi } from "../src/ai/request";
import { workspaceAssistantHistory, confirmWorkspacePlan } from "../src/assistant/workspace-assistant-service";
import { saveOnboardingModule } from "../src/onboarding/onboarding-service";
import { runWorkspaceAgent } from "../src/agents/agent-service";
import { assistantArtifacts } from "../src/assistant/workspace-artifacts";
import { accountDeletionPreview, deleteAccount } from "../src/workspace/account-deletion";
import { exportWorkspaceData, eraseWorkspaceData } from "../src/workspace/pdpl-service";
vi.mock("../src/agents/agent-service", () => ({ runWorkspaceAgent: vi.fn() }));
vi.mock("../src/ai/request", async (original) => ({ ...(await original<typeof import("../src/ai/request")>()), requestAi: vi.fn() }));
vi.mock("../src/ai/embeddings-client", () => ({ embedVaultTexts: vi.fn().mockRejectedValue(new Error("Use current Vault facts in this focused test")) }));
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
beforeEach(() => {
  vi.mocked(runWorkspaceAgent).mockReset();
  vi.mocked(requestAi)
    .mockReset()
    .mockResolvedValue({
      model: "test",
      prompt_version: "test",
      tokens_in: 5,
      tokens_out: 8,
      result: {
        reply: "Let’s make a bakery post.",
        proposal: {
          action: "CONTENT",
          summary: "A post with a bilingual caption.",
          instruction: "Write a short bilingual bakery caption only.",
          contentType: "POST",
          contentItemId: null,
          durationDays: null,
          startsAt: null,
          publishesPerDay: null
        }
      }
    });
  vi.mocked(respondToConversation)
    .mockReset()
    .mockResolvedValue({
      model: "test",
      prompt_version: "test",
      tokens_in: 5,
      tokens_out: 8,
      result: {
        reply: "Proposed",
        summary: "Bakery",
        conversion: null,
        generation: [],
        operations: [{ type: "updateContent", field: "caption", value: "Fresh bread. خبز طازج." }]
      }
    });
});
async function fixture() {
  const r = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `assistant-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Home Assistant",
      workspaceName: `Assistant ${randomUUID()}`,
      locale: "en"
    }
  });
  expect(r.statusCode).toBe(201);
  const session = r.json().data;
  await prisma.user.update({ where: { id: session.user.id }, data: { isVerified: true } });
  return {
    session,
    headers: { authorization: `Bearer ${session.tokens.accessToken}` },
    input: { requestId: randomUUID(), message: "Make a bakery post", locale: "en" },
    get: async () =>
      (await app.inject({ method: "GET", url: "/v1/assistant/conversation", headers: { authorization: `Bearer ${session.tokens.accessToken}` } })).json().data
  };
}

it("creates exactly one chat post draft per request and keeps it private", async () => {
  const owner = await fixture();
  const other = await fixture();
  const payload = { ...owner.input, chatId: randomUUID(), message: "Design a post for our opening hours" };
  const send = (headers: typeof owner.headers, body = payload) => app.inject({ method: "POST", url: "/v1/assistant/post-designs", headers, payload: body });
  const first = await send(owner.headers);
  expect(first.statusCode).toBe(200);
  const { id, contentItemId } = first.json().data;
  expect(first.json().data).toMatchObject({ id: payload.requestId, chatId: payload.chatId, postDesign: true, status: "COMPLETED" });
  expect((await send(owner.headers)).json().data.contentItemId).toBe(contentItemId);
  expect((await send(owner.headers, { ...payload, message: "Different brief" })).statusCode).toBe(409);
  expect((await send(other.headers)).statusCode).toBe(409);
  expect((await send(other.headers, { ...payload, requestId: randomUUID() })).statusCode).toBe(404);
  expect(await prisma.contentItem.count({ where: { workspaceId: owner.session.workspace.id, id: contentItemId } })).toBe(1);
  const history = await app.inject({ method: "GET", url: `/v1/assistant/chats/${payload.chatId}/messages`, headers: owner.headers });
  expect(history.json().data.turns).toEqual([expect.objectContaining({ id, postDesign: true, contentItemId })]);
});

it("keeps new chats separate, scopes model history and preserves a proposal when another chat starts", async () => {
  const f = await fixture(),
    a = randomUUID(),
    b = randomUUID();
  const send = (chatId: string, message: string) =>
    app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: { ...f.input, requestId: randomUUID(), chatId, message } });
  expect((await send(a, "A private bread launch")).statusCode).toBe(202);
  await processWorkspaceAssistant(f.session.workspace.id);
  const [first] = await workspaceAssistantHistory(f.session.workspace.id, f.session.user.id, undefined, a);
  await send(b, "An unrelated coffee request");
  await processWorkspaceAssistant(f.session.workspace.id);
  const body = vi.mocked(requestAi).mock.calls.at(-1)![1].body as { history: { text: string }[] };
  expect(JSON.stringify(body.history)).not.toContain("bread launch");
  expect((await workspaceAssistantHistory(f.session.workspace.id, f.session.user.id, undefined, a)).map((t) => t.message)).toEqual(["A private bread launch"]);
  expect(await f.get()).toEqual([]);
  await expect(confirmWorkspacePlan(f.session.workspace.id, f.session.user.id, first!.id, first!.confirmationToken!)).resolves.toMatchObject({
    status: "EXECUTING"
  });
  const list = await app.inject({ method: "GET", url: "/v1/assistant/chats", headers: f.headers });
  expect(list.headers["cache-control"]).toBe("private, no-store");
  expect(
    list
      .json()
      .data.items.map((c: { id: string }) => c.id)
      .sort()
  ).toEqual([a, b].sort());
  const renamed = await app.inject({ method: "PATCH", url: `/v1/assistant/chats/${a}`, headers: f.headers, payload: { title: "Bread launch" } });
  expect(renamed.json().data.title).toBe("Bread launch");
});

it("protects chat reads, writes, replay and composite links across accounts/workspaces, with RLS", async () => {
  const f = await fixture(),
    other = await fixture(),
    chatId = randomUUID();
  await prisma.workspaceMember.create({ data: { workspaceId: f.session.workspace.id, userId: other.session.user.id, role: "EDITOR" } });
  const payload = { ...f.input, chatId };
  expect((await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload })).statusCode).toBe(202);
  for (const headers of [other.headers, { ...other.headers, "x-workspace-id": f.session.workspace.id }]) {
    expect((await app.inject({ method: "GET", url: `/v1/assistant/chats/${chatId}/messages`, headers })).statusCode).toBe(404);
    expect((await app.inject({ method: "PATCH", url: `/v1/assistant/chats/${chatId}`, headers, payload: { title: "Take over" } })).statusCode).toBe(404);
    expect(
      (await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers, payload: { ...payload, requestId: randomUUID() } })).statusCode
    ).toBe(404);
    expect((await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers, payload })).statusCode).toBe(409);
  }
  await expect(prisma.aiInteraction.update({ where: { id: payload.requestId }, data: { workspaceId: other.session.workspace.id } })).rejects.toThrow();
  await prisma.$transaction(async (tx) => {
    await tx.$executeRaw`SET LOCAL ROLE markos_app`;
    await tx.$executeRaw`SELECT set_config('app.current_workspace', ${other.session.workspace.id}, true)`;
    expect(await tx.workspaceChat.findMany({ where: { id: chatId } })).toEqual([]);
    expect((await tx.workspaceChat.updateMany({ where: { id: chatId }, data: { title: "Hidden" } })).count).toBe(0);
  });
  await expect(
    prisma.$transaction(async (tx) => {
      await tx.$executeRaw`SET LOCAL ROLE markos_app`;
      await tx.$executeRaw`SELECT set_config('app.current_workspace', ${other.session.workspace.id}, true)`;
      await tx.workspaceChat.create({ data: { id: randomUUID(), workspaceId: f.session.workspace.id, userId: f.session.user.id, title: "Forbidden" } });
    })
  ).rejects.toThrow();
});

it("migrates the existing Home conversation once and preserves legacy retries and message pagination", async () => {
  const f = await fixture();
  await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: f.input });
  // Simulate an interaction written before chat IDs existed.
  const old = await prisma.aiInteraction.findUniqueOrThrow({ where: { id: f.input.requestId } });
  await prisma.aiInteraction.update({ where: { id: old.id }, data: { workspaceChatId: null } });
  await prisma.workspaceChat.deleteMany({ where: { workspaceId: f.session.workspace.id } });
  const list = (await app.inject({ method: "GET", url: "/v1/assistant/chats", headers: f.headers })).json().data;
  expect(list.items).toHaveLength(1);
  const chat = list.items[0];
  expect(chat.legacy).toBe(true);
  expect((await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: f.input })).statusCode).toBe(202);
  await prisma.aiInteraction.createMany({
    data: Array.from({ length: 24 }, (_, i) => ({
      id: randomUUID(),
      workspaceId: f.session.workspace.id,
      workspaceChatId: chat.id,
      agent: "WORKSPACE_ASSISTANT",
      promptVersion: "test",
      prompt: { userId: f.session.user.id, message: `Older ${i}`, locale: "en" },
      response: { status: "DISCUSSION", reply: "Okay", proposal: null },
      model: "test",
      tokensIn: 0,
      tokensOut: 0,
      costMinor: 0,
      currency: "BHD",
      createdAt: new Date(Date.now() + i * 1000)
    }))
  });
  const page1 = (await app.inject({ method: "GET", url: `/v1/assistant/chats/${chat.id}/messages`, headers: f.headers })).json().data;
  expect(page1.turns).toHaveLength(20);
  const page2 = (await app.inject({ method: "GET", url: `/v1/assistant/chats/${chat.id}/messages?before=${page1.nextBefore}`, headers: f.headers })).json()
    .data;
  expect(page2.turns).toHaveLength(5);
  expect(page2.nextBefore).toBeNull();
  expect(new Set([...page1.turns, ...page2.turns].map((t) => t.id)).size).toBe(25);
  expect((await app.inject({ method: "GET", url: "/v1/assistant/chats?cursor=invalid", headers: f.headers })).statusCode).toBe(400);
});

it("asks for missing campaign settings instead of executing silent defaults", async () => {
  const f = await fixture();
  vi.mocked(requestAi).mockResolvedValueOnce({
    model: "test",
    prompt_version: "test",
    tokens_in: 1,
    tokens_out: 1,
    result: {
      reply: "Let's generate",
      proposal: {
        action: "CAMPAIGN",
        summary: "Launch",
        instruction: "Create a launch campaign",
        contentType: null,
        contentItemId: null,
        durationDays: null,
        startsAt: null,
        publishesPerDay: null
      }
    }
  });
  await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: { ...f.input, message: "I want to create a campaign" } });
  await processWorkspaceAssistant(f.session.workspace.id);
  expect((await f.get())[0]).toMatchObject({ status: "DISCUSSION", proposal: null, reply: expect.stringContaining("how long") });
  expect(await prisma.campaignGenerationJob.count({ where: { workspaceId: f.session.workspace.id } })).toBe(0);
});

it("builds campaign preview cards from the saved result and ignores foreign/deleted campaigns", async () => {
  const f = await fixture(),
    other = await fixture();
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: f.session.workspace.id,
      title: "Pearl launch",
      objective: "Bring visitors",
      content: { summary: "A bilingual launch plan", weeklyCadence: [{ days: [{ posts: [{}, {}] }, { posts: [{}] }] }] },
      startsAt: new Date("2026-12-01T06:00:00Z"),
      endsAt: new Date("2026-12-07T06:00:00Z"),
      durationDays: 7,
      publishesPerDay: 1
    }
  });
  const turn = {
    id: randomUUID(),
    message: "Plan",
    reply: "Ready",
    status: "COMPLETED" as const,
    proposal: null,
    createdAt: new Date().toISOString(),
    campaignId: campaign.id
  };
  expect((await assistantArtifacts(f.session.workspace.id, [turn]))[0]!.result).toMatchObject({
    id: campaign.id,
    title: "Pearl launch",
    postCount: 3,
    durationDays: 7,
    publishesPerDay: 1,
    kind: "CAMPAIGN"
  });
  expect((await assistantArtifacts(other.session.workspace.id, [turn]))[0]!.result).toBeUndefined();
  expect((await assistantArtifacts(f.session.workspace.id, [{ ...turn, status: "EXECUTING" }]))[0]!.result).toBeUndefined();
  await prisma.campaign.update({ where: { id: campaign.id }, data: { deletedAt: new Date() } });
  expect((await assistantArtifacts(f.session.workspace.id, [turn]))[0]!.result).toBeUndefined();
});

it("removes private chats when their account is deleted without deleting another member's chats", async () => {
  const f = await fixture(),
    other = await fixture();
  await prisma.workspaceMember.create({ data: { workspaceId: other.session.workspace.id, userId: f.session.user.id, role: "EDITOR" } });
  for (const userId of [f.session.user.id, other.session.user.id])
    await prisma.workspaceChat.create({ data: { id: randomUUID(), workspaceId: other.session.workspace.id, userId, title: "Private" } });
  const preview = await accountDeletionPreview(f.session.user.id);
  await deleteAccount(f.session.user.id, { confirmationToken: preview.confirmationToken, password: "CorrectHorseBattery99!" });
  expect(await prisma.workspaceChat.count({ where: { userId: f.session.user.id } })).toBe(0);
  expect(await prisma.workspaceChat.count({ where: { userId: other.session.user.id } })).toBe(1);
});

it("exports only the owner's private chats and erases workspace chat data", async () => {
  const f = await fixture(),
    other = await fixture();
  await prisma.workspaceMember.create({ data: { workspaceId: f.session.workspace.id, userId: other.session.user.id, role: "EDITOR" } });
  const rows = await Promise.all(
    [f.session.user.id, other.session.user.id].map(async (userId) => {
      const chat = await prisma.workspaceChat.create({
        data: { id: randomUUID(), workspaceId: f.session.workspace.id, userId, title: "Private conversation" }
      });
      return prisma.aiInteraction.create({
        data: {
          id: randomUUID(),
          workspaceId: f.session.workspace.id,
          workspaceChatId: chat.id,
          agent: "WORKSPACE_ASSISTANT",
          promptVersion: "test",
          prompt: { userId, message: "Private", locale: "en" },
          response: { status: "DISCUSSION", reply: "Private", proposal: null },
          model: "test",
          tokensIn: 0,
          tokensOut: 0,
          costMinor: 0,
          currency: "BHD"
        }
      });
    })
  );
  const exported = await exportWorkspaceData(f.session.workspace.id);
  expect((exported.records.aiInteractions as { id: string }[]).map((row) => row.id)).toEqual([rows[0]!.id]);
  expect(exported.records.workspaceChats).toHaveLength(1);
  await eraseWorkspaceData({ workspaceId: f.session.workspace.id, actorId: f.session.user.id });
  expect(await prisma.workspaceChat.count({ where: { workspaceId: f.session.workspace.id } })).toBe(0);
  expect(await prisma.aiInteraction.count({ where: { workspaceId: f.session.workspace.id, deletedAt: null } })).toBe(0);
});
it("reads the latest completed strategy independently of chat pagination and isolates members and workspaces", async () => {
  const f = await fixture(),
    other = await fixture();
  await prisma.workspaceMember.create({ data: { workspaceId: f.session.workspace.id, userId: other.session.user.id, role: "EDITOR" } });
  expect((await app.inject({ method: "GET", url: "/v1/assistant/strategy" })).statusCode).toBe(401);
  expect((await app.inject({ method: "GET", url: "/v1/assistant/strategy", headers: f.headers })).json().data).toBeNull();
  const older = new Date("2026-01-01T12:00:00Z");
  const row = await prisma.aiInteraction.create({
    data: {
      id: randomUUID(),
      workspaceId: f.session.workspace.id,
      agent: "WORKSPACE_ASSISTANT",
      accepted: true,
      promptVersion: "test",
      prompt: { userId: f.session.user.id, message: "Make a strategy", locale: "en", intent: "GENERAL" },
      response: {
        status: "COMPLETED",
        reply: "Saved",
        proposal: { action: "STRATEGY" },
        strategy: { summary: "Owner strategy", strategy: { nextActions: ["Plan the launch"] } }
      },
      model: "test",
      tokensIn: 0,
      tokensOut: 0,
      costMinor: 0,
      currency: "BHD",
      createdAt: older
    }
  });
  await prisma.aiInteraction.createMany({
    data: Array.from({ length: 22 }, () => ({
      id: randomUUID(),
      workspaceId: f.session.workspace.id,
      agent: "WORKSPACE_ASSISTANT",
      accepted: false,
      promptVersion: "test",
      prompt: { userId: f.session.user.id, message: "Later discussion", locale: "en" },
      response: { status: "DISCUSSION", reply: "No strategy", proposal: null },
      model: "test",
      tokensIn: 0,
      tokensOut: 0,
      costMinor: 0,
      currency: "BHD"
    }))
  });
  expect((await f.get()).every((turn: { id: string }) => turn.id !== row.id)).toBe(true);
  const response = await app.inject({ method: "GET", url: "/v1/assistant/strategy", headers: f.headers });
  expect(response.statusCode).toBe(200);
  expect(response.headers["cache-control"]).toBe("private, no-store");
  expect(response.json().data).toMatchObject({ id: row.id, strategy: { summary: "Owner strategy" } });
  for (const headers of [other.headers, { ...other.headers, "x-workspace-id": f.session.workspace.id }])
    expect((await app.inject({ method: "GET", url: "/v1/assistant/strategy", headers })).json().data).toBeNull();
  await prisma.aiInteraction.update({ where: { id: row.id }, data: { accepted: false } });
  expect((await app.inject({ method: "GET", url: "/v1/assistant/strategy", headers: f.headers })).json().data).toBeNull();
});

it("queues a message once, creates nothing before confirmation, then executes without a second confirmation", async () => {
  const f = await fixture();
  const send = () => app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: f.input });
  expect((await send()).statusCode).toBe(202);
  expect((await send()).statusCode).toBe(202);
  await processWorkspaceAssistant(f.session.workspace.id);
  let turn = (await f.get())[0];
  expect(turn.status).toBe("PROPOSED");
  expect(await prisma.contentItem.count({ where: { workspaceId: f.session.workspace.id } })).toBe(0);
  const confirm = () =>
    app.inject({
      method: "POST",
      url: `/v1/assistant/conversation/${turn.id}/confirm`,
      headers: f.headers,
      payload: { confirmationToken: turn.confirmationToken }
    });
  expect((await confirm()).statusCode).toBe(200);
  expect((await confirm()).statusCode).toBe(200);
  expect(await prisma.contentItem.count({ where: { workspaceId: f.session.workspace.id } })).toBe(1);
  await processWorkspaceAssistant(f.session.workspace.id);
  await processConversationRuns(f.session.workspace.id);
  await processWorkspaceAssistant(f.session.workspace.id);
  turn = (await f.get())[0];
  expect(turn.status).toBe("COMPLETED");
  const draft = await prisma.contentItem.findUniqueOrThrow({ where: { id: turn.contentItemId } });
  expect(draft.caption).toBe("Fresh bread. خبز طازج.");
  expect(await prisma.conversationRun.findFirst({ where: { workspaceId: f.session.workspace.id } })).toMatchObject({ status: "SUCCEEDED" });
  expect(respondToConversation).toHaveBeenCalledOnce();
});
it("preserves a long campaign's date and publishing intensity through the confirmed handoff", async () => {
  const f = await fixture();
  await saveOnboardingModule(f.session.workspace.id, "company", { name: "Long campaign bakery", socials: [], languages: [] });
  vi.mocked(requestAi).mockResolvedValueOnce({
    model: "test",
    prompt_version: "test",
    tokens_in: 1,
    tokens_out: 1,
    result: {
      reply: "Here is the plan.",
      proposal: {
        action: "CAMPAIGN",
        summary: "A 90-day bakery campaign.",
        instruction: "Plan 90 days for the bakery, three posts a day, starting 1 December.",
        contentType: null,
        contentItemId: null,
        durationDays: 90,
        startsAt: "2026-12-01T06:00:00.000Z",
        publishesPerDay: 3
      }
    }
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: "/v1/assistant/conversation",
        headers: f.headers,
        payload: { ...f.input, message: "Plan 90 days from December 1, three posts a day." }
      })
    ).statusCode
  ).toBe(202);
  await processWorkspaceAssistant(f.session.workspace.id);
  const turn = (await f.get())[0];
  expect(turn.status).toBe("PROPOSED");
  await confirmWorkspacePlan(f.session.workspace.id, f.session.user.id, turn.id, turn.confirmationToken);
  await processWorkspaceAssistant(f.session.workspace.id);
  const job = await prisma.campaignGenerationJob.findFirstOrThrow({ where: { workspaceId: f.session.workspace.id } });
  expect(job.input).toMatchObject({ durationDays: 90, startsAt: "2026-12-01T06:00:00.000Z", publishesPerDay: 3 });
  expect(job.totalWeeks).toBe(13);
  expect((await f.get())[0]).toMatchObject({
    status: "EXECUTING",
    campaignRequestId: turn.id,
    campaign: { status: "QUEUED", progress: { completedWeeks: 0, totalWeeks: 13 } }
  });
  await prisma.campaignGenerationJob.update({
    where: { id: job.id },
    data: { status: "FAILED", completedWeeks: 1, resumable: true, errorCode: "AI_PROVIDER_TIMEOUT" }
  });
  const stopped = (await f.get())[0];
  expect(stopped).toMatchObject({ status: "FAILED", campaign: { status: "FAILED", canResume: true, progress: { completedWeeks: 1, totalWeeks: 13 } } });
  expect(stopped.campaignId).toBeUndefined();
  const campaign = await prisma.campaign.create({
    data: {
      workspaceId: f.session.workspace.id,
      title: "Ready campaign",
      durationDays: 90,
      publishesPerDay: 3,
      startsAt: new Date("2026-12-01"),
      endsAt: new Date("2027-03-01"),
      content: {}
    }
  });
  await prisma.campaignGenerationJob.update({
    where: { id: job.id },
    data: { status: "COMPLETED", campaignId: campaign.id, completedWeeks: 13, errorCode: null }
  });
  expect((await f.get())[0]).toMatchObject({ status: "COMPLETED", campaignId: campaign.id, campaign: { status: "COMPLETED", canResume: false } });
  expect(await workspaceAssistantHistory(f.session.workspace.id, randomUUID())).toEqual([]);
});
it("isolates messages and confirmation tokens by workspace AND user", async () => {
  const f = await fixture(),
    other = await fixture();
  await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: f.input });
  await processWorkspaceAssistant(f.session.workspace.id);
  const turn = (await f.get())[0];
  expect(await other.get()).toEqual([]);
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/v1/assistant/conversation/${turn.id}/confirm`,
        headers: other.headers,
        payload: { confirmationToken: turn.confirmationToken }
      })
    ).statusCode
  ).toBe(404);
  expect((await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: other.headers, payload: f.input })).statusCode).toBe(409);
  expect(await prisma.contentItem.count({ where: { workspaceId: other.session.workspace.id } })).toBe(0);
});
it("rejects an expired proposal after a newer instruction", async () => {
  const f = await fixture();
  await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: f.input });
  await processWorkspaceAssistant(f.session.workspace.id);
  const turn = (await f.get())[0];
  await app.inject({
    method: "POST",
    url: "/v1/assistant/conversation",
    headers: f.headers,
    payload: { ...f.input, requestId: randomUUID(), message: "Actually use a carousel" }
  });
  expect(
    (
      await app.inject({
        method: "POST",
        url: `/v1/assistant/conversation/${turn.id}/confirm`,
        headers: f.headers,
        payload: { confirmationToken: turn.confirmationToken }
      })
    ).statusCode
  ).toBe(409);
});

it("keeps Home replies private to the member and lets that member report a reply", async () => {
  const f = await fixture(),
    other = await fixture();
  await prisma.workspaceMember.create({ data: { workspaceId: f.session.workspace.id, userId: other.session.user.id, role: "EDITOR" } });
  await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: f.input });
  await processWorkspaceAssistant(f.session.workspace.id);
  const turn = (await f.get())[0];
  expect(await workspaceAssistantHistory(f.session.workspace.id, other.session.user.id)).toEqual([]);
  await expect(confirmWorkspacePlan(f.session.workspace.id, other.session.user.id, turn.id, turn.confirmationToken)).rejects.toMatchObject({
    code: "ASSISTANT_NOT_FOUND"
  });
  const reported = await app.inject({
    method: "POST",
    url: "/v1/content-reports",
    headers: f.headers,
    payload: { requestId: randomUUID(), source: "ASSISTANT_MESSAGE", sourceId: turn.id, reason: "INACCURATE", note: "This response needs correction." }
  });
  expect(reported.statusCode).toBe(201);
  expect(await prisma.contentReport.findUniqueOrThrow({ where: { id: reported.json().data.id } })).toMatchObject({
    sourceId: turn.id,
    excerpt: expect.stringContaining("bakery")
  });
});

it("scopes task discussions and confirmations while rejecting an ID reused for another intent", async () => {
  const f = await fixture();
  const content = { ...f.input, intent: "CONTENT" };
  expect((await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: content })).statusCode).toBe(202);
  await processWorkspaceAssistant(f.session.workspace.id);
  const first = (await workspaceAssistantHistory(f.session.workspace.id, f.session.user.id, "CONTENT"))[0]!;
  expect(first.intent).toBe("CONTENT");
  expect(
    (await app.inject({ method: "POST", url: "/v1/assistant/conversation", headers: f.headers, payload: { ...content, intent: "STRATEGY" } })).statusCode
  ).toBe(409);
  await app.inject({
    method: "POST",
    url: "/v1/assistant/conversation",
    headers: f.headers,
    payload: { ...f.input, requestId: randomUUID(), intent: "STRATEGY", message: "Find a useful strategy" }
  });
  await processWorkspaceAssistant(f.session.workspace.id);
  const scoped = await app.inject({ method: "GET", url: "/v1/assistant/conversation?intent=CONTENT", headers: f.headers });
  expect(scoped.json().data.map((turn: { id: string }) => turn.id)).toEqual([first.id]);
  await expect(confirmWorkspacePlan(f.session.workspace.id, f.session.user.id, first.id, first.confirmationToken!)).resolves.toMatchObject({
    status: "EXECUTING"
  });
  expect((await app.inject({ method: "GET", url: "/v1/assistant/conversation?intent=UNKNOWN", headers: f.headers })).statusCode).toBe(400);
});

it("keeps the full strategy brief and uses the user's earlier strategy as private advisory context", async () => {
  const f = await fixture(),
    other = await fixture();
  const instruction = "Build a detailed, practical strategy for our bakery. ".repeat(32);
  vi.mocked(requestAi).mockResolvedValueOnce({
    model: "test",
    prompt_version: "test",
    tokens_in: 1,
    tokens_out: 1,
    result: {
      reply: "Here is the plan.",
      proposal: {
        action: "STRATEGY",
        summary: "Build a practical bakery strategy.",
        instruction,
        contentType: null,
        contentItemId: null,
        durationDays: null,
        startsAt: null,
        publishesPerDay: null
      }
    }
  });
  const id = randomUUID();
  await app.inject({
    method: "POST",
    url: "/v1/assistant/conversation",
    headers: f.headers,
    payload: { requestId: id, message: "Help me grow with a strategy", locale: "en", intent: "STRATEGY" }
  });
  await processWorkspaceAssistant(f.session.workspace.id);
  const [plan] = await workspaceAssistantHistory(f.session.workspace.id, f.session.user.id, "STRATEGY");
  vi.mocked(runWorkspaceAgent).mockResolvedValue({
    id: randomUUID(),
    workspaceId: f.session.workspace.id,
    agent: "MARKETING_STRATEGIST",
    promptVersion: "test",
    request: { task: instruction.slice(0, 1000), locale: "en", retrievedContext: [] },
    output: {
      summary: "A private bakery direction",
      strategy: { objectives: ["More qualified visits"], pillars: ["Morning rituals"], nextActions: ["Plan next week"] },
      assumptions: [],
      missingInformation: []
    },
    tokensIn: 1,
    tokensOut: 1,
    model: "test",
    createdAt: new Date().toISOString()
  });
  await confirmWorkspacePlan(f.session.workspace.id, f.session.user.id, id, plan!.confirmationToken!);
  await processWorkspaceAssistant(f.session.workspace.id);
  expect(runWorkspaceAgent).toHaveBeenCalledWith(
    f.session.workspace.id,
    expect.objectContaining({ task: instruction.slice(0, 1000), inputs: { ownerBrief: instruction } }),
    f.session.user.id
  );
  for (const owner of [f, other]) {
    await app.inject({
      method: "POST",
      url: "/v1/assistant/conversation",
      headers: owner.headers,
      payload: { requestId: randomUUID(), message: "Plan a campaign from my direction", locale: "en", intent: "CAMPAIGN" }
    });
    await processWorkspaceAssistant(owner.session.workspace.id);
    const body = vi.mocked(requestAi).mock.calls.at(-1)![1].body as { context: { entryIntent: string; previousStrategy: { summary: string } | null } };
    expect(body.context.entryIntent).toBe("CAMPAIGN");
    if (owner === f) expect(body.context.previousStrategy?.summary).toBe("A private bakery direction");
    else expect(body.context.previousStrategy).toBeNull();
  }
  await prisma.workspaceMember.create({ data: { workspaceId: f.session.workspace.id, userId: other.session.user.id, role: "EDITOR" } });
  const colleagueSent = await app.inject({
    method: "POST",
    url: "/v1/assistant/conversation",
    headers: { ...other.headers, "x-workspace-id": f.session.workspace.id },
    payload: { requestId: randomUUID(), message: "Help with my campaign", locale: "en", intent: "CAMPAIGN" }
  });
  expect(colleagueSent.statusCode).toBe(202);
  await processWorkspaceAssistant(f.session.workspace.id);
  const colleagueContext = vi.mocked(requestAi).mock.calls.at(-1)![1].body as { context: { previousStrategy: unknown } };
  expect(colleagueContext.context.previousStrategy).toBeNull();
});
