import type { FastifyInstance } from "fastify";
import {
  enableMfaTotpSchema,
  googleLoginSchema,
  loginSchema,
  refreshSessionSchema,
  registerSchema,
  requestEmailVerificationSchema,
  verifyEmailSchema
} from "@markos/validation";
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
import { RefreshTokenInvalidError, RefreshTokenReuseDetectedError } from "./tokens";
import { requireWorkspaceContext } from "../tenancy/workspace-context";

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
      return ok(await loginWithGoogle(parsed.data));
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

      if (error instanceof MfaSetupRequiredError) {
        return reply.status(403).send(errorEnvelope("MFA_SETUP_REQUIRED", error.message));
      }

      if (error instanceof MfaRequiredError) {
        return reply.status(401).send(errorEnvelope("MFA_REQUIRED", error.message));
      }

      if (error instanceof RefreshTokenInvalidError || error instanceof InvalidCredentialsError) {
        return reply.status(401).send(errorEnvelope("INVALID_REFRESH_TOKEN", error.message));
      }

      throw error;
    }
  });
}
