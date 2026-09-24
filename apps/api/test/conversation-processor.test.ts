import Fastify, { type FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  env: { NODE_ENV: "development", CONVERSATION_PROCESSOR_ENABLED: true },
  process: vi.fn<() => Promise<void>>().mockResolvedValue(undefined),
  get: vi.fn().mockResolvedValue({ id: "conversation" }),
  submit: vi.fn().mockResolvedValue({ id: "conversation", latestRun: { status: "QUEUED" } })
}));

vi.mock("../src/config/env", () => ({ env: mocks.env }));
vi.mock("../src/content/content-aggregate", () => ({ ContentAggregateError: class extends Error {} }));
vi.mock("../src/content/conversation-service", () => ({
  ConversationError: class extends Error {},
  getContentConversation: mocks.get,
  submitConversationTurn: mocks.submit,
  confirmConversationActions: vi.fn(),
  processConversationRuns: mocks.process
}));
vi.mock("../src/tenancy/workspace-context", () => ({
  requireWorkspaceContext: () => ({ workspaceId: "workspace", userId: "user" })
}));

import { registerConversationRoutes } from "../src/content/conversation-routes";

let app: FastifyInstance | undefined;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ["setInterval", "clearInterval"] });
  mocks.env.NODE_ENV = "development";
  mocks.env.CONVERSATION_PROCESSOR_ENABLED = true;
  mocks.process.mockReset().mockResolvedValue(undefined);
  mocks.get.mockClear();
  mocks.submit.mockClear();
});

afterEach(async () => {
  await app?.close();
  app = undefined;
  vi.useRealTimers();
});

async function readyApp() {
  app = Fastify();
  await registerConversationRoutes(app);
  await app.ready();
  return app;
}

describe("conversation processor ownership", () => {
  it("keeps read, submit and confirmation routes available without starting a disabled processor", async () => {
    mocks.env.CONVERSATION_PROCESSOR_ENABLED = false;
    const server = await readyApp();
    const url = "/v1/content/00000000-0000-4000-8000-000000000001/conversation";

    expect((await server.inject({ method: "GET", url })).statusCode).toBe(200);
    const submitted = await server.inject({
      method: "POST",
      url,
      payload: { requestId: "00000000-0000-4000-8000-000000000002", expectedRevision: 1, message: "Edit the draft", locale: "en" }
    });
    expect(submitted.statusCode).toBe(202);
    expect(submitted.json().data.latestRun.status).toBe("QUEUED");
    expect(server.hasRoute({ method: "POST", url: "/v1/content/:contentItemId/conversation/:runId/confirm" })).toBe(true);
    expect(mocks.get).toHaveBeenCalledOnce();
    expect(mocks.submit).toHaveBeenCalledOnce();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(3_000);
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("runs the enabled processor after readiness and stops its interval on close", async () => {
    const server = await readyApp();
    expect(mocks.process).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(750);
    expect(mocks.process).toHaveBeenCalledOnce();

    await server.close();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(mocks.process).toHaveBeenCalledOnce();
  });

  it("preserves the existing test-environment suppression when enabled", async () => {
    mocks.env.NODE_ENV = "test";
    await readyApp();
    expect(vi.getTimerCount()).toBe(0);
    await vi.advanceTimersByTimeAsync(1_500);
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
