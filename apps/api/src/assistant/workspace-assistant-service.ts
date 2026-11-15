import { randomUUID } from "node:crypto";
import { Prisma, type AiInteraction } from "@prisma/client";
import { z } from "zod";
import type { WorkspaceAssistantTurn, CampaignGenerationJobRecord } from "@markos/shared-types";
import { workspaceAssistantMessageSchema, workspaceAssistantResultSchema } from "@markos/validation";
import { prisma } from "../db/prisma";
import { getBusinessKnowledge } from "../business-profile/knowledge-service";
import { resolveModelSetting } from "../admin/model-settings-service";
import { requestAi, AiServiceRequestError } from "../ai/request";
import { recordAiTokenUsage } from "../usage/usage-service";
import { createContentAggregate } from "../content/content-aggregate";
import { canContinue, ConversationError, submitConversationTurn } from "../content/conversation-service";
import { queueCampaignGeneration, campaignGenerationRecord, campaignGenerationPublicSelect } from "../campaign/campaign-generation-service";
import { runWorkspaceAgent } from "../agents/agent-service";
import { env } from "../config/env";
import { applyPersonalMemory, personalizationContext } from "../vault/personalization-service";
import { searchVaultContext } from "../vault/vault-service";

const agent = "WORKSPACE_ASSISTANT";
const json = (value: unknown) => value as Prisma.InputJsonValue;
type Prompt = { userId: string; message: string; locale: "en" | "ar"; startsAt: string };
type State = Omit<WorkspaceAssistantTurn, "id" | "message" | "createdAt"> & { baseRevision?: number; contentRequestId?: string; executionClaimed?: boolean };
const state = (row: AiInteraction) => row.response as unknown as State;
function record(row: AiInteraction, campaign?: CampaignGenerationJobRecord): WorkspaceAssistantTurn {
  const s = state(row);
  const ar = (row.prompt as unknown as Prompt).locale === "ar";
  const campaignStatus = campaign ? (campaign.status === "COMPLETED" ? "COMPLETED" : campaign.status === "FAILED" ? "FAILED" : "EXECUTING") : undefined;
  const campaignReply = campaign
    ? campaign.status === "COMPLETED"
      ? ar
        ? "حملتك جاهزة. افتحها لمراجعة الخطة."
        : "Your campaign is ready. Open it to review the plan."
      : campaign.status === "FAILED"
        ? ar
          ? "توقف التخطيط قبل الاكتمال. الأسابيع المحفوظة لم تُفقد؛ يمكنك استئناف العمل المتبقي هنا."
          : "Planning stopped before completion. Your saved weeks are kept; resume the remaining work here."
        : ar
          ? "جارٍ إعداد حملتك. سأضع رابطها هنا بمجرد اكتمالها."
          : "Your campaign is being planned. I’ll link it here as soon as it’s ready."
    : undefined;
  return {
    id: row.id,
    message: (row.prompt as unknown as Prompt).message,
    reply: campaignReply ?? s.reply,
    status: campaignStatus ?? s.status,
    proposal: s.proposal,
    createdAt: row.createdAt.toISOString(),
    ...(s.status === "PROPOSED" ? { confirmationToken: s.confirmationToken } : {}),
    ...(s.contentItemId ? { contentItemId: s.contentItemId } : {}),
    ...(s.campaignRequestId ? { campaignRequestId: s.campaignRequestId } : {}),
    ...(campaign ? { campaign, ...(campaign.campaignId ? { campaignId: campaign.campaignId } : {}) } : {}),
    ...(s.strategy ? { strategy: s.strategy } : {}),
    ...(s.errorCode ? { errorCode: s.errorCode } : {})
  };
}
const owned = (workspaceId: string, userId: string) => ({ workspaceId, agent, deletedAt: null, prompt: { path: ["userId"], equals: userId } });
async function currentRecord(row: AiInteraction) {
  if (!row.accepted || state(row).proposal?.action !== "CAMPAIGN") return record(row);
  const job = await prisma.campaignGenerationJob.findFirst({
    where: { workspaceId: row.workspaceId, userId: (row.prompt as unknown as Prompt).userId, requestId: state(row).campaignRequestId ?? row.id },
    select: campaignGenerationPublicSelect
  });
  return record(row, job ? campaignGenerationRecord(job) : undefined);
}
export async function workspaceAssistantHistory(workspaceId: string, userId: string) {
  const rows = await prisma.aiInteraction.findMany({ where: owned(workspaceId, userId), orderBy: { createdAt: "desc" }, take: 20 });
  const requests = rows.filter((row) => row.accepted && state(row).proposal?.action === "CAMPAIGN").map((row) => state(row).campaignRequestId ?? row.id);
  const jobs = requests.length
    ? await prisma.campaignGenerationJob.findMany({
        where: { workspaceId, userId, requestId: { in: requests } },
        select: campaignGenerationPublicSelect
      })
    : [];
  const byRequest = new Map(jobs.map((job) => [job.requestId, campaignGenerationRecord(job, { userId, mayGenerate: true })]));
  return rows.reverse().map((row) => record(row, byRequest.get(state(row).campaignRequestId ?? row.id)));
}
export async function submitWorkspaceMessage(workspaceId: string, userId: string, raw: unknown) {
  const input = workspaceAssistantMessageSchema.parse(raw);
  if (!(await canContinue(workspaceId, userId))) throw new ConversationError("ASSISTANT_ACCESS_CHANGED", "You no longer have access to create content.", 403);
  const existing = await prisma.aiInteraction.findUnique({ where: { id: input.requestId } });
  const replay = (row: AiInteraction) => {
    const p = row.prompt as unknown as Prompt;
    if (
      row.workspaceId !== workspaceId ||
      row.agent !== agent ||
      p.userId !== userId ||
      p.message !== input.message ||
      p.locale !== input.locale ||
      row.deletedAt
    )
      throw new ConversationError("ASSISTANT_REQUEST_MISMATCH", "This message ID is already in use.");
    return currentRecord(row);
  };
  if (existing) return replay(existing);
  try {
    return record(
      await prisma.aiInteraction.create({
        data: {
          id: input.requestId,
          workspaceId,
          agent,
          promptVersion: "workspace-chat.v3",
          prompt: { userId, message: input.message, locale: input.locale, startsAt: new Date().toISOString() },
          response: json({ status: "THINKING", reply: "", proposal: null }),
          model: "queued",
          tokensIn: 0,
          tokensOut: 0,
          costMinor: 0,
          currency: "BHD"
        }
      })
    );
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      const duplicate = await prisma.aiInteraction.findUnique({ where: { id: input.requestId } });
      if (duplicate) return replay(duplicate);
    }
    throw error;
  }
}

