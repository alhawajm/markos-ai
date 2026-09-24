import { createHash, randomUUID } from "node:crypto";
import type { Prisma } from "@prisma/client";
import type { Locale } from "@markos/shared-types";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { decryptCredential, encryptCredential } from "../security/credential-encryption";

type Mail = { email: string; locale: Locale; code?: string };
export type AuthMail = Mail & { kind: "RESET_CODE" | "PASSWORD_CHANGED" };
const encryptionKey = () => createHash("sha256").update(`markos-auth-mail-v1:${env.JWT_REFRESH_SECRET}`).digest("base64");
export async function queueAuthMail(
  tx: Prisma.TransactionClient,
  kind: "RESET_CODE" | "PASSWORD_CHANGED" | "VERIFY",
  mail: Mail,
  expiresAt: Date,
  challengeId?: string
): Promise<void> {
  await tx.authEmailJob.create({
    data: { id: randomUUID(), kind, payload: encryptCredential(JSON.stringify(mail), encryptionKey()), expiresAt, ...(challengeId ? { challengeId } : {}) }
  });
}
export async function sendAuthMail(mail: AuthMail, fetchImpl: typeof fetch = fetch): Promise<void> {
  if (env.EMAIL_PROVIDER === "local" && env.NODE_ENV !== "production") return;
  if (!env.SENDGRID_API_KEY || !env.FROM_EMAIL) throw new Error("AUTH_EMAIL_NOT_CONFIGURED");
  const ar = mail.locale === "ar";
  const reset = mail.kind === "RESET_CODE";
  const subject = reset
    ? ar
      ? "رمز استعادة كلمة المرور في ماركوس"
      : "Your MARKOS password reset code"
    : ar
      ? "تم تغيير كلمة مرور ماركوس"
      : "Your MARKOS password was changed";
  const body = reset
    ? ar
      ? `رمز استعادة كلمة المرور: ${mail.code}\n\nأدخله في شاشة استعادة كلمة المرور في ماركوس. تنتهي صلاحيته خلال ١٠ دقائق. لا تشاركه مع أي شخص.\n\nإذا لم تطلب تغيير كلمة المرور، تجاهل هذه الرسالة؛ لم يتغير حسابك.`
      : `Your password reset code is ${mail.code}.\n\nEnter it on the MARKOS password recovery screen. It expires in 10 minutes. Do not share this code.\n\nIf you did not request a password reset, ignore this email; your account has not changed.`
    : ar
      ? "تم تغيير كلمة مرور حسابك في ماركوس وتسجيل خروج الجلسات السابقة. إذا لم تقم بذلك، استخدم استعادة كلمة المرور فورًا وأمّن بريدك الإلكتروني."
      : "Your MARKOS password was changed and previous sessions were signed out. If this was not you, reset your password immediately and secure your email account.";
  const safeBody = body.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
  let response: Response;
  try {
    response = await fetchImpl("https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      headers: { authorization: `Bearer ${env.SENDGRID_API_KEY}`, "content-type": "application/json" },
      body: JSON.stringify({
        personalizations: [{ to: [{ email: mail.email }] }],
        from: { email: env.FROM_EMAIL, name: "MARKOS" },
        subject,
        tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } },
        content: [
          { type: "text/plain", value: body },
          {
            type: "text/html",
            value: `<html lang="${mail.locale}" dir="${ar ? "rtl" : "ltr"}"><body style="font-family:Arial,sans-serif;line-height:1.8;white-space:pre-line;padding:24px">${safeBody}</body></html>`
          }
        ]
      }),
      signal: AbortSignal.timeout(10_000)
    });
  } catch {
    throw new Error("AUTH_EMAIL_DELIVERY_FAILED");
  }
  if (response.status !== 202) throw new Error("AUTH_EMAIL_DELIVERY_FAILED");
}

/** Database leases survive deploys and coordinate API replicas. Payloads are erased on terminal states. */
export async function processAuthEmails(send: (mail: AuthMail) => Promise<void> = sendAuthMail): Promise<{ processed: number; failed: number }> {
  const now = new Date();
  await prisma.authEmailJob.updateMany({
    where: { payload: { not: null }, OR: [{ expiresAt: { lte: now } }, { attempts: { gte: 5 }, leaseUntil: { lte: now } }] },
    data: { status: "FAILED", payload: null, failureCode: "AUTH_EMAIL_EXPIRED" }
  });
  await prisma.authEmailJob.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } });
  await prisma.passwordResetChallenge.deleteMany({ where: { expiresAt: { lt: new Date(Date.now() - 86_400_000) } } });
  let processed = 0;
  let failed = 0;
  for (let count = 0; count < 5; count++) {
    const lease = randomUUID();
    const jobs = await prisma.$queryRaw<Array<{ id: string; kind: string; payload: string; challengeId: string | null; attempts: number }>>`
      UPDATE auth_email_jobs SET status='PROCESSING', "leaseUntil"=NOW()+INTERVAL '60 seconds', "leaseToken"=${lease}::uuid, attempts=attempts+1, "updatedAt"=NOW()
      WHERE id=(SELECT id FROM auth_email_jobs WHERE payload IS NOT NULL AND "expiresAt">NOW() AND attempts<5 AND "availableAt"<=NOW()
        AND (status='PENDING' OR (status='PROCESSING' AND "leaseUntil"<NOW())) ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1)
      RETURNING id,kind,payload,"challengeId",attempts`;
    const job = jobs[0];
    if (!job) break;
    try {
      const mail = JSON.parse(decryptCredential(job.payload, encryptionKey())) as Mail;
      let ignored = false;
      if (job.kind === "RESET_CODE") {
        const user = await prisma.user.findUnique({ where: { email: mail.email } });
        ignored = !user || !!user.deletedAt || !user.passwordHash;
        if (!ignored && user && job.challengeId) {
          // Bind to the credential version once. A later password change cannot resurrect this code.
          await prisma.passwordResetChallenge.updateMany({
            where: { id: job.challengeId, userId: null, consumedAt: null, expiresAt: { gt: new Date() } },
            data: { userId: user.id, authVersion: user.authVersion }
          });
          const challenge = await prisma.passwordResetChallenge.findUnique({ where: { id: job.challengeId } });
          ignored = !challenge || !!challenge.consumedAt || challenge.authVersion !== user.authVersion || challenge.expiresAt <= new Date();
        }
        if (!ignored) await send({ ...mail, kind: "RESET_CODE" });
      } else if (job.kind === "VERIFY") {
        const { requestEmailVerification } = await import("./auth-service");
        await requestEmailVerification({ email: mail.email, locale: mail.locale });
      } else await send({ ...mail, kind: "PASSWORD_CHANGED" });
      await prisma.authEmailJob.updateMany({
        where: { id: job.id, leaseToken: lease },
        data: { status: ignored ? "IGNORED" : "SENT", payload: null, leaseToken: null, leaseUntil: null, failureCode: null }
      });
      processed++;
    } catch {
      const terminal = job.attempts >= 5;
      await prisma.authEmailJob.updateMany({
        where: { id: job.id, leaseToken: lease },
        data: {
          status: terminal ? "FAILED" : "PENDING",
          ...(terminal ? { payload: null } : {}),
          availableAt: new Date(Date.now() + Math.min(120_000, 15_000 * 2 ** (job.attempts - 1))),
          leaseToken: null,
          leaseUntil: null,
          failureCode: "AUTH_EMAIL_DELIVERY_FAILED"
        }
      });
      failed++;
    }
  }
  return { processed, failed };
}
