import { env } from "../config/env";
export { INSTAGRAM_RELEASE_SCOPES } from "../config/instagram-contract";

export const INSTAGRAM_PROVIDER = "INSTAGRAM" as const;
export const INSTAGRAM_AUTHORIZATION_URL = "https://www.instagram.com/oauth/authorize";
export const INSTAGRAM_SHORT_LIVED_TOKEN_URL = "https://api.instagram.com/oauth/access_token";
export const INSTAGRAM_LONG_LIVED_TOKEN_URL = "https://graph.instagram.com/access_token";
export const INSTAGRAM_GRAPH_VERSION = env.INSTAGRAM_GRAPH_VERSION;
export const INSTAGRAM_GRAPH_BASE_URL = `https://graph.instagram.com/${INSTAGRAM_GRAPH_VERSION}`;
export const INSTAGRAM_MANAGE_ACCESS_URL = "https://www.instagram.com/accounts/manage_access/";
export const INSTAGRAM_REQUESTED_SCOPES = env.INSTAGRAM_OAUTH_SCOPES;

export function canonicalRedirectUri(value: string): string {
  const url = new URL(value);
  if (url.hash || url.username || url.password) throw new Error("Instagram redirect URI is invalid");
  return url.toString();
}
