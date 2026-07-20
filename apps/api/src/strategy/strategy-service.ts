import type { Prisma } from "@prisma/client";
import type { StrategyPlan, StrategyRecord, VaultRagChunk } from "@markos/shared-types";
import type { GenerateStrategyInput } from "@markos/validation";
import { generateStrategyPlan } from "../ai/strategy-client";
import { buildCatalogCommercialBrief, listCatalogGenerationContext } from "../catalog/catalog-service";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, searchVaultContext } from "../vault/vault-service";

const strategyAgentName = "STRATEGIST";
const localCurrency = "BHD";

export class StrategyContextMissingError extends Error {
  constructor() {
    super("Complete at least one Vault section before generating strategy");
  }
}

export class StrategyNotFoundError extends Error {
  constructor() {
    super("Strategy was not found");
  }
}

export async function listStrategies(workspaceId: string): Promise<StrategyRecord[]> {
  const rows = await prisma.strategy.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });

  return rows.map(toStrategyRecord);
}

export async function exportStrategyPdf(
  workspaceId: string,
  strategyId: string
): Promise<{ bytes: Buffer; filename: string }> {
  const row = await prisma.strategy.findFirst({
    where: {
      id: strategyId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!row) {
    throw new StrategyNotFoundError();
  }

  const strategy = toStrategyRecord(row);

  return {
    bytes: buildStrategyPdf(strategy),
    filename: `${slugForFilename(strategy.title)}.pdf`
  };
}

export async function generateWorkspaceStrategy(
  workspaceId: string,
  input: GenerateStrategyInput
): Promise<StrategyRecord> {
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new StrategyContextMissingError();
  }

  const query = input.objective ?? "Instagram strategy content pillars Bahrain SMB";
  const vaultContext = await searchVaultContext(workspaceId, {
    query,
    topK: 8
  });
  const catalogContext = await listCatalogGenerationContext(workspaceId, {
    limit: 8,
    ...(input.offerId === undefined ? {} : { offerId: input.offerId }),
    ...(input.productId === undefined ? {} : { productId: input.productId })
  });
  const commercialContext = buildCatalogCommercialBrief({
    catalogContext,
    requestText: query,
    vaultContext,
    ...(input.offerId === undefined ? {} : { offerId: input.offerId }),
    ...(input.productId === undefined ? {} : { productId: input.productId })
  });
  const context = mergeGenerationContext([...commercialContext, ...catalogContext], vaultContext, 14);
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    strategyAgentName,
    `${workspaceId}:${query}:${input.horizonDays}:${input.productId ?? "no-product"}:${input.offerId ?? "no-offer"}`
  );
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });

  try {
    await reserveWorkspaceUsage({ workspaceId, metric: "STRATEGY", now: usagePeriodDate });
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });
    throw error;
  }

  try {
    const request = {
      workspaceId,
      horizonDays: input.horizonDays,
      context,
      ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } })
    };
    const generated = await generateStrategyPlan(
      input.objective === undefined
        ? request
        : {
            ...request,
            objective: input.objective
          }
    );
    const strategy: StrategyPlan = {
      ...generated.strategy,
      retrievedContext: context
    };
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;

    const saved = await prisma.$transaction(async (tx) => {
      const row = await tx.strategy.create({
        data: {
          workspaceId,
          title: titleForStrategy(input.horizonDays, input.objective),
          horizonDays: input.horizonDays,
          content: strategy as unknown as Prisma.InputJsonValue
        }
      });

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: strategyAgentName,
          promptVersion,
          prompt: {
            ...(input.objective === undefined ? {} : { objective: input.objective }),
            horizonDays: input.horizonDays,
            ...(input.productId === undefined ? {} : { productId: input.productId }),
            ...(input.offerId === undefined ? {} : { offerId: input.offerId }),
            ...(promptTemplate === undefined ? {} : { promptTemplate }),
            retrievedContext: context
          } as unknown as Prisma.InputJsonValue,
          response: {
            ...strategy,
            providerPromptVersion: generated.prompt_version
          } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: localCurrency,
          model: generated.model || env.LLM_PRIMARY_MODEL
        }
      });
      await recordAiTokenUsage({
        client: tx,
        workspaceId,
        tokensIn: generated.tokens_in,
        tokensOut: generated.tokens_out,
        now: usagePeriodDate
      });

      return row;
    });

    return toStrategyRecord(saved);
  } catch (error) {
    await Promise.all([
      refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate }),
      refundWorkspaceUsage({ workspaceId, metric: "STRATEGY", now: usagePeriodDate })
    ]);
    throw error;
  }
}

function titleForStrategy(horizonDays: number, objective: string | undefined): string {
  return objective === undefined ? `${horizonDays}-day Instagram strategy` : `${horizonDays}-day strategy: ${objective}`;
}

