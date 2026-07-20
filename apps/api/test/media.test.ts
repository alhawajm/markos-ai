import { randomUUID } from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";
import { processWorkspaceCreativeLearning } from "../src/learning/creative-learning-service";

let imageGenerationCalls = 0;
let imageGenerationPrompts: string[] = [];

vi.mock("../src/ai/image-client", () => ({
  generateImageAsset: async (input: {
    aspectRatio: string;
    prompt: string;
    workspaceId: string;
  }) => {
    imageGenerationCalls += 1;
    imageGenerationPrompts.push(input.prompt);
    const bytes = Buffer.from(
      `<svg>${input.workspaceId}:${input.aspectRatio}:${input.prompt}</svg>`,
    );

    return {
      base64_data: bytes.toString("base64"),
      filename: "generated-test.svg",
      height: 1350,
      mime_type: "image/svg+xml",
      model: "test-image-model",
      prompt: input.prompt,
      prompt_version: "image.v1.test",
      size_bytes: bytes.byteLength,
      tokens_in: 31,
      tokens_out: 7,
      width: 1080,
    };
  },
}));

describe("media routes", () => {
  beforeEach(() => {
    imageGenerationCalls = 0;
    imageGenerationPrompts = [];
  });

  it("registers public media and attaches it to content", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);

    const registered = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "IMAGE",
        filename: "menu-post.jpg",
        publicUrl: "https://cdn.example.com/menu-post.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 245000,
        width: 1080,
        height: 1080,
      },
    });
    const mediaId = registered.json().data.id as string;
    const attached = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/media`,
      headers,
      payload: {
        mediaAssetId: mediaId,
      },
    });
    const list = await app.inject({
      method: "GET",
      url: "/v1/media",
      headers,
    });

    expect(registered.statusCode).toBe(200);
    expect(registered.json()).toMatchObject({
      data: {
        filename: "menu-post.jpg",
        publicUrl: "https://cdn.example.com/menu-post.jpg",
        workspaceId: session.workspace.id,
      },
    });
    expect(attached.statusCode).toBe(200);
    expect(attached.json().data.mediaIds).toEqual([mediaId]);
    expect(list.statusCode).toBe(200);
    expect(list.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          id: mediaId,
          publicUrl: "https://cdn.example.com/menu-post.jpg",
        }),
      ]),
    );
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "STORAGE_BYTES",
            periodStart: storagePeriodStart(),
          },
        },
      }),
    ).resolves.toMatchObject({
      used: 245000,
    });

    await app.close();
  });

  it("uploads local media bytes and serves the stored file", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const bytes = Buffer.from("markos media upload");

    const uploaded = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers,
      payload: {
        type: "IMAGE",
        filename: "upload.jpg",
        mimeType: "image/jpeg",
        base64Data: bytes.toString("base64"),
      },
    });
    const publicUrl = uploaded.json().data.publicUrl as string;
    const served = await app.inject({
      method: "GET",
      url: new URL(publicUrl).pathname,
    });

    expect(uploaded.statusCode).toBe(200);
    expect(uploaded.json()).toMatchObject({
      data: {
        filename: "upload.jpg",
        mimeType: "image/jpeg",
        sizeBytes: bytes.byteLength,
        workspaceId: session.workspace.id,
      },
    });
    expect(served.statusCode).toBe(200);
    expect(served.headers["content-type"]).toContain("image/jpeg");
    expect(served.body).toBe("markos media upload");

    await app.close();
  });

  it("generates an AI image for content, attaches it, and meters usage", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);
    const periodStart = monthStart();

    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/generate-image`,
      headers,
      payload: {
        aspectRatio: "4:5",
        prompt: "Premium Bahrain coffee product photo",
      },
    });
    const body = response.json().data;
    const assetId = body.mediaAsset.id as string;
    const served = await app.inject({
      method: "GET",
      url: new URL(body.mediaAsset.publicUrl as string).pathname,
    });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "IMAGE",
      },
    });

    expect(response.statusCode).toBe(200);
    expect(body).toMatchObject({
      contentItem: {
        id: content.id,
        mediaIds: [assetId],
      },
      mediaAsset: {
        id: assetId,
        type: "AI_GENERATED",
        filename: "generated-test.svg",
        mimeType: "image/svg+xml",
        width: 1080,
        height: 1350,
      },
      model: "test-image-model",
      prompt: "Premium Bahrain coffee product photo",
      promptVersion: "image.v1.test",
    });
    expect(served.statusCode).toBe(200);
    expect(served.body).toContain("Premium Bahrain coffee product photo");
    expect(interaction).toMatchObject({
      promptVersion: "image.v1.test",
      tokensIn: 31,
      tokensOut: 7,
      costMinor: 0,
      currency: "BHD",
      model: "test-image-model",
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_IMAGE",
            periodStart,
          },
        },
      }),
    ).resolves.toMatchObject({
      used: 1,
      limit: 20,
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_TOKENS_IN",
            periodStart,
          },
        },
      }),
    ).resolves.toMatchObject({
      used: 31,
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_TOKENS_OUT",
            periodStart,
          },
        },
      }),
    ).resolves.toMatchObject({
      used: 7,
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "STORAGE_BYTES",
            periodStart: storagePeriodStart(),
          },
        },
      }),
    ).resolves.toMatchObject({
      used: body.mediaAsset.sizeBytes,
    });

    await app.close();
  });

  it("generates Visual Studio variants with review gating, lineage, and usage metering", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);
    const sourceMedia = await createSourceMediaAsset(session.workspace.id);
    const product = await prisma.product.create({
      data: {
        workspaceId: session.workspace.id,
        benefits: [
          "Handcrafted limited-edition pieces",
          "Premium gifting presentation",
        ],
        category: "Luxury jewelry",
        description: "Luxury jewelry collection for Bahrain customers",
        mediaAssetIds: [sourceMedia.id],
        name: "Luxury Jewelry Collection",
        priceMinor: 450000,
        salesChannels: ["Instagram"],
      },
    });
    const offer = await prisma.offer.create({
      data: {
        workspaceId: session.workspace.id,
        description: "Launch campaign for the luxury jewelry collection",
        priceMinor: 450000,
        productId: product.id,
        title: "BD 450 launch bundle",
      },
    });

    await seedVisualVaultContext(session.workspace.id);

    const generated = await app.inject({
      method: "POST",
      url: "/v1/media/visual-studio/generate",
      headers,
      payload: {
        aspectRatio: "4:5",
        contentItemId: content.id,
        count: 1,
        negativePrompt: "No cluttered background",
        offerId: offer.id,
        productId: product.id,
        prompt:
          "Create a premium launch visual for the luxury jewelry campaign",
        sourceMediaAssetIds: [sourceMedia.id],
        visualMode: "PRODUCT_PHOTO",
      },
    });
    const generatedBody = generated.json().data;
    const variant = generatedBody.variants[0];
    const mediaAssetId = variant.mediaAssetId as string;

    const blockedAttach = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/media`,
      headers,
      payload: {
        mediaAssetId,
      },
    });
    const approved = await app.inject({
      method: "POST",
      url: `/v1/media/visual-studio/variants/${variant.id}/approve`,
      headers,
      payload: {
        reasonCodes: ["ON_BRAND", "PRODUCT_ACCURATE", "READY_TO_PUBLISH"],
        notes: "Product framing and brand palette are ready for publishing.",
        scores: {
          brandAlignment: 94,
          composition: 88,
          platformReadiness: 92,
          productAccuracy: 96,
        },
      },
    });
    const attached = await app.inject({
      method: "POST",
      url: `/v1/media/visual-studio/variants/${variant.id}/attach-to-content`,
      headers,
      payload: {
        contentItemId: content.id,
      },
    });
    const listed = await app.inject({
      method: "GET",
      url: "/v1/media/visual-studio/variants?status=APPROVED",
      headers,
    });
    const interaction = await prisma.aiInteraction.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        agent: "IMAGE",
        response: {
          path: ["variantId"],
          equals: variant.id,
        },
      },
    });
    const variantRow = await prisma.generatedMediaVariant.findUniqueOrThrow({
      where: {
        id: variant.id,
      },
    });
    const feedback = await prisma.creativeFeedback.findFirstOrThrow({
      where: {
        generatedMediaVariantId: variant.id,
        workspaceId: session.workspace.id,
      },
    });
    const exemplar = await prisma.creativeLearningExemplar.findFirstOrThrow({
      where: {
        generatedMediaVariantId: variant.id,
        source: "HUMAN_FEEDBACK",
        workspaceId: session.workspace.id,
      },
    });
    const insights = await app.inject({
      method: "GET",
      url: "/v1/media/visual-studio/learning-insights",
      headers,
    });

    expect(generated.statusCode).toBe(200);
    expect(generatedBody).toMatchObject({
      model: "test-image-model",
      promptVersion: "image.v1.test",
      variants: [
        expect.objectContaining({
          aspectRatio: "4:5",
          contentItemId: content.id,
          mediaAsset: expect.objectContaining({
            type: "AI_GENERATED",
            width: 1080,
            height: 1350,
          }),
          negativePrompt: expect.stringContaining("No cluttered background"),
          offerId: offer.id,
          productId: product.id,
          qualityScores: expect.objectContaining({
            overall: expect.any(Number),
            platformReadiness: 84,
          }),
          qualityStatus: "REVIEW_REQUIRED",
          sourceMediaAssetIds: [sourceMedia.id],
          status: "PENDING_REVIEW",
          visualMode: "PRODUCT_PHOTO",
        }),
      ],
    });
    expect(variant.prompt).toContain("Luxury Jewelry Collection");
    expect(variant.prompt).toContain("BD 450 launch bundle");
    expect(blockedAttach.statusCode).toBe(409);
    expect(blockedAttach.json().error.code).toBe(
      "GENERATED_MEDIA_NOT_APPROVED",
    );
    expect(approved.statusCode).toBe(200);
    expect(approved.json()).toMatchObject({
      data: {
        id: variant.id,
        latestFeedback: {
          decision: "APPROVED",
          reasonCodes: ["ON_BRAND", "PRODUCT_ACCURATE", "READY_TO_PUBLISH"],
          scores: expect.objectContaining({
            brandAlignment: 94,
            overall: 93,
            productAccuracy: 96,
          }),
        },
        qualityStatus: "APPROVED",
        status: "APPROVED",
      },
    });
    expect(attached.statusCode).toBe(200);
    expect(attached.json().data.mediaIds).toEqual([mediaAssetId]);
    expect(listed.statusCode).toBe(200);
    expect(listed.json().data).toEqual(
      expect.arrayContaining([expect.objectContaining({ id: variant.id })]),
    );
    expect(interaction).toMatchObject({
      accepted: true,
      model: "test-image-model",
      promptVersion: "image.v1.test",
      tokensIn: 31,
      tokensOut: 7,
    });
    expect(JSON.stringify(interaction.response)).toContain("creativeFeedback");
    expect(feedback).toMatchObject({
      createdBy: session.user.id,
      decision: "APPROVED",
      reasonCodes: ["ON_BRAND", "PRODUCT_ACCURATE", "READY_TO_PUBLISH"],
    });
    expect(exemplar).toMatchObject({
      patternType: "POSITIVE",
      source: "HUMAN_FEEDBACK",
    });
    expect(exemplar.summary).toContain("Product framing and brand palette");
    expect(insights.statusCode).toBe(200);
    expect(insights.json()).toMatchObject({
      data: {
        feedbackCount: 1,
        positivePatternCount: 1,
        topPositive: [
          expect.objectContaining({
            generatedMediaVariantId: variant.id,
            patternType: "POSITIVE",
          }),
        ],
      },
    });
    expect(JSON.stringify(variantRow.metadata)).toContain(
      "humanApprovalRequired",
    );
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_IMAGE",
            periodStart: monthStart(),
          },
        },
      }),
    ).resolves.toMatchObject({
      limit: 20,
      used: 1,
    });
    await expect(
      prisma.usageCounter.findUniqueOrThrow({
        where: {
          workspaceId_metric_periodStart: {
            workspaceId: session.workspace.id,
            metric: "AI_TOKENS_IN",
            periodStart: monthStart(),
          },
        },
      }),
    ).resolves.toMatchObject({
      used: 31,
    });

    await app.close();
  });

  it("persists rejection feedback and injects it into the next visual prompt", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const first = await app.inject({
      method: "POST",
      url: "/v1/media/visual-studio/generate",
      headers,
      payload: {
        aspectRatio: "4:5",
        count: 1,
        prompt: "Create a premium jewelry launch visual",
        visualMode: "PRODUCT_PHOTO",
      },
    });
    const firstVariant = first.json().data.variants[0];
    const rejected = await app.inject({
      method: "POST",
      url: `/v1/media/visual-studio/variants/${firstVariant.id}/reject`,
      headers,
      payload: {
        reasonCodes: ["OFF_BRAND", "COLOR_MISMATCH"],
        notes: "Avoid neon purple backgrounds and oversized headline text.",
      },
    });
    const second = await app.inject({
      method: "POST",
      url: "/v1/media/visual-studio/generate",
      headers,
      payload: {
        aspectRatio: "4:5",
        count: 1,
        prompt: "Create another premium jewelry launch visual",
        visualMode: "PRODUCT_PHOTO",
      },
    });
    const feedback = await prisma.creativeFeedback.findMany({
      where: {
        generatedMediaVariantId: firstVariant.id,
        workspaceId: session.workspace.id,
      },
    });
    const negativeExemplar =
      await prisma.creativeLearningExemplar.findFirstOrThrow({
        where: {
          generatedMediaVariantId: firstVariant.id,
          patternType: "NEGATIVE",
          workspaceId: session.workspace.id,
        },
      });

    expect(first.statusCode).toBe(200);
    expect(rejected.statusCode).toBe(200);
    expect(rejected.json()).toMatchObject({
      data: {
        latestFeedback: {
          decision: "REJECTED",
          notes: "Avoid neon purple backgrounds and oversized headline text.",
          reasonCodes: ["OFF_BRAND", "COLOR_MISMATCH"],
        },
        status: "REJECTED",
      },
    });
    expect(second.statusCode).toBe(200);
    expect(imageGenerationPrompts).toHaveLength(2);
    expect(imageGenerationPrompts[1]).toContain(
      "Rejected or low-performing patterns that must not be reused",
    );
    expect(imageGenerationPrompts[1]).toContain(
      "Avoid neon purple backgrounds and oversized headline text",
    );
    expect(feedback).toHaveLength(1);
    expect(negativeExemplar.summary).toContain("off brand, color mismatch");

    await app.close();
  });

  it("attributes Instagram performance only to attached generated media", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const content = await createDraftContent(session.workspace.id);
    const generated = await app.inject({
      method: "POST",
      url: "/v1/media/visual-studio/generate",
      headers,
      payload: {
        aspectRatio: "1:1",
        contentItemId: content.id,
        count: 1,
        prompt: "Create a performance attribution visual",
        visualMode: "AD_CREATIVE",
      },
    });
    const variant = generated.json().data.variants[0];
    await app.inject({
      method: "POST",
      url: `/v1/media/visual-studio/variants/${variant.id}/approve`,
      headers,
      payload: {
        reasonCodes: ["ON_BRAND", "READY_TO_PUBLISH"],
      },
    });
    await app.inject({
      method: "POST",
      url: `/v1/media/visual-studio/variants/${variant.id}/attach-to-content`,
      headers,
      payload: { contentItemId: content.id },
    });
    const observedAt = new Date("2026-07-19T12:00:00.000Z");
    await prisma.instagramAnalytics.create({
      data: {
        contentItemId: content.id,
        dataDate: observedAt,
        metricType: "POST",
        metrics: {
          comments: 20,
          likes: 180,
          reach: 2000,
          saves: 30,
          shares: 40,
        },
        syncedAt: observedAt,
        workspaceId: session.workspace.id,
      },
    });

    const firstRun = await processWorkspaceCreativeLearning(
      session.workspace.id,
      {
        now: new Date("2026-07-20T12:00:00.000Z"),
      },
    );
    const secondRun = await processWorkspaceCreativeLearning(
      session.workspace.id,
      {
        now: new Date("2026-07-20T12:05:00.000Z"),
      },
    );
    const learnedVariant = await prisma.generatedMediaVariant.findUniqueOrThrow(
      {
        where: { id: variant.id },
      },
    );
    const interaction = await prisma.aiInteraction.findUniqueOrThrow({
      where: { id: learnedVariant.aiInteractionId! },
    });
    const performanceExemplars = await prisma.creativeLearningExemplar.findMany(
      {
        where: {
          source: "INSTAGRAM_PERFORMANCE",
          workspaceId: session.workspace.id,
        },
      },
    );
    const vaultEntries = await prisma.knowledgeVault.findMany({
      where: {
        key: { startsWith: "creative.learning.performance." },
        workspaceId: session.workspace.id,
      },
    });

    expect(firstRun).toMatchObject({
      analyzedContent: 1,
      exemplarsUpserted: 2,
      interactionsUpdated: 1,
      linkedVariants: 1,
      vaultEntriesWritten: 2,
    });
    expect(secondRun.exemplarsUpserted).toBe(2);
    expect(performanceExemplars).toHaveLength(2);
    expect(learnedVariant.performanceScore).toBe(50);
    expect(learnedVariant.lastLearnedAt).not.toBeNull();
    expect(JSON.stringify(interaction.response)).toContain(
      "creativePerformance",
    );
    expect(vaultEntries).toHaveLength(2);

    await app.close();
  });

  it("blocks Visual Studio generation before provider calls when image quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.usageCounter.create({
      data: {
        workspaceId: session.workspace.id,
        metric: "AI_IMAGE",
        periodStart: monthStart(),
        periodEnd: nextMonthStart(),
        used: 20,
        limit: 20,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/visual-studio/generate",
      headers,
      payload: {
        aspectRatio: "1:1",
        count: 1,
        prompt: "Generate a blocked image",
        visualMode: "AD_CREATIVE",
      },
    });
    const generatedVariants = await prisma.generatedMediaVariant.findMany({
      where: {
        workspaceId: session.workspace.id,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "QUOTA_EXCEEDED",
        details: [
          {
            metric: "AI_IMAGE",
          },
        ],
      },
    });
    expect(imageGenerationCalls).toBe(0);
    expect(generatedVariants).toHaveLength(0);

    await app.close();
  });

  it("does not attach media from another workspace", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const ownerHeaders = authHeaders(owner.tokens.accessToken);
    const content = await createDraftContent(owner.workspace.id);
    const foreignMedia = await prisma.mediaAsset.create({
      data: {
        workspaceId: other.workspace.id,
        type: "IMAGE",
        filename: "foreign.jpg",
        s3Key: "external:https://cdn.example.com/foreign.jpg",
        cdnUrl: "https://cdn.example.com/foreign.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 120000,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/content/${content.id}/media`,
      headers: ownerHeaders,
      payload: {
        mediaAssetId: foreignMedia.id,
      },
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error.code).toBe("MEDIA_NOT_FOUND");

    await app.close();
  });

  it("requires HTTPS public media URLs", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "IMAGE",
        filename: "local.jpg",
        publicUrl: "http://example.com/local.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      },
    });

    expect(response.statusCode).toBe(400);
    expect(response.json().error.code).toBe("VALIDATION_ERROR");

    await app.close();
  });

  it("blocks media registration when storage quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.usageCounter.create({
      data: {
        workspaceId: session.workspace.id,
        metric: "STORAGE_BYTES",
        periodStart: storagePeriodStart(),
        periodEnd: storagePeriodEnd(),
        used: 1_000_000_000,
        limit: 1_000_000_000,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "IMAGE",
        filename: "too-much.jpg",
        publicUrl: "https://cdn.example.com/too-much.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1,
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "QUOTA_EXCEEDED",
        details: [
          {
            metric: "STORAGE_BYTES",
          },
        ],
      },
    });

    await app.close();
  });

  it("blocks AI generated media when the AI image quota is exhausted", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.usageCounter.create({
      data: {
        workspaceId: session.workspace.id,
        metric: "AI_IMAGE",
        periodStart: monthStart(),
        periodEnd: nextMonthStart(),
        used: 20,
        limit: 20,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/public-url",
      headers,
      payload: {
        type: "AI_GENERATED",
        filename: "generated.jpg",
        publicUrl: "https://cdn.example.com/generated.jpg",
        mimeType: "image/jpeg",
        sizeBytes: 1000,
      },
    });
    const storageCounter = await prisma.usageCounter.findUnique({
      where: {
        workspaceId_metric_periodStart: {
          workspaceId: session.workspace.id,
          metric: "STORAGE_BYTES",
          periodStart: storagePeriodStart(),
        },
      },
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "QUOTA_EXCEEDED",
        details: [
          {
            metric: "AI_IMAGE",
          },
        ],
      },
    });
    expect(storageCounter?.used ?? 0).toBe(0);

    await app.close();
  });

  it("blocks media upload when billing is cancelled", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.user.update({
      data: {
        planStatus: "CANCELLED",
      },
      where: {
        id: session.user.id,
      },
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/media/upload",
      headers,
      payload: {
        type: "IMAGE",
        filename: "cancelled.jpg",
        mimeType: "image/jpeg",
        base64Data: Buffer.from("blocked media").toString("base64"),
      },
    });

    expect(response.statusCode).toBe(402);
    expect(response.json()).toMatchObject({
      error: {
        code: "BILLING_STATUS_INACTIVE",
        details: [
          {
            status: "CANCELLED",
          },
        ],
      },
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const email = `media-${randomUUID()}@markos.test`;
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email,
      password: "CorrectHorseBattery99!",
      fullName: "Media User",
      workspaceName: `Media Workspace ${randomUUID()}`,
      locale: "en",
    },
  });

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true,
    },
    where: {
      id: session.user.id,
    },
  });

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: true,
    },
  };
}

