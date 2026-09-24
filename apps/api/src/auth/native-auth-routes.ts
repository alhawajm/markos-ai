import type { FastifyInstance, FastifyReply } from "fastify";
import { z } from "zod";
import { enableMfaTotpSchema, loginSchema, nativeRegisterSchema } from "@markos/validation";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import type { NativeAuthSession } from "@markos/shared-types";
import { errorEnvelope, ok } from "../http/envelope";
import {
  InvalidCredentialsError,
  MfaInvalidError,
  MfaRequiredError,
  MfaSetupRequiredError,
  login,
  register,
  AuthConflictError,
  refreshSession,
  verifyMfaTotpSession,
  type AuthSessionGrant
} from "./auth-service";
import { RefreshTokenInvalidError, RefreshTokenReuseDetectedError, revokeRefreshToken } from "./tokens";

const refreshInput = z.object({ refreshToken: z.string().min(16).max(8192) }).strict();

/** Native clients keep the rotating credential in the OS credential store, not a browser cookie. */
export async function registerNativeAuthRoutes(app: FastifyInstance): Promise<void> {
  await app.register(async (native) => {
    native.addHook("onRequest", async (request, reply) => {
      reply.header("Cache-Control", "no-store");
      if (request.headers["x-markos-session"] !== "native" || request.headers.origin !== undefined) {
        return reply.status(400).send(errorEnvelope("NATIVE_SESSION_REQUEST_REQUIRED", "Use the native session transport"));
      }
    });

    native.post("/v1/auth/native/login", { bodyLimit: 16_384 }, async (request, reply) => {
      const parsed = loginSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid login request"));
      try {
        return sendNativeSession(reply, await login(parsed.data));
      } catch (error) {
        return sendAuthError(reply, error);
      }
    });
    native.post("/v1/auth/native/register", { bodyLimit: 16_384 }, async (request, reply) => {
      const parsed = nativeRegisterSchema.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Check your registration details and accept the terms"));
      try {
        reply.status(201);
        return sendNativeSession(reply, await register(parsed.data, { queueVerification: true }));
      } catch (error) {
        if (error instanceof AuthConflictError) return reply.status(409).send(errorEnvelope("EMAIL_ALREADY_EXISTS", error.message));
        throw error;
      }
    });

    native.post("/v1/auth/native/refresh", { bodyLimit: 16_384 }, async (request, reply) => {
      const parsed = refreshInput.safeParse(request.body);
      if (!parsed.success) return reply.status(401).send(errorEnvelope("INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired"));
      try {
        return sendNativeSession(reply, await refreshSession(parsed.data.refreshToken));
      } catch (error) {
        return sendAuthError(reply, error, true);
      }
    });

    native.post(
      "/v1/auth/native/mfa/totp/verify",
      {
        bodyLimit: 4096,
        config: { workspaceRequired: true, verifiedUserRequired: true, permissions: ["workspace:read"] }
      },
      async (request, reply) => {
        const parsed = enableMfaTotpSchema.safeParse(request.body);
        if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Enter the six-digit authenticator code"));
        const { userId, workspaceId } = requireWorkspaceContext();
        try {
          return sendNativeSession(reply, await verifyMfaTotpSession({ code: parsed.data.code, userId, workspaceId, authVersion: request.auth!.authVersion }));
        } catch (error) {
          if (error instanceof InvalidCredentialsError)
            return reply.status(401).send(errorEnvelope("INVALID_TOKEN", "Sign in again to confirm account security"));
          return sendAuthError(reply, error);
        }
      }
    );

    native.post("/v1/auth/native/logout", { bodyLimit: 16_384 }, async (request, reply) => {
      const parsed = refreshInput.safeParse(request.body);
      if (!parsed.success) return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid logout request"));
      await revokeRefreshToken(parsed.data.refreshToken);
      return ok({ loggedOut: true });
    });
  });
}

function sendNativeSession(reply: FastifyReply, grant: AuthSessionGrant) {
  const session: NativeAuthSession = {
    ...grant.session,
    tokens: { ...grant.session.tokens, refreshToken: grant.refreshToken }
  };
  return reply.send(ok(session));
}

function sendAuthError(reply: FastifyReply, error: unknown, refreshing = false) {
  if (error instanceof MfaSetupRequiredError) return reply.status(403).send(errorEnvelope("MFA_SETUP_REQUIRED", error.message));
  if (error instanceof MfaRequiredError) return reply.status(401).send(errorEnvelope("MFA_REQUIRED", error.message));
  if (error instanceof MfaInvalidError) return reply.status(401).send(errorEnvelope("MFA_INVALID", error.message));
  if (error instanceof RefreshTokenReuseDetectedError) return reply.status(401).send(errorEnvelope("REFRESH_TOKEN_REUSE_DETECTED", error.message));
  if (error instanceof RefreshTokenInvalidError || (refreshing && error instanceof InvalidCredentialsError)) {
    return reply.status(401).send(errorEnvelope("INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired"));
  }
  if (error instanceof InvalidCredentialsError) return reply.status(401).send(errorEnvelope("INVALID_CREDENTIALS", error.message));
  throw error;
}
