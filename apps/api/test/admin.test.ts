import { randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { describe, expect, it } from "vitest";
import { hasPermission } from "../src/auth/rbac";
import { resolveModelSetting } from "../src/admin/model-settings-service";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

describe("admin routes", () => {
  it("keeps platform admin permissions separate from workspace owner permissions", () => {
    expect(hasPermission(["OWNER"], "admin:manage")).toBe(false);
    expect(hasPermission(["WORKSPACE_ADMIN"], "admin:manage")).toBe(false);
    expect(hasPermission(["PRODUCT_ADMIN"], "admin:manage")).toBe(true);
    expect(hasPermission(["SUPER_ADMIN"], "admin:manage")).toBe(true);
    expect(hasPermission(["READONLY_ADMIN"], "admin:read")).toBe(true);
    expect(hasPermission(["READONLY_ADMIN"], "admin:manage")).toBe(false);
  });

  it("allows product admins to edit plan limits without deploy and writes an audit log", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const originalPlan = await prisma.plan.findUniqueOrThrow({
      where: {
        code: "STARTER"
      }
    });
    const nextLimit = randomLimit();

    await updateMemberRole(session.user.id, session.workspace.id, "PRODUCT_ADMIN");

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/plans/STARTER/limits",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        limits: {
          aiGenerations: nextLimit
        }
      }
    });
    const updatedPlan = await prisma.plan.findUniqueOrThrow({
      where: {
        code: "STARTER"
      }
    });
    const auditLog = await prisma.auditLog.findFirstOrThrow({
      orderBy: {
        createdAt: "desc"
      },
      where: {
        action: "ADMIN_PLAN_LIMITS_UPDATED",
        actorId: session.user.id,
        targetId: originalPlan.id,
        workspaceId: session.workspace.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      code: "STARTER",
      limits: {
        aiGenerations: nextLimit
      }
    });
    expect(updatedPlan.limits).toMatchObject({
      aiGenerations: nextLimit
    });
    expect(auditLog.metadata).toMatchObject({
      changedKeys: ["aiGenerations"],
      nextLimits: {
        aiGenerations: nextLimit
      },
      previousLimits: originalPlan.limits
    });

    await prisma.plan.update({
      data: {
        limits: originalPlan.limits as Prisma.InputJsonValue
      },
      where: {
        id: originalPlan.id
      }
    });
    await app.close();
  });

  it("shows product admins billing operations, gateway readiness, and model config", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);

    await prisma.$executeRaw`
      DELETE FROM "model_settings"
      WHERE "key" IN ('LLM_PRIMARY_MODEL', 'IMAGE_MODEL_PRIMARY', 'IMAGE_MODEL_FALLBACK')
    `;

    await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers,
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });
    await updateMemberRole(session.user.id, session.workspace.id, "PRODUCT_ADMIN");

    const [operations, gateways, modelConfig] = await Promise.all([
      app.inject({
        method: "GET",
        url: "/v1/admin/billing/operations",
        headers
      }),
      app.inject({
        method: "GET",
        url: "/v1/admin/gateways",
        headers
      }),
      app.inject({
        method: "GET",
        url: "/v1/admin/model-config",
        headers
      })
    ]);

    expect(operations.statusCode).toBe(200);
    expect(operations.json().data).toMatchObject({
      invoices: expect.arrayContaining([expect.objectContaining({ workspaceId: session.workspace.id })]),
      payments: expect.arrayContaining([expect.objectContaining({ gateway: "CREDIMAX", workspaceId: session.workspace.id })]),
      subscriptions: expect.arrayContaining([expect.objectContaining({ planCode: "STARTER", status: "TRIALING" })])
    });
    expect(gateways.statusCode).toBe(200);
    expect(gateways.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "CREDIMAX",
          dryRun: true,
          ready: false
        }),
        expect.objectContaining({
          code: "BENEFIT"
        }),
        expect.objectContaining({
          code: "STRIPE"
        })
      ])
    );
    expect(modelConfig.statusCode).toBe(200);
    expect(modelConfig.json().data).toMatchObject({
      editable: true,
      models: expect.arrayContaining([
        expect.objectContaining({
          key: "LLM_PRIMARY_MODEL",
          source: "environment"
        }),
        expect.objectContaining({
          key: "IMAGE_MODEL_PRIMARY",
          source: "environment"
        })
      ])
    });

    await app.close();
  });

  it("reports Starter and Growth Bahrain launch readiness with live gateway blockers", async () => {
    const originalEnv = snapshotGatewayEnv();
    const app = await buildApp();
    const session = await registerTestUser(app);

    clearGatewayEnv();
    await updateMemberRole(session.user.id, session.workspace.id, "PRODUCT_ADMIN");

    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/admin/bahrain-launch-readiness",
        headers: authHeaders(session.tokens.accessToken)
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        gatewayReady: false,
        liveReady: false,
        planCatalogReady: true,
        reasons: expect.arrayContaining(["BAHRAIN_PAYMENT_GATEWAY_NOT_READY"]),
        requiredGateways: ["CREDIMAX", "BENEFIT"]
      });
      expect(response.json().data.plans).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            checkoutReady: true,
            code: "STARTER",
            currency: "BHD",
            grossMinor: 19_800,
            netMinor: 18_000,
            priceMinor: 18_000,
            vatMinor: 1_800,
            vatRateBps: 1000
          }),
          expect.objectContaining({
            checkoutReady: true,
            code: "GROWTH",
            currency: "BHD",
            grossMinor: 40_700,
            netMinor: 37_000,
            priceMinor: 37_000,
            vatMinor: 3_700,
            vatRateBps: 1000
          })
        ])
      );
    } finally {
      restoreGatewayEnv(originalEnv);
      await app.close();
    }
  });

  it("marks Bahrain launch ready when a local gateway is fully configured", async () => {
    const originalEnv = snapshotGatewayEnv();
    const app = await buildApp();
    const session = await registerTestUser(app);

    process.env.CREDIMAX_MERCHANT_ID = "merchant";
    process.env.CREDIMAX_API_PASSWORD = "password";
    process.env.CREDIMAX_WEBHOOK_SECRET = "secret";
    await updateMemberRole(session.user.id, session.workspace.id, "PRODUCT_ADMIN");

    try {
      const response = await app.inject({
        method: "GET",
        url: "/v1/admin/bahrain-launch-readiness",
        headers: authHeaders(session.tokens.accessToken)
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        gatewayReady: true,
        liveReady: true,
        planCatalogReady: true,
        reasons: []
      });
      expect(response.json().data.gateways).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            code: "CREDIMAX",
            dryRun: false,
            ready: true,
            reasons: []
          })
        ])
      );
    } finally {
      restoreGatewayEnv(originalEnv);
      await app.close();
    }
  });

  it("lets product admins update model settings without deploy and audits the change", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const modelValue = `admin-test-model-${randomUUID()}`;

    await prisma.$executeRaw`
      DELETE FROM "model_settings"
      WHERE "key" = 'LLM_PRIMARY_MODEL'
    `;
    await updateMemberRole(session.user.id, session.workspace.id, "PRODUCT_ADMIN");

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/model-config/LLM_PRIMARY_MODEL",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        value: modelValue
      }
    });
    const auditLog = await prisma.auditLog.findFirstOrThrow({
      orderBy: {
        createdAt: "desc"
      },
      where: {
        action: "MODEL_SETTING_UPDATED",
        actorId: session.user.id,
        targetType: "ModelSetting",
        workspaceId: session.workspace.id
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      editable: true,
      models: expect.arrayContaining([
        expect.objectContaining({
          key: "LLM_PRIMARY_MODEL",
          source: "database",
          value: modelValue
        })
      ])
    });
    await expect(resolveModelSetting("LLM_PRIMARY_MODEL")).resolves.toBe(modelValue);
    expect(auditLog.metadata).toMatchObject({
      key: "LLM_PRIMARY_MODEL",
      nextValue: modelValue
    });

    await prisma.$executeRaw`
      DELETE FROM "model_settings"
      WHERE "key" = 'LLM_PRIMARY_MODEL' AND "value" = ${modelValue}
    `;
    await app.close();
  });

  it("blocks workspace owners from global plan limit edits", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    const response = await app.inject({
      method: "PATCH",
      url: "/v1/admin/plans/STARTER/limits",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        limits: {
          aiGenerations: randomLimit()
        }
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.details[0]).toMatchObject({
      requiredPermissions: ["admin:manage"],
      roles: ["OWNER"]
    });

    await app.close();
  });

  it("blocks workspace owners from platform admin reads", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/admin/billing/operations",
      headers: authHeaders(session.tokens.accessToken)
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.details[0]).toMatchObject({
      requiredPermissions: ["admin:read"],
      roles: ["OWNER"]
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `admin-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Admin User",
      workspaceName: `Admin Workspace ${randomUUID()}`,
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


async function updateMemberRole(userId: string, workspaceId: string, role: "PRODUCT_ADMIN"): Promise<void> {
  await prisma.workspaceMember.updateMany({
    data: {
      role
    },
    where: {
      userId,
      workspaceId
    }
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}

function randomLimit(): number {
  return 10_000 + Math.floor(Math.random() * 100_000);
}

function snapshotGatewayEnv(): Record<string, string | undefined> {
  return {
    BENEFIT_API_KEY: process.env.BENEFIT_API_KEY,
    BENEFIT_MERCHANT_ID: process.env.BENEFIT_MERCHANT_ID,
    BENEFIT_WEBHOOK_SECRET: process.env.BENEFIT_WEBHOOK_SECRET,
    CREDIMAX_API_PASSWORD: process.env.CREDIMAX_API_PASSWORD,
    CREDIMAX_MERCHANT_ID: process.env.CREDIMAX_MERCHANT_ID,
    CREDIMAX_WEBHOOK_SECRET: process.env.CREDIMAX_WEBHOOK_SECRET
  };
}

function restoreGatewayEnv(snapshot: Record<string, string | undefined>): void {
  for (const [key, value] of Object.entries(snapshot)) {
    if (value === undefined) {
      delete process.env[key];
      continue;
    }

    process.env[key] = value;
  }
}

function clearGatewayEnv(): void {
  restoreGatewayEnv({
    BENEFIT_API_KEY: undefined,
    BENEFIT_MERCHANT_ID: undefined,
    BENEFIT_WEBHOOK_SECRET: undefined,
    CREDIMAX_API_PASSWORD: undefined,
    CREDIMAX_MERCHANT_ID: undefined,
    CREDIMAX_WEBHOOK_SECRET: undefined
  });
}