async function createDraftContent(workspaceId: string) {
  return prisma.contentItem.create({
    data: {
      workspaceId,
      contentType: "POST",
      status: "DRAFT",
      captionEn: "Draft with media",
      hashtags: ["#Bahrain"],
      mediaIds: [],
    },
  });
}

async function createSourceMediaAsset(workspaceId: string) {
  return prisma.mediaAsset.create({
    data: {
      workspaceId,
      type: "BRAND_ASSET",
      filename: "brand-reference.png",
      s3Key: "external:https://cdn.example.com/brand-reference.png",
      cdnUrl: "https://cdn.example.com/brand-reference.png",
      mimeType: "image/png",
      sizeBytes: 2048,
      width: 1080,
      height: 1350,
    },
  });
}

async function seedVisualVaultContext(workspaceId: string): Promise<void> {
  await prisma.knowledgeVault.createMany({
    data: [
      {
        workspaceId,
        section: "COMPANY",
        key: "profile",
        value: {
          country: "Bahrain",
          name: "Maryam Studio",
        },
      },
      {
        workspaceId,
        section: "BRAND",
        key: "visual-style",
        value: {
          colors: ["teal", "gold"],
          personality: "premium, modern, warm",
        },
      },
      {
        workspaceId,
        section: "TONE",
        key: "voice",
        value: {
          rules: ["confident", "clear", "no exaggerated claims"],
        },
      },
      {
        workspaceId,
        section: "AUDIENCE",
        key: "primary",
        value: {
          segment: "Bahrain luxury shoppers",
        },
      },
    ],
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`,
  };
}

function monthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), 1));
}

function nextMonthStart(date = new Date()): Date {
  return new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() + 1, 1));
}

function storagePeriodStart(): Date {
  return new Date(Date.UTC(1970, 0, 1));
}

function storagePeriodEnd(): Date {
  return new Date(Date.UTC(9999, 11, 31));
}
