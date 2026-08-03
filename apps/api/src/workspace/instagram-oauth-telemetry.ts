import type { FastifyBaseLogger } from "fastify";

export const INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT =
  "instagram_oauth_callback_failure";

export type InstagramOAuthFailureStage =
  | "callback_input"
  | "state_validation"
  | "state_consumption"
  | "short_lived_token_exchange"
  | "long_lived_token_exchange"
  | "profile_retrieval"
  | "credential_persistence";

export type InstagramOAuthFailureDiagnostic = {
  stage: InstagramOAuthFailureStage;
  category: string;
  retryable: boolean;
  providerHttpStatus?: number;
  providerErrorType?: string;
  providerErrorCode?: string | number;
  providerErrorSubcode?: string | number;
};

type OAuthLogger = Pick<FastifyBaseLogger, "warn">;

/** Logs a deliberately allowlisted event. Never pass the originating error here. */
export function reportInstagramOAuthCallbackFailure(input: {
  logger: OAuthLogger;
  requestId: string;
  diagnostic: InstagramOAuthFailureDiagnostic;
}): void {
  const { diagnostic } = input;
  const fields = {
    event: INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT,
    stage: diagnostic.stage,
    category: diagnostic.category,
    retryable: diagnostic.retryable,
    requestId: input.requestId,
    ...(diagnostic.providerHttpStatus === undefined
      ? {}
      : { providerHttpStatus: diagnostic.providerHttpStatus }),
    ...(diagnostic.providerErrorType === undefined
      ? {}
      : { providerErrorType: diagnostic.providerErrorType }),
    ...(diagnostic.providerErrorCode === undefined
      ? {}
      : { providerErrorCode: diagnostic.providerErrorCode }),
    ...(diagnostic.providerErrorSubcode === undefined
      ? {}
      : { providerErrorSubcode: diagnostic.providerErrorSubcode }),
  };
  try {
    input.logger.warn(fields, INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT);
  } catch {
    // Diagnostics must never change callback behavior.
  }
}
