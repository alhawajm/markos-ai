import type { FastifyInstance } from "fastify";
import { forgotPasswordSchema, resetPasswordSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import { forgotPassword, resetPassword, PasswordResetInvalidError } from "./password-recovery";
import { processAuthEmails } from "./auth-email";
import { env } from "../config/env";
export async function registerPasswordRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/auth/password/forgot", { bodyLimit: 4096 }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = forgotPasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Enter a valid email address"));
    return reply.code(202).send(ok(await forgotPassword(parsed.data)));
  });
  app.post("/v1/auth/password/reset", { bodyLimit: 4096 }, async (request, reply) => {
    reply.header("Cache-Control", "no-store");
    const parsed = resetPasswordSchema.safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check your code and matching passwords (15–128 characters)"));
    try {
      await resetPassword(parsed.data);
      return ok({ reset: true });
    } catch (error) {
      if (error instanceof PasswordResetInvalidError) return reply.code(400).send(errorEnvelope("PASSWORD_RESET_INVALID", error.message));
      throw error;
    }
  });
  if (env.NODE_ENV !== "test") {
    let running: Promise<unknown> | undefined;
    let timer: ReturnType<typeof setInterval> | undefined;
    app.addHook("onReady", async () => {
      timer = setInterval(() => {
        if (running) return;
        running = processAuthEmails()
          .then((result) => {
            if (result.failed) app.log.warn({ count: result.failed }, "Auth email delivery will retry or needs attention");
          })
          .catch(() => app.log.error("Auth email processor failed"))
          .finally(() => {
            running = undefined;
          });
      }, 2000);
      timer.unref();
    });
    app.addHook("onClose", async () => {
      clearInterval(timer);
      await running;
    });
  }
}
