import type { FastifyInstance, FastifyReply } from "fastify";
import type { AnalyticsChatResult, AnalyticsDigestResult } from "@markos/shared-types";
import {
  analyticsChatSchema,
  analyticsDigestSchema,
  analyticsLearningSchema,
  analyticsMonthlyEmailSchema,
  analyticsMonthlyPdfSchema
} from "@markos/validation";
import { AgentContextMissingError, runWorkspaceAgent } from "../agents/agent-service";
import { sendMonthlyAnalyticsPdfEmail } from "./analytics-email-service";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { UsagePlanInactiveError, UsageQuotaExceededError } from "../usage/usage-service";
import {
  AnalyticsWorkspaceNotFoundError,
  exportMonthlyAnalyticsPdf,
  getAnalyticsLiveReadiness,
  getAnalyticsSummary,
  syncInstagramAnalytics,
  writeAnalyticsLearningToVault
} from "./analytics-service";

export async function registerAnalyticsRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/analytics/live-readiness",
    {
      config: {
        permissions: ["analytics:sync"],
        workspaceRequired: true
      }
    },
    async (_request, reply) => {
      const { workspaceId } = requireWorkspaceContext();

      try {
        return ok(await getAnalyticsLiveReadiness(workspaceId));
      } catch (error) {
        if (error instanceof AnalyticsWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.get(
    "/v1/analytics",
    {
      config: {
        permissions: ["analytics:read"],
        workspaceRequired: true
      }
    },
    async (request) => {
      const { workspaceId } = requireWorkspaceContext();
      const query = request.query as { days?: string };
      const days = query.days === undefined ? undefined : Number(query.days);

      return ok(await getAnalyticsSummary(workspaceId, { ...(days === undefined ? {} : { days }) }));
    }
  );

  app.post(
    "/v1/analytics/sync",
    {
      config: {
        permissions: ["analytics:sync"],
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const { workspaceId } = requireWorkspaceContext();
      const body = (request.body ?? {}) as { days?: number };

      try {
        return ok(await syncInstagramAnalytics(workspaceId, { ...(body.days === undefined ? {} : { days: body.days }) }));
      } catch (error) {
        if (error instanceof AnalyticsWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/analytics/digest",
    {
      config: {
        permissions: ["analytics:read", "agent:run"],
        verifiedUserRequired: true,
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = analyticsDigestSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid analytics digest request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        const run = await runWorkspaceAgent(workspaceId, {
          agent: "ANALYTICS_CONSULTANT",
          inputs: {
            analyticsDays: parsed.data.days,
            outputFormat: "digest"
          },
          locale: parsed.data.locale,
          task: `Create a concise analytics digest for the last ${parsed.data.days} days with wins, risks, and next actions.`
        });
        const result: AnalyticsDigestResult = {
          days: parsed.data.days,
          generatedAt: new Date().toISOString(),
          locale: parsed.data.locale,
          run
        };

        return ok(result);
      } catch (error) {
        return handleAnalyticsAgentError(error, reply);
      }
    }
  );

  app.post(
    "/v1/analytics/learning",
    {
      config: {
        permissions: ["analytics:sync"],
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = analyticsLearningSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid analytics learning request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      return ok(await writeAnalyticsLearningToVault(workspaceId, { days: parsed.data.days }));
    }
  );

  app.get(
    "/v1/analytics/monthly-pdf",
    {
      config: {
        permissions: ["analytics:read"],
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const query = request.query as { locale?: string; month?: string };
      const parsed = analyticsMonthlyPdfSchema.safeParse(query);

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid analytics PDF request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        const pdf = await exportMonthlyAnalyticsPdf(workspaceId, {
          locale: parsed.data.locale,
          ...(parsed.data.month === undefined ? {} : { month: parsed.data.month })
        });

        return reply.header("content-type", "application/pdf").header("content-disposition", `attachment; filename="${pdf.filename}"`).send(pdf.bytes);
      } catch (error) {
        if (error instanceof AnalyticsWorkspaceNotFoundError) {
          return reply.status(404).send(errorEnvelope("WORKSPACE_NOT_FOUND", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/analytics/monthly-email",
    {
      config: {
        permissions: ["analytics:read"],
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = analyticsMonthlyEmailSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid analytics email request", parsed.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();
      const result = await sendMonthlyAnalyticsPdfEmail(workspaceId, {
        actorId: userId,
        locale: parsed.data.locale,
        ...(parsed.data.month === undefined ? {} : { month: parsed.data.month })
      });

      return ok(result);
    }
  );

  app.post(
    "/v1/analytics/chat",
    {
      config: {
        permissions: ["analytics:read", "agent:run"],
        verifiedUserRequired: true,
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = analyticsChatSchema.safeParse(request.body ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid analytics chat request", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();

      try {
        const run = await runWorkspaceAgent(workspaceId, {
          agent: "ANALYTICS_CONSULTANT",
          inputs: {
            analyticsDays: parsed.data.days,
            outputFormat: "chat_answer",
            question: parsed.data.question
          },
          locale: parsed.data.locale,
          task: `Answer this analytics question using the last ${parsed.data.days} days of Instagram metrics: ${parsed.data.question}`
        });
        const result: AnalyticsChatResult = {
          days: parsed.data.days,
          locale: parsed.data.locale,
          question: parsed.data.question,
          run
        };

        return ok(result);
      } catch (error) {
        return handleAnalyticsAgentError(error, reply);
      }
    }
  );
}

function handleAnalyticsAgentError(error: unknown, reply: FastifyReply) {
  if (error instanceof AgentContextMissingError) {
    return reply.status(409).send(errorEnvelope("AGENT_CONTEXT_MISSING", error.message));
  }

  if (error instanceof UsageQuotaExceededError) {
    return reply.status(402).send(errorEnvelope("USAGE_QUOTA_EXCEEDED", error.message, [{ metric: error.metric }]));
  }

  if (error instanceof UsagePlanInactiveError) {
    return reply.status(402).send(errorEnvelope("BILLING_STATUS_INACTIVE", error.message, [{ status: error.status }]));
  }

  throw error;
}
