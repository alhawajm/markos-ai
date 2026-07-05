import type {
  BillingCheckoutResult,
  BillingInvoiceRecord,
  BillingPaymentCaptureResult,
  BillingPaymentRecord,
  BillingPlanCatalogItem,
  BillingProrationBreakdown,
  BillingSummary,
  BillingSubscriptionRecord,
  BillingUpgradeResult,
  BillingVatComplianceCheck,
  BillingVatComplianceReport,
  BillingVatBreakdown,
  PaymentGatewayCode,
  PlanCode
} from "@markos/shared-types";
import { prisma } from "../db/prisma";

const BHD = "BHD" as const;
const VAT_RATE_BPS = 1000;
const CHECKOUT_BASE_URL = "https://payments.markos.local/checkout";

export class BillingPlanNotFoundError extends Error {
  constructor(planCode: PlanCode) {
    super(`Active billing plan ${planCode} was not found`);
  }
}

export class BillingWorkspaceNotFoundError extends Error {
  constructor() {
    super("Workspace was not found");
  }
}

export class BillingOwnerRequiredError extends Error {
  constructor() {
    super("Only the workspace owner can manage billing");
  }
}

export class BillingCurrencyError extends Error {
  constructor(currency: string) {
    super(`Billing currently supports BHD only, received ${currency}`);
  }
}

export class BillingPaymentNotFoundError extends Error {
  constructor() {
    super("Payment was not found for this workspace");
  }
}

export class BillingPaymentInvalidStateError extends Error {
  constructor(message = "Payment cannot be captured from its current state") {
    super(message);
  }
}

export class BillingInvoiceNotFoundError extends Error {
  constructor() {
    super("Invoice was not found for this workspace");
  }
}

export class BillingUpgradeUnavailableError extends Error {
  constructor(message = "A paid active subscription is required before upgrading") {
    super(message);
  }
}

export class BillingUpgradePlanInvalidError extends Error {
  constructor(message = "Upgrade target must be a higher priced active plan") {
    super(message);
  }
}

export interface PaymentGatewayAdapter {
  readonly code: PaymentGatewayCode;
  createCheckout(input: {
    amountMinor: number;
    currency: "BHD";
    invoiceId: string;
    planCode: PlanCode;
    workspaceId: string;
  }): Promise<{
    gatewayRef: string;
    redirectUrl: string;
  }>;
}

export async function listBillingPlans(): Promise<BillingPlanCatalogItem[]> {
  const plans = await prisma.plan.findMany({
    where: {
      active: true,
      deletedAt: null
    },
    orderBy: {
      priceMinor: "asc"
    }
  });

  return plans.map(mapPlan);
}

export async function getBillingSummary(workspaceId: string): Promise<BillingSummary> {
  const [plans, workspace, invoices, payments, subscription] = await Promise.all([
    listBillingPlans(),
    prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        deletedAt: null
      },
      select: {
        vatPricingMode: true
      }
    }),
    prisma.invoice.findMany({
      where: {
        workspaceId,
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 12
    }),
    prisma.payment.findMany({
      where: {
        workspaceId,
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc"
      },
      take: 12
    }),
    prisma.subscription.findFirst({
      where: {
        workspaceId,
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    })
  ]);

  if (workspace === null) {
    throw new BillingWorkspaceNotFoundError();
  }

  const subscriptionPlan =
    subscription === null
      ? null
      : await prisma.plan.findUnique({
          where: {
            id: subscription.planId
          }
        });

  return {
    invoices: invoices.map((invoice) => mapInvoice(invoice, workspace.vatPricingMode)),
    payments: payments.map(mapPayment),
    plans,
    ...(subscription === null || subscriptionPlan === null
      ? {}
      : { subscription: mapSubscription(subscription, subscriptionPlan.code as PlanCode) }),
    workspaceId
  };
}

