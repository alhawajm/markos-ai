import type { AnalyticsEmailDeliveryForAllWorkspacesResult, AnalyticsEmailDeliveryResult, Locale } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { exportMonthlyAnalyticsPdf } from "./analytics-service";

type Mail = { attachment: Buffer; filename: string; html: string; subject: string; text: string; to: string[] };
export interface AnalyticsEmailProvider {
  mode: "dry_run" | "sendgrid";
  send(input: Mail): Promise<{ messageId: string }>;
}
export class DryRunAnalyticsEmailProvider implements AnalyticsEmailProvider {
  readonly mode = "dry_run" as const;
  async send(_input: Mail) {
    return { messageId: "dry-run:monthly-report" };
  }
}
export class ReportMailError extends Error {
  constructor(
    readonly code: string,
    readonly state: "PENDING" | "FAILED" | "UNKNOWN"
  ) {
    super(code);
  }
}
export class SendGridAnalyticsEmailProvider implements AnalyticsEmailProvider {
  readonly mode = "sendgrid" as const;
  constructor(private readonly fetchImpl: typeof fetch = fetch) {}
  async send(input: Mail): Promise<{ messageId: string }> {
    if (!env.SENDGRID_API_KEY || !env.FROM_EMAIL) throw new ReportMailError("REPORT_EMAIL_NOT_CONFIGURED", "FAILED");
    let response: Response;
    try {
      response = await this.fetchImpl("https://api.sendgrid.com/v3/mail/send", {
        method: "POST",
        redirect: "error",
        signal: AbortSignal.timeout(15_000),
        headers: { authorization: `Bearer ${env.SENDGRID_API_KEY}`, "content-type": "application/json" },
        body: JSON.stringify({
          personalizations: [{ to: input.to.map((email) => ({ email })) }],
          from: { email: env.FROM_EMAIL, name: "MARKOS" },
          subject: input.subject,
          content: [
            { type: "text/plain", value: input.text },
            { type: "text/html", value: input.html }
          ],
          attachments: [{ content: input.attachment.toString("base64"), filename: input.filename, type: "application/pdf", disposition: "attachment" }],
          tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } }
        })
      });
    } catch {
      throw new ReportMailError("REPORT_EMAIL_RESULT_UNKNOWN", "UNKNOWN");
    }
    if (response.status !== 202) throw new ReportMailError("REPORT_EMAIL_REJECTED", response.status === 429 || response.status >= 500 ? "PENDING" : "FAILED");
    return { messageId: response.headers.get("x-message-id") ?? "accepted" };
  }
}
export function createAnalyticsEmailProvider(): AnalyticsEmailProvider {
  return env.EMAIL_PROVIDER === "local" && env.NODE_ENV !== "production" ? new DryRunAnalyticsEmailProvider() : new SendGridAnalyticsEmailProvider();
}
function previousMonthKey(now: Date) {
  const date = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 1, 1));
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}`;
}
function result(
  workspaceId: string,
  month: string,
  mode: AnalyticsEmailProvider["mode"],
  status: string,
  extra: Partial<AnalyticsEmailDeliveryResult> = {}
): AnalyticsEmailDeliveryResult {
  // ACCEPTED means queued by SendGrid, never a claim that it reached the inbox.
  return { workspaceId, month, mode, attachmentBytes: 0, filename: "", recipients: [], delivered: false, skippedReason: status, ...extra };
}

export async function sendMonthlyAnalyticsPdfEmail(
  workspaceId: string,
  input: { actorId?: string; locale?: Locale; month?: string; now?: Date; provider?: AnalyticsEmailProvider; skipIfAlreadySent?: boolean } = {}
): Promise<AnalyticsEmailDeliveryResult> {
  const workspace = await prisma.workspace.findFirstOrThrow({ where: { id: workspaceId, deletedAt: null } });
  const userId = input.actorId ?? workspace.ownerUserId;
  const user = await prisma.user.findFirstOrThrow({ where: { id: userId, deletedAt: null, isVerified: true } });
  const member = await prisma.workspaceMember.findFirst({ where: { workspaceId, userId, deletedAt: null } });
  if (!member) throw new Error("REPORT_RECIPIENT_NOT_A_MEMBER");
  const provider = input.provider ?? createAnalyticsEmailProvider(),
    month = input.month ?? previousMonthKey(input.now ?? new Date());
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("INVALID_REPORT_MONTH");
  if (!input.actorId) {
    const preference = await prisma.notificationPreference.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
    if (!preference?.monthlyReportEmail) return result(workspaceId, month, provider.mode, "NOT_SUBSCRIBED");
  }
  await prisma.analyticsReportDelivery.createMany({
    skipDuplicates: true,
    data: {
      workspaceId,
      userId,
      month,
      availableAt: input.now ?? new Date(),
      locale: input.locale === "ar" ? "AR" : input.locale === "en" ? "EN" : user.locale,
      requested: !!input.actorId
    }
  });
  const job = await prisma.analyticsReportDelivery.findUniqueOrThrow({ where: { workspaceId_userId_month: { workspaceId, userId, month } } });
  return result(workspaceId, month, provider.mode, job.status, { recipients: [user.email] });
}

export async function processReportDeliveries(
  input: { now?: Date; provider?: AnalyticsEmailProvider; workspaceIds?: string[] } = {}
): Promise<AnalyticsEmailDeliveryResult[]> {
  const now = input.now ?? new Date(),
    provider = input.provider ?? createAnalyticsEmailProvider();
  await prisma.analyticsReportDelivery.updateMany({
    where: { status: "PROCESSING", leaseUntil: { lt: now } },
    data: { status: "UNKNOWN", failureCode: "REPORT_EMAIL_RESULT_UNKNOWN", leaseUntil: null }
  });
  const jobs = await prisma.analyticsReportDelivery.findMany({
    where: { status: "PENDING", availableAt: { lte: now }, ...(input.workspaceIds ? { workspaceId: { in: input.workspaceIds } } : {}) },
    orderBy: { createdAt: "asc" },
    take: 5
  });
  const results: AnalyticsEmailDeliveryResult[] = [];
  for (const job of jobs) {
    const claimed = await prisma.analyticsReportDelivery.updateMany({
      where: { id: job.id, status: "PENDING", attempts: job.attempts },
      data: { status: "PROCESSING", attempts: { increment: 1 }, leaseUntil: new Date(now.getTime() + 5 * 60_000) }
    });
    if (!claimed.count) continue;
    const [user, workspace, member, preference] = await Promise.all([
      prisma.user.findFirst({ where: { id: job.userId, deletedAt: null, isVerified: true } }),
      prisma.workspace.findFirst({ where: { id: job.workspaceId, deletedAt: null } }),
      prisma.workspaceMember.findFirst({ where: { workspaceId: job.workspaceId, userId: job.userId, deletedAt: null } }),
      prisma.notificationPreference.findUnique({ where: { workspaceId_userId: { workspaceId: job.workspaceId, userId: job.userId } } })
    ]);
    if (!user || !workspace || !member || (!job.requested && !preference?.monthlyReportEmail) || now.getTime() - job.createdAt.getTime() > 7 * 86400_000) {
      await prisma.analyticsReportDelivery.update({ where: { id: job.id }, data: { status: "CANCELLED", leaseUntil: null } });
      continue;
    }
    let sending = false;
    try {
      const locale = job.locale === "AR" ? "ar" : "en";
      const pdf = await exportMonthlyAnalyticsPdf(job.workspaceId, { locale, month: job.month });
      const text =
        locale === "ar"
          ? `تقرير ماركوس لشهر ${job.month} مرفق. يمكنك إدارة التقارير الشهرية من إعدادات الإشعارات في ماركوس.`
          : `Your MARKOS report for ${job.month} is attached. Manage monthly reports in MARKOS notification settings.`;
      // Recheck deletion/opt-out after rendering; no external work belongs inside a DB transaction.
      const eligible = await prisma.user.count({ where: { id: job.userId, deletedAt: null } });
      const stillActive = await prisma.workspace.count({ where: { id: job.workspaceId, deletedAt: null } });
      const stillMember = await prisma.workspaceMember.count({ where: { workspaceId: job.workspaceId, userId: job.userId, deletedAt: null } });
      const subscribed =
        job.requested || (await prisma.notificationPreference.count({ where: { workspaceId: job.workspaceId, userId: job.userId, monthlyReportEmail: true } }));
      if (!eligible || !stillActive || !stillMember || !subscribed) {
        await prisma.analyticsReportDelivery.updateMany({ where: { id: job.id }, data: { status: "CANCELLED", leaseUntil: null } });
        continue;
      }
      sending = true;
      const sent = await provider.send({
        attachment: pdf.bytes,
        filename: pdf.filename,
        to: [user.email],
        subject: locale === "ar" ? `تقرير ماركوس — ${job.month}` : `MARKOS analytics report — ${job.month}`,
        text,
        html: `<html lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"><body><p>${text}</p></body></html>`
      });
      const status = provider.mode === "dry_run" ? "SIMULATED" : "ACCEPTED";
      await prisma.$transaction(async (tx) => {
        await tx.analyticsReportDelivery.updateMany({
          where: { id: job.id, status: "PROCESSING" },
          data: { status, messageId: sent.messageId, failureCode: null, leaseUntil: null }
        });
        await tx.auditLog.create({
          data: {
            actorId: job.userId,
            workspaceId: job.workspaceId,
            action: status === "SIMULATED" ? "MONTHLY_ANALYTICS_PDF_EMAIL_SIMULATED" : "MONTHLY_ANALYTICS_PDF_EMAIL_ACCEPTED",
            targetType: "AnalyticsReport",
            targetId: job.id,
            metadata: { month: job.month, deliveryMode: provider.mode }
          }
        });
      });
      results.push(
        result(job.workspaceId, job.month, provider.mode, status, {
          attachmentBytes: pdf.bytes.length,
          filename: pdf.filename,
          recipients: [user.email],
          messageId: sent.messageId
        })
      );
    } catch (error) {
      const failure =
        error instanceof ReportMailError
          ? error
          : new ReportMailError(sending ? "REPORT_EMAIL_RESULT_UNKNOWN" : "REPORT_RENDER_FAILED", sending ? "UNKNOWN" : "PENDING");
      const status = failure.state === "PENDING" && job.attempts >= 4 ? "FAILED" : failure.state;
      await prisma.analyticsReportDelivery.updateMany({
        where: { id: job.id, status: "PROCESSING" },
        data: { status, failureCode: failure.code, leaseUntil: null, availableAt: new Date(now.getTime() + 60_000 * 2 ** job.attempts) }
      });
      results.push(result(job.workspaceId, job.month, provider.mode, status));
    }
  }
  return results;
}

