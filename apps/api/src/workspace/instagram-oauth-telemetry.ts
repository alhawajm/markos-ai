import type { FastifyBaseLogger } from "fastify";

export const INSTAGRAM_OAUTH_START_FAILURE_EVENT =
  "instagram_oauth_start_failure";
export const INSTAGRAM_OAUTH_START_SUCCESS_EVENT =
  "instagram_oauth_start_success";
export const INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT =
  "instagram_oauth_callback_failure";
export const INSTAGRAM_OAUTH_CALLBACK_SUCCESS_EVENT =
  "instagram_oauth_callback_success";
export const INSTAGRAM_CONNECTION_STATUS_FAILURE_EVENT =
  "instagram_connection_status_failure";

export const INSTAGRAM_OAUTH_FAILURE_STAGES = [
  "start_request_validation",
  "start_authentication",
  "start_workspace_authorization",
  "provider_configuration",
  "oauth_transaction_creation",
  "oauth_transaction_persistence",
  "authorization_url_construction",
  "callback_request_validation",
  "provider_authorization_denied",
  "state_verification",
  "oauth_transaction_binding",
  "oauth_transaction_consumption",
  "short_lived_token_exchange",
  "short_lived_token_response_validation",
  "long_lived_token_exchange",
  "long_lived_token_response_validation",
  "profile_fetch",
  "profile_response_validation",
  "professional_account_resolution",
  "credential_configuration",
  "credential_serialization",
  "credential_encryption",
  "database_transaction_begin",
  "connection_upsert",
  "recent_media_delete",
  "recent_media_insert",
  "audit_insert",
  "database_transaction_commit",
  "post_persistence_read",
  "connection_status_transformation",
  "success_redirect",
  "failure_redirect",
  "connection_status_authentication",
  "connection_status_authorization",
  "connection_status_read",
] as const;

export type InstagramOAuthFailureStage =
  (typeof INSTAGRAM_OAUTH_FAILURE_STAGES)[number];
export type InstagramOAuthFailureDiagnostic = {
  stage: InstagramOAuthFailureStage;
  category: string;
  retryable: boolean;
  providerHttpStatus?: number;
  providerErrorType?: string;
  providerErrorCode?: string | number;
  providerErrorSubcode?: string | number;
  databaseCode?: string;
  validationCode?: string;
};

export class InstagramOAuthDiagnosticError extends Error {
  constructor(
    readonly diagnostic: InstagramOAuthFailureDiagnostic,
    cause?: unknown,
  ) {
    super("Instagram authorization could not be completed", { cause });
  }
}

type FailureLogger = Pick<FastifyBaseLogger, "warn">;
type SuccessLogger = Pick<FastifyBaseLogger, "info">;
type FailureEvent =
  | typeof INSTAGRAM_OAUTH_START_FAILURE_EVENT
  | typeof INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT
  | typeof INSTAGRAM_CONNECTION_STATUS_FAILURE_EVENT;

/** Emits only explicitly selected scalar fields; never pass an error or request object. */
export function reportInstagramOAuthFailure(input: {
  event: FailureEvent;
  logger: FailureLogger;
  requestId: string;
  diagnostic: InstagramOAuthFailureDiagnostic;
}): void {
  const d = input.diagnostic;
  const fields = {
    event: input.event,
    stage: d.stage,
    category: d.category,
    retryable: d.retryable,
    requestId: input.requestId,
    ...safeHttpStatus(d.providerHttpStatus),
    ...safeProviderType(d.providerErrorType),
    ...safeNumericIdentifier("providerErrorCode", d.providerErrorCode),
    ...safeNumericIdentifier("providerErrorSubcode", d.providerErrorSubcode),
    ...safeDatabaseCode(d.databaseCode),
    ...safeValidationCode(d.validationCode),
  };
  try {
    input.logger.warn(fields, input.event);
  } catch {
    /* telemetry cannot change behavior */
  }
}

export function reportInstagramOAuthCallbackFailure(
  input: Omit<Parameters<typeof reportInstagramOAuthFailure>[0], "event">,
): void {
  reportInstagramOAuthFailure({
    ...input,
    event: INSTAGRAM_OAUTH_CALLBACK_FAILURE_EVENT,
  });
}

export function reportInstagramOAuthLifecycleSuccess(input: {
  event:
    | typeof INSTAGRAM_OAUTH_START_SUCCESS_EVENT
    | typeof INSTAGRAM_OAUTH_CALLBACK_SUCCESS_EVENT;
  logger: SuccessLogger;
  requestId: string;
}): void {
  try {
    input.logger.info(
      { event: input.event, requestId: input.requestId },
      input.event,
    );
  } catch {
    /* telemetry cannot change behavior */
  }
}

const RETRYABLE_DATABASE_CODES = new Set([
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2034",
]);
const SAFE_DATABASE_CODES = new Set([
  "P1000",
  "P1001",
  "P1002",
  "P1008",
  "P1017",
  "P2002",
  "P2003",
  "P2025",
  "P2034",
]);

export function classifyDatabaseFailure(
  error: unknown,
): Pick<
  InstagramOAuthFailureDiagnostic,
  "category" | "retryable" | "databaseCode"
> {
  const candidate =
    typeof error === "object" && error !== null && "code" in error
      ? (error as { code?: unknown }).code
      : undefined;
  const code =
    typeof candidate === "string" && SAFE_DATABASE_CODES.has(candidate)
      ? candidate
      : undefined;
  const category =
    code === "P2002"
      ? "database_unique_constraint"
      : code === "P2003"
        ? "database_foreign_key_constraint"
        : code === "P2025"
          ? "database_record_not_found"
          : code === "P2034"
            ? "database_transaction_conflict"
            : code && code.startsWith("P10")
              ? "database_connection_failure"
              : "database_unknown_failure";
  return {
    category,
    retryable: code !== undefined && RETRYABLE_DATABASE_CODES.has(code),
    ...(code ? { databaseCode: code } : {}),
  };
}

function safeHttpStatus(value: unknown) {
  return typeof value === "number" &&
    Number.isInteger(value) &&
    value >= 100 &&
    value <= 599
    ? { providerHttpStatus: value }
    : {};
}
function safeProviderType(value: unknown) {
  return typeof value === "string" && /^[A-Za-z0-9_.:-]{1,80}$/.test(value)
    ? { providerErrorType: value }
    : {};
}
function safeNumericIdentifier(
  key: "providerErrorCode" | "providerErrorSubcode",
  value: unknown,
): Record<string, string | number> {
  return (typeof value === "number" && Number.isFinite(value)) ||
    (typeof value === "string" && /^\d{1,20}$/.test(value))
    ? { [key]: value }
    : {};
}
function safeDatabaseCode(value: unknown) {
  return typeof value === "string" && SAFE_DATABASE_CODES.has(value)
    ? { databaseCode: value }
    : {};
}
function safeValidationCode(value: unknown) {
  return typeof value === "string" && /^[A-Z][A-Z0-9_]{0,63}$/.test(value)
    ? { validationCode: value }
    : {};
}