export async function exportBillingInvoicePdf(workspaceId: string, invoiceId: string): Promise<{ bytes: Buffer; filename: string }> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      workspaceId,
      deletedAt: null
    }
  });

  if (invoice === null) {
    throw new BillingInvoiceNotFoundError();
  }

  const [workspace, payment] = await Promise.all([
    prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        deletedAt: null
      },
      select: {
        name: true,
        slug: true,
        vatPricingMode: true
      }
    }),
    prisma.payment.findFirst({
      where: {
        invoiceId: invoice.id,
        workspaceId,
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    })
  ]);

  if (workspace === null) {
    throw new BillingWorkspaceNotFoundError();
  }

  const mappedInvoice = mapInvoice(invoice, workspace.vatPricingMode);

  return {
    bytes: buildVatInvoicePdf({
      invoice: mappedInvoice,
      ...(payment === null ? {} : { payment: mapPayment(payment) }),
      workspaceName: workspace.name
    }),
    filename: `markos-vat-invoice-${slugForFilename(workspace.slug)}-${invoice.id.slice(0, 8)}.pdf`
  };
}

export async function verifyBillingVatCompliance(workspaceId: string, invoiceId: string): Promise<BillingVatComplianceReport> {
  const invoice = await prisma.invoice.findFirst({
    where: {
      id: invoiceId,
      workspaceId,
      deletedAt: null
    }
  });

  if (invoice === null) {
    throw new BillingInvoiceNotFoundError();
  }

  const [workspace, payment] = await Promise.all([
    prisma.workspace.findFirst({
      where: {
        id: workspaceId,
        deletedAt: null
      },
      select: {
        vatPricingMode: true
      }
    }),
    prisma.payment.findFirst({
      where: {
        invoiceId: invoice.id,
        workspaceId,
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    })
  ]);

  if (workspace === null) {
    throw new BillingWorkspaceNotFoundError();
  }

  const mappedInvoice = mapInvoice(invoice, workspace.vatPricingMode);
  const expectedVat = calculateVat({
    priceMinor: workspace.vatPricingMode === "INCLUSIVE" ? invoice.grossMinor : invoice.netMinor,
    vatPricingMode: workspace.vatPricingMode,
    vatRateBps: invoice.vatRateBps
  });
  const checks: BillingVatComplianceCheck[] = [
    {
      code: "BHD_CURRENCY",
      details: `Invoice currency is ${invoice.currency}; Bahrain launch billing must be BHD.`,
      passed: invoice.currency === BHD
    },
    {
      code: "INTEGER_MINOR_UNITS",
      details: "Net, VAT, gross, and payment amounts must be stored as integer BHD fils.",
      passed:
        Number.isInteger(invoice.netMinor) &&
        Number.isInteger(invoice.vatMinor) &&
        Number.isInteger(invoice.grossMinor) &&
        (payment === null || Number.isInteger(payment.amountMinor))
    },
    {
      code: "NON_NEGATIVE_AMOUNTS",
      details: "Net, VAT, gross, and payment amounts must not be negative.",
      passed:
        invoice.netMinor >= 0 &&
        invoice.vatMinor >= 0 &&
        invoice.grossMinor >= 0 &&
        (payment === null || payment.amountMinor >= 0)
    },
    {
      code: "VAT_RATE",
      details: `Stored VAT rate is ${invoice.vatRateBps} basis points; Bahrain VAT is ${VAT_RATE_BPS} basis points.`,
      passed: invoice.vatRateBps === VAT_RATE_BPS
    },
    {
      code: "VAT_BREAKDOWN",
      details: `Expected net ${expectedVat.netMinor}, VAT ${expectedVat.vatMinor}, gross ${expectedVat.grossMinor} for ${workspace.vatPricingMode} pricing.`,
      passed:
        invoice.netMinor === expectedVat.netMinor &&
        invoice.vatMinor === expectedVat.vatMinor &&
        invoice.grossMinor === expectedVat.grossMinor
    },
    {
      code: "GROSS_TOTAL",
      details: "Gross must equal net plus VAT.",
      passed: invoice.grossMinor === invoice.netMinor + invoice.vatMinor
    },
    {
      code: "ISSUED_AT",
      details: "VAT invoices must have an issue timestamp.",
      passed: invoice.issuedAt !== null
    },
    {
      code: "PAYMENT_RECONCILIATION",
      details:
        payment === null
          ? "No payment is linked yet; draft invoices can remain unpaid before capture."
          : `Latest payment ${payment.status} amount is ${payment.amountMinor}; invoice gross is ${invoice.grossMinor}.`,
      passed: payment === null || payment.amountMinor === invoice.grossMinor
    }
  ];

  return {
    checks,
    compliant: checks.every((check) => check.passed),
    generatedAt: new Date().toISOString(),
    invoice: mappedInvoice,
    workspaceId
  };
}

export async function startSubscriptionCheckout(input: {
  gateway: PaymentGatewayCode;
  planCode: PlanCode;
  userId: string;
  workspaceId: string;
}): Promise<BillingCheckoutResult> {
  const [plan, workspace] = await Promise.all([
    prisma.plan.findFirst({
      where: {
        active: true,
        code: input.planCode,
        deletedAt: null
      }
    }),
    prisma.workspace.findFirst({
      where: {
        id: input.workspaceId,
        deletedAt: null
      },
      select: {
        id: true,
        ownerUserId: true,
        vatPricingMode: true
      }
    })
  ]);

  if (plan === null) {
    throw new BillingPlanNotFoundError(input.planCode);
  }

  if (workspace === null) {
    throw new BillingWorkspaceNotFoundError();
  }

  if (workspace.ownerUserId !== input.userId) {
    throw new BillingOwnerRequiredError();
  }

  const mappedPlan = mapPlan(plan);
  const vat = calculateVat({
    priceMinor: mappedPlan.priceMinor,
    vatPricingMode: workspace.vatPricingMode
  });
  const adapter = getPaymentGatewayAdapter(input.gateway);
  const periodStart = new Date();
  const periodEnd = addMonths(periodStart, 1);

  const { invoice } = await prisma.$transaction(async (tx) => {
    const createdSubscription = await tx.subscription.create({
      data: {
        currentPeriodEnd: periodEnd,
        currentPeriodStart: periodStart,
        gateway: input.gateway,
        planId: plan.id,
        status: "TRIALING",
        userId: input.userId,
        workspaceId: input.workspaceId
      }
    });
    const createdInvoice = await tx.invoice.create({
      data: {
        currency: BHD,
        grossMinor: vat.grossMinor,
        issuedAt: new Date(),
        netMinor: vat.netMinor,
        status: "DRAFT",
        subscriptionId: createdSubscription.id,
        userId: input.userId,
        vatMinor: vat.vatMinor,
        vatRateBps: vat.vatRateBps,
        workspaceId: input.workspaceId
      }
    });

    return {
      invoice: createdInvoice,
      subscription: createdSubscription
    };
  });

  const checkout = await adapter.createCheckout({
    amountMinor: vat.grossMinor,
    currency: BHD,
    invoiceId: invoice.id,
    planCode: input.planCode,
    workspaceId: input.workspaceId
  });

  const payment = await prisma.payment.create({
    data: {
      amountMinor: vat.grossMinor,
      currency: BHD,
      gateway: input.gateway,
      gatewayRef: checkout.gatewayRef,
      invoiceId: invoice.id,
      status: "INITIATED",
      workspaceId: input.workspaceId
    }
  });

  return {
    checkoutMode: "dry_run",
    gateway: input.gateway,
    invoice: mapInvoice(invoice, workspace.vatPricingMode),
    payment: mapPayment(payment),
    plan: mappedPlan,
    redirectUrl: checkout.redirectUrl,
    vat
  };
}

export async function startProratedUpgrade(input: {
  gateway: PaymentGatewayCode;
  targetPlanCode: PlanCode;
  userId: string;
  workspaceId: string;
  now?: Date;
}): Promise<BillingUpgradeResult> {
  const now = input.now ?? new Date();
  const [workspace, activeSubscription, targetPlan] = await Promise.all([
    prisma.workspace.findFirst({
      where: {
        id: input.workspaceId,
        deletedAt: null
      },
      select: {
        id: true,
        ownerUserId: true,
        vatPricingMode: true
      }
    }),
    prisma.subscription.findFirst({
      where: {
        workspaceId: input.workspaceId,
        status: "ACTIVE",
        deletedAt: null
      },
      orderBy: {
        createdAt: "desc"
      }
    }),
    prisma.plan.findFirst({
      where: {
        active: true,
        code: input.targetPlanCode,
        deletedAt: null
      }
    })
  ]);

  if (workspace === null) {
    throw new BillingWorkspaceNotFoundError();
  }

  if (workspace.ownerUserId !== input.userId) {
    throw new BillingOwnerRequiredError();
  }

  if (targetPlan === null) {
    throw new BillingPlanNotFoundError(input.targetPlanCode);
  }

  if (activeSubscription === null || activeSubscription.currentPeriodEnd <= now) {
    throw new BillingUpgradeUnavailableError();
  }

  const currentPlan = await prisma.plan.findUnique({
    where: {
      id: activeSubscription.planId
    }
  });

  if (currentPlan === null || !currentPlan.active || currentPlan.deletedAt !== null) {
    throw new BillingUpgradeUnavailableError("Current subscription plan is no longer active");
  }

  const currentMappedPlan = mapPlan(currentPlan);
  const targetMappedPlan = mapPlan(targetPlan);

  if (targetMappedPlan.priceMinor <= currentMappedPlan.priceMinor) {
    throw new BillingUpgradePlanInvalidError();
  }

  const proration = calculateProration({
    currentPlan: currentMappedPlan,
    periodEnd: activeSubscription.currentPeriodEnd,
    periodStart: activeSubscription.currentPeriodStart,
    targetPlan: targetMappedPlan,
    now
  });
  const vat = calculateVat({
    priceMinor: proration.upgradeNetMinor,
    vatPricingMode: workspace.vatPricingMode
  });
  const adapter = getPaymentGatewayAdapter(input.gateway);

  const { invoice } = await prisma.$transaction(async (tx) => {
    const pendingSubscription = await tx.subscription.create({
      data: {
        currentPeriodEnd: activeSubscription.currentPeriodEnd,
        currentPeriodStart: now,
        gateway: input.gateway,
        planId: targetPlan.id,
        status: "TRIALING",
        userId: input.userId,
        workspaceId: input.workspaceId
      }
    });
    const createdInvoice = await tx.invoice.create({
      data: {
        currency: BHD,
        grossMinor: vat.grossMinor,
        issuedAt: now,
        netMinor: vat.netMinor,
        status: "DRAFT",
        subscriptionId: pendingSubscription.id,
        userId: input.userId,
        vatMinor: vat.vatMinor,
        vatRateBps: vat.vatRateBps,
        workspaceId: input.workspaceId
      }
    });

    return {
      invoice: createdInvoice
    };
  });

  const checkout = await adapter.createCheckout({
    amountMinor: vat.grossMinor,
    currency: BHD,
    invoiceId: invoice.id,
    planCode: input.targetPlanCode,
    workspaceId: input.workspaceId
  });
  const payment = await prisma.payment.create({
    data: {
      amountMinor: vat.grossMinor,
      currency: BHD,
      gateway: input.gateway,
      gatewayRef: checkout.gatewayRef,
      invoiceId: invoice.id,
      status: "INITIATED",
      workspaceId: input.workspaceId
    }
  });

  return {
    checkoutMode: "dry_run",
    gateway: input.gateway,
    invoice: mapInvoice(invoice, workspace.vatPricingMode),
    payment: mapPayment(payment),
    plan: targetMappedPlan,
    proration,
    redirectUrl: checkout.redirectUrl,
    vat
  };
}

export async function captureDryRunPayment(input: {
  paymentId: string;
  userId: string;
  workspaceId: string;
}): Promise<BillingPaymentCaptureResult> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      id: input.workspaceId,
      deletedAt: null
    },
    select: {
      ownerUserId: true,
      vatPricingMode: true
    }
  });

  if (workspace === null) {
    throw new BillingWorkspaceNotFoundError();
  }

  if (workspace.ownerUserId !== input.userId) {
    throw new BillingOwnerRequiredError();
  }

  const result = await prisma.$transaction(async (tx) => {
    const payment = await tx.payment.findFirst({
      where: {
        id: input.paymentId,
        workspaceId: input.workspaceId,
        deletedAt: null
      }
    });

    if (payment === null) {
      throw new BillingPaymentNotFoundError();
    }

    if (payment.invoiceId === null) {
      throw new BillingPaymentInvalidStateError("Payment is not linked to an invoice");
    }

    const invoice = await tx.invoice.findFirst({
      where: {
        id: payment.invoiceId,
        workspaceId: input.workspaceId,
        deletedAt: null
      }
    });

    if (invoice === null) {
      throw new BillingPaymentInvalidStateError("Payment invoice was not found");
    }

    if (invoice.subscriptionId === null) {
      throw new BillingPaymentInvalidStateError("Invoice is not linked to a subscription");
    }

    const subscription = await tx.subscription.findFirst({
      where: {
        id: invoice.subscriptionId,
        workspaceId: input.workspaceId,
        deletedAt: null
      }
    });

    if (subscription === null) {
      throw new BillingPaymentInvalidStateError("Invoice subscription was not found");
    }

    const plan = await tx.plan.findUnique({
      where: {
        id: subscription.planId
      }
    });

    if (plan === null || !plan.active || plan.deletedAt !== null) {
      throw new BillingPaymentInvalidStateError("Subscription plan is no longer active");
    }

    if (payment.status !== "INITIATED" && payment.status !== "AUTHORIZED" && payment.status !== "CAPTURED") {
      throw new BillingPaymentInvalidStateError();
    }

    if (payment.status !== "CAPTURED") {
      await tx.subscription.updateMany({
        data: {
          cancelAtPeriodEnd: true,
          status: "CANCELLED"
        },
        where: {
          id: {
            not: subscription.id
          },
          workspaceId: input.workspaceId,
          status: {
            in: ["TRIALING", "ACTIVE", "PAST_DUE"]
          },
          deletedAt: null
        }
      });
    }

    const capturedAt = invoice.paidAt ?? new Date();
    const capturedPayment =
      payment.status === "CAPTURED"
        ? payment
        : await tx.payment.update({
            data: {
              status: "CAPTURED"
            },
            where: {
              id: payment.id
            }
          });
    const paidInvoice =
      invoice.status === "PAID"
        ? invoice
        : await tx.invoice.update({
            data: {
              paidAt: capturedAt,
              status: "PAID"
            },
            where: {
              id: invoice.id
            }
          });
    const activeSubscription =
      subscription.status === "ACTIVE"
        ? subscription
        : await tx.subscription.update({
            data: {
              cancelAtPeriodEnd: false,
              status: "ACTIVE"
            },
            where: {
              id: subscription.id
            }
          });

    await tx.user.update({
      data: {
        planId: plan.id,
        planStatus: "ACTIVE",
        trialEndsAt: null
      },
      where: {
        id: subscription.userId
      }
    });

    return {
      invoice: paidInvoice,
      payment: capturedPayment,
      plan,
      subscription: activeSubscription
    };
  });

  return {
    invoice: mapInvoice(result.invoice, workspace.vatPricingMode),
    payment: mapPayment(result.payment),
    subscription: mapSubscription(result.subscription, result.plan.code as PlanCode),
    workspaceId: input.workspaceId
  };
}

