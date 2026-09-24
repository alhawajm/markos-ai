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

const jobSelect = { id: true, requestId: true, objective: true, status: true, campaignId: true, errorCode: true, createdAt: true, updatedAt: true } as const;
function record(row: Pick<CampaignGenerationJob, keyof typeof jobSelect>): CampaignGenerationJobRecord {
  return {
    id: row.id,
    requestId: row.requestId,
    objective: row.objective,
    campaignId: row.campaignId,
    errorCode: row.errorCode,
    status: row.status as CampaignGenerationJobRecord["status"],
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
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

export async function readCampaignGeneration(workspaceId: string, requestId: string): Promise<CampaignGenerationJobRecord> {
  const row = await prisma.campaignGenerationJob.findFirst({ where: { workspaceId, requestId }, select: jobSelect });
  if (!row) throw new CampaignGenerationError("CAMPAIGN_GENERATION_NOT_FOUND", "Campaign generation was not found.", 404);
  return record(row);
}

export async function listCampaignGenerations(workspaceId: string): Promise<CampaignGenerationJobRecord[]> {
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
  return [...active, ...recent].map(record);
}

export async function processCampaignGenerations(workspaceId?: string): Promise<void> {
  const scope = workspaceId ? { workspaceId } : {};
  // Ambiguous provider work is never automatically replayed. Queued jobs survive
  // process restarts; abandoned running jobs become an explicit, safe retry state.
  await prisma.campaignGenerationJob.updateMany({
    where: { ...scope, status: "RUNNING", leaseExpiresAt: { lte: new Date() } },
    data: {
      status: "FAILED",
      errorCode: "CAMPAIGN_INTERRUPTED",
      input: Prisma.DbNull,
      leaseExpiresAt: null
    }
  });
  const job = await prisma.campaignGenerationJob.findFirst({ where: { ...scope, status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!job) return;
  const claimed = await prisma.campaignGenerationJob.updateMany({
    where: { id: job.id, workspaceId: job.workspaceId, status: "QUEUED" },
    data: {
      status: "RUNNING",
      leaseExpiresAt: new Date(Date.now() + 10 * 60_000)
    }
  });
  if (!claimed.count) return;
  try {
    await assertCampaignGenerationAccess(job.workspaceId, job.userId);
    await generateWorkspaceCampaign(job.workspaceId, generateCampaignSchema.parse(job.input), { id: job.id, userId: job.userId });
  } catch (error) {
    const errorCode =
      error instanceof AiServiceRequestError || error instanceof CampaignGenerationError
        ? error.code
        : error instanceof CampaignContextMissingError
          ? "CAMPAIGN_CONTEXT_MISSING"
          : "CAMPAIGN_GENERATION_FAILED";
    await prisma.campaignGenerationJob.updateMany({
      where: { id: job.id, workspaceId: job.workspaceId, status: "RUNNING" },
      data: {
        status: "FAILED",
        errorCode,
        input: Prisma.DbNull,
        leaseExpiresAt: null
      }
    });
  }
}
