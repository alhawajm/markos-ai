import type { Prisma } from "@prisma/client";
import type {
  AdminBahrainLaunchReadiness,
  AdminBahrainLaunchPlanReadiness,
  AdminBillingOperations,
  AdminGatewayReadiness,
  AdminModelConfiguration,
  BillingPlanCatalogItem,
  PaymentGatewayCode,
  PlanCode
} from "@markos/shared-types";
import type { AdminUpdatePlanLimitsInput } from "@markos/validation";
import { prisma } from "../db/prisma";
import { calculateVat } from "../billing/billing-service";
import { getModelConfiguration } from "./model-settings-service";

export class AdminPlanNotFoundError extends Error {
  constructor(planCode: PlanCode) {
    super(`Plan ${planCode} was not found`);
  }
}

export async function listAdminPlans(): Promise<BillingPlanCatalogItem[]> {
  const plans = await prisma.plan.findMany({
    orderBy: {
      priceMinor: "asc"
    },
    where: {
      deletedAt: null
    }
  });

  return plans.map(toBillingPlanCatalogItem);
}

export async function updateAdminPlanLimits(input: {
  actorId: string;
  limits: AdminUpdatePlanLimitsInput["limits"];
  planCode: PlanCode;
  workspaceId: string;
}): Promise<BillingPlanCatalogItem> {
  return prisma.$transaction(async (tx) => {
    const existing = await tx.plan.findFirst({
      where: {
        code: input.planCode,
        deletedAt: null
      }
    });

    if (existing === null) {
      throw new AdminPlanNotFoundError(input.planCode);
    }

    const previousLimits = normalizeLimits(existing.limits);
    const nextLimits = {
      ...previousLimits,
      ...input.limits
    };

    const updated = await tx.plan.update({
      data: {
        limits: nextLimits as Prisma.InputJsonValue
      },
      where: {
        id: existing.id
      }
    });

    await tx.auditLog.create({
      data: {
        action: "ADMIN_PLAN_LIMITS_UPDATED",
        actorId: input.actorId,
        metadata: {
          changedKeys: Object.keys(input.limits).sort(),
          nextLimits,
          previousLimits
        },
        targetId: existing.id,
        targetType: "Plan",
        workspaceId: input.workspaceId
      }
    });

    return toBillingPlanCatalogItem(updated);
  });
}

export async function getAdminBillingOperations(): Promise<AdminBillingOperations> {
  const [invoices, payments, subscriptions] = await Promise.all([
    prisma.invoice.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 50,
      where: {
        deletedAt: null
      }
    }),
    prisma.payment.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 50,
      where: {
        deletedAt: null
      }
    }),
    prisma.subscription.findMany({
      orderBy: {
        createdAt: "desc"
      },
      take: 50,
      where: {
        deletedAt: null
      }
    })
  ]);
  const workspaceIds = [...new Set(invoices.map((invoice) => invoice.workspaceId))];
  const workspaces = await prisma.workspace.findMany({
    select: {
      id: true,
      vatPricingMode: true
    },
    where: {
      id: {
        in: workspaceIds
      }
    }
  });
  const vatPricingModeByWorkspaceId = new Map(workspaces.map((workspace) => [workspace.id, workspace.vatPricingMode]));
  const planIds = [...new Set(subscriptions.map((subscription) => subscription.planId))];
  const plans = await prisma.plan.findMany({
    where: {
      id: {
        in: planIds
      }
    }
  });
  const planCodeById = new Map(plans.map((plan) => [plan.id, plan.code as PlanCode]));

  return {
    invoices: invoices.map((invoice) => ({
      currency: "BHD",
      grossMinor: invoice.grossMinor,
      id: invoice.id,
      ...(invoice.issuedAt === null ? {} : { issuedAt: invoice.issuedAt.toISOString() }),
      netMinor: invoice.netMinor,
      ...(invoice.paidAt === null ? {} : { paidAt: invoice.paidAt.toISOString() }),
      status: invoice.status,
      vatMinor: invoice.vatMinor,
      vatPricingMode: vatPricingModeByWorkspaceId.get(invoice.workspaceId) ?? "EXCLUSIVE",
      vatRateBps: invoice.vatRateBps,
      workspaceId: invoice.workspaceId
    })),
    payments: payments.map((payment) => ({
      amountMinor: payment.amountMinor,
      currency: "BHD",
      gateway: payment.gateway as PaymentGatewayCode,
      ...(payment.gatewayRef === null ? {} : { gatewayRef: payment.gatewayRef }),
      id: payment.id,
      ...(payment.invoiceId === null ? {} : { invoiceId: payment.invoiceId }),
      status: payment.status,
      workspaceId: payment.workspaceId
    })),
    subscriptions: subscriptions.map((subscription) => ({
      cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
      currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
      currentPeriodStart: subscription.currentPeriodStart.toISOString(),
      gateway: subscription.gateway,
      id: subscription.id,
      planCode: planCodeById.get(subscription.planId) ?? "STARTER",
      status: subscription.status
    }))
  };
}

export function getAdminGatewayReadiness(): AdminGatewayReadiness[] {
  return [
    gatewayReadiness("CREDIMAX", ["CREDIMAX_MERCHANT_ID", "CREDIMAX_API_PASSWORD"], "CREDIMAX_WEBHOOK_SECRET"),
    gatewayReadiness("BENEFIT", ["BENEFIT_MERCHANT_ID", "BENEFIT_API_KEY"], "BENEFIT_WEBHOOK_SECRET"),
    gatewayReadiness("STRIPE", ["STRIPE_SECRET_KEY"], "STRIPE_WEBHOOK_SECRET")
  ];
}