export function calculateVat(input: {
  priceMinor: number;
  vatPricingMode: "EXCLUSIVE" | "INCLUSIVE";
  vatRateBps?: number;
}): BillingVatBreakdown {
  assertBhdMinorUnits(input.priceMinor);

  const vatRateBps = input.vatRateBps ?? VAT_RATE_BPS;

  if (input.vatPricingMode === "INCLUSIVE") {
    const grossMinor = input.priceMinor;
    const netMinor = roundDiv(grossMinor * 10_000, 10_000 + vatRateBps);
    return {
      currency: BHD,
      grossMinor,
      netMinor,
      vatMinor: grossMinor - netMinor,
      vatPricingMode: input.vatPricingMode,
      vatRateBps
    };
  }

  const netMinor = input.priceMinor;
  const vatMinor = roundDiv(netMinor * vatRateBps, 10_000);

  return {
    currency: BHD,
    grossMinor: netMinor + vatMinor,
    netMinor,
    vatMinor,
    vatPricingMode: input.vatPricingMode,
    vatRateBps
  };
}

function getPaymentGatewayAdapter(code: PaymentGatewayCode): PaymentGatewayAdapter {
  return new DryRunPaymentGatewayAdapter(code);
}

class DryRunPaymentGatewayAdapter implements PaymentGatewayAdapter {
  readonly code: PaymentGatewayCode;

