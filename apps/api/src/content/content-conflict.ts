export class ContentConflictError extends Error {
  readonly statusCode = 409;
  readonly code = "CONTENT_REVISION_CONFLICT";
  constructor() {
    super("This post changed elsewhere. Reload the latest draft before saving again.");
  }
}
