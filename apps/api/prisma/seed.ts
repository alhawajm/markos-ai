import "../src/config/env";

import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

// Registration and Google sign-up require the STARTER plan, while billing exposes and
// upgrades through the complete active catalog. No tenant or sample data is seeded.
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
}

await main().finally(async () => {
  await prisma.$disconnect();
});
