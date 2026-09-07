import type { FastifyInstance } from "fastify";
import { calendarReadQuerySchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { readWorkspaceCalendar } from "./calendar-service";

export async function registerCalendarRoutes(app: FastifyInstance): Promise<void> {
  app.get(
    "/v1/calendar",
    {
      config: {
        workspaceRequired: true,
        permissions: ["content:read"]
      }
    },
    async (request, reply) => {
      const parsed = calendarReadQuerySchema.safeParse(request.query ?? {});

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Calendar query", parsed.error.issues));
      }

      const { workspaceId } = requireWorkspaceContext();
      return ok(await readWorkspaceCalendar(workspaceId, parsed.data));
    }
  );
}
