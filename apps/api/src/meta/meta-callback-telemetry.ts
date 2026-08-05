import type { FastifyBaseLogger } from "fastify";

export const META_CALLBACK_STAGE_EVENT = "meta_callback_stage";

export type MetaCallbackType = "deauthorize" | "data_deletion";

export type MetaCallbackStageUpdate = {
  stage:
    | "callback_request"
    | "payload_parse"
    | "signature_verification"
    | "credential_lookup"
    | "local_cleanup"
    | "audit_persistence"
    | "callback_complete";
  outcome: "received" | "started" | "completed" | "rejected" | "failed";
  contentTypeCategory?: "form" | "json" | "text" | "missing" | "other";
  credentialMatched?: boolean;
  failureCategory?:
    | "unsupported_media_type"
    | "payload_parse_failed"
    | "signature_verification_failed"
    | "database_failure";
};

type MetaCallbackLogger = Pick<FastifyBaseLogger, "info" | "warn">;

/** Emits only allowlisted callback lifecycle fields; never pass payloads, headers, identities, or raw errors. */
export function reportMetaCallbackStage(input: {
  callbackType: MetaCallbackType;
  logger: MetaCallbackLogger;
  requestId: string;
  update: MetaCallbackStageUpdate;
}): void {
  const fields = {
    event: META_CALLBACK_STAGE_EVENT,
    callbackType: input.callbackType,
    requestId: input.requestId,
    stage: input.update.stage,
    outcome: input.update.outcome,
    ...(input.update.contentTypeCategory
      ? { contentTypeCategory: input.update.contentTypeCategory }
      : {}),
    ...(typeof input.update.credentialMatched === "boolean"
      ? { credentialMatched: input.update.credentialMatched }
      : {}),
    ...(input.update.failureCategory
      ? { failureCategory: input.update.failureCategory }
      : {}),
  };

  try {
    const level =
      input.update.outcome === "failed" || input.update.outcome === "rejected"
        ? "warn"
        : "info";
    input.logger[level](fields, META_CALLBACK_STAGE_EVENT);
  } catch {
    /* telemetry cannot change callback behavior */
  }
}

export function classifyMetaCallbackContentType(
  value: string | string[] | undefined,
): NonNullable<MetaCallbackStageUpdate["contentTypeCategory"]> {
  const normalized = (Array.isArray(value) ? value[0] : value)
    ?.split(";", 1)[0]
    ?.trim()
    .toLowerCase();

  if (!normalized) return "missing";
  if (normalized === "application/x-www-form-urlencoded") return "form";
  if (normalized === "application/json") return "json";
  if (normalized === "text/plain") return "text";
  return "other";
}