  constructor(code: PaymentGatewayCode) {
    this.code = code;
  }

  async createCheckout(input: {
    amountMinor: number;
    currency: "BHD";
    invoiceId: string;
    planCode: PlanCode;
    workspaceId: string;
  }): Promise<{ gatewayRef: string; redirectUrl: string }> {
    const gatewayRef = `${this.code.toLowerCase()}_${input.invoiceId}`;
    const redirectUrl = new URL(`${CHECKOUT_BASE_URL}/${this.code.toLowerCase()}`);
    redirectUrl.searchParams.set("invoiceId", input.invoiceId);
    redirectUrl.searchParams.set("workspaceId", input.workspaceId);
    redirectUrl.searchParams.set("plan", input.planCode);
    redirectUrl.searchParams.set("amountMinor", String(input.amountMinor));
    redirectUrl.searchParams.set("currency", input.currency);

    return {
      gatewayRef,
      redirectUrl: redirectUrl.toString()
    };
  }
}

function mapPlan(plan: {
  active: boolean;
  code: string;
  currency: string;
  id: string;
  limits: unknown;
  name: string;
  priceMinor: number;
}): BillingPlanCatalogItem {
  if (plan.currency !== BHD) {
    throw new BillingCurrencyError(plan.currency);
  }

  assertBhdMinorUnits(plan.priceMinor);

  return {
    active: plan.active,
    code: plan.code as PlanCode,
    currency: BHD,
    id: plan.id,
    limits: isRecord(plan.limits) ? plan.limits : {},
    name: plan.name,
    priceMinor: plan.priceMinor
  };
}

