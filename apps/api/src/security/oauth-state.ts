import { createHmac, randomUUID, timingSafeEqual } from "node:crypto";

export interface OAuthStateStore {
  consume(nonce: string): Promise<"consumed" | "already_consumed" | "not_found_or_expired">;
  put(nonce: string, expiresAt: Date): Promise<void>;
}

export type OAuthStateClaims = {
  exp: number;
  nonce: string;
  returnTo: string;
  userId: string;
  workspaceId: string;
};
const ALLOWED_RETURN_PATHS = new Set(["/settings/integrations", "/settings/instagram", "/en/app/settings", "/ar/app/settings"]);

export class OAuthStateError extends Error {
  constructor(
    readonly reason:
      | "return_path_invalid"
      | "malformed"
      | "signature_invalid"
      | "expired"
      | "binding_invalid"
      | "already_consumed"
      | "not_found_or_expired" = "malformed"
  ) {
    super("OAuth state is invalid or expired");
  }
}

export async function issueOAuthState(input: {
  userId: string;
  workspaceId: string;
  returnTo: string;
  secret: string;
  store: OAuthStateStore;
  now?: Date;
  ttlSeconds?: number;
}): Promise<string> {
  if (!ALLOWED_RETURN_PATHS.has(input.returnTo)) throw new OAuthStateError("return_path_invalid");
  const now = input.now ?? new Date();
  const claims: OAuthStateClaims = {
    exp: Math.floor(now.getTime() / 1000) + (input.ttlSeconds ?? 600),
    nonce: randomUUID(),
    returnTo: input.returnTo,
    userId: input.userId,
    workspaceId: input.workspaceId
  };
  await input.store.put(claims.nonce, new Date(claims.exp * 1000));
  const payload = Buffer.from(JSON.stringify(claims)).toString("base64url");
  return `${payload}.${sign(payload, input.secret)}`;
}

export async function consumeOAuthState(input: {
  state: string;
  userId: string;
  workspaceId: string;
  secret: string;
  store: OAuthStateStore;
  now?: Date;
}): Promise<{ returnTo: string }> {
  const claims = verifyOAuthState(input.state, input.secret, input.now);
  if (claims.userId !== input.userId || claims.workspaceId !== input.workspaceId) throw new OAuthStateError("binding_invalid");
  const outcome = await input.store.consume(claims.nonce);
  if (outcome !== "consumed") throw new OAuthStateError(outcome);
  return { returnTo: claims.returnTo };
}

export function verifyOAuthState(state: string, secret: string, nowDate = new Date()): OAuthStateClaims {
  try {
    const [payload, signature, extra] = state.split(".");
    if (!payload || !signature || extra) throw new OAuthStateError("malformed");
    const expected = Buffer.from(sign(payload, secret));
    const actual = Buffer.from(signature);
    if (actual.length !== expected.length || !timingSafeEqual(actual, expected)) throw new OAuthStateError("signature_invalid");
    const claims = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as OAuthStateClaims;
    const now = Math.floor(nowDate.getTime() / 1000);
    if (claims.exp <= now) throw new OAuthStateError("expired");
    if (
      typeof claims.userId !== "string" ||
      typeof claims.workspaceId !== "string" ||
      typeof claims.nonce !== "string" ||
      !ALLOWED_RETURN_PATHS.has(claims.returnTo)
    )
      throw new OAuthStateError("malformed");
    return claims;
  } catch (error) {
    if (error instanceof OAuthStateError) throw error;
    throw new OAuthStateError("malformed");
  }
}

function sign(payload: string, secret: string): string {
  if (Buffer.byteLength(secret) < 32) throw new OAuthStateError("signature_invalid");
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
