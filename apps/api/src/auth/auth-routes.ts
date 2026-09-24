import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { enableMfaTotpSchema, googleLoginSchema, loginSchema, registerSchema, requestEmailVerificationSchema, verifyEmailSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import {
  AuthConflictError,
  EmailVerificationInvalidError,
  GoogleAccountConflictError,
  GoogleEmailNotVerifiedError,
  MfaAlreadyEnabledError,
  MfaInvalidError,
  MfaRequiredError,
  MfaSetupMissingError,
  MfaSetupRequiredError,
  enableMfaTotp,
  getMfaTotpStatus,
  InvalidCredentialsError,
  login,
  loginWithGoogle,
  refreshSession,
  register,
  requestEmailVerification,
  setupMfaTotp,
  switchWorkspaceSession,
  verifyEmail,
  verifyMfaTotpSession
} from "./auth-service";
import { GoogleOAuthConfigurationError, GoogleOAuthTokenError, getGoogleOAuthConfigurationStatus } from "./google-oauth";
import { clearRefreshCookieHeader, readRefreshCookie, refreshCookieHeader } from "./refresh-cookie";
import { RefreshTokenInvalidError, RefreshTokenReuseDetectedError, revokeRefreshToken } from "./tokens";
import { forwardEmailVerification, VerificationEmailConfigurationError, VerificationEmailDeliveryError } from "./verification-email";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { registerNativeAuthRoutes } from "./native-auth-routes";

const BROWSER_SESSION_HEADER = "x-markos-session";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  await registerNativeAuthRoutes(app);
  app.post("/v1/auth/workspace", { config: { workspaceRequired: true, verifiedUserRequired: true } }, async (request, reply) => {
    const parsed = z
      .object({
        workspaceId: z.string().uuid(),
        totpCode: z
          .string()
          .regex(/^\d{6}$/)
          .optional()
      })
      .strict()
      .safeParse(request.body);
    if (!parsed.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Choose a workspace"));
    const body = parsed.data;
    const current = request.auth!;
    try {
      const grant = await switchWorkspaceSession({
        userId: current.userId,
        authVersion: current.authVersion,
        mfaVerifiedUntil: current.mfaVerifiedUntil,
        workspaceId: body.workspaceId,
        ...(body.totpCode ? { totpCode: body.totpCode } : {})
      });
      const previous = readRefreshCookie(request.headers.cookie);
      if (previous) await revokeRefreshToken(previous, current.userId);
      return sendSession(reply, grant);
    } catch (error) {
      if (error instanceof InvalidCredentialsError) return reply.code(403).send(errorEnvelope("WORKSPACE_FORBIDDEN", "Workspace is not available"));
      if (error instanceof MfaRequiredError) return reply.code(403).send(errorEnvelope("MFA_REQUIRED", error.message));
      if (error instanceof MfaSetupRequiredError) return reply.code(403).send(errorEnvelope("MFA_SETUP_REQUIRED", error.message));
      if (error instanceof MfaInvalidError) return reply.code(400).send(errorEnvelope("MFA_INVALID", error.message));
      throw error;
    }
  });
  app.post("/v1/auth/register", { bodyLimit: 16_384 }, async (request, reply) => {
    const parsed = registerSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid registration request", parsed.error.issues));
    }

    try {
      return sendSession(reply, await register(parsed.data), 201);
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
      return sendSession(reply, await login(parsed.data));
    } catch (error) {
      if (error instanceof MfaSetupRequiredError) {
        return reply.status(403).send(errorEnvelope("MFA_SETUP_REQUIRED", error.message));
      }

      if (error instanceof MfaRequiredError) {
        return reply.status(401).send(errorEnvelope("MFA_REQUIRED", error.message));
      }

      if (error instanceof MfaInvalidError) {
        return reply.status(401).send(errorEnvelope("MFA_INVALID", error.message));
      }

      if (error instanceof InvalidCredentialsError) {
        return reply.status(401).send(errorEnvelope("INVALID_CREDENTIALS", error.message));
      }

      throw error;
    }
  });

  app.get("/v1/auth/google/configuration", async () => {
    return ok(getGoogleOAuthConfigurationStatus());
  });

  app.post("/v1/auth/google", async (request, reply) => {
    const parsed = googleLoginSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid Google login request", parsed.error.issues));
    }

    try {
      return sendSession(reply, await loginWithGoogle(parsed.data));
    } catch (error) {
      if (error instanceof GoogleOAuthConfigurationError) {
        return reply.status(409).send(errorEnvelope("GOOGLE_OAUTH_NOT_CONFIGURED", error.message, error.missing));
      }

      if (error instanceof GoogleOAuthTokenError) {
        return reply.status(401).send(errorEnvelope("GOOGLE_ID_TOKEN_INVALID", error.message));
      }

      if (error instanceof GoogleEmailNotVerifiedError) {
        return reply.status(403).send(errorEnvelope("GOOGLE_EMAIL_NOT_VERIFIED", error.message));
      }

      if (error instanceof MfaSetupRequiredError) {
        return reply.status(403).send(errorEnvelope("MFA_SETUP_REQUIRED", error.message));
      }

      if (error instanceof MfaRequiredError) {
        return reply.status(401).send(errorEnvelope("MFA_REQUIRED", error.message));
      }

      if (error instanceof MfaInvalidError) {
        return reply.status(401).send(errorEnvelope("MFA_INVALID", error.message));
      }

      if (error instanceof GoogleAccountConflictError) {
        return reply.status(409).send(errorEnvelope("GOOGLE_ACCOUNT_CONFLICT", error.message));
      }

      if (error instanceof InvalidCredentialsError) {
        return reply.status(401).send(errorEnvelope("INVALID_CREDENTIALS", error.message));
      }

      throw error;
    }
  });

  app.get(
    "/v1/auth/mfa/totp",
    {
      config: {
        permissions: ["workspace:read"],
        verifiedUserRequired: true,
        workspaceRequired: true
      }
    },
    async () => {
      const { userId } = requireWorkspaceContext();
      return ok(await getMfaTotpStatus(userId));
    }
  );

  app.post(
    "/v1/auth/mfa/totp/setup",
    {
      config: {
        permissions: ["workspace:read"],
        verifiedUserRequired: true,
        workspaceRequired: true
      }
    },
    async (_request, reply) => {
      const { userId } = requireWorkspaceContext();

      try {
        return ok(await setupMfaTotp(userId));
      } catch (error) {
        if (error instanceof MfaAlreadyEnabledError) {
          return reply.status(409).send(errorEnvelope("MFA_ALREADY_ENABLED", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/auth/mfa/totp/enable",
    {
      config: {
        permissions: ["workspace:read"],
        verifiedUserRequired: true,
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = enableMfaTotpSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid TOTP MFA request", parsed.error.issues));
      }

      const { userId } = requireWorkspaceContext();

      try {
        return ok(await enableMfaTotp(userId, parsed.data));
      } catch (error) {
        if (error instanceof MfaSetupMissingError) {
          return reply.status(409).send(errorEnvelope("MFA_SETUP_MISSING", error.message));
        }

        if (error instanceof MfaInvalidError) {
          return reply.status(401).send(errorEnvelope("MFA_INVALID", error.message));
        }

        throw error;
      }
    }
  );

  app.post(
    "/v1/auth/mfa/totp/verify",
    {
      config: {
        permissions: ["workspace:read"],
        verifiedUserRequired: true,
        workspaceRequired: true
      }
    },
    async (request, reply) => {
      const parsed = enableMfaTotpSchema.safeParse(request.body);

      if (!parsed.success) {
        return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid TOTP MFA request", parsed.error.issues));
      }

      const { userId, workspaceId } = requireWorkspaceContext();

      try {
        return sendSession(
          reply,
          await verifyMfaTotpSession({
            code: parsed.data.code,
            authVersion: request.auth!.authVersion,
            userId,
            workspaceId
          })
        );
      } catch (error) {
        if (error instanceof InvalidCredentialsError) {
          return reply.status(401).send(errorEnvelope("INVALID_TOKEN", "Sign in again to confirm account security"));
        }
        if (error instanceof MfaSetupRequiredError) {
          return reply.status(403).send(errorEnvelope("MFA_SETUP_REQUIRED", error.message));
        }

        if (error instanceof MfaInvalidError) {
          return reply.status(401).send(errorEnvelope("MFA_INVALID", error.message));
        }

        throw error;
      }
    }
  );

  app.post("/v1/auth/verification/request", async (request, reply) => {
    const parsed = requestEmailVerificationSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid email verification request", parsed.error.issues));
    }

    try {
      const forwarded = await forwardEmailVerification("/v1/auth/verification/request", parsed.data);
      if (forwarded !== null) return reply.status(forwarded.status).send(forwarded.body);
      return ok(await requestEmailVerification(parsed.data));
    } catch (error) {
      if (error instanceof VerificationEmailConfigurationError) {
        return reply.status(503).send(errorEnvelope("EMAIL_DELIVERY_NOT_CONFIGURED", error.message));
      }

      if (error instanceof VerificationEmailDeliveryError) {
        return reply.status(503).send(errorEnvelope("EMAIL_DELIVERY_UNAVAILABLE", error.message));
      }

      throw error;
    }
  });

  app.post("/v1/auth/verify-email", async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid email verification request", parsed.error.issues));
    }

    try {
      const forwarded = await forwardEmailVerification("/v1/auth/verify-email", parsed.data);
      if (forwarded !== null) return reply.status(forwarded.status).send(forwarded.body);
      return ok(await verifyEmail(parsed.data));
    } catch (error) {
      if (error instanceof VerificationEmailDeliveryError) {
        return reply.status(503).send(errorEnvelope("EMAIL_DELIVERY_UNAVAILABLE", error.message));
      }

      if (error instanceof EmailVerificationInvalidError) {
        return reply.status(400).send(errorEnvelope("EMAIL_VERIFICATION_INVALID", error.message));
      }

      throw error;
    }
  });

  app.post("/v1/auth/refresh", async (request, reply) => {
    if (!isBrowserSessionRequest(request)) {
      return reply.status(400).send(errorEnvelope("AUTH_SESSION_REQUEST_REQUIRED", "Invalid browser session request"));
    }

    const refreshToken = readRefreshCookie(request.headers.cookie);

    if (!refreshToken) {
      clearRefreshCookie(reply);
      return reply.status(401).send(errorEnvelope("INVALID_REFRESH_TOKEN", "Refresh token is invalid or expired"));
    }

    try {
      return sendSession(reply, await refreshSession(refreshToken));
    } catch (error) {
      if (error instanceof RefreshTokenReuseDetectedError) {
        clearRefreshCookie(reply);
        return reply.status(401).send(errorEnvelope("REFRESH_TOKEN_REUSE_DETECTED", error.message));
      }

      if (error instanceof MfaSetupRequiredError) {
        clearRefreshCookie(reply);
        return reply.status(403).send(errorEnvelope("MFA_SETUP_REQUIRED", error.message));
      }

      if (error instanceof MfaRequiredError) {
        clearRefreshCookie(reply);
        return reply.status(401).send(errorEnvelope("MFA_REQUIRED", error.message));
      }

      if (error instanceof RefreshTokenInvalidError || error instanceof InvalidCredentialsError) {
        clearRefreshCookie(reply);
        return reply.status(401).send(errorEnvelope("INVALID_REFRESH_TOKEN", error.message));
      }

      throw error;
    }
  });

  app.post("/v1/auth/logout", async (request, reply) => {
    if (!isBrowserSessionRequest(request)) {
      return reply.status(400).send(errorEnvelope("AUTH_SESSION_REQUEST_REQUIRED", "Invalid browser session request"));
    }

    const refreshToken = readRefreshCookie(request.headers.cookie);
    clearRefreshCookie(reply);

    if (refreshToken) await revokeRefreshToken(refreshToken);
    return ok({ loggedOut: true });
  });
}

function sendSession(reply: FastifyReply, grant: Awaited<ReturnType<typeof login>>, statusCode = 200) {
  reply.header("Cache-Control", "no-store");
  reply.header("Set-Cookie", refreshCookieHeader(grant.refreshToken));
  return reply.status(statusCode).send(ok(grant.session));
}

function clearRefreshCookie(reply: FastifyReply): void {
  reply.header("Cache-Control", "no-store");
  reply.header("Set-Cookie", clearRefreshCookieHeader());
}

function isBrowserSessionRequest(request: FastifyRequest): boolean {
  return request.headers[BROWSER_SESSION_HEADER] === "browser";
}
