import { randomUUID } from "node:crypto";
import { describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

vi.mock("../src/ai/embeddings-client", () => ({
  embedVaultTexts: async (texts: string[]) => ({
    model: "test-embedding-model",
    dimensions: 1536,
    embeddings: texts.map(testEmbedding)
  })
}));

vi.mock("../src/ai/agent-client", () => ({
  runAiAgent: async (input: { agent: string; promptTemplate?: { version: string } }) => ({
    model: "test-agent-model",
    prompt_version: `${input.agent.toLowerCase()}.provider.test`,
    tokens_in: 21,
    tokens_out: 34,
    output: {
      agent: input.agent,
      promptTemplateVersion: input.promptTemplate?.version,
      summary: "Prompt variant integration response"
    }
  })
}));

describe("prompt routes", () => {
  it("creates, lists, updates, and selects active prompt variants", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const version = `content.ab.${randomUUID()}`;

    const created = await app.inject({
      method: "POST",
      url: "/v1/prompts",
      headers,
      payload: {
        agent: "CONTENT",
        version,
        body: "Generate a bilingual Instagram caption with strict brand tone.",
        trafficPct: 100,
        active: true
      }
    });
    const promptId = created.json().data.id as string;
    const list = await app.inject({
      method: "GET",
      url: "/v1/prompts?agent=CONTENT",
      headers
    });
    const selected = await app.inject({
      method: "POST",
      url: "/v1/prompts/select",
      headers,
      payload: {
        agent: "CONTENT",
        seed: "workspace-a/topic-a"
      }
    });
    const updated = await app.inject({
      method: "PATCH",
      url: `/v1/prompts/${promptId}`,
      headers,
      payload: {
        trafficPct: 50
      }
    });

    expect(created.statusCode).toBe(200);
    expect(created.json()).toMatchObject({
      data: {
        agent: "CONTENT",
        version,
        trafficPct: 100,
        active: true
      }
    });
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual(expect.arrayContaining([expect.objectContaining({ id: promptId, version })]));
    expect(selected.statusCode).toBe(200);
    expect(selected.json()).toMatchObject({
      data: {
        selected: {
          id: promptId,
          version
        },
        candidates: [expect.objectContaining({ id: promptId })],
        seed: "workspace-a/topic-a"
      }
    });
    expect(updated.statusCode).toBe(200);
    expect(updated.json().data.trafficPct).toBe(50);
    await expect(
      prisma.auditLog.findMany({
        where: {
          action: {
            in: ["PROMPT_TEMPLATE_CREATED", "PROMPT_TEMPLATE_UPDATED"]
          },
          actorId: session.user.id,
          targetId: promptId,
          targetType: "PromptTemplate",
          workspaceId: session.workspace.id
        }
      })
    ).resolves.toHaveLength(2);

    await app.close();
  });

  it("stamps selected prompt variants onto AI interactions", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const version = `strategist.ab.${randomUUID()}`;

    await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers,
      payload: {
        entries: [
          {
            key: "profile",
            value: {
              name: "Pearl Coffee",
              location: "Manama, Bahrain"
            }
          }
        ]
      }
    });
    await app.inject({
      method: "POST",
      url: "/v1/prompts",
      headers,
      payload: {
        agent: "MARKETING_STRATEGIST",
        version,
        body: "Use experimental strategist variant B with concise recommendations.",
        trafficPct: 100,
        active: true
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/agents/run",
      headers,
      payload: {
        agent: "MARKETING_STRATEGIST",
        task: "increase wholesale coffee leads",
        locale: "en"
      }
    });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "MARKETING_STRATEGIST"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      promptVersion: version,
      output: {
        promptTemplateVersion: version
      }
    });
    expect(interaction).toMatchObject({
      promptVersion: version,
      tokensIn: 21,
      tokensOut: 34,
      model: "test-agent-model"
    });
    expect(interaction.prompt).toMatchObject({
      promptTemplate: {
        version,
        trafficPct: 100,
        active: true
      }
    });
    expect(interaction.response).toMatchObject({
      providerPromptVersion: "marketing_strategist.provider.test"
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `prompts-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Prompt User",
      workspaceName: `Prompt Workspace ${randomUUID()}`,
      locale: "en"
    }
  });

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: session.user.id
    }
  });

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: true
    }
  };
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

function testEmbedding(text: string): number[] {
  const vector = Array.from({ length: 1536 }, () => 0);

  for (const token of text.toLowerCase().split(/\W+/).filter(Boolean)) {
    const index = token.charCodeAt(0) % vector.length;
    vector[index] = (vector[index] ?? 0) + 1;
  }

  const norm = Math.sqrt(vector.reduce((sum, value) => sum + value * value, 0));

  return norm === 0 ? vector : vector.map((value) => value / norm);
}
