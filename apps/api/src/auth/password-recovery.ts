import { createHmac, randomInt, randomUUID, timingSafeEqual } from "node:crypto";
import argon2 from "argon2";
import type { Locale } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { queueAuthMail } from "./auth-email";
export const resetLifetimeMs = 10 * 60_000;
export class PasswordResetInvalidError extends Error {
  constructor() {
    super("The reset code is invalid or expired. Request a new code.");
  }
}
function hashCode(id: string, code: string): string {
  return createHmac("sha256", env.JWT_REFRESH_SECRET).update(`password-reset:${id}:${code}`).digest("hex");
}
export async function forgotPassword(input: { email: string; locale: Locale }): Promise<{ challengeId: string; expiresAt: string }> {
  const id = randomUUID();
  const code = String(randomInt(0, 100_000_000)).padStart(8, "0");
  const expiresAt = new Date(Date.now() + resetLifetimeMs);
  // Identical work and response for existing, deleted, federated and unknown accounts. Lookup happens in the email worker.
  await prisma.$transaction(async (tx) => {
    await tx.passwordResetChallenge.create({ data: { id, codeHash: hashCode(id, code), expiresAt } });
    await queueAuthMail(tx, "RESET_CODE", { email: input.email.trim().toLowerCase(), locale: input.locale, code }, expiresAt, id);
  });
  return { challengeId: id, expiresAt: expiresAt.toISOString() };
}
export async function resetPassword(input: { challengeId: string; code: string; password: string }): Promise<void> {
  const result = await prisma.$transaction(
    async (tx) => {
      await tx.$queryRaw`SELECT id FROM password_reset_challenges WHERE id=${input.challengeId}::uuid FOR UPDATE`;
      const challenge = await tx.passwordResetChallenge.findUnique({ where: { id: input.challengeId } });
      if (!challenge || challenge.consumedAt || challenge.expiresAt <= new Date() || challenge.attempts >= 5) return false;
      await tx.passwordResetChallenge.update({ where: { id: challenge.id }, data: { attempts: { increment: 1 } } });
      if (
        !timingSafeEqual(Buffer.from(challenge.codeHash, "hex"), Buffer.from(hashCode(challenge.id, input.code), "hex")) ||
        !challenge.userId ||
        challenge.authVersion === null
      )
        return false;
      const user = await tx.user.findUnique({ where: { id: challenge.userId } });
      if (!user || user.deletedAt || !user.passwordHash || user.authVersion !== challenge.authVersion) return false;
      const passwordHash = await argon2.hash(input.password, { type: argon2.argon2id });
      const changed = await tx.user.updateMany({
        where: { id: user.id, authVersion: challenge.authVersion, deletedAt: null },
        data: { passwordHash, authVersion: { increment: 1 } }
      });
      if (changed.count !== 1) return false;
      await tx.passwordResetChallenge.update({ where: { id: challenge.id }, data: { consumedAt: new Date() } });
      await queueAuthMail(tx, "PASSWORD_CHANGED", { email: user.email, locale: user.locale === "AR" ? "ar" : "en" }, new Date(Date.now() + 86_400_000));
      return true;
    },
    { timeout: 15_000 }
  );
  if (!result) throw new PasswordResetInvalidError();
}
