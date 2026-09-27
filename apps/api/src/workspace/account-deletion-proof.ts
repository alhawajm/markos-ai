import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { queueAuthMail } from "../auth/auth-email";
import { teamError } from "./team-service";

const digest = (text: string) => createHmac("sha256", env.JWT_REFRESH_SECRET).update(`account-delete-v1:${text}`).digest("hex");
export async function requestAccountDeletionCode(userId: string) {
  const user = await prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null } });
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const nonce = randomUUID(),
    expiresAt = new Date(Date.now() + 10 * 60_000);
  const body = Buffer.from(
    JSON.stringify({ userId, version: user.authVersion, nonce, expires: expiresAt.getTime(), proof: digest(`${nonce}:${code}`) })
  ).toString("base64url");
  await prisma.$transaction((tx) => queueAuthMail(tx, "DELETE_CODE", { email: user.email, locale: user.locale === "AR" ? "ar" : "en", code }, expiresAt));
  return { challengeToken: `${body}.${digest(body)}`, expiresAt: expiresAt.toISOString() };
}
export function verifyAccountDeletionCode(userId: string, version: number, token: string | undefined, code: string | undefined) {
  try {
    const [body, signature, ...rest] = (token ?? "").split(".");
    if (!body || !signature || rest.length || !/^[a-f0-9]{64}$/.test(signature) || !/^\d{8}$/.test(code ?? "")) throw Error();
    if (!timingSafeEqual(Buffer.from(signature, "hex"), Buffer.from(digest(body), "hex"))) throw Error();
    const payload = JSON.parse(Buffer.from(body, "base64url").toString("utf8"));
    if (payload.userId !== userId || payload.version !== version || payload.expires <= Date.now() || payload.proof !== digest(`${payload.nonce}:${code}`))
      throw Error();
  } catch {
    throw teamError("ACCOUNT_DELETE_AUTH_FAILED", "Your confirmation code is invalid or expired", 403);
  }
}
