import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { enableMfaTotpSchema, googleLoginSchema, loginSchema, registerSchema, requestEmailVerificationSchema, verifyEmailSchema } from "@markos/validation";
import { errorEnvelope, ok } from "../http/envelope";
import {
  AuthConflictError,
  EmailVerificationInvalidError,
  GoogleAccountConflictError,
  GoogleEmailNotVerifiedError,
  MfaInvalidError,
  MfaRequiredError,
  MfaSetupMissingError,
  MfaSetupRequiredError,
  enableMfaTotp,
  InvalidCredentialsError,
  login,
  loginWithGoogle,
  refreshSession,
  register,
  requestEmailVerification,
  setupMfaTotp,
  verifyEmail
} from "./auth-service";
import { GoogleOAuthConfigurationError, GoogleOAuthTokenError, getGoogleOAuthConfigurationStatus } from "./google-oauth";
import { clearRefreshCookieHeader, readRefreshCookie, refreshCookieHeader } from "./refresh-cookie";
import { RefreshTokenInvalidError, RefreshTokenReuseDetectedError, revokeRefreshToken } from "./tokens";
import { requireWorkspaceContext } from "../tenancy/workspace-context";

const BROWSER_SESSION_HEADER = "x-markos-session";

export async function registerAuthRoutes(app: FastifyInstance): Promise<void> {
  app.post("/v1/auth/register", async (request, reply) => {
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

  app.post(
    "/v1/auth/mfa/totp/setup",
    {
      config: {
        permissions: ["workspace:read"],
        workspaceRequired: true
      }
    },
    async () => {
      const { userId } = requireWorkspaceContext();
      return ok(await setupMfaTotp(userId));
    }
  );

  app.post(
    "/v1/auth/mfa/totp/enable",
    {
      config: {
        permissions: ["workspace:read"],
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

  app.post("/v1/auth/verification/request", async (request, reply) => {
    const parsed = requestEmailVerificationSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid email verification request", parsed.error.issues));
    }

    return ok(await requestEmailVerification(parsed.data));
  });

  app.post("/v1/auth/verify-email", async (request, reply) => {
    const parsed = verifyEmailSchema.safeParse(request.body);

    if (!parsed.success) {
      return reply.status(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid email verification request", parsed.error.issues));
    }

    try {
      return ok(await verifyEmail(parsed.data));
    } catch (error) {
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