export async function processWorkspaceAssistant(workspaceId?: string) {
  const scope = workspaceId ? { workspaceId } : {};
  const interrupted = await prisma.aiInteraction.findMany({
    where: {
      ...scope,
      agent,
      deletedAt: null,
      AND: [{ response: { path: ["status"], equals: "EXECUTING" } }, { response: { path: ["executionClaimed"], equals: true } }],
      updatedAt: { lt: new Date(Date.now() - Math.max(180000, env.AI_HTTP_TIMEOUT_MS + 60000)) }
    },
    take: 10
  });
  for (const row of interrupted)
    await prisma.aiInteraction.updateMany({
      where: { id: row.id, workspaceId: row.workspaceId, updatedAt: row.updatedAt },
      data: {
        response: json({
          ...state(row),
          status: "FAILED",
          errorCode: "ASSISTANT_INTERRUPTED",
          reply:
            (row.prompt as unknown as Prompt).locale === "ar"
              ? "انقطع التنفيذ. راجع المسودة قبل طلب محاولة جديدة."
              : "Execution was interrupted. Review any draft before asking for another attempt."
        })
      }
    });
  const execution = await prisma.aiInteraction.findFirst({
    where: {
      ...scope,
      agent,
      deletedAt: null,
      accepted: true,
      AND: [{ response: { path: ["status"], equals: "EXECUTING" } }, { response: { path: ["executionClaimed"], equals: false } }]
    },
    orderBy: { createdAt: "asc" }
  });
  if (execution) {
    const claim = await prisma.aiInteraction.updateMany({
      where: { id: execution.id, workspaceId: execution.workspaceId, updatedAt: execution.updatedAt },
      data: { response: json({ ...state(execution), executionClaimed: true }) }
    });
    if (claim.count) await executeWorkspacePlan(execution);
    return;
  }
  const expired = await prisma.aiInteraction.findMany({
    where: { ...scope, agent, model: "working", deletedAt: null, updatedAt: { lt: new Date(Date.now() - Math.max(180000, env.AI_HTTP_TIMEOUT_MS + 60000)) } },
    take: 10
  });
  for (const row of expired)
    await prisma.aiInteraction.updateMany({
      where: { id: row.id, workspaceId: row.workspaceId, model: "working", updatedAt: row.updatedAt },
      data: {
        model: "interrupted",
        response: json({
          ...state(row),
          status: "FAILED",
          errorCode: "ASSISTANT_INTERRUPTED",
          reply:
            (row.prompt as unknown as Prompt).locale === "ar"
              ? "انقطع الطلب. لم تُجرَ تغييرات. أرسل طلبًا جديدًا للمتابعة."
              : "The request was interrupted. No changes were made. Send a new message to continue."
        })
      }
    });
  const row = await prisma.aiInteraction.findFirst({ where: { ...scope, agent, model: "queued", deletedAt: null }, orderBy: { createdAt: "asc" } });
  if (!row) return;
  const claim = await prisma.aiInteraction.updateMany({ where: { id: row.id, workspaceId: row.workspaceId, model: "queued" }, data: { model: "working" } });
  if (!claim.count) return;
  const p = row.prompt as unknown as Prompt;
  try {
    if (!(await canContinue(row.workspaceId, p.userId))) throw new ConversationError("ASSISTANT_ACCESS_CHANGED", "Access changed", 403);
    const [business, drafts, history, retrieved, personalization] = await Promise.all([
      getBusinessKnowledge(row.workspaceId),
      prisma.contentItem.findMany({
        where: { workspaceId: row.workspaceId, deletedAt: null, status: { in: ["DRAFT", "IN_REVIEW"] } },
        orderBy: { updatedAt: "desc" },
        take: 8,
        select: { id: true, brief: true, caption: true, contentType: true, revision: true }
      }),
      workspaceAssistantHistory(row.workspaceId, p.userId),
      searchVaultContext(row.workspaceId, { query: p.message, topK: 8 }),
      personalizationContext(row.workspaceId, p.userId)
    ]);
    const generated = await requestAi("/ai/workspace/conversation", {
      body: {
        workspace_id: row.workspaceId,
        message: p.message,
        locale: p.locale,
        model: await resolveModelSetting("LLM_PRIMARY_MODEL"),
        context: {
          business,
          vault: retrieved,
          personalization: personalization.value,
          drafts,
          campaigns: history
            .filter((t) => t.campaign)
            .map((t) => ({ status: t.campaign!.status, progress: t.campaign!.progress, summary: t.proposal?.summary })),
          today: new Date().toISOString(),
          timezone: "Asia/Bahrain"
        },
        history: history
          .filter((t) => t.id !== row.id && !["THINKING", "FAILED"].includes(t.status))
          .slice(-10)
          .flatMap((t) => [
            { role: "user", text: t.message },
            { role: "assistant", text: t.reply + (t.proposal ? "\n" + t.proposal.summary : "") }
          ])
      },
      parse: (value) =>
        z
          .object({
            model: z.string(),
            prompt_version: z.string(),
            tokens_in: z.number().int().nonnegative(),
            tokens_out: z.number().int().nonnegative(),
            result: workspaceAssistantResultSchema
          })
          .parse(value)
    });
    const parsed = workspaceAssistantResultSchema.parse(generated.result);
    const proposal = parsed.proposal;
    if (proposal?.action === "CAMPAIGN") {
      proposal.startsAt = proposal.startsAt ?? p.startsAt;
      proposal.durationDays = proposal.durationDays ?? 7;
      proposal.publishesPerDay = proposal.publishesPerDay ?? 1;
      const format = new Intl.DateTimeFormat(p.locale === "ar" ? "ar-BH" : "en-GB", { dateStyle: "medium", timeZone: "Asia/Bahrain" });
      const start = new Date(proposal.startsAt),
        end = new Date(start);
      end.setUTCDate(end.getUTCDate() + proposal.durationDays - 1);
      const date = `${format.format(start)} – ${format.format(end)}`;
      proposal.summary =
        proposal.summary.slice(0, 800) +
        `\n${date} · ${proposal.durationDays} ${p.locale === "ar" ? "يوم" : "days"} · ${proposal.publishesPerDay}/${p.locale === "ar" ? "يوم" : "day"}`;
    }
    const target = proposal?.action === "EDIT_CONTENT" ? drafts.find((d) => d.id === proposal.contentItemId) : null;
    if (proposal?.action === "EDIT_CONTENT" && !target) throw new ConversationError("ASSISTANT_DRAFT_UNAVAILABLE", "Choose a current editable draft.");
    if (proposal?.action === "CONTENT" && !proposal.contentType) throw new ConversationError("AI_OUTPUT_INVALID", "A content format is required.");
    await prisma.$transaction(async (tx) => {
      if (!(await canContinue(row.workspaceId, p.userId, tx))) throw new ConversationError("ASSISTANT_ACCESS_CHANGED", "Access changed", 403);
      const changed = await tx.aiInteraction.updateMany({
        where: { id: row.id, workspaceId: row.workspaceId, model: "working", deletedAt: null },
        data: {
          model: generated.model,
          promptVersion: generated.prompt_version,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          response: json({
            status: proposal ? "PROPOSED" : "DISCUSSION",
            reply: generated.result.reply,
            proposal,
            ...(proposal ? { confirmationToken: randomUUID(), ...(target ? { baseRevision: target.revision } : {}) } : {})
          })
        }
      });
      if (changed.count) {
        const remembered = await applyPersonalMemory(tx, {
          workspaceId: row.workspaceId,
          userId: p.userId,
          sourceId: row.id,
          sourceAt: row.createdAt,
          message: p.message,
          updates: parsed.memoryUpdates ?? []
        });
        if (remembered) {
          const receipt = await tx.aiInteraction.findUniqueOrThrow({ where: { id: row.id } });
          await tx.aiInteraction.update({
            where: { id: row.id },
            data: {
              response: json({
                ...state(receipt),
                reply: `${parsed.reply}\n\n${p.locale === "ar" ? "حُدّثت تفضيلاتك المحفوظة لهذه المساحة." : "Your saved preferences for this workspace are updated."}`
              })
            }
          });
        }
        await recordAiTokenUsage({ client: tx, workspaceId: row.workspaceId, tokensIn: generated.tokens_in, tokensOut: generated.tokens_out });
      }
    });
  } catch (error) {
    await prisma.aiInteraction.updateMany({
      where: { id: row.id, workspaceId: row.workspaceId, model: "working" },
      data: {
        model: "failed",
        response: json({
          status: "FAILED",
          proposal: null,
          errorCode: error instanceof AiServiceRequestError || error instanceof ConversationError ? error.code : "ASSISTANT_FAILED",
          reply:
            p.locale === "ar"
              ? "تعذّر إكمال الطلب. لم تُجرَ تغييرات. حاول برسالة جديدة."
              : "I couldn’t complete that request. No changes were made. Try a new message."
        })
      }
    });
  }
}

