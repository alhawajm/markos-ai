import "../src/config/env";

import { Prisma, PrismaClient } from "@prisma/client";
import argon2 from "argon2";

const prisma = new PrismaClient();

const plans = [
  {
    code: "STARTER",
    name: "Starter",
    priceMinor: 18000,
    limits: {
      workspaces: 1,
      aiGenerations: 100,
      aiImages: 20,
      aiInputTokens: 1_000_000,
      aiOutputTokens: 500_000,
      strategies: 1,
      posts: 30,
      seats: 1,
      storageBytes: 1_000_000_000
    }
  },
  {
    code: "GROWTH",
    name: "Growth",
    priceMinor: 37000,
    limits: {
      workspaces: 1,
      aiGenerations: 300,
      aiImages: 60,
      aiInputTokens: 3_000_000,
      aiOutputTokens: 1_500_000,
      strategies: 3,
      posts: 90,
      seats: 2,
      storageBytes: 5_000_000_000
    }
  },
  {
    code: "PREMIUM",
    name: "Premium",
    priceMinor: 75000,
    limits: {
      workspaces: 3,
      aiGenerations: 700,
      aiImages: 150,
      aiInputTokens: 8_000_000,
      aiOutputTokens: 4_000_000,
      strategies: 12,
      posts: 200,
      seats: 5,
      storageBytes: 20_000_000_000
    }
  },
  {
    code: "ENTERPRISE",
    name: "Enterprise",
    priceMinor: 188000,
    limits: {
      workspaces: 10,
      aiGenerations: 1500,
      aiImages: 500,
      aiInputTokens: 20_000_000,
      aiOutputTokens: 10_000_000,
      strategies: 20,
      posts: 500,
      seats: 15,
      storageBytes: 100_000_000_000
    }
  }
] as const;

const demoFixture = {
  userId: "018ffd04-3f8a-7000-8000-000000000001",
  workspaceId: "018ffd04-3f8a-7000-8000-000000000002",
  productId: "018ffd04-3f8a-7000-8000-000000000003",
  offerId: "018ffd04-3f8a-7000-8000-000000000004",
  email: "demo@markos.local",
  workspaceSlug: "markos-demo"
} as const;

async function main(): Promise<void> {
  for (const plan of plans) {
    await prisma.plan.upsert({
      where: { code: plan.code },
      update: {
        name: plan.name,
        priceMinor: plan.priceMinor,
        currency: "BHD",
        limits: plan.limits,
        active: true
      },
      create: {
        code: plan.code,
        name: plan.name,
        priceMinor: plan.priceMinor,
        currency: "BHD",
        limits: plan.limits,
        active: true
      }
    });
  }

  if (process.env.MARKOS_SEED_DEMO_WORKSPACE === "true") {
    await seedDemoWorkspace();
  }
}

