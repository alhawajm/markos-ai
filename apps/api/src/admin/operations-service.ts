import { prisma } from "../db/prisma";
import { teamError } from "../workspace/team-service";
export async function getDeliveryOperations() {
  const [reports, pushes, erasures] = await Promise.all([
    prisma.analyticsReportDelivery.findMany({
      where: { status: { in: ["FAILED", "UNKNOWN"] } },
      select: { id: true, workspaceId: true, status: true, failureCode: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.pushDelivery.findMany({
      where: { status: { in: ["FAILED", "UNKNOWN"] } },
      select: { id: true, workspaceId: true, status: true, failureCode: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50
    }),
    prisma.workspaceErasureJob.findMany({
      where: { status: "FAILED" },
      select: { id: true, workspaceId: true, status: true, failureCode: true, updatedAt: true },
      orderBy: { updatedAt: "desc" },
      take: 50
    })
  ]);
  return {
    checkedAt: new Date().toISOString(),
    failures: [
      ...reports.map((r) => ({ ...r, kind: "REPORT" as const })),
      ...pushes.map((r) => ({ ...r, kind: "PUSH" as const })),
      ...erasures.map((r) => ({ ...r, kind: "ERASURE" as const }))
    ].map((r) => ({ ...r, updatedAt: r.updatedAt.toISOString() }))
  };
}
export async function retryDelivery(actorId: string, kind: "REPORT" | "PUSH" | "ERASURE", id: string) {
  await prisma.$transaction(async (tx) => {
    const options = { where: { id, status: "FAILED" }, data: { status: "PENDING", attempts: 0, availableAt: new Date(), leaseUntil: null, failureCode: null } };
    const result =
      kind === "REPORT"
        ? await tx.analyticsReportDelivery.updateMany(options)
        : kind === "PUSH"
          ? await tx.pushDelivery.updateMany(options)
          : await tx.workspaceErasureJob.updateMany(options);
    if (!result.count)
      throw teamError("DELIVERY_RETRY_NOT_ALLOWED", "Only confirmed failures can be retried. An unknown result must be investigated first", 409);
    await tx.auditLog.create({ data: { actorId, action: "DELIVERY_MANUAL_RETRY", targetType: kind, targetId: id } });
  });
  return { queued: true };
}