export async function confirmWorkspacePlan(workspaceId: string, userId: string, id: string, token: string) {
  if (!(await canContinue(workspaceId, userId))) throw new ConversationError("ASSISTANT_ACCESS_CHANGED", "Access changed", 403);
  const row = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM ai_interactions WHERE id=${id}::uuid AND "workspaceId"=${workspaceId}::uuid FOR UPDATE`;
    const row = await tx.aiInteraction.findFirst({ where: { id, ...owned(workspaceId, userId) } });
    if (!row) throw new ConversationError("ASSISTANT_NOT_FOUND", "This proposal was not found.", 404);
    const s = state(row);
    if (s.confirmationToken !== token || !s.proposal)
      throw new ConversationError("ASSISTANT_CONFIRMATION_INVALID", "This confirmation does not match the plan.");
    if (row.accepted) return row;
    if (s.status !== "PROPOSED") throw new ConversationError("ASSISTANT_PLAN_UNAVAILABLE", "Prepare a new plan.");
    if (await tx.aiInteraction.findFirst({ where: { ...owned(workspaceId, userId), createdAt: { gt: row.createdAt } } }))
      throw new ConversationError("ASSISTANT_PLAN_SUPERSEDED", "Confirm your latest plan instead.");
    if (s.proposal.action === "CONTENT") {
      const content = await createContentAggregate(tx, workspaceId, {
        platform: "INSTAGRAM",
        contentType: s.proposal.contentType ?? "POST",
        brief: s.proposal.instruction.slice(0, 1000)
      });
      s.contentItemId = content.id;
      s.baseRevision = content.revision;
      s.contentRequestId = randomUUID();
    } else if (s.proposal.action === "EDIT_CONTENT") {
      if (!s.baseRevision) throw new ConversationError("ASSISTANT_PLAN_UNAVAILABLE", "Prepare a fresh plan.");
      const draft = await tx.contentItem.findFirst({
        where: { id: s.proposal.contentItemId!, workspaceId, deletedAt: null, status: { in: ["DRAFT", "IN_REVIEW"] }, revision: s.baseRevision }
      });
      if (!draft) throw new ConversationError("CONTENT_REVISION_CONFLICT", "The draft changed. Ask MARKOS for an updated plan.");
      s.contentItemId = draft.id;
      s.contentRequestId = randomUUID();
    }
    s.status = "EXECUTING";
    s.executionClaimed = false;
    return tx.aiInteraction.update({ where: { id: row.id }, data: { accepted: true, response: json(s) } });
  });
  return currentRecord(row);
}

async function executeWorkspacePlan(row: AiInteraction) {
  const workspaceId = row.workspaceId,
    userId = (row.prompt as unknown as Prompt).userId;
  const s = state(row),
    p = row.prompt as unknown as Prompt;
  if (s.status !== "EXECUTING") return record(row);
  try {
    if (!(await canContinue(workspaceId, userId))) throw new ConversationError("ASSISTANT_ACCESS_CHANGED", "Access changed", 403);
    if (s.contentItemId && s.contentRequestId && s.baseRevision) {
      await submitConversationTurn(
        workspaceId,
        userId,
        s.contentItemId,
        { requestId: s.contentRequestId, expectedRevision: s.baseRevision, message: s.proposal!.instruction, locale: p.locale },
        row.id
      );
    } else if (s.proposal!.action === "CAMPAIGN") {
      await queueCampaignGeneration(workspaceId, userId, row.id, {
        objective: s.proposal!.summary.slice(0, 500),
        description: s.proposal!.instruction,
        durationDays: s.proposal!.durationDays ?? 7,
        publishesPerDay: s.proposal!.publishesPerDay ?? 1,
        startsAt: s.proposal!.startsAt ?? p.startsAt,
        locale: p.locale
      });
      s.campaignRequestId = row.id;
    } else if (s.proposal!.action === "STRATEGY") {
      const result = await runWorkspaceAgent(workspaceId, { agent: "MARKETING_STRATEGIST", task: s.proposal!.instruction, locale: p.locale }, p.userId);
      s.strategy = result.output;
    }
    s.status = "COMPLETED";
    s.reply =
      p.locale === "ar"
        ? s.strategy
          ? "استراتيجيتك جاهزة للمراجعة."
          : "بدأت العمل على خطتك. يمكنك فتحها ومتابعة النتيجة."
        : s.strategy
          ? "Your strategy is ready to review."
          : "I’ve started your plan. Open it to follow progress and review the result.";
    return record(await prisma.aiInteraction.update({ where: { id: row.id }, data: { response: json(s) } }));
  } catch (error) {
    s.status = "FAILED";
    s.errorCode = error instanceof ConversationError || error instanceof AiServiceRequestError ? error.code : "ASSISTANT_EXECUTION_FAILED";
    s.reply =
      p.locale === "ar"
        ? "تعذّر إكمال الخطة. راجع المسودة قبل إرسال طلب جديد."
        : "I couldn’t finish this plan. Review any draft below before sending a new request.";
    return record(await prisma.aiInteraction.update({ where: { id: row.id }, data: { response: json(s) } }));
  }
}