function mergeGenerationContext(preferred: VaultRagChunk[], fallback: VaultRagChunk[], limit: number): VaultRagChunk[] {
  const seen = new Set<string>();
  const merged: VaultRagChunk[] = [];

  for (const chunk of [...preferred, ...fallback]) {
    const key = `${chunk.section}:${chunk.key}`;

    if (seen.has(key)) {
      continue;
    }

    seen.add(key);
    merged.push(chunk);
  }

  return merged.slice(0, limit);
}

function toStrategyRecord(row: {
  id: string;
  workspaceId: string;
  title: string;
  horizonDays: number;
  content: Prisma.JsonValue;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): StrategyRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    horizonDays: row.horizonDays,
    content: row.content as unknown as StrategyPlan,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function buildStrategyPdf(strategy: StrategyRecord): Buffer {
  const content = strategy.content;
  const lines = [
    "MARKOS AI Strategy Export",
    strategy.title,
    `Horizon: ${strategy.horizonDays} days`,
    `Created: ${new Date(strategy.createdAt).toISOString().slice(0, 10)}`,
    "",
    "Summary",
    content.summary,
    "",
    "Objectives",
    ...content.objectives.map((item) => `- ${item}`),
    "",
    "Content Pillars",
    ...content.pillars.flatMap((pillar) => [
      `- ${pillar.name}: ${pillar.rationale}`,
      ...pillar.contentAngles.map((angle) => `  * ${angle}`)
    ]),
    "",
    "Weekly Cadence",
    ...content.weeklyCadence.flatMap((week) => [
      `- Week ${week.week}: ${week.focus}`,
      ...week.actions.map((action) => `  * ${action}`)
    ]),
    "",
    "KPIs",
    ...content.kpis.map((kpi) => `- ${kpi.name}: ${kpi.target}`),
    "",
    "Risks",
    ...content.risks.map((risk) => `- ${risk}`),
    "",
    "Next Actions",
    ...content.nextActions.map((action) => `- ${action}`),
    "",
    "Vault Context",
    ...content.retrievedContext.map((chunk) => `- ${chunk.section}/${chunk.key}`)
  ];
  const pages = paginatePdfLines(lines.map(sanitizePdfText), 42);
  const objects: string[] = [];
  const addObject = (body: string): number => {
    objects.push(body);
    return objects.length;
  };
  const catalogId = addObject("<< /Type /Catalog /Pages 2 0 R >>");
  const pagesId = addObject("PAGES_PLACEHOLDER");
  const fontId = addObject("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const pageIds: number[] = [];

  for (const pageLines of pages) {
    const stream = buildPdfContentStream(pageLines);
    const contentId = addObject(`<< /Length ${Buffer.byteLength(stream, "utf8")} >>\nstream\n${stream}\nendstream`);
    const pageId = addObject(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`);
    pageIds.push(pageId);
  }

  objects[pagesId - 1] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(" ")}] /Count ${pageIds.length} >>`;

  return assemblePdf(objects, catalogId);
}

function paginatePdfLines(lines: string[], pageSize: number): string[][] {
  const pages: string[][] = [];

  for (let index = 0; index < lines.length; index += pageSize) {
    pages.push(lines.slice(index, index + pageSize));
  }

  return pages.length === 0 ? [["MARKOS AI Strategy Export"]] : pages;
}

function buildPdfContentStream(lines: string[]): string {
  const commands = ["BT", "/F1 11 Tf", "50 742 Td", "14 TL"];

  for (const line of lines) {
    commands.push(`(${escapePdfString(line)}) Tj`, "T*");
  }

  commands.push("ET");
  return commands.join("\n");
}

function assemblePdf(objects: string[], catalogId: number): Buffer {
  const chunks = ["%PDF-1.4\n"];
  const offsets = [0];

  for (const [index, body] of objects.entries()) {
    offsets.push(Buffer.byteLength(chunks.join(""), "utf8"));
    chunks.push(`${index + 1} 0 obj\n${body}\nendobj\n`);
  }

  const xrefOffset = Buffer.byteLength(chunks.join(""), "utf8");
  chunks.push(`xref\n0 ${objects.length + 1}\n`);
  chunks.push("0000000000 65535 f \n");

  for (const offset of offsets.slice(1)) {
    chunks.push(`${String(offset).padStart(10, "0")} 00000 n \n`);
  }

  chunks.push(`trailer\n<< /Size ${objects.length + 1} /Root ${catalogId} 0 R >>\n`);
  chunks.push(`startxref\n${xrefOffset}\n%%EOF\n`);

  return Buffer.from(chunks.join(""), "utf8");
}

function sanitizePdfText(value: string): string {
  return value
    .normalize("NFKD")
    .replace(/[^\x20-\x7E]/g, "?")
    .slice(0, 110);
}

function escapePdfString(value: string): string {
  return value.replace(/\\/g, "\\\\").replace(/\(/g, "\\(").replace(/\)/g, "\\)");
}

function slugForFilename(value: string): string {
  const slug = value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);

  return slug.length === 0 ? "strategy-export" : slug;
}
