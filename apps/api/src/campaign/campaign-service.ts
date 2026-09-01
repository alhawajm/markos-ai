import type { CampaignStatus, Prisma } from "@prisma/client";
import type { CampaignPlan, CampaignRecord } from "@markos/shared-types";
import type { GenerateCampaignInput } from "@markos/validation";
import { AiServiceRequestError } from "../ai/request";
import { generateCampaignPlan } from "../ai/campaign-client";
import { env } from "../config/env";
import { prisma } from "../db/prisma";
import { selectPromptTemplateForRun } from "../prompts/prompt-service";
import { recordAiTokenUsage, refundWorkspaceUsage, reserveWorkspaceUsage } from "../usage/usage-service";
import { getVaultScore, searchVaultContext } from "../vault/vault-service";

const campaignAgentName = "STRATEGIST";
const localCurrency = "BHD";

export class CampaignContextMissingError extends Error {
  constructor() {
    super("Complete at least one Business Profile section before generating a campaign");
  }
}

export class CampaignNotFoundError extends Error {
  constructor() {
    super("Campaign was not found");
  }
}

export async function listCampaigns(workspaceId: string): Promise<CampaignRecord[]> {
  const rows = await prisma.campaign.findMany({
    where: {
      workspaceId,
      deletedAt: null
    },
    orderBy: {
      createdAt: "desc"
    },
    take: 20
  });

  return rows.map(toCampaignRecord);
}

export async function exportCampaignPdf(workspaceId: string, campaignId: string): Promise<{ bytes: Buffer; filename: string }> {
  const row = await prisma.campaign.findFirst({
    where: {
      id: campaignId,
      workspaceId,
      deletedAt: null
    }
  });

  if (!row) {
    throw new CampaignNotFoundError();
  }

  const campaign = toCampaignRecord(row);

  return {
    bytes: buildCampaignPdf(campaign),
    filename: `${slugForFilename(campaign.title)}.pdf`
  };
}

