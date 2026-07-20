import { randomUUID } from "node:crypto";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { reserveWorkspaceUsage } from "../src/usage/usage-service";
import { processWebsiteIngestJobs } from "../src/vault/website-ingest-service";

afterEach(() => {
  vi.unstubAllGlobals();
});

beforeEach(async () => {
  await prisma.vaultWebsiteIngestJob.updateMany({
    where: { status: "QUEUED" },
    data: { nextRunAt: new Date(Date.now() + 24 * 60 * 60 * 1_000) },
  });
});

describe("asynchronous Vault website ingest jobs", () => {
  it("crawls multiple pages, creates an evidence-backed draft, and meters the extraction", async () => {
    const app = await buildApp();
    const session = await registerVerifiedTestUser(app);
    const other = await registerVerifiedTestUser(app);
    const sourceUrl = `https://deep-${randomUUID()}.example/`;
    const rootOrigin = new URL(sourceUrl).origin;
    const fetchMock = vi.fn(async (input: FetchInput, init?: RequestInit) => {
      const url = requestUrl(input);

      if (url.endsWith("/ai/vault/extract-website")) {
        const body = JSON.parse(String(init?.body)) as {
          model: string;
          pages: unknown[];
        };
        expect(body.model).toBe("local-website-extractor");
        expect(body.pages).toHaveLength(3);

        return Response.json({
          model: body.model,
          prompt_version: "website-extraction.v1.test",
          tokens_in: 34,
          tokens_out: 17,
          candidates: [supportedCandidate(sourceUrl)],
        });
      }

      if (url === sourceUrl) {
        return htmlResponse(`
          <html>
            <head>
              <title>Raedat Jewelry</title>
              <meta name="description" content="Premium jewelry collections crafted for Bahrain businesses" />
            </head>
            <body>
              <h1>Luxury Jewelry Collection</h1>
              <p>Premium jewelry collections crafted for Bahrain businesses</p>
              <a href="/about">About our craft</a>
              <a href="/services">Shop jewelry services</a>
            </body>
          </html>
        `);
      }

      if (url === `${rootOrigin}/about`) {
        return htmlResponse(
          "<html><body><h1>Our Story</h1><p>Handcrafted in Bahrain with meticulous care.</p></body></html>",
        );
      }

      if (url === `${rootOrigin}/services`) {
        return htmlResponse(
          "<html><body><h1>Services</h1><p>Bridal collections and custom jewelry packages.</p></body></html>",
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queued = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/jobs",
      headers: authHeaders(session.tokens.accessToken),
      payload: { url: sourceUrl, maxPages: 3 },
    });

    expect(queued.statusCode).toBe(202);
    expect(queued.json().data).toMatchObject({
      workspaceId: session.workspace.id,
      sourceUrl,
      maxPages: 3,
      status: "QUEUED",
      attempts: 0,
    });

    const jobId = queued.json().data.id as string;
    const crossWorkspace = await app.inject({
      method: "GET",
      url: `/v1/vault/ingest/website/jobs/${jobId}`,
      headers: authHeaders(other.tokens.accessToken),
    });
    expect(crossWorkspace.statusCode).toBe(404);

    const result = await processWebsiteIngestJobs({
      limit: 1,
      now: new Date(Date.now() + 1_000),
    });
    expect(result).toEqual({ completed: 1, failed: 0, retried: 0 });

    const completed = await app.inject({
      method: "GET",
      url: `/v1/vault/ingest/website/jobs/${jobId}`,
      headers: authHeaders(session.tokens.accessToken),
    });
    expect(completed.statusCode).toBe(200);
    expect(completed.json().data).toMatchObject({
      status: "COMPLETED",
      attempts: 1,
    });
    expect(completed.json().data.draftId).toEqual(expect.any(String));

    const draftResponse = await app.inject({
      method: "GET",
      url: `/v1/vault/ingest/${completed.json().data.draftId}`,
      headers: authHeaders(session.tokens.accessToken),
    });
    expect(draftResponse.statusCode).toBe(200);
    expect(draftResponse.json().data).toMatchObject({
      workspaceId: session.workspace.id,
      status: "PENDING",
      sourceUrl,
    });

    const crossWorkspaceDraft = await app.inject({
      method: "GET",
      url: `/v1/vault/ingest/${completed.json().data.draftId}`,
      headers: authHeaders(other.tokens.accessToken),
    });
    expect(crossWorkspaceDraft.statusCode).toBe(404);

    const draft = await prisma.vaultIngestDraft.findUniqueOrThrow({
      where: { id: completed.json().data.draftId },
    });
    expect(draft).toMatchObject({
      workspaceId: session.workspace.id,
      sourceTitle: "Raedat Jewelry",
      status: "PENDING",
    });
    expect(draft.candidates).toEqual([
      expect.objectContaining({ key: "website-profile", sourceUrl }),
    ]);

    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: { workspaceId: session.workspace.id, agent: "WEBSITE_EXTRACTOR" },
    });
    expect(interaction).toMatchObject({
      model: "local-website-extractor",
      promptVersion: "website-extraction.v1.test",
      tokensIn: 34,
      tokensOut: 17,
    });

    const usage = await prisma.usageCounter.findMany({
      where: { workspaceId: session.workspace.id },
      select: { metric: true, used: true },
    });
    expect(usage).toEqual(
      expect.arrayContaining([
        { metric: "AI_GENERATION", used: 1 },
        { metric: "AI_TOKENS_IN", used: 34 },
        { metric: "AI_TOKENS_OUT", used: 17 },
      ]),
    );

    const actions = await prisma.auditLog.findMany({
      where: { workspaceId: session.workspace.id },
      select: { action: true },
    });
    expect(actions.map((entry) => entry.action)).toEqual(
      expect.arrayContaining([
        "VAULT_WEBSITE_INGEST_QUEUED",
        "VAULT_WEBSITE_INGEST_PREVIEWED",
        "VAULT_WEBSITE_INGEST_COMPLETED",
      ]),
    );

    await app.close();
  });

  it("refuses unsupported claims, refunds quota, retries, and eventually fails without a draft", async () => {
    const app = await buildApp();
    const session = await registerVerifiedTestUser(app);
    const sourceUrl = `https://weak-${randomUUID()}.example/`;
    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = requestUrl(input);

      if (url.endsWith("/ai/vault/extract-website")) {
        return Response.json({
          model: "test-website-model",
          prompt_version: "website-extraction.v1.test",
          tokens_in: 12,
          tokens_out: 8,
          candidates: [
            {
              ...supportedCandidate(sourceUrl),
              sourceSnippet: "Fabricated market leadership claim",
            },
          ],
        });
      }

      if (url === sourceUrl) {
        return htmlResponse(
          "<html><head><title>Evidence Brand</title></head><body><p>Verified public description.</p></body></html>",
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queued = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/jobs",
      headers: authHeaders(session.tokens.accessToken),
      payload: { url: sourceUrl, maxPages: 1 },
    });
    const jobId = queued.json().data.id as string;

    const firstRun = await processWebsiteIngestJobs({
      limit: 1,
      now: new Date(Date.now() + 1_000),
    });
    expect(firstRun).toEqual({ completed: 0, failed: 0, retried: 1 });

    let job = await prisma.vaultWebsiteIngestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(job).toMatchObject({ status: "QUEUED", attempts: 1, draftId: null });
    expect(job.error).toContain("no source-supported claims");
    expect(
      fetchMock.mock.calls.filter(([input]) =>
        requestUrl(input).endsWith("/ai/vault/extract-website"),
      ),
    ).toHaveLength(2);

    await prisma.vaultWebsiteIngestJob.update({
      where: { id: jobId },
      data: { attempts: 2, nextRunAt: new Date(0) },
    });
    const finalRun = await processWebsiteIngestJobs({
      limit: 1,
      now: new Date(Date.now() + 2_000),
    });
    expect(finalRun).toEqual({ completed: 0, failed: 1, retried: 0 });

    job = await prisma.vaultWebsiteIngestJob.findUniqueOrThrow({
      where: { id: jobId },
    });
    expect(job).toMatchObject({ status: "FAILED", attempts: 3, draftId: null });
    expect(
      await prisma.vaultIngestDraft.count({
        where: { workspaceId: session.workspace.id },
      }),
    ).toBe(0);

    const generationUsage = await prisma.usageCounter.findFirstOrThrow({
      where: { workspaceId: session.workspace.id, metric: "AI_GENERATION" },
    });
    expect(generationUsage.used).toBe(0);

    await app.close();
  });

  it("does not refund usage when the extraction reservation is rejected", async () => {
    const app = await buildApp();
    const session = await registerVerifiedTestUser(app);
    const sourceUrl = `https://quota-${randomUUID()}.example/`;
    await assignOneGenerationPlan(session.user.id);
    await reserveWorkspaceUsage({
      workspaceId: session.workspace.id,
      metric: "AI_GENERATION",
    });

    const fetchMock = vi.fn(async (input: FetchInput) => {
      const url = requestUrl(input);

      if (url === sourceUrl) {
        return htmlResponse(
          "<html><head><title>Quota Brand</title></head><body><p>Public company evidence.</p></body></html>",
        );
      }

      throw new Error(`Unexpected fetch URL: ${url}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    const queued = await app.inject({
      method: "POST",
      url: "/v1/vault/ingest/website/jobs",
      headers: authHeaders(session.tokens.accessToken),
      payload: { url: sourceUrl, maxPages: 1 },
    });
    const result = await processWebsiteIngestJobs({
      limit: 1,
      now: new Date(Date.now() + 1_000),
    });

    expect(result).toEqual({ completed: 0, failed: 0, retried: 1 });
    expect(
      await prisma.vaultWebsiteIngestJob.findUniqueOrThrow({
        where: { id: queued.json().data.id },
      }),
    ).toMatchObject({ status: "QUEUED", attempts: 1, draftId: null });
    expect(
      await prisma.usageCounter.findFirstOrThrow({
        where: {
          workspaceId: session.workspace.id,
          metric: "AI_GENERATION",
        },
      }),
    ).toMatchObject({ limit: 1, used: 1 });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    await app.close();
  });
});

function supportedCandidate(sourceUrl: string) {
  return {
    section: "COMPANY",
    key: "website-profile",
    value: { name: "Raedat Jewelry" },
    confidence: 0.86,
    sourceUrl,
    sourceSnippet: "Premium jewelry collections crafted for Bahrain businesses",
    extractedAt: "2026-07-19T12:00:00.000Z",
  };
}

function htmlResponse(html: string): Response {
  return new Response(html, {
    headers: { "content-type": "text/html; charset=utf-8" },
    status: 200,
  });
}

async function registerVerifiedTestUser(
  app: Awaited<ReturnType<typeof buildApp>>,
) {
  const email = `vault-job-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Vault Job User",
      workspaceName: `Vault Job Workspace ${randomUUID()}`,
      locale: "en",
    },
  });
  const session = response.json().data;

  await prisma.user.update({
    data: { isVerified: true },
    where: { id: session.user.id },
  });

  return session;
}

function authHeaders(accessToken: string): Record<string, string> {
  return { authorization: `Bearer ${accessToken}` };
}

async function assignOneGenerationPlan(userId: string): Promise<void> {
  const plan = await prisma.plan.create({
    data: {
      active: true,
      code: `VAULT_JOB_LIMIT_${randomUUID()}`,
      currency: "BHD",
      limits: {
        aiGenerations: 1,
        aiImages: 1,
        aiInputTokens: 1_000,
        aiOutputTokens: 1_000,
        posts: 1,
        storageBytes: 1_000,
        strategies: 1,
      },
      name: "Vault Job One Generation Plan",
      priceMinor: 1_000,
    },
  });

  await prisma.user.update({
    where: { id: userId },
    data: {
      planId: plan.id,
      planStatus: "ACTIVE",
      trialEndsAt: null,
    },
  });
}

type FetchInput = Parameters<typeof fetch>[0];

function requestUrl(input: FetchInput): string {
  if (typeof input === "string") {
    return input;
  }

  return input instanceof URL ? input.toString() : input.url;
}
