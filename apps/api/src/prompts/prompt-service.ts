import { createHash } from "node:crypto";
import type { PromptTemplate } from "@prisma/client";
import type { PromptTemplateRecord, PromptVariantSelection } from "@markos/shared-types";
import type { CreatePromptTemplateInput, SelectPromptVariantInput, UpdatePromptTemplateInput } from "@markos/validation";
import { prisma } from "../db/prisma";

export class PromptTemplateNotFoundError extends Error {
  constructor() {
    super("Prompt template was not found");
  }
}

export class PromptTemplateConflictError extends Error {
  constructor() {
    super("Prompt template version already exists for this agent");
  }
}

export async function listPromptTemplates(input: { agent?: string; workspaceId: string }): Promise<PromptTemplateRecord[]> {
  const rows = await prisma.promptTemplate.findMany({
    where: {
      deletedAt: null,
      workspaceId: input.workspaceId,
      ...(input.agent === undefined ? {} : { agent: input.agent })
    },
    orderBy: [
      {
        agent: "asc"
      },
      {
        createdAt: "desc"
      }
    ]
  });

  return rows.map(toPromptTemplateRecord);
}

export async function createPromptTemplate(
  workspaceId: string,
  input: CreatePromptTemplateInput,
  audit: { actorId?: string } = {}
): Promise<PromptTemplateRecord> {
  try {
    const row = await prisma.$transaction(async (tx) => {
      const created = await tx.promptTemplate.create({
        data: {
          active: input.active,
          agent: input.agent,
          body: input.body,
          trafficPct: input.trafficPct,
          version: input.version,
          workspaceId,
          ...(input.variantOf === undefined ? {} : { variantOf: input.variantOf })
        }
      });

      await tx.auditLog.create({
        data: {
          action: "PROMPT_TEMPLATE_CREATED",
          ...(audit.actorId === undefined ? {} : { actorId: audit.actorId }),
          metadata: {
            active: created.active,
            agent: created.agent,
            trafficPct: created.trafficPct,
            version: created.version
          },
          targetId: created.id,
          targetType: "PromptTemplate",
          workspaceId
        }
      });

      return created;
    });

    return toPromptTemplateRecord(row);
  } catch (error) {
    if (isUniqueConstraintError(error)) {
      throw new PromptTemplateConflictError();
    }

    throw error;
  }
}

export async function updatePromptTemplate(
  workspaceId: string,
  id: string,
  input: UpdatePromptTemplateInput,
  audit: { actorId?: string } = {}
): Promise<PromptTemplateRecord> {
  const existing = await prisma.promptTemplate.findFirst({
    where: {
      id,
      workspaceId,
      deletedAt: null
    }
  });

  if (!existing) {
    throw new PromptTemplateNotFoundError();
  }

  const row = await prisma.$transaction(async (tx) => {
    const updated = await tx.promptTemplate.update({
      where: {
        id
      },
      data: {
        ...(input.active === undefined ? {} : { active: input.active }),
        ...(input.body === undefined ? {} : { body: input.body }),
        ...(input.trafficPct === undefined ? {} : { trafficPct: input.trafficPct }),
        ...(input.variantOf === undefined ? {} : { variantOf: input.variantOf })
      }
    });

    await tx.auditLog.create({
      data: {
        action: "PROMPT_TEMPLATE_UPDATED",
        ...(audit.actorId === undefined ? {} : { actorId: audit.actorId }),
        metadata: {
          changedKeys: Object.keys(input).sort(),
          next: {
            active: updated.active,
            trafficPct: updated.trafficPct,
            variantOf: updated.variantOf,
            version: updated.version
          },
          previous: {
            active: existing.active,
            trafficPct: existing.trafficPct,
            variantOf: existing.variantOf,
            version: existing.version
          }
        },
        targetId: updated.id,
        targetType: "PromptTemplate",
        workspaceId
      }
    });

    return updated;
  });

  return toPromptTemplateRecord(row);
}

export async function selectPromptVariant(workspaceId: string, input: SelectPromptVariantInput): Promise<PromptVariantSelection> {
  const candidates = await activePromptCandidates(workspaceId, input.agent);
  const selected = chooseWeightedCandidate(candidates, `${input.agent}:${input.seed}`);

  return {
    candidates: candidates.map(toPromptTemplateRecord),
    seed: input.seed,
    ...(selected === undefined ? {} : { selected: toPromptTemplateRecord(selected) })
  };
}

export async function selectPromptTemplateForRun(workspaceId: string, agent: string, seed: string): Promise<PromptTemplateRecord | undefined> {
  const selected = chooseWeightedCandidate(await activePromptCandidates(workspaceId, agent), `${agent}:${seed}`);
  return selected === undefined ? undefined : toPromptTemplateRecord(selected);
}

async function activePromptCandidates(workspaceId: string, agent: string): Promise<PromptTemplate[]> {
  return prisma.promptTemplate.findMany({
    where: {
      active: true,
      agent,
      deletedAt: null,
      workspaceId,
      trafficPct: {
        gt: 0
      }
    },
    orderBy: {
      version: "asc"
    }
  });
}

function chooseWeightedCandidate(candidates: PromptTemplate[], seed: string): PromptTemplate | undefined {
  const total = candidates.reduce((sum, candidate) => sum + candidate.trafficPct, 0);

  if (total <= 0) {
    return undefined;
  }

  let bucket = hashToBucket(seed, total);

  for (const candidate of candidates) {
    if (bucket < candidate.trafficPct) {
      return candidate;
    }

    bucket -= candidate.trafficPct;
  }

  return candidates.at(-1);
}

function hashToBucket(seed: string, total: number): number {
  const digest = createHash("sha256").update(seed).digest();
  return digest.readUInt32BE(0) % total;
}

function toPromptTemplateRecord(row: PromptTemplate): PromptTemplateRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    agent: row.agent,
    version: row.version,
    body: row.body,
    ...(row.variantOf === null ? {} : { variantOf: row.variantOf }),
    trafficPct: row.trafficPct,
    active: row.active,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error && error.code === "P2002";
}
