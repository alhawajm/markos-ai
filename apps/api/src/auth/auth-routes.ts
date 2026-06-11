import type { FastifyInstance } from "fastify";
import { loginSchema, refreshSessionSchema, registerSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { AuthConflictError, InvalidCredentialsError, login, refreshSession, register } from "./auth-service";
import { RefreshTokenInvalidError, RefreshTokenReuseDetectedError } from "./tokens";

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

  app.post("/v1/auth/refresh", async (request, reply) => {
    const parsed = refreshSessionSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid refresh request", parsed.error.issues));
    }

    try {
      return ok(await refreshSession(parsed.data));
    } catch (error) {
      if (error instanceof RefreshTokenReuseDetectedError) {
        return reply.status(401).send(errorEnvelope("REFRESH_TOKEN_REUSE_DETECTED", error.message));
      }

      if (error instanceof RefreshTokenInvalidError || error instanceof InvalidCredentialsError) {
        return reply.status(401).send(errorEnvelope("INVALID_REFRESH_TOKEN", error.message));
      }

      throw error;
    }
  });
}
