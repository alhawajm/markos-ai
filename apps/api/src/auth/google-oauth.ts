import { createRemoteJWKSet, jwtVerify } from "jose";
import { env } from "../config/env";

export interface GoogleIdentity {
  email: string;
  emailVerified: boolean;
  fullName: string;
  googleId: string;
}

export interface GoogleOAuthConfig {
  clientId?: string;
  issuer: string;
  jwksUrl: string;
}

export class GoogleOAuthConfigurationError extends Error {
  constructor(readonly missing: string[]) {
    super("Google OAuth is not configured");
  }
}

export class GoogleOAuthTokenError extends Error {
  constructor(message = "Google ID token is invalid") {
    super(message);
  }
}

export type GoogleTokenVerifier = (idToken: string, config?: GoogleOAuthConfig) => Promise<GoogleIdentity>;

export function getGoogleOAuthConfig(): GoogleOAuthConfig {
  return {
    ...(env.GOOGLE_OAUTH_CLIENT_ID === undefined ? {} : { clientId: env.GOOGLE_OAUTH_CLIENT_ID }),
    issuer: env.GOOGLE_OAUTH_ISSUER,
    jwksUrl: env.GOOGLE_OAUTH_JWKS_URL
  };
}

export function getGoogleOAuthConfigurationStatus(config: GoogleOAuthConfig = getGoogleOAuthConfig()): {
  configured: boolean;
  missing: string[];
} {
  const missing = getConfigurationMissingFields(config);

  return {
    configured: missing.length === 0,
    missing
  };
}

export const verifyGoogleIdToken: GoogleTokenVerifier = async (idToken, config = getGoogleOAuthConfig()) => {
  const missing = getConfigurationMissingFields(config);

  if (missing.length > 0) {
    throw new GoogleOAuthConfigurationError(missing);
  }

  try {
    const clientId = config.clientId;

    if (clientId === undefined) {
      throw new GoogleOAuthConfigurationError(["GOOGLE_OAUTH_CLIENT_ID"]);
    }

    const jwks = createRemoteJWKSet(new URL(config.jwksUrl));
    const result = await jwtVerify(idToken, jwks, {
      audience: clientId,
      issuer: config.issuer
    });
    const email = typeof result.payload.email === "string" ? result.payload.email : undefined;
    const emailVerified = result.payload.email_verified === true || result.payload.email_verified === "true";
    const fullName = typeof result.payload.name === "string" ? result.payload.name : email;

    if (!result.payload.sub || typeof result.payload.sub !== "string" || email === undefined || fullName === undefined) {
      throw new GoogleOAuthTokenError();
    }

    return {
      email,
      emailVerified,
      fullName,
      googleId: result.payload.sub
    };
  } catch (error) {
    if (error instanceof GoogleOAuthConfigurationError || error instanceof GoogleOAuthTokenError) {
      throw error;
    }

    throw new GoogleOAuthTokenError();
  }
};

function getConfigurationMissingFields(config: GoogleOAuthConfig): string[] {
  const missing: string[] = [];

  if (config.clientId === undefined) {
    missing.push("GOOGLE_OAUTH_CLIENT_ID");
  }

  return missing;
}
