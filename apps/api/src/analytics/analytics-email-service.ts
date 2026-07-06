import type {
  AnalyticsEmailDeliveryForAllWorkspacesResult,
  AnalyticsEmailDeliveryResult,
  Locale
} from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { exportMonthlyAnalyticsPdf } from "./analytics-service";

const monthlyAnalyticsTemplateKey = "MONTHLY_ANALYTICS_PDF";

export interface AnalyticsEmailProvider {
  mode: "dry_run";
  send(input: {
    attachment: Buffer;
    filename: string;
    html: string;
    subject: string;
    text: string;
    to: string[];
  }): Promise<{ messageId: string }>;
}

export class DryRunAnalyticsEmailProvider implements AnalyticsEmailProvider {
  readonly mode = "dry_run" as const;

  async send(input: { filename: string; to: string[] }): Promise<{ messageId: string }> {
    return {
      messageId: `dry-run:${input.filename}:${input.to.join(",")}`
    };
  }
}

export function createAnalyticsEmailProvider(): AnalyticsEmailProvider {
  return new DryRunAnalyticsEmailProvider();
}

export async function sendMonthlyAnalyticsPdfEmail(
  workspaceId: string,
  input: {
    actorId?: string;
    locale?: Locale;
    month?: string;
    now?: Date;
    provider?: AnalyticsEmailProvider;
    skipIfAlreadySent?: boolean;
  } = {}
): Promise<AnalyticsEmailDeliveryResult> {
  const workspace = await prisma.workspace.findFirst({
    where: {
      deletedAt: null,
      id: workspaceId
    }
  });

  if (!workspace) {
    throw new Error("Workspace was not found");
  }
  const owner = await prisma.user.findFirstOrThrow({
    where: {
      deletedAt: null,
      id: workspace.ownerUserId
    }
  });

  const month = input.month ?? previousMonthKey(input.now ?? new Date());

  if (input.skipIfAlreadySent === true) {
    const existing = await prisma.notification.findFirst({
      where: {
        channel: "EMAIL",
        deletedAt: null,
        payload: {
          path: ["month"],
          equals: month
        },
        templateKey: monthlyAnalyticsTemplateKey,
        workspaceId
      }
    });

    if (existing !== null) {
      return {
        attachmentBytes: 0,
        delivered: false,
        filename: "",
        mode: "dry_run",
        month,
        recipients: [],
        skippedReason: "ALREADY_SENT",
        workspaceId
      };
    }
  }

  const provider = input.provider ?? createAnalyticsEmailProvider();
  const locale = input.locale ?? (owner.locale === "EN" ? "en" : "ar");
  const pdf = await exportMonthlyAnalyticsPdf(workspaceId, { locale, month });
  const recipients = [owner.email];
  const subject = `MARKOS AI analytics report - ${workspace.name} - ${month}`;
  const text = `Your MARKOS AI analytics report for ${month} is attached.`;
  const result = await provider.send({
    attachment: pdf.bytes,
    filename: pdf.filename,
    html: `<p>${text}</p>`,
    subject,
    text,
    to: recipients
  });

  await prisma.$transaction(async (tx) => {
    await tx.notification.create({
      data: {
        channel: "EMAIL",
        payload: {
          attachmentBytes: pdf.bytes.length,
          deliveryMode: provider.mode,
          filename: pdf.filename,
          messageId: result.messageId,
          month,
          recipients,
          subject
        },
        templateKey: monthlyAnalyticsTemplateKey,
        userId: workspace.ownerUserId,
        workspaceId
      }
    });
    await tx.auditLog.create({
      data: {
        action: "MONTHLY_ANALYTICS_PDF_EMAIL_SENT",
        ...(input.actorId === undefined ? {} : { actorId: input.actorId }),
        metadata: {
          attachmentBytes: pdf.bytes.length,
          deliveryMode: provider.mode,
          filename: pdf.filename,
          messageId: result.messageId,
          month,
          recipients
        },
        targetId: workspaceId,
        targetType: "AnalyticsReport",
        workspaceId
      }
    });
  });

  return {
    attachmentBytes: pdf.bytes.length,
    delivered: true,
    filename: pdf.filename,
    messageId: result.messageId,
    mode: provider.mode,
    month,
    recipients,
    workspaceId
  };
}

export async function sendMonthlyAnalyticsPdfEmailForAllWorkspaces(
  input: {
    locale?: Locale;
    month?: string;
    now?: Date;
    provider?: AnalyticsEmailProvider;
    workspaceIds?: string[];
  } = {}
): Promise<AnalyticsEmailDeliveryForAllWorkspacesResult> {
  const workspaces = await prisma.workspace.findMany({
    where: {
      deletedAt: null,
      ...(input.workspaceIds === undefined
        ? {}
        : {
            id: {
              in: input.workspaceIds
            }
          })
    }
  });
  const results: AnalyticsEmailDeliveryResult[] = [];

  for (const workspace of workspaces) {
    results.push(
      await sendMonthlyAnalyticsPdfEmail(workspace.id, {
        ...(input.locale === undefined ? {} : { locale: input.locale }),
        ...(input.month === undefined ? {} : { month: input.month }),
        ...(input.now === undefined ? {} : { now: input.now }),
        ...(input.provider === undefined ? {} : { provider: input.provider }),
        skipIfAlreadySent: true
      })
    );
  }

  return {
    attempted: results.length,
    delivered: results.filter((result) => result.delivered).length,
    results,
    skipped: results.filter((result) => !result.delivered).length
  };
}

function previousMonthKey(date: Date): string {
  return monthKey(new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth() - 1, 1)));
}

function monthKey(date: Date): string {
  const year = date.getUTCFullYear();
  const month = String(date.getUTCMonth() + 1).padStart(2, "0");

  return `${year}-${month}`;
}
