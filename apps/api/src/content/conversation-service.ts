import { Prisma } from "@prisma/client";
import type { ContentConversationRecord, ConversationTurnInput, ConversationRunStatus } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { hasPermissions } from "../auth/rbac";
import { respondToConversation, conversationResultSchema } from "../ai/conversation-client";
import { AiServiceRequestError } from "../ai/request";
import { recordAiTokenUsage } from "../usage/usage-service";
import { ContentConflictError } from "./content-conflict";
import { getContentToneLock, toContentRecord } from "./content-service";

export class ConversationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409
  ) {
    super(message);
  }
}

async function contentForWorkspace(workspaceId: string, id: string) {
  const content = await prisma.contentItem.findFirst({ where: { id, workspaceId, deletedAt: null } });
  if (!content) throw new ConversationError("CONTENT_NOT_FOUND", "This post was not found.", 404);
  return content;
}

export async function getContentConversation(workspaceId: string, contentItemId: string): Promise<ContentConversationRecord> {
  const content = await contentForWorkspace(workspaceId, contentItemId);
  const conversation = await prisma.contentConversation.findFirst({
    where: { workspaceId, contentItemId },
    include: { messages: { orderBy: [{ createdAt: "asc" }, { id: "asc" }] }, runs: { orderBy: { createdAt: "desc" }, take: 1 } }
  });
  const run = conversation?.runs[0];
  const result = run?.result ? conversationResultSchema.safeParse(run.result) : undefined;
  return {
    id: conversation?.id ?? null,
    contentItem: toContentRecord(content),
    messages:
      conversation?.messages.map((m) => ({
        id: m.id,
        runId: m.runId,
        role: m.role as "user" | "assistant",
        text: m.text,
        createdAt: m.createdAt.toISOString()
      })) ?? [],
    latestRun: run
      ? {
          id: run.id,
          requestId: run.requestId,
          status: run.status as ConversationRunStatus,
          errorCode: run.errorCode,
          proposedCaption: run.status === "CONFLICT" && result?.success ? (result.data.changes?.caption ?? null) : null
        }
      : null
  };
}

export async function submitConversationTurn(workspaceId: string, userId: string, contentItemId: string, input: ConversationTurnInput) {
  await contentForWorkspace(workspaceId, contentItemId);
  try {
    await prisma.$transaction(async (tx) => {
      // Serialize submission with any content write. A duplicate request is resolved
      // before checking the revision, including retries after a successful response.
      await tx.$queryRaw`SELECT id FROM content_items WHERE id = ${contentItemId}::uuid AND "workspaceId" = ${workspaceId}::uuid FOR UPDATE`;
      const conversation = await tx.contentConversation.upsert({
        where: { contentItemId },
        create: { workspaceId, contentItemId },
        update: {}
      });
      const existing = await tx.conversationRun.findUnique({
        where: { conversationId_requestId: { conversationId: conversation.id, requestId: input.requestId } }
      });
      if (existing) {
        if (
          existing.userId !== userId ||
          existing.instruction !== input.message ||
          existing.locale !== input.locale ||
          existing.baseRevision !== input.expectedRevision
        ) {
          throw new ConversationError("CONVERSATION_REQUEST_MISMATCH", "This request ID belongs to a different message.");
        }
        return;
      }
      const content = await tx.contentItem.findFirst({ where: { id: contentItemId, workspaceId, deletedAt: null } });
      if (!content) throw new ConversationError("CONTENT_NOT_FOUND", "This post was not found.", 404);
      if (content.revision !== input.expectedRevision) throw new ContentConflictError();
      const active = await tx.conversationRun.findFirst({ where: { conversationId: conversation.id, status: { in: ["QUEUED", "RUNNING"] } } });
      if (active) throw new ConversationError("CONVERSATION_BUSY", "MARKOS is still working on the previous message.");
      const run = await tx.conversationRun.create({
        data: {
          workspaceId,
          conversationId: conversation.id,
          userId,
          requestId: input.requestId,
          instruction: input.message,
          locale: input.locale,
          baseRevision: content.revision
        }
      });
      await tx.conversationMessage.create({ data: { workspaceId, conversationId: conversation.id, runId: run.id, role: "user", text: input.message } });
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002")
      throw new ConversationError("CONVERSATION_BUSY", "MARKOS is still working on the previous message.");
    throw error;
  }
  return getContentConversation(workspaceId, contentItemId);
}

function failureText(locale: string, conflict: boolean) {
  if (locale === "ar")
    return conflict
      ? "تغيّر المنشور أثناء العمل. لم أطبّق النتيجة على النص الأحدث. راجع المسودة الحالية قبل إعادة الطلب."
      : "لم تكتمل هذه الرسالة ولم تُحفظ تغييرات منها. يمكنك المحاولة برسالة جديدة.";
  return conflict
    ? "The post changed while I was working. I did not apply this result over the newer draft. Review the current draft before asking again."
    : "This message could not be completed. No changes from it were saved. You can try again with a new message.";
}

async function failRun(id: string, code: string, status = "FAILED") {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.conversationRun.updateMany({ where: { id, status: "RUNNING" }, data: { status, errorCode: code, leaseExpiresAt: null } });
    if (!claimed.count) return;
    const run = await tx.conversationRun.findUniqueOrThrow({ where: { id } });
    await tx.conversationMessage.create({
      data: {
        workspaceId: run.workspaceId,
        conversationId: run.conversationId,
        runId: id,
        role: "assistant",
        text: failureText(run.locale, status === "CONFLICT")
      }
    });
  });
}

