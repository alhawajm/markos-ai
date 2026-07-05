import type { FastifyInstance } from "fastify";
import { billingCheckoutSchema, billingInvoiceParamsSchema, billingPaymentCaptureParamsSchema, billingUpgradeSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  BillingPaymentInvalidStateError,
  BillingPaymentNotFoundError,
  BillingInvoiceNotFoundError,
  BillingOwnerRequiredError,
  BillingPlanNotFoundError,
  BillingUpgradePlanInvalidError,
  BillingUpgradeUnavailableError,
  BillingWorkspaceNotFoundError,
  captureDryRunPayment,
  exportBillingInvoicePdf,
  getBillingSummary,
  listBillingPlans,
  startProratedUpgrade,
  startSubscriptionCheckout,
  verifyBillingVatCompliance
} from "./billing-service";

export async function registerBillingRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/billing/plans",
    {
      config: {
        workspaceRequired: true,
        permissions: ["billing:read"]
      }
    },
    async () => ok(await listBillingPlans())
  );

  app.get(
    "/v1/billing/summary",
    {
      config: {
        workspaceRequired: true,
        permissions: ["billing:read"]
      }
    },
    async () => {
      const { workspaceId } = requireWorkspaceContext();
      return ok(await getBillingSummary(workspaceId));
    }
  );

  app.post(
    "/v1/billing/checkout",
    {
      config: {
        workspaceRequired: true,
        permissions: ["billing:manage"]
      }
    },
    async (request, reply) => {
      const parsed = billingCheckoutSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid billing checkout request", parsed.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();

      try {
        return ok(
          await startSubscriptionCheckout({
            gateway: parsed.data.gateway,
            planCode: parsed.data.planCode,
            userId,
            workspaceId
          })
        );
      } catch (error) {
        if (error instanceof BillingPlanNotFoundError) {
          return reply.status(404).send(errorEnvelope("BILLING_PLAN_NOT_FOUND", error.message));
        }

        if (error instanceof BillingWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        if (error instanceof BillingOwnerRequiredError) {
          return reply.status(403).send(errorEnvelope("BILLING_OWNER_REQUIRED", error.message));
        }

        throw error;
      }
    }
  );

  app.get(
    "/v1/billing/invoices/:invoiceId/pdf",
    {
      config: {
        workspaceRequired: true,
        permissions: ["billing:read"]
      }
    },
    async (request, reply) => {
      const params = request.params as { invoiceId?: string };

      if (!params.invoiceId) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invoice id is required"));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        const pdf = await exportBillingInvoicePdf(workspaceId, params.invoiceId);

        return reply
          .header("content-type", "application/pdf")
          .header("content-disposition", `attachment; filename="${pdf.filename}"`)
          .send(pdf.bytes);
      } catch (error) {
        if (error instanceof BillingInvoiceNotFoundError) {
          return reply.status(404).send(errorEnvelope("BILLING_INVOICE_NOT_FOUND", error.message));
        }

        if (error instanceof BillingWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.get(
    "/v1/billing/invoices/:invoiceId/vat-compliance",
    {
      config: {
        workspaceRequired: true,
        permissions: ["billing:read"]
      }
    },
    async (request, reply) => {
      const parsed = billingInvoiceParamsSchema.safeParse(request.params ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid billing invoice request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await verifyBillingVatCompliance(workspaceId, parsed.data.invoiceId));
      } catch (error) {
        if (error instanceof BillingInvoiceNotFoundError) {
          return reply.status(404).send(errorEnvelope("BILLING_INVOICE_NOT_FOUND", error.message));
        }

        if (error instanceof BillingWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/billing/payments/:paymentId/capture",
    {
      config: {
        workspaceRequired: true,
        permissions: ["billing:manage"]
      }
    },
    async (request, reply) => {
      const parsed = billingPaymentCaptureParamsSchema.safeParse(request.params ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid billing payment capture request", parsed.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();

      try {
        return ok(
          await captureDryRunPayment({
            paymentId: parsed.data.paymentId,
            userId,
            workspaceId
          })
        );
      } catch (error) {
        if (error instanceof BillingPaymentNotFoundError) {
          return reply.status(404).send(errorEnvelope("BILLING_PAYMENT_NOT_FOUND", error.message));
        }

        if (error instanceof BillingWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        if (error instanceof BillingOwnerRequiredError) {
          return reply.status(403).send(errorEnvelope("BILLING_OWNER_REQUIRED", error.message));
        }

        if (error instanceof BillingPaymentInvalidStateError) {
          return reply.status(409).send(errorEnvelope("BILLING_PAYMENT_INVALID_STATE", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/billing/upgrade",
    {
      config: {
        workspaceRequired: true,
        permissions: ["billing:manage"]
      }
    },
    async (request, reply) => {
      const parsed = billingUpgradeSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid billing upgrade request", parsed.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();

      try {
        return ok(
          await startProratedUpgrade({
            gateway: parsed.data.gateway,
            targetPlanCode: parsed.data.targetPlanCode,
            userId,
            workspaceId
          })
        );
      } catch (error) {
        if (error instanceof BillingPlanNotFoundError) {
          return reply.status(404).send(errorEnvelope("BILLING_PLAN_NOT_FOUND", error.message));
        }

        if (error instanceof BillingWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        if (error instanceof BillingOwnerRequiredError) {
          return reply.status(403).send(errorEnvelope("BILLING_OWNER_REQUIRED", error.message));
        }

        if (error instanceof BillingUpgradeUnavailableError) {
          return reply.status(409).send(errorEnvelope("BILLING_UPGRADE_UNAVAILABLE", error.message));
        }

        if (error instanceof BillingUpgradePlanInvalidError) {
          return reply.status(409).send(errorEnvelope("BILLING_UPGRADE_PLAN_INVALID", error.message));
        }

        throw error;
      }
    }
  );
}
