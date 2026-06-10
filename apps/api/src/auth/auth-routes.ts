import type { FastifyInstance } from "fastify";
import { loginSchema, registerSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { AuthConflictError, InvalidCredentialsError, login, register } from "./auth-service";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/auth/register", async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid registration request", parsed.error.issues));
    }

    try {
      const session = await register(parsed.data);
      return reply.status(201).send(ok(session));
    } catch (error) {
      if (error instanceof AuthConflictError) {
        return reply.status(409).send(errorEnvelope("EMAIL_ALREADY_EXISTS", error.message));
      }

      throw error;
    }
  });

  app.post("/v1/auth/login", async (request, reply) => {
    const parsed = loginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid login request", parsed.error.issues));
    }

    try {
      return ok(await login(parsed.data));
    } catch (error) {
      if (error instanceof InvalidCredentialsError) {
        return reply.status(401).send(errorEnvelope("INVALID_CREDENTIALS", error.message));
      }

      throw error;
    }
  });
}
