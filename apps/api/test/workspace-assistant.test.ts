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
vi.mock("../src/ai/request", async (original) => ({ ...(await original<typeof import("../src/ai/request")>()), requestAi: vi.fn() }));
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