function mapInvoice(invoice: {
  currency: string;
  grossMinor: number;
  id: string;
  issuedAt: Date | null;
  netMinor: number;
  paidAt: Date | null;
  status: "DRAFT" | "PAID" | "FAILED" | "VOID";
  vatMinor: number;
  vatRateBps: number;
  workspaceId: string;
}, vatPricingMode: "EXCLUSIVE" | "INCLUSIVE"): BillingInvoiceRecord {
  if (invoice.currency !== BHD) {
    throw new BillingCurrencyError(invoice.currency);
  }

  return {
    currency: BHD,
    grossMinor: invoice.grossMinor,
    id: invoice.id,
    ...(invoice.issuedAt === null ? {} : { issuedAt: invoice.issuedAt.toISOString() }),
    netMinor: invoice.netMinor,
    ...(invoice.paidAt === null ? {} : { paidAt: invoice.paidAt.toISOString() }),
    status: invoice.status,
    vatMinor: invoice.vatMinor,
    vatPricingMode,
    vatRateBps: invoice.vatRateBps,
    workspaceId: invoice.workspaceId
  };
}

function mapPayment(payment: {
  amountMinor: number;
  currency: string;
  gateway: string;
  gatewayRef: string | null;
  id: string;
  invoiceId: string | null;
  status: "INITIATED" | "AUTHORIZED" | "CAPTURED" | "FAILED" | "REFUNDED";
  workspaceId: string;
}): BillingPaymentRecord {
  if (payment.currency !== BHD) {
    throw new BillingCurrencyError(payment.currency);
  }

  return {
    amountMinor: payment.amountMinor,
    currency: BHD,
    gateway: payment.gateway as PaymentGatewayCode,
    ...(payment.gatewayRef === null ? {} : { gatewayRef: payment.gatewayRef }),
    id: payment.id,
    ...(payment.invoiceId === null ? {} : { invoiceId: payment.invoiceId }),
    status: payment.status,
    workspaceId: payment.workspaceId
  };
}

