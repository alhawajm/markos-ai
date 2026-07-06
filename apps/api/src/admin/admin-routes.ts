import type { FastifyInstance } from "fastify";
import { adminModelSettingKeySchema, adminUpdateModelSettingSchema, planCodeSchema, adminUpdatePlanLimitsSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import {
  AdminPlanNotFoundError,
  getBahrainLaunchReadiness,
  getAdminBillingOperations,
  getAdminGatewayReadiness,
  getAdminModelConfiguration,
  listAdminPlans,
  updateAdminPlanLimits
} from "./admin-service";
import { updateModelSetting } from "./model-settings-service";

export async function registerAdminRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/admin/plans",
    {
      config: {
        workspaceRequired: true,
        permissions: ["admin:read"]
      }
    },
    async () => ok(await listAdminPlans())
  );

  app.patch(
    "/v1/admin/plans/:planCode/limits",
    {
      config: {
        workspaceRequired: true,
        permissions: ["admin:manage"]
      }
    },
    async (request, reply) => {
      const params = request.params as { planCode?: string };
      const parsedPlanCode = planCodeSchema.safeParse(params.planCode);
      const parsedBody = adminUpdatePlanLimitsSchema.safeParse(request.body ?? {});

      if (!parsedPlanCode.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid admin plan code", parsedPlanCode.error.issues));
      }

      if (!parsedBody.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid admin plan limit update", parsedBody.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();

      try {
        return ok(
          await updateAdminPlanLimits({
            actorId: userId,
            limits: parsedBody.data.limits,
            planCode: parsedPlanCode.data,
            workspaceId
          })
        );
      } catch (error) {
        if (error instanceof AdminPlanNotFoundError) {
          return reply.status(404).send(errorEnvelope("ADMIN_PLAN_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.get(
    "/v1/admin/billing/operations",
    {
      config: {
        workspaceRequired: true,
        permissions: ["admin:read"]
      }
    },
    async () => ok(await getAdminBillingOperations())
  );

  app.get(
    "/v1/admin/gateways",
    {
      config: {
        workspaceRequired: true,
        permissions: ["admin:read"]
      }
    },
    async () => ok(getAdminGatewayReadiness())
  );

  app.get(
    "/v1/admin/bahrain-launch-readiness",
    {
      config: {
        workspaceRequired: true,
        permissions: ["admin:read"]
      }
    },
    async () => ok(await getBahrainLaunchReadiness())
  );

  app.get(
    "/v1/admin/model-config",
    {
      config: {
        workspaceRequired: true,
        permissions: ["admin:read"]
      }
    },
    async () => ok(await getAdminModelConfiguration())
  );

  app.patch(
    "/v1/admin/model-config/:key",
    {
      config: {
        workspaceRequired: true,
        permissions: ["admin:manage"]
      }
    },
    async (request, reply) => {
      const params = request.params as { key?: string };
      const parsedKey = adminModelSettingKeySchema.safeParse(params.key);
      const parsedBody = adminUpdateModelSettingSchema.safeParse(request.body ?? {});

      if (!parsedKey.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid model setting key", parsedKey.error.issues));
      }

      if (!parsedBody.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid model setting update", parsedBody.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();

      return ok(
        await updateModelSetting({
          actorId: userId,
          key: parsedKey.data,
          value: parsedBody.data.value,
          workspaceId
        })
      );
    }
  );
}