export async function sendMonthlyAnalyticsPdfEmailForAllWorkspaces(
  input: { locale?: Locale; month?: string; now?: Date; provider?: AnalyticsEmailProvider; workspaceIds?: string[] } = {}
): Promise<AnalyticsEmailDeliveryForAllWorkspacesResult> {
  const month = input.month ?? previousMonthKey(input.now ?? new Date());
  const preferences = await prisma.notificationPreference.findMany({
    where: { monthlyReportEmail: true, ...(input.workspaceIds ? { workspaceId: { in: input.workspaceIds } } : {}) }
  });
  for (const preference of preferences) {
    const [workspace, user, member] = await Promise.all([
      prisma.workspace.findFirst({ where: { id: preference.workspaceId, deletedAt: null } }),
      prisma.user.findFirst({ where: { id: preference.userId, deletedAt: null, isVerified: true } }),
      prisma.workspaceMember.findFirst({ where: { workspaceId: preference.workspaceId, userId: preference.userId, deletedAt: null } })
    ]);
    if (!workspace || !user || !member) continue;
    await prisma.analyticsReportDelivery.createMany({
      skipDuplicates: true,
      data: {
        workspaceId: workspace.id,
        userId: user.id,
        month,
        availableAt: input.now ?? new Date(),
        locale: input.locale === "ar" ? "AR" : input.locale === "en" ? "EN" : user.locale
      }
    });
  }
  const results = await processReportDeliveries(input);
  return { attempted: results.length, delivered: 0, results, skipped: results.filter((r) => r.skippedReason !== "ACCEPTED").length };
}
