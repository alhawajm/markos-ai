import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { issueAuthTokens } from "../src/auth/tokens";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

describe("billing routes", () => {
  it("lists active BHD plans in integer fils", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    const response = await app.inject({
      method: "GET",
      url: "/v1/billing/plans",
      headers: authHeaders(session.tokens.accessToken)
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "STARTER",
          currency: "BHD",
          priceMinor: 18_000
        })
      ])
    );
    expect(response.json().data.every((plan: { priceMinor: number }) => Number.isInteger(plan.priceMinor))).toBe(true);

    await app.close();
  });

  it("starts a CrediMax checkout with exclusive Bahrain VAT", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      checkoutMode: "dry_run",
      gateway: "CREDIMAX",
      invoice: {
        currency: "BHD",
        grossMinor: 19_800,
        netMinor: 18_000,
        status: "DRAFT",
        vatMinor: 1_800,
        vatPricingMode: "EXCLUSIVE",
        vatRateBps: 1000,
        workspaceId: session.workspace.id
      },
      payment: {
        amountMinor: 19_800,
        currency: "BHD",
        gateway: "CREDIMAX",
        status: "INITIATED",
        workspaceId: session.workspace.id
      },
      plan: {
        code: "STARTER",
        currency: "BHD",
        priceMinor: 18_000
      },
      vat: {
        grossMinor: 19_800,
        netMinor: 18_000,
        vatMinor: 1_800,
        vatPricingMode: "EXCLUSIVE"
      }
    });
    expect(response.json().data.redirectUrl).toContain("/credimax");
    expect(response.json().data.payment.gatewayRef).toContain("credimax_");

    const invoice = await prisma.invoice.findUniqueOrThrow({
      where: {
        id: response.json().data.invoice.id
      }
    });
    const payment = await prisma.payment.findUniqueOrThrow({
      where: {
        id: response.json().data.payment.id
      }
    });

    expect(invoice.workspaceId).toBe(session.workspace.id);
    expect(payment.invoiceId).toBe(invoice.id);

    await app.close();
  });

  it("captures a dry-run payment and activates the workspace subscription", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "GROWTH"
      }
    });
    const paymentId = checkout.json().data.payment.id;

    const capture = await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${paymentId}/capture`,
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });

    expect(capture.statusCode).toBe(200);
    expect(capture.json().data).toMatchObject({
      invoice: {
        status: "PAID",
        grossMinor: 40_700,
        workspaceId: session.workspace.id
      },
      payment: {
        amountMinor: 40_700,
        gateway: "CREDIMAX",
        status: "CAPTURED",
        workspaceId: session.workspace.id
      },
      subscription: {
        cancelAtPeriodEnd: false,
        gateway: "CREDIMAX",
        planCode: "GROWTH",
        status: "ACTIVE"
      },
      workspaceId: session.workspace.id
    });
    expect(capture.json().data.invoice.paidAt).toBeDefined();

    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: session.user.id
      },
      select: {
        planId: true,
        planStatus: true,
        trialEndsAt: true
      }
    });
    const growth = await prisma.plan.findUniqueOrThrow({
      where: {
        code: "GROWTH"
      }
    });

    expect(user).toMatchObject({
      planId: growth.id,
      planStatus: "ACTIVE",
      trialEndsAt: null
    });

    const summary = await app.inject({
      method: "GET",
      url: "/v1/billing/summary",
      headers: authHeaders(session.tokens.accessToken)
    });

    expect(summary.statusCode).toBe(200);
    expect(summary.json().data.subscription).toMatchObject({
      planCode: "GROWTH",
      status: "ACTIVE"
    });

    await app.close();
  });

  it("exports a workspace-scoped VAT invoice PDF", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers,
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });
    const invoiceId = checkout.json().data.invoice.id as string;

    await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${checkout.json().data.payment.id}/capture`,
      headers,
      payload: {}
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/billing/invoices/${invoiceId}/pdf`,
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.headers["content-type"]).toContain("application/pdf");
    expect(response.headers["content-disposition"]).toContain("markos-vat-invoice");
    expect(response.headers["content-disposition"]).toContain(".pdf");
    expect(response.body.startsWith("%PDF-1.4")).toBe(true);
    expect(response.body).toContain("MARKOS AI VAT Invoice");
    expect(response.body).toContain("VAT Breakdown");
    expect(response.body).toContain("Net: BHD 18.000");
    expect(response.body).toContain("VAT: BHD 1.800");
    expect(response.body).toContain("Gross: BHD 19.800");
    expect(response.body).toContain("Payment Status: CAPTURED");

    await app.close();
  });

  it("verifies a Bahrain VAT-compliant invoice", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers,
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });
    const invoiceId = checkout.json().data.invoice.id as string;

    await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${checkout.json().data.payment.id}/capture`,
      headers,
      payload: {}
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/billing/invoices/${invoiceId}/vat-compliance`,
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      compliant: true,
      invoice: {
        currency: "BHD",
        grossMinor: 19_800,
        netMinor: 18_000,
        vatMinor: 1_800,
        vatPricingMode: "EXCLUSIVE",
        vatRateBps: 1000,
        workspaceId: session.workspace.id
      },
      workspaceId: session.workspace.id
    });
    expect(response.json().data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ code: "BHD_CURRENCY", passed: true }),
        expect.objectContaining({ code: "VAT_RATE", passed: true }),
        expect.objectContaining({ code: "VAT_BREAKDOWN", passed: true }),
        expect.objectContaining({ code: "PAYMENT_RECONCILIATION", passed: true })
      ])
    );

    await app.close();
  });

  it("flags VAT invoices with broken Bahrain VAT arithmetic", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const headers = authHeaders(session.tokens.accessToken);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers,
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });
    const invoiceId = checkout.json().data.invoice.id as string;

    await prisma.invoice.update({
      data: {
        grossMinor: 19_799,
        vatMinor: 1_799
      },
      where: {
        id: invoiceId
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/billing/invoices/${invoiceId}/vat-compliance`,
      headers
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data.compliant).toBe(false);
    expect(response.json().data.checks).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          code: "VAT_BREAKDOWN",
          passed: false
        }),
        expect.objectContaining({
          code: "PAYMENT_RECONCILIATION",
          passed: false
        })
      ])
    );

    await app.close();
  });

  it("does not export invoices from another workspace", async () => {
    const app = await buildApp();
    const first = await registerTestUser(app);
    const second = await registerTestUser(app);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(first.tokens.accessToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });

    const response = await app.inject({
      method: "GET",
      url: `/v1/billing/invoices/${checkout.json().data.invoice.id}/pdf`,
      headers: authHeaders(second.tokens.accessToken)
    });

    expect(response.statusCode).toBe(404);
    expect(response.json().error).toMatchObject({
      code: "BILLING_INVOICE_NOT_FOUND"
    });

    await app.close();
  });

  it("captures payments idempotently without duplicating subscriptions", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        gateway: "BENEFIT",
        planCode: "STARTER"
      }
    });
    const paymentId = checkout.json().data.payment.id;

    const firstCapture = await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${paymentId}/capture`,
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });
    const secondCapture = await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${paymentId}/capture`,
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });
    const subscriptions = await prisma.subscription.findMany({
      where: {
        workspaceId: session.workspace.id,
        deletedAt: null
      }
    });

    expect(firstCapture.statusCode).toBe(200);
    expect(secondCapture.statusCode).toBe(200);
    expect(firstCapture.json().data.subscription.id).toBe(secondCapture.json().data.subscription.id);
    expect(subscriptions).toHaveLength(1);
    expect(subscriptions[0]).toMatchObject({
      gateway: "BENEFIT",
      status: "ACTIVE"
    });

    await app.close();
  });

  it("starts a prorated upgrade and activates the target plan on capture", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const starterCheckout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });

    await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${starterCheckout.json().data.payment.id}/capture`,
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });

    const activeStarter = await prisma.subscription.findFirstOrThrow({
      where: {
        workspaceId: session.workspace.id,
        status: "ACTIVE"
      }
    });
    const now = new Date();
    const periodStart = new Date(now.getTime() - 10 * 86_400_000);
    const periodEnd = new Date(now.getTime() + 20 * 86_400_000);

    await prisma.subscription.update({
      data: {
        currentPeriodEnd: periodEnd,
        currentPeriodStart: periodStart
      },
      where: {
        id: activeStarter.id
      }
    });

    const upgrade = await app.inject({
      method: "POST",
      url: "/v1/billing/upgrade",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        gateway: "BENEFIT",
        targetPlanCode: "GROWTH"
      }
    });

    expect(upgrade.statusCode).toBe(200);
    expect(upgrade.json().data).toMatchObject({
      checkoutMode: "dry_run",
      gateway: "BENEFIT",
      invoice: {
        currency: "BHD",
        status: "DRAFT",
        vatPricingMode: "EXCLUSIVE",
        vatRateBps: 1000,
        workspaceId: session.workspace.id
      },
      payment: {
        currency: "BHD",
        gateway: "BENEFIT",
        status: "INITIATED",
        workspaceId: session.workspace.id
      },
      plan: {
        code: "GROWTH",
        priceMinor: 37_000
      },
      proration: {
        currentPlanCode: "STARTER",
        currentPlanPriceMinor: 18_000,
        targetPlanCode: "GROWTH",
        targetPlanPriceMinor: 37_000,
        totalPeriodDays: 30
      }
    });
    expect(upgrade.json().data.proration.remainingDays).toBeGreaterThanOrEqual(19);
    expect(upgrade.json().data.proration.remainingDays).toBeLessThanOrEqual(20);
    expect(upgrade.json().data.proration.remainingPeriodRatioBps).toBeGreaterThanOrEqual(6665);
    expect(upgrade.json().data.proration.remainingPeriodRatioBps).toBeLessThanOrEqual(6667);
    expect(upgrade.json().data.proration.upgradeNetMinor).toBeGreaterThanOrEqual(12_660);
    expect(upgrade.json().data.proration.upgradeNetMinor).toBeLessThanOrEqual(12_667);
    expect(upgrade.json().data.invoice.netMinor).toBe(upgrade.json().data.proration.upgradeNetMinor);
    expect(upgrade.json().data.invoice.vatMinor).toBe(Math.round(upgrade.json().data.invoice.netMinor * 0.1));
    expect(upgrade.json().data.invoice.grossMinor).toBe(upgrade.json().data.invoice.netMinor + upgrade.json().data.invoice.vatMinor);

    const capture = await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${upgrade.json().data.payment.id}/capture`,
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });

    expect(capture.statusCode).toBe(200);
    expect(capture.json().data).toMatchObject({
      invoice: {
        status: "PAID"
      },
      payment: {
        status: "CAPTURED"
      },
      subscription: {
        gateway: "BENEFIT",
        planCode: "GROWTH",
        status: "ACTIVE"
      }
    });
    expect(new Date(capture.json().data.subscription.currentPeriodEnd).getTime()).toBe(periodEnd.getTime());

    const previousSubscription = await prisma.subscription.findUniqueOrThrow({
      where: {
        id: activeStarter.id
      }
    });
    const user = await prisma.user.findUniqueOrThrow({
      where: {
        id: session.user.id
      },
      select: {
        planId: true,
        planStatus: true
      }
    });
    const growth = await prisma.plan.findUniqueOrThrow({
      where: {
        code: "GROWTH"
      }
    });

    expect(previousSubscription).toMatchObject({
      cancelAtPeriodEnd: true,
      status: "CANCELLED"
    });
    expect(user).toMatchObject({
      planId: growth.id,
      planStatus: "ACTIVE"
    });

    await app.close();
  });

  it("rejects prorated downgrade attempts", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "GROWTH"
      }
    });

    await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${checkout.json().data.payment.id}/capture`,
      headers: authHeaders(session.tokens.accessToken),
      payload: {}
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/upgrade",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        targetPlanCode: "STARTER"
      }
    });

    expect(response.statusCode).toBe(409);
    expect(response.json()).toMatchObject({
      error: {
        code: "BILLING_UPGRADE_PLAN_INVALID"
      }
    });

    await app.close();
  });

  it("supports BENEFIT and Stripe checkout adapter boundaries", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    for (const gateway of ["BENEFIT", "STRIPE"] as const) {
      const response = await app.inject({
        method: "POST",
        url: "/v1/billing/checkout",
        headers: authHeaders(session.tokens.accessToken),
        payload: {
          gateway,
          planCode: "GROWTH"
        }
      });

      expect(response.statusCode).toBe(200);
      expect(response.json().data).toMatchObject({
        checkoutMode: "dry_run",
        gateway,
        payment: {
          amountMinor: 40_700,
          gateway,
          status: "INITIATED"
        },
        plan: {
          code: "GROWTH",
          priceMinor: 37_000
        }
      });
      expect(response.json().data.redirectUrl).toContain(`/${gateway.toLowerCase()}`);
      expect(response.json().data.payment.gatewayRef).toContain(`${gateway.toLowerCase()}_`);
    }

    await app.close();
  });

  it("calculates inclusive VAT without changing BHD gross fils", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    await prisma.workspace.update({
      data: {
        vatPricingMode: "INCLUSIVE"
      },
      where: {
        id: session.workspace.id
      }
    });

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        planCode: "STARTER"
      }
    });

    expect(response.statusCode).toBe(200);
    expect(response.json().data).toMatchObject({
      gateway: "CREDIMAX",
      invoice: {
        grossMinor: 18_000,
        netMinor: 16_364,
        vatMinor: 1_636,
        vatPricingMode: "INCLUSIVE"
      },
      payment: {
        amountMinor: 18_000
      },
      vat: {
        grossMinor: 18_000,
        netMinor: 16_364,
        vatMinor: 1_636,
        vatPricingMode: "INCLUSIVE"
      }
    });

    await app.close();
  });

  it("blocks non-owner workspace members from starting checkout", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const member = await registerTestUser(app);
    const memberToken = await createWorkspaceTokenForUser(member.user.id, owner.workspace.id);

    const response = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(memberToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });

    expect(response.statusCode).toBe(403);
    expect(response.json()).toMatchObject({
      error: {
        code: "BILLING_OWNER_REQUIRED"
      }
    });

    await app.close();
  });

  it("does not let another workspace capture a payment", async () => {
    const app = await buildApp();
    const owner = await registerTestUser(app);
    const other = await registerTestUser(app);
    const checkout = await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(owner.tokens.accessToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });

    const response = await app.inject({
      method: "POST",
      url: `/v1/billing/payments/${checkout.json().data.payment.id}/capture`,
      headers: authHeaders(other.tokens.accessToken),
      payload: {}
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toMatchObject({
      error: {
        code: "BILLING_PAYMENT_NOT_FOUND"
      }
    });

    const payment = await prisma.payment.findUniqueOrThrow({
      where: {
        id: checkout.json().data.payment.id
      }
    });

    expect(payment.status).toBe("INITIATED");

    await app.close();
  });

  it("keeps billing summaries scoped to the active workspace", async () => {
    const app = await buildApp();
    const first = await registerTestUser(app);
    const second = await registerTestUser(app);

    await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(first.tokens.accessToken),
      payload: {
        gateway: "CREDIMAX",
        planCode: "STARTER"
      }
    });
    await app.inject({
      method: "POST",
      url: "/v1/billing/checkout",
      headers: authHeaders(second.tokens.accessToken),
      payload: {
        gateway: "BENEFIT",
        planCode: "PREMIUM"
      }
    });

    const firstSummary = await app.inject({
      method: "GET",
      url: "/v1/billing/summary",
      headers: authHeaders(first.tokens.accessToken)
    });
    const secondSummary = await app.inject({
      method: "GET",
      url: "/v1/billing/summary",
      headers: authHeaders(second.tokens.accessToken)
    });

    expect(firstSummary.statusCode).toBe(200);
    expect(secondSummary.statusCode).toBe(200);
    expect(firstSummary.json().data.invoices).toHaveLength(1);
    expect(secondSummary.json().data.invoices).toHaveLength(1);
    expect(firstSummary.json().data.payments[0]).toMatchObject({
      amountMinor: 19_800,
      gateway: "CREDIMAX",
      workspaceId: first.workspace.id
    });
    expect(secondSummary.json().data.payments[0]).toMatchObject({
      amountMinor: 82_500,
      gateway: "BENEFIT",
      workspaceId: second.workspace.id
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `billing-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "Billing User",
      workspaceName: `Billing Workspace ${randomUUID()}`,
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


async function createWorkspaceTokenForUser(userId: string, workspaceId: string): Promise<string> {
  await prisma.workspaceMember.create({
    data: {
      role: "EDITOR",
      userId,
      workspaceId
    }
  });
  const tokens = await issueAuthTokens({
    roles: ["EDITOR"],
    userId,
    workspaceId
  });

  return tokens.accessToken;
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    Authorization: `Bearer ${accessToken}`
  };
}