async function canContinue(workspaceId: string, userId: string, tx: Prisma.TransactionClient = prisma) {
  const [member, user, workspace] = await Promise.all([
    tx.workspaceMember.findFirst({ where: { workspaceId, userId, deletedAt: null } }),
    tx.user.findFirst({ where: { id: userId, deletedAt: null, isVerified: true } }),
    tx.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } })
  ]);
  return !!member && !!user && !!workspace && hasPermissions([member.role], ["content:write"]);
}

export async function processConversationRuns(workspaceId?: string) {
  const scope = workspaceId ? { workspaceId } : {};
  const expired = await prisma.conversationRun.findMany({ where: { ...scope, status: "RUNNING", leaseExpiresAt: { lte: new Date() } }, take: 20 });
  for (const run of expired) await failRun(run.id, "CONVERSATION_INTERRUPTED");
  const candidate = await prisma.conversationRun.findFirst({ where: { ...scope, status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return;
  const leaseExpiresAt = new Date(Date.now() + Math.max(120_000, env.AI_HTTP_TIMEOUT_MS + 60_000));
  const claimed = await prisma.conversationRun.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "RUNNING", leaseExpiresAt } });
  if (!claimed.count) return;
  try {
    const conversation = await prisma.contentConversation.findUniqueOrThrow({ where: { id: candidate.conversationId } });
    const current = await contentForWorkspace(candidate.workspaceId, conversation.contentItemId);
    if (!(await canContinue(candidate.workspaceId, candidate.userId))) throw new ConversationError("CONVERSATION_ACCESS_CHANGED", "Access changed.");
    if (current.revision !== candidate.baseRevision) {
      await failRun(candidate.id, "CONTENT_REVISION_CONFLICT", "CONFLICT");
      return;
    }
    const [tone, profile, offerings, campaign, messages] = await Promise.all([
      getContentToneLock(candidate.workspaceId),
      prisma.knowledgeVault.findMany({
        where: { workspaceId: candidate.workspaceId, deletedAt: null, section: { in: ["COMPANY", "AUDIENCE"] } },
        select: { id: true, key: true, section: true, value: true, version: true },
        take: 8,
        orderBy: { updatedAt: "desc" }
      }),
      prisma.offering.findMany({
        where: { workspaceId: candidate.workspaceId, deletedAt: null, status: "ACTIVE" },
        select: { id: true, name: true, kind: true, description: true, priceType: true, priceMinor: true, currency: true, version: true },
        take: 20,
        orderBy: { updatedAt: "desc" }
      }),
      current.campaignId
        ? prisma.campaign.findFirst({
            where: { id: current.campaignId, workspaceId: candidate.workspaceId, deletedAt: null },
            select: { id: true, title: true, objective: true, version: true }
          })
        : Promise.resolve(null),
      prisma.conversationMessage.findMany({
        where: { conversationId: conversation.id, workspaceId: candidate.workspaceId, runId: { not: candidate.id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20
      })
    ]);
    const context = { profile, offerings, campaign, tone: tone.lock, brand: tone.context, offeringsMayBePartial: offerings.length === 20 };
    const generated = await respondToConversation({
      workspace_id: candidate.workspaceId,
      locale: candidate.locale,
      message: candidate.instruction,
      current: toContentRecord(current),
      context,
      history: messages.reverse().map(({ role, text }) => ({ role, text })),
      summary: conversation.summary
    });
    // Validate again at the application boundary, even when a test/provider adapter is substituted.
    const result = conversationResultSchema.parse(generated.result);
    const changes = result.changes;
    if ((changes?.carousel && current.contentType !== "CAROUSEL") || (changes?.reelScript && current.contentType !== "REEL"))
      throw new ConversationError("AI_OUTPUT_INVALID", "Unexpected format change.");
    await prisma.$transaction(async (tx) => {
      const owned = await tx.conversationRun.updateMany({
        where: { id: candidate.id, status: "RUNNING", leaseExpiresAt: { gt: new Date() } },
        data: { status: "RUNNING" }
      });
      if (!owned.count) return;
      if (!(await canContinue(candidate.workspaceId, candidate.userId, tx))) throw new ConversationError("CONVERSATION_ACCESS_CHANGED", "Access changed.");
      let conflict = false;
      let revision = current.revision;
      const data = Object.fromEntries(Object.entries(changes ?? {}).filter(([, value]) => value !== null));
      if (Object.keys(data).length) {
        const applied = await tx.contentItem.updateMany({
          where: { id: current.id, workspaceId: candidate.workspaceId, revision: current.revision, deletedAt: null, status: { in: ["DRAFT", "IN_REVIEW"] } },
          data: { ...data, aiPromptUsed: generated.prompt_version }
        });
        conflict = applied.count !== 1;
        if (!conflict) revision += 1;
      }
      const status = conflict ? "CONFLICT" : "SUCCEEDED";
      await tx.conversationRun.update({
        where: { id: candidate.id },
        data: { status, result: result as unknown as Prisma.InputJsonValue, errorCode: conflict ? "CONTENT_REVISION_CONFLICT" : null, leaseExpiresAt: null }
      });
      await tx.conversationMessage.create({
        data: {
          workspaceId: candidate.workspaceId,
          conversationId: conversation.id,
          runId: candidate.id,
          role: "assistant",
          text: conflict
            ? failureText(candidate.locale, true) +
              (changes?.caption == null
                ? ""
                : `\n\n${candidate.locale === "ar" ? "النص المقترح الذي لم يُحفظ:" : "Proposed caption, not saved:"}\n${changes.caption}`)
            : result.reply
        }
      });
      if (!conflict) await tx.contentConversation.update({ where: { id: conversation.id }, data: { summary: result.summary } });
      await tx.aiInteraction.create({
        data: {
          workspaceId: candidate.workspaceId,
          agent: "CREATE_CONVERSATION",
          conversationRunId: candidate.id,
          contentItemId: current.id,
          contentRevision: revision,
          model: generated.model,
          promptVersion: generated.prompt_version,
          prompt: { instruction: candidate.instruction, baseRevision: candidate.baseRevision, context } as unknown as Prisma.InputJsonValue,
          response: { result, applied: !conflict && Object.keys(data).length > 0 } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: "BHD"
        }
      });
      await recordAiTokenUsage({ client: tx, workspaceId: candidate.workspaceId, tokensIn: generated.tokens_in, tokensOut: generated.tokens_out });
    });
  } catch (error) {
    // Do not automatically repeat an ambiguous provider request or an application write.
    await failRun(candidate.id, error instanceof AiServiceRequestError || error instanceof ConversationError ? error.code : "CONVERSATION_FAILED");
  }
}