export async function getBahrainLaunchReadiness(): Promise<AdminBahrainLaunchReadiness> {
  const plans = await prisma.plan.findMany({
    where: {
      code: {
        in: ["STARTER", "GROWTH"]
      },
      deletedAt: null
    }
  });
  const planByCode = new Map(plans.map((plan) => [plan.code, plan]));
  const planReadiness = (["STARTER", "GROWTH"] as const).map((code) => buildBahrainLaunchPlanReadiness(code, planByCode.get(code)));
  const gateways = getAdminGatewayReadiness().filter((gateway) => gateway.code === "CREDIMAX" || gateway.code === "BENEFIT");
  const gatewayReady = gateways.some((gateway) => gateway.ready);
  const planCatalogReady = planReadiness.every((plan) => plan.checkoutReady);
  const reasons = [...(planCatalogReady ? [] : ["STARTER_GROWTH_PLAN_CATALOG_NOT_READY"]), ...(gatewayReady ? [] : ["BAHRAIN_PAYMENT_GATEWAY_NOT_READY"])];

  return {
    gatewayReady,
    gateways,
    liveReady: planCatalogReady && gatewayReady,
    planCatalogReady,
    plans: planReadiness,
    reasons,
    requiredGateways: ["CREDIMAX", "BENEFIT"]
  };
}

export async function getAdminModelConfiguration(): Promise<AdminModelConfiguration> {
  return getModelConfiguration();
}

function toBillingPlanCatalogItem(plan: {
  active: boolean;
  code: string;
  currency: string;
  id: string;
  limits: Prisma.JsonValue;
  name: string;
  priceMinor: number;
}): BillingPlanCatalogItem {
  return {
    active: plan.active,
    code: plan.code as PlanCode,
    currency: "BHD",
    id: plan.id,
    limits: normalizeLimits(plan.limits),
    name: plan.name,
    priceMinor: plan.priceMinor
  };
}

function normalizeLimits(value: Prisma.JsonValue): Record<string, number> {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    return {};
  }

  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === "number" && Number.isFinite(entry[1])));
}

function buildBahrainLaunchPlanReadiness(
  code: "STARTER" | "GROWTH",
  plan:
    | {
        active: boolean;
        currency: string;
        limits: Prisma.JsonValue;
        priceMinor: number;
      }
    | undefined
): AdminBahrainLaunchPlanReadiness {
  const reasons: string[] = [];

  if (plan === undefined) {
    return {
      checkoutReady: false,
      code,
      currency: "BHD",
      grossMinor: 0,
      limitsReady: false,
      netMinor: 0,
      planActive: false,
      priceMinor: 0,
      reasons: [`${code}_PLAN_MISSING`],
      vatMinor: 0,
      vatRateBps: 1000
    };
  }

  const limits = normalizeLimits(plan.limits);
  const requiredLimitKeys = ["aiGenerations", "aiImages", "aiInputTokens", "aiOutputTokens", "posts", "seats", "storageBytes", "strategies"];
  const missingLimitKeys = requiredLimitKeys.filter((key) => {
    const limit = limits[key];
    return !Number.isInteger(limit) || limit === undefined || limit <= 0;
  });

  if (!plan.active) {
    reasons.push(`${code}_PLAN_INACTIVE`);
  }

  if (plan.currency !== "BHD") {
    reasons.push(`${code}_CURRENCY_NOT_BHD`);
  }

  if (!Number.isInteger(plan.priceMinor) || plan.priceMinor <= 0) {
    reasons.push(`${code}_PRICE_NOT_POSITIVE_BHD_FILS`);
  }

  if (missingLimitKeys.length > 0) {
    reasons.push(...missingLimitKeys.map((key) => `${code}_${key}_LIMIT_MISSING`));
  }

  const vat = calculateVat({
    priceMinor: Number.isInteger(plan.priceMinor) && plan.priceMinor > 0 ? plan.priceMinor : 0,
    vatPricingMode: "EXCLUSIVE"
  });

  return {
    checkoutReady: reasons.length === 0,
    code,
    currency: "BHD",
    grossMinor: vat.grossMinor,
    limitsReady: missingLimitKeys.length === 0,
    netMinor: vat.netMinor,
    planActive: plan.active,
    priceMinor: plan.priceMinor,
    reasons,
    vatMinor: vat.vatMinor,
    vatRateBps: vat.vatRateBps
  };
}

function gatewayReadiness(code: PaymentGatewayCode, credentialKeys: string[], callbackSecretKey: string): AdminGatewayReadiness {
  const missingCredentials = credentialKeys.filter((key) => process.env[key] === undefined || process.env[key] === "");
  const callbackConfigured = process.env[callbackSecretKey] !== undefined && process.env[callbackSecretKey] !== "";
  const reasons = [...missingCredentials.map((key) => `${key}_MISSING`), ...(callbackConfigured ? [] : [`${callbackSecretKey}_MISSING`])];

  return {
    callbackConfigured,
    code,
    credentialKeys,
    dryRun: reasons.length > 0,
    ready: reasons.length === 0,
    reasons
  };
}
