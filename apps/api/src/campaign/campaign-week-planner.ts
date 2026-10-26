import { Prisma, type CampaignGenerationJob } from "@prisma/client";
import { z } from "zod";
import { generateCampaignSchema } from "@markos/validation";
import { vaultSections } from "@markos/shared-types";
import { campaignOutlineSchema, campaignPlanSchema, campaignWeekSchema } from "../ai/campaign-contracts";
import { generateCampaignSegment } from "../ai/campaign-client";
import { prisma } from "../db/prisma";
import { recordAiTokenUsage } from "../usage/usage-service";
import { assertCampaignGenerationAccess, CampaignGenerationError } from "./campaign-generation-access";
import { generateWorkspaceCampaign, prepareCampaignContext } from "./campaign-service";

const checkpointSchema = z.object({
  version: z.literal(1),
  prepared: z.object({
    referenceFiles: z.array(z.object({ filename: z.string(), mimeType: z.string(), sizeBytes: z.number(), checksumSha256: z.string() })),
    context: z.array(
      z.object({
        id: z.string(),
        section: z.enum(vaultSections),
        key: z.string(),
        version: z.number().int(),
        value: z.record(z.string(), z.unknown()),
        score: z.number()
      })
    ),
    promptTemplate: z.object({ body: z.string(), version: z.string() }).optional()
  }),
  outline: campaignOutlineSchema,
  weeks: z.array(campaignWeekSchema).max(13),
  model: z.string(),
  promptVersion: z.string()
});
export function campaignCheckpoint(value: unknown) {
  const parsed = checkpointSchema.safeParse(value);
  return parsed.success ? parsed.data : undefined;
}

/** One provider window per lease. Committed windows survive deploys without replay. */
export async function planNextCampaignWeek(job: CampaignGenerationJob, leaseExpiresAt: Date): Promise<void> {
  const input = generateCampaignSchema.parse(job.input);
  const checkpoint = campaignCheckpoint(job.checkpoint);
  if (job.checkpoint !== null && !checkpoint) throw new CampaignGenerationError("CAMPAIGN_CHECKPOINT_INVALID", "The saved plan could not be recovered.");
  const prepared = checkpoint?.prepared ?? (await prepareCampaignContext(job.workspaceId, input));
  const completed = checkpoint?.weeks.length ?? 0;
  const total = Math.ceil(input.durationDays / 7);
  if (completed === total && checkpoint) {
    const campaign = campaignPlanSchema.parse({
      ...checkpoint.outline,
      durationDays: input.durationDays,
      publishesPerDay: input.publishesPerDay,
      weeklyCadence: checkpoint.weeks
    });
    await generateWorkspaceCampaign(
      job.workspaceId,
      input,
      { id: job.id, userId: job.userId, leaseExpiresAt },
      {
        prepared: { ...prepared, promptTemplate: prepared.promptTemplate },
        // Actual provider usage was committed once per window. Assembly consumes no tokens.
        response: { campaign, model: checkpoint.model, prompt_version: `${checkpoint.promptVersion.slice(0, 105)}.assembled`, tokens_in: 0, tokens_out: 0 }
      }
    );
    return;
  }
  const startDay = completed * 7 + 1;
  const durationDays = Math.min(7, input.durationDays - startDay + 1);
  const startsAt = new Date(input.startsAt);
  startsAt.setUTCDate(startsAt.getUTCDate() + startDay - 1);
  const request = {
    ...input,
    workspaceId: job.workspaceId,
    durationDays,
    startsAt: startsAt.toISOString(),
    ...(input.referenceFiles && !completed ? { referenceFiles: input.referenceFiles } : { referenceFiles: [] }),
    context: prepared.context,
    ...(prepared.promptTemplate ? { promptTemplate: prepared.promptTemplate } : {})
  };
  const generated = await generateCampaignSegment(request, {
    total_duration_days: input.durationDays,
    start_day: startDay,
    outline: checkpoint?.outline ?? null,
    previous_weeks:
      checkpoint?.weeks.map((week) => `Week ${week.week}: ${week.focus}. ${week.days.flatMap((day) => day.posts.map((post) => post.title)).join("; ")}`) ?? []
  });
  const localWeek = generated.campaign.weeklyCadence[0];
  const { weeklyCadence: _weeks, durationDays: _duration, publishesPerDay: _intensity, ...newOutline } = generated.campaign;
  const outline = checkpoint?.outline ?? newOutline;
  const pillars = new Set(outline.pillars.map((pillar) => pillar.name));
  if (
    generated.campaign.durationDays !== durationDays ||
    generated.campaign.publishesPerDay !== input.publishesPerDay ||
    generated.campaign.weeklyCadence.length !== 1 ||
    !localWeek ||
    localWeek.week !== 1 ||
    (prepared.referenceFiles.length > 0 && !outline.referenceSummary?.trim()) ||
    localWeek.days.some((day) => day.posts.some((post) => !pillars.has(post.contentPillar)))
  ) {
    throw new CampaignGenerationError("AI_SERVICE_RESPONSE_INVALID", "The weekly plan was incomplete. Your completed weeks are saved.");
  }
  const week = { ...localWeek, week: completed + 1, days: localWeek.days.map((day) => ({ ...day, day: day.day + startDay - 1 })) };
  const next = { version: 1, prepared, outline, weeks: [...(checkpoint?.weeks ?? []), week], model: generated.model, promptVersion: generated.prompt_version };
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM campaign_generation_jobs WHERE id = ${job.id}::uuid AND "workspaceId" = ${job.workspaceId}::uuid FOR UPDATE`;
    const active = await tx.campaignGenerationJob.findFirst({
      where: { id: job.id, workspaceId: job.workspaceId, status: "RUNNING", leaseExpiresAt: { equals: leaseExpiresAt, gt: new Date() } }
    });
    if (!active) throw new CampaignGenerationError("CAMPAIGN_INTERRUPTED", "The generation lease expired.");
    await assertCampaignGenerationAccess(job.workspaceId, job.userId, tx);
    await tx.aiInteraction.create({
      data: {
        workspaceId: job.workspaceId,
        agent: "STRATEGIST",
        promptVersion: generated.prompt_version,
        model: generated.model,
        prompt: {
          phase: "CAMPAIGN_WEEK",
          requestId: job.requestId,
          week: completed + 1,
          durationDays: input.durationDays,
          objective: input.objective,
          description: input.description,
          referenceFiles: prepared.referenceFiles,
          context: prepared.context
        } as unknown as Prisma.InputJsonValue,
        response: generated.campaign as unknown as Prisma.InputJsonValue,
        tokensIn: generated.tokens_in,
        tokensOut: generated.tokens_out,
        costMinor: 0,
        currency: "BHD"
      }
    });
    await recordAiTokenUsage({ client: tx, workspaceId: job.workspaceId, tokensIn: generated.tokens_in, tokensOut: generated.tokens_out, now: new Date() });
    await tx.campaignGenerationJob.update({
      where: { id: job.id, workspaceId: job.workspaceId },
      data: {
        status: "QUEUED",
        leaseExpiresAt: null,
        checkpoint: next as unknown as Prisma.InputJsonValue,
        completedWeeks: completed + 1,
        resumable: true,
        // The reference summary and metadata replace document bytes after the first window.
        input: { ...input, referenceFiles: [] } as unknown as Prisma.InputJsonValue
      }
    });
  });
}