function mapSubscription(subscription: {
  cancelAtPeriodEnd: boolean;
  currentPeriodEnd: Date;
  currentPeriodStart: Date;
  gateway: string;
  id: string;
  status: "TRIALING" | "ACTIVE" | "PAST_DUE" | "CANCELLED";
}, planCode: PlanCode): BillingSubscriptionRecord {
  return {
    cancelAtPeriodEnd: subscription.cancelAtPeriodEnd,
    currentPeriodEnd: subscription.currentPeriodEnd.toISOString(),
    currentPeriodStart: subscription.currentPeriodStart.toISOString(),
    gateway: subscription.gateway,
    id: subscription.id,
    planCode,
    status: subscription.status
  };
}

function calculateProration(input: {
  currentPlan: BillingPlanCatalogItem;
  now: Date;
  periodEnd: Date;
  periodStart: Date;
  targetPlan: BillingPlanCatalogItem;
}): BillingProrationBreakdown {
  const totalMs = input.periodEnd.getTime() - input.periodStart.getTime();
  const remainingMs = Math.max(input.periodEnd.getTime() - input.now.getTime(), 0);

  if (totalMs <= 0 || remainingMs <= 0) {
    throw new BillingUpgradeUnavailableError();
  }

  const priceDifference = input.targetPlan.priceMinor - input.currentPlan.priceMinor;
  const upgradeNetMinor = roundDiv(priceDifference * remainingMs, totalMs);
  const creditMinor = roundDiv(input.currentPlan.priceMinor * remainingMs, totalMs);

  if (upgradeNetMinor <= 0) {
    throw new BillingUpgradePlanInvalidError();
  }

  return {
    creditMinor,
    currentPlanCode: input.currentPlan.code,
    currentPlanPriceMinor: input.currentPlan.priceMinor,
    remainingDays: Math.ceil(remainingMs / 86_400_000),
    remainingPeriodRatioBps: roundDiv(remainingMs * 10_000, totalMs),
    targetPlanCode: input.targetPlan.code,
    targetPlanPriceMinor: input.targetPlan.priceMinor,
    totalPeriodDays: Math.ceil(totalMs / 86_400_000),
    upgradeNetMinor
  };
}