export async function generateWorkspaceCampaign(workspaceId: string, input: GenerateCampaignInput): Promise<CampaignRecord> {
  const score = await getVaultScore(workspaceId);

  if (score.entryCount === 0) {
    throw new CampaignContextMissingError();
  }

  const query = input.objective ?? (input.locale === "ar" ? "حملة تسويق إنستغرام للشركات الصغيرة في البحرين" : "Instagram marketing campaign Bahrain SMB");
  const context = await searchVaultContext(workspaceId, {
    query,
    topK: 10
  });
  const promptTemplate = await selectPromptTemplateForRun(
    workspaceId,
    campaignAgentName,
    `${workspaceId}:${query}:${input.durationDays}:${input.publishesPerDay}:${input.startsAt}:${input.locale}`
  );
  const usagePeriodDate = new Date();
  await reserveWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });

  try {
    await reserveWorkspaceUsage({ workspaceId, metric: "CAMPAIGN", now: usagePeriodDate });
  } catch (error) {
    await refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate });
    throw error;
  }

  try {
    const request = {
      workspaceId,
      durationDays: input.durationDays,
      publishesPerDay: input.publishesPerDay,
      startsAt: input.startsAt,
      locale: input.locale,
      context,
      ...(promptTemplate === undefined ? {} : { promptTemplate: { body: promptTemplate.body, version: promptTemplate.version } })
    };
    const generated = await generateCampaignPlan(
      input.objective === undefined
        ? request
        : {
            ...request,
            objective: input.objective
          }
    );

    if (generated.campaign.durationDays !== input.durationDays || generated.campaign.publishesPerDay !== input.publishesPerDay) {
      throw new AiServiceRequestError({
        code: "AI_SERVICE_RESPONSE_INVALID",
        message: "The AI service returned an invalid response",
        retryable: true,
        statusCode: 502
      });
    }

    const campaign: CampaignPlan = {
      ...generated.campaign,
      retrievedContext: context
    };
    const promptVersion = promptTemplate?.version ?? generated.prompt_version;

    const saved = await prisma.$transaction(async (tx) => {
      const startsAt = new Date(input.startsAt);
      const row = await tx.campaign.create({
        data: {
          workspaceId,
          title: titleForCampaign(input.durationDays, input.objective, input.locale),
          ...(input.objective === undefined ? {} : { objective: input.objective }),
          status: "REVIEW",
          startsAt,
          endsAt: campaignEnd(startsAt, input.durationDays),
          durationDays: input.durationDays,
          publishesPerDay: input.publishesPerDay,
          content: campaign as unknown as Prisma.InputJsonValue
        }
      });

      await tx.aiInteraction.create({
        data: {
          workspaceId,
          agent: campaignAgentName,
          promptVersion,
          prompt: {
            ...(input.objective === undefined ? {} : { objective: input.objective }),
            durationDays: input.durationDays,
            publishesPerDay: input.publishesPerDay,
            startsAt: input.startsAt,
            locale: input.locale,
            ...(promptTemplate === undefined ? {} : { promptTemplate }),
            retrievedContext: context
          } as unknown as Prisma.InputJsonValue,
          response: {
            ...campaign,
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

    return toCampaignRecord(saved);
  } catch (error) {
    await Promise.all([
      refundWorkspaceUsage({ workspaceId, metric: "AI_GENERATION", now: usagePeriodDate }),
      refundWorkspaceUsage({ workspaceId, metric: "CAMPAIGN", now: usagePeriodDate })
    ]);
    throw error;
  }
}

function titleForCampaign(durationDays: number, objective: string | undefined, locale: "ar" | "en"): string {
  if (locale === "ar") {
    return objective === undefined ? `حملة إنستغرام لمدة ${durationDays} يومًا` : `حملة لمدة ${durationDays} يومًا: ${objective}`;
  }

  return objective === undefined ? `${durationDays}-day Instagram campaign` : `${durationDays}-day campaign: ${objective}`;
}

function toCampaignRecord(row: {
  id: string;
  workspaceId: string;
  title: string;
  objective: string | null;
  status: CampaignStatus;
  startsAt: Date;
  endsAt: Date;
  durationDays: number;
  publishesPerDay: number;
  content: Prisma.JsonValue;
  version: number;
  createdAt: Date;
  updatedAt: Date;
}): CampaignRecord {
  return {
    id: row.id,
    workspaceId: row.workspaceId,
    title: row.title,
    ...(row.objective === null ? {} : { objective: row.objective }),
    status: row.status,
    startsAt: row.startsAt.toISOString(),
    endsAt: row.endsAt.toISOString(),
    durationDays: row.durationDays as CampaignRecord["durationDays"],
    publishesPerDay: row.publishesPerDay,
    content: row.content as unknown as CampaignPlan,
    version: row.version,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString()
  };
}

function buildCampaignPdf(campaign: CampaignRecord): Buffer {
  const content = campaign.content;
  const lines = [
    "MARKOS AI Campaign Export",
    campaign.title,
    `Duration: ${campaign.durationDays} days`,
    `Publishing intensity: ${campaign.publishesPerDay} per day`,
    `Starts: ${campaign.startsAt.slice(0, 10)}`,
    `Created: ${new Date(campaign.createdAt).toISOString().slice(0, 10)}`,
    "",
    "Summary",
    content.summary,
    "",
    "Objectives",
    ...content.objectives.map((item) => `- ${item}`),
    "",
    "Content Pillars",
    ...content.pillars.flatMap((pillar) => [`- ${pillar.name}: ${pillar.rationale}`, ...pillar.contentAngles.map((angle) => `  * ${angle}`)]),
    "",
    "Weekly Cadence",
    ...content.weeklyCadence.flatMap((week) => [`- Week ${week.week}: ${week.focus}`, ...week.actions.map((action) => `  * ${action}`)]),
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
    const pageId = addObject(
      `<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 ${fontId} 0 R >> >> /Contents ${contentId} 0 R >>`
    );
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

  return pages.length === 0 ? [["MARKOS AI Campaign Export"]] : pages;
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

  return slug.length === 0 ? "campaign-export" : slug;
}

function campaignEnd(startsAt: Date, durationDays: number): Date {
  const endsAt = new Date(startsAt);
  endsAt.setUTCDate(endsAt.getUTCDate() + durationDays);
  return endsAt;
}
