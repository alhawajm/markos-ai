export const INSTAGRAM_GRAPH_VERSION = "v25.0" as const;

export const INSTAGRAM_RELEASE_SCOPES = ["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"] as const;

export type InstagramReleaseScope = (typeof INSTAGRAM_RELEASE_SCOPES)[number];

const allowedScopes = new Set<string>(INSTAGRAM_RELEASE_SCOPES);

export function parseInstagramOAuthScopes(value: string): InstagramReleaseScope[] {
  const scopes = value.split(",").map((scope) => scope.trim());

  if (scopes.some((scope) => scope.length === 0)) {
    throw new Error("Instagram OAuth scopes must not contain empty values");
  }

  if (new Set(scopes).size !== scopes.length) {
    throw new Error("Instagram OAuth scopes must not contain duplicates");
  }

  const unknownScopes = scopes.filter((scope) => !allowedScopes.has(scope));

  if (unknownScopes.length > 0) {
    throw new Error("Instagram OAuth scopes contain unsupported permissions");
  }

  if (!scopes.includes("instagram_business_basic")) {
    throw new Error("Instagram OAuth scopes must include instagram_business_basic");
  }

  const requested = new Set(scopes);
  return INSTAGRAM_RELEASE_SCOPES.filter((scope) => requested.has(scope));
}

export function hasCanonicalReleaseScopeSet(scopes: readonly string[]): boolean {
  return scopes.length === INSTAGRAM_RELEASE_SCOPES.length && INSTAGRAM_RELEASE_SCOPES.every((scope, index) => scopes[index] === scope);
}
