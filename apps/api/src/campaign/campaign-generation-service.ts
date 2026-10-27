import { createHash } from "node:crypto";
import { Prisma, type CampaignGenerationJob } from "@prisma/client";
import { generateCampaignSchema, type GenerateCampaignInput } from "@markos/validation";
import type { CampaignGenerationJobRecord } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { AiServiceRequestError } from "../ai/request";
import { getVaultScore } from "../vault/vault-service";
import { CampaignContextMissingError, generateWorkspaceCampaign } from "./campaign-service";
import { validateCampaignReferences } from "./campaign-reference-files";
import { assertCampaignGenerationAccess, CampaignGenerationError } from "./campaign-generation-access";
import { campaignCheckpoint, planNextCampaignWeek } from "./campaign-week-planner";

const jobSelect = {
  id: true,
  userId: true,
  requestId: true,
  objective: true,
  status: true,
  campaignId: true,
  errorCode: true,
  createdAt: true,
  updatedAt: true,
  totalWeeks: true,
  completedWeeks: true,
  resumable: true
} as const;
type GenerationViewer = { userId: string; mayGenerate: boolean };
function record(row: Pick<CampaignGenerationJob, keyof typeof jobSelect>, viewer?: GenerationViewer): CampaignGenerationJobRecord {
  return {
    id: row.id,
    requestId: row.requestId,
    objective: row.objective,
    campaignId: row.campaignId,
    errorCode: row.errorCode,
    status: row.status as CampaignGenerationJobRecord["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    ...(row.totalWeeks ? { progress: { completedWeeks: row.completedWeeks, totalWeeks: row.totalWeeks } } : {}),
    canResume:
      row.status === "FAILED" &&
      row.resumable &&
      row.updatedAt.getTime() > Date.now() - 7 * 86400_000 &&
      (!viewer || (viewer.userId === row.userId && viewer.mayGenerate))
  };
}

export async function resumeCampaignGeneration(workspaceId: string, userId: string, requestId: string): Promise<CampaignGenerationJobRecord> {
  await assertCampaignGenerationAccess(workspaceId, userId);
  const job = await prisma.campaignGenerationJob.findFirst({ where: { workspaceId, userId, requestId } });
  if (!job) throw new CampaignGenerationError("CAMPAIGN_GENERATION_NOT_FOUND", "Campaign generation was not found.", 404);
  if (["QUEUED", "RUNNING", "COMPLETED"].includes(job.status)) return record(job);
  if (!record(job).canResume || !campaignCheckpoint(job.checkpoint) || !generateCampaignSchema.safeParse(job.input).success)
    throw new CampaignGenerationError("CAMPAIGN_CANNOT_RESUME", "Review the brief and start a new campaign.");
  await prisma.campaignGenerationJob.updateMany({
    where: { id: job.id, workspaceId, status: "FAILED", updatedAt: job.updatedAt },
    data: { status: "QUEUED", errorCode: null, leaseExpiresAt: null }
  });
  return readCampaignGeneration(workspaceId, requestId);
}

export async function queueCampaignGeneration(
  workspaceId: string,
  userId: string,
  requestId: string,
  input: GenerateCampaignInput
): Promise<CampaignGenerationJobRecord> {
  input = generateCampaignSchema.parse(input);
  const references = validateCampaignReferences(input.referenceFiles ?? []);
  const { referenceFiles: _bytes, ...brief } = input;
  const requestHash = createHash("sha256")
    .update(JSON.stringify({ ...brief, referenceFiles: references }))
    .digest("hex");
  const key = { workspaceId, requestId };
  const existing = await prisma.campaignGenerationJob.findUnique({ where: { workspaceId_requestId: key } });
  const replay = (row: CampaignGenerationJob) => {
    if (row.requestHash !== requestHash || row.userId !== userId)
      throw new CampaignGenerationError("CAMPAIGN_REQUEST_MISMATCH", "This request ID belongs to a different campaign brief.");
    return record(row);
  };
  if (existing) return replay(existing);
  await assertCampaignGenerationAccess(workspaceId, userId);
  if (!(await getVaultScore(workspaceId)).entryCount) throw new CampaignContextMissingError();
  try {
    return record(
      await prisma.campaignGenerationJob.create({
        data: {
          ...key,
          userId,
          requestHash,
          objective: input.objective ?? "",
          totalWeeks: input.durationDays > 14 ? Math.ceil(input.durationDays / 7) : null,
          input: input as unknown as Prisma.InputJsonValue
        }
      })
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const concurrent = await prisma.campaignGenerationJob.findUnique({ where: { workspaceId_requestId: key } });
      if (concurrent) return replay(concurrent);
    }
    throw error;
  }
}

export async function readCampaignGeneration(workspaceId: string, requestId: string, viewer?: GenerationViewer): Promise<CampaignGenerationJobRecord> {
  const row = await prisma.campaignGenerationJob.findFirst({ where: { workspaceId, requestId }, select: jobSelect });
  if (!row) throw new CampaignGenerationError("CAMPAIGN_GENERATION_NOT_FOUND", "Campaign generation was not found.", 404);
  return record(row, viewer);
}

export async function listCampaignGenerations(workspaceId: string, viewer?: GenerationViewer): Promise<CampaignGenerationJobRecord[]> {
  // Include active jobs even if a workspace has a large recent campaign history.
  const [active, recent] = await Promise.all([
    prisma.campaignGenerationJob.findMany({
      where: { workspaceId, status: { in: ["QUEUED", "RUNNING"] } },
      select: jobSelect,
      orderBy: { createdAt: "desc" },
      take: 50
    }),
    prisma.campaignGenerationJob.findMany({
      where: { workspaceId, status: { in: ["COMPLETED", "FAILED"] } },
      select: jobSelect,
      orderBy: { createdAt: "desc" },
      take: 10
    })
  ]);
  return [...active, ...recent].map((row) => record(row, viewer));
}

export async function processCampaignGenerations(workspaceId?: string): Promise<void> {
  const scope = workspaceId ? { workspaceId } : {};
  // Ambiguous provider work is never automatically replayed. Queued jobs survive
  // process restarts; abandoned running jobs become an explicit, safe retry state.
  const expired = await prisma.campaignGenerationJob.findMany({ where: { ...scope, status: "RUNNING", leaseExpiresAt: { lte: new Date() } }, take: 50 });
  for (const abandoned of expired) await failGeneration(abandoned, "CAMPAIGN_INTERRUPTED", abandoned.leaseExpiresAt);
  await prisma.campaignGenerationJob.updateMany({
    where: { ...scope, status: "FAILED", updatedAt: { lt: new Date(Date.now() - 7 * 86400_000) }, checkpoint: { not: Prisma.DbNull } },
    data: { input: Prisma.DbNull, checkpoint: Prisma.DbNull, resumable: false, completedWeeks: 0 }
  });
  const job = await prisma.campaignGenerationJob.findFirst({ where: { ...scope, status: "QUEUED" }, orderBy: [{ updatedAt: "asc" }, { createdAt: "asc" }] });
  if (!job) return;
  const leaseExpiresAt = new Date(Date.now() + 10 * 60_000);
  const claimed = await prisma.campaignGenerationJob.updateMany({
    where: { id: job.id, workspaceId: job.workspaceId, status: "QUEUED", updatedAt: job.updatedAt },
    data: {
      status: "RUNNING",
      leaseExpiresAt
    }
  });
  if (!claimed.count) return;
  try {
    await assertCampaignGenerationAccess(job.workspaceId, job.userId);
    const input = generateCampaignSchema.parse(job.input);
    if (input.durationDays > 14) await planNextCampaignWeek(job, leaseExpiresAt);
    else await generateWorkspaceCampaign(job.workspaceId, input, { id: job.id, userId: job.userId, leaseExpiresAt });
  } catch (error) {
    const errorCode =
      error instanceof AiServiceRequestError || error instanceof CampaignGenerationError
        ? error.code
        : error instanceof CampaignContextMissingError
          ? "CAMPAIGN_CONTEXT_MISSING"
          : "CAMPAIGN_GENERATION_FAILED";
    await failGeneration(job, errorCode, leaseExpiresAt);
  }
}

async function failGeneration(job: CampaignGenerationJob, errorCode: string, leaseExpiresAt: Date | null) {
  const resumable = !!campaignCheckpoint(job.checkpoint) && errorCode !== "CAMPAIGN_ACCESS_CHANGED";
  await prisma.campaignGenerationJob.updateMany({
    where: { id: job.id, workspaceId: job.workspaceId, status: "RUNNING", leaseExpiresAt },
    data: {
      status: "FAILED",
      errorCode,
      leaseExpiresAt: null,
      ...(!resumable ? { input: Prisma.DbNull, checkpoint: Prisma.DbNull, resumable: false, completedWeeks: 0 } : {})
    }
  });
}