function buildVatInvoicePdf(input: {
  invoice: BillingInvoiceRecord;
  payment?: BillingPaymentRecord;
  workspaceName: string;
}): Buffer {
  const lines = [
    "MARKOS AI VAT Invoice",
    `Invoice ID: ${input.invoice.id}`,
    `Workspace: ${input.workspaceName}`,
    `Workspace ID: ${input.invoice.workspaceId}`,
    `Status: ${input.invoice.status}`,
    `Currency: ${input.invoice.currency}`,
    `Issued At: ${input.invoice.issuedAt ?? "Not issued"}`,
    `Paid At: ${input.invoice.paidAt ?? "Not paid"}`,
    "",
    "VAT Breakdown",
    `VAT Pricing Mode: ${input.invoice.vatPricingMode}`,
    `VAT Rate: ${(input.invoice.vatRateBps / 100).toFixed(2)}%`,
    `Net: ${formatBhd(input.invoice.netMinor)}`,
    `VAT: ${formatBhd(input.invoice.vatMinor)}`,
    `Gross: ${formatBhd(input.invoice.grossMinor)}`,
    "",
    "Payment Evidence",
    `Payment ID: ${input.payment?.id ?? "Not captured"}`,
    `Gateway: ${input.payment?.gateway ?? "Not available"}`,
    `Gateway Ref: ${input.payment?.gatewayRef ?? "Not available"}`,
    `Payment Status: ${input.payment?.status ?? "Not available"}`,
    "",
    "Tax Notes",
    "BHD amounts are stored and rendered in fils.",
    "Bahrain VAT is calculated at 10% when VAT rate is 1000 basis points.",
    "Seller VAT number: pending configuration.",
    "Reverse-charge handling: pending VAT ID profile support."
  ];
  const pages = paginatePdfLines(lines.map(sanitizePdfText), 42);
  const objects: string[] = [];
  const catalogId = 1;
  const pagesId = 2;
  const fontId = 3;
  const pageIds: number[] = [];

  objects.push(`<< /Type /Catalog /Pages ${pagesId} 0 R >>`);
  objects.push("");
  objects.push("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");

  for (const pageLines of pages) {
    const pageId = objects.length + 1;
    const contentId = pageId + 1;
    const stream = buildPdfContentStream(pageLines);

    pageIds.push(pageId);
    objects.push(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
    objects.push(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  return assemblePdf(objects, catalogId);
}

function paginatePdfLines(lines: string[], pageSize: number): string[][] {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }

  return pages.length === 0 ? [["MARKOS AI VAT Invoice"]] : pages;
}

function buildPdfContentStream(lines: string[]): string {
  const commands = ["BT", "/F1 11 Tf", "50 742 Td", "14 TL"];

  for (const line of lines) {
    commands.push(`(${escapePdfString(line)}) Tj`, "T*");
  }

  commands.push("ET");
  return commands.join("\n");
}

function assemblePdf(objects: string[], catalogId: number): Buffer {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");

  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }

  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`);
  chunks.push(`startxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "utf8");
}

function sanitizePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 110);
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function formatBhd(amountMinor: number): string {
  return `BHD ${(amountMinor / 1000).toFixed(3)}`;
}

function slugForFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug.length === 0 ? "invoice" : slug;
}

function assertBhdMinorUnits(amountMinor: number): void {
  if (!Number.isInteger(amountMinor) || amountMinor < 0) {
    throw new Error("BHD amounts must be non-negative integer fils");
  }
}

function roundDiv(numerator: number, denominator: number): number {
  return Math.floor((numerator + denominator / 2) / denominator);
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function addMonths(date: Date, months: number): Date {
  const copy = new Date(date);
  copy.setMonth(copy.getMonth() + months);
  return copy;
}