async function seedDemoWorkspace(): Promise<void> {
  const starterPlan = await prisma.plan.findUniqueOrThrow({
    where: {
      code: "STARTER"
    }
  });
  const passwordHash = await argon2.hash(process.env.MARKOS_DEMO_PASSWORD ?? "MarkosDemo!2026", {
    type: argon2.argon2id
  });
  const trialEndsAt = new Date(Date.now() + 14 * 24 * 60 * 60 * 1000);

  const user = await prisma.user.upsert({
    where: {
      email: demoFixture.email
    },
    update: {
      fullName: "Maryam",
      isVerified: true,
      locale: "EN",
      passwordHash,
      planId: starterPlan.id,
      planStatus: "TRIAL",
      trialEndsAt
    },
    create: {
      id: demoFixture.userId,
      email: demoFixture.email,
      fullName: "Maryam",
      isVerified: true,
      locale: "EN",
      passwordHash,
      planId: starterPlan.id,
      planStatus: "TRIAL",
      trialEndsAt
    }
  });

  const workspace = await prisma.workspace.upsert({
    where: {
      slug: demoFixture.workspaceSlug
    },
    update: {
      name: "Maryam Jewelry",
      onboardingScore: 86,
      onboardingStatus: "COMPLETE",
      ownerUserId: user.id
    },
    create: {
      id: demoFixture.workspaceId,
      name: "Maryam Jewelry",
      onboardingScore: 86,
      onboardingStatus: "COMPLETE",
      ownerUserId: user.id,
      slug: demoFixture.workspaceSlug
    }
  });

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId_role: {
        role: "OWNER",
        userId: user.id,
        workspaceId: workspace.id
      }
    },
    update: {
      deletedAt: null
    },
    create: {
      role: "OWNER",
      userId: user.id,
      workspaceId: workspace.id
    }
  });

  await prisma.product.upsert({
    where: {
      id: demoFixture.productId
    },
    update: {
      benefits: ["Handcrafted luxury positioning", "Premium gifting story", "High-intent Instagram showcase"],
      category: "Luxury Jewelry",
      currency: "BHD",
      description: "Limited luxury jewelry collection built around craftsmanship, premium gifting, and timeless elegance.",
      mediaAssetIds: [],
      name: "Luxury Jewelry Collection",
      priceMinor: 450000,
      salesChannels: ["Instagram", "Website"],
      status: "ACTIVE",
      workspaceId: workspace.id
    },
    create: {
      id: demoFixture.productId,
      benefits: ["Handcrafted luxury positioning", "Premium gifting story", "High-intent Instagram showcase"],
      category: "Luxury Jewelry",
      currency: "BHD",
      description: "Limited luxury jewelry collection built around craftsmanship, premium gifting, and timeless elegance.",
      mediaAssetIds: [],
      name: "Luxury Jewelry Collection",
      priceMinor: 450000,
      salesChannels: ["Instagram", "Website"],
      status: "ACTIVE",
      workspaceId: workspace.id
    }
  });

  await prisma.offer.upsert({
    where: {
      id: demoFixture.offerId
    },
    update: {
      compareAtPriceMinor: null,
      currency: "BHD",
      description: "Launch the new collection during the strongest evening engagement window.",
      endsAt: new Date("2026-08-31T20:00:00.000Z"),
      priceMinor: 450000,
      productId: demoFixture.productId,
      startsAt: new Date("2026-07-20T16:30:00.000Z"),
      status: "ACTIVE",
      terms: "Approved for Instagram launch messaging; final inventory count must be confirmed before publishing.",
      title: "Luxury Jewelry Collection Launch",
      workspaceId: workspace.id
    },
    create: {
      id: demoFixture.offerId,
      compareAtPriceMinor: null,
      currency: "BHD",
      description: "Launch the new collection during the strongest evening engagement window.",
      endsAt: new Date("2026-08-31T20:00:00.000Z"),
      priceMinor: 450000,
      productId: demoFixture.productId,
      startsAt: new Date("2026-07-20T16:30:00.000Z"),
      status: "ACTIVE",
      terms: "Approved for Instagram launch messaging; final inventory count must be confirmed before publishing.",
      title: "Luxury Jewelry Collection Launch",
      workspaceId: workspace.id
    }
  });

  await upsertVaultFixture(workspace.id, "PRODUCTS", `catalog:product:${demoFixture.productId}`, {
    benefits: ["Handcrafted luxury positioning", "Premium gifting story", "High-intent Instagram showcase"],
    category: "Luxury Jewelry",
    currency: "BHD",
    mediaAssetIds: [],
    name: "Luxury Jewelry Collection",
    priceMinor: 450000,
    productId: demoFixture.productId,
    salesChannels: ["Instagram", "Website"],
    source: "catalog",
    sourceType: "product",
    status: "ACTIVE"
  });
  await upsertVaultFixture(workspace.id, "PRODUCTS", `catalog:offer:${demoFixture.offerId}`, {
    compareAtPriceMinor: null,
    currency: "BHD",
    endsAt: "2026-08-31T20:00:00.000Z",
    offerId: demoFixture.offerId,
    priceMinor: 450000,
    productId: demoFixture.productId,
    source: "catalog",
    sourceType: "offer",
    startsAt: "2026-07-20T16:30:00.000Z",
    status: "ACTIVE",
    title: "Luxury Jewelry Collection Launch"
  });
  await upsertVaultFixture(workspace.id, "COMPANY", "profile", {
    industry: "luxury jewelry",
    location: "Bahrain",
    name: "Maryam Jewelry",
    source: "demo_seed"
  });
  await upsertVaultFixture(workspace.id, "AUDIENCE", "primary", {
    painPoints: ["needs premium gifting inspiration", "responds to craftsmanship and limited collections"],
    segment: "women shopping for luxury gifts in Bahrain",
    source: "demo_seed"
  });
  await upsertVaultFixture(workspace.id, "BRAND", "identity", {
    colors: ["teal", "gold", "warm orange"],
    personality: ["premium", "calm", "craft-led"],
    source: "demo_seed"
  });
  await upsertVaultFixture(workspace.id, "TONE", "voice", {
    examples: ["crafted with passion, worn with pride", "timeless elegance with modern Bahraini taste"],
    rules: ["sound premium without exaggerating claims", "keep CTAs clear and Instagram-native"],
    source: "demo_seed"
  });
  await upsertVaultFixture(workspace.id, "OBJECTIVES", "q3", {
    goals: ["increase Instagram inquiries", "launch a high-impact luxury collection campaign"],
    kpis: ["qualified DMs", "saves", "profile visits"],
    source: "demo_seed"
  });
}

async function upsertVaultFixture(
  workspaceId: string,
  section: "COMPANY" | "STORY" | "PRODUCTS" | "AUDIENCE" | "COMPETITORS" | "BRAND" | "TONE" | "OBJECTIVES",
  key: string,
  value: Prisma.InputJsonValue
): Promise<void> {
  const existing = await prisma.knowledgeVault.findFirst({
    where: {
      deletedAt: null,
      key,
      section,
      workspaceId
    },
    orderBy: {
      version: "desc"
    }
  });

  if (existing !== null && stableJson(existing.value) === stableJson(value)) {
    return;
  }

  const row =
    existing === null
      ? await prisma.knowledgeVault.create({
          data: {
            key,
            section,
            value,
            workspaceId
          }
        })
      : await prisma.knowledgeVault.update({
          where: {
            id: existing.id
          },
          data: {
            value,
            version: {
              increment: 1
            }
          }
        });

  await prisma.knowledgeVaultHistory.create({
    data: {
      key: row.key,
      knowledgeVaultId: row.id,
      section: row.section,
      value: row.value as Prisma.InputJsonValue,
      version: row.version,
      workspaceId: row.workspaceId
    }
  });
}

function stableJson(value: unknown): string {
  return JSON.stringify(sortJson(value));
}

function sortJson(value: unknown): unknown {
  if (Array.isArray(value)) {
    return value.map(sortJson);
  }
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, nestedValue]) => [key, sortJson(nestedValue)])
    );
  }
  return value;
}

await main().finally(async () => {
  await prisma.$disconnect();
});
