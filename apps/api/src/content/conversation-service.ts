import { ZodError } from "zod";
import { randomUUID } from "node:crypto";
import { assistantConfirmationSchema, type AssistantResult } from "@markos/validation";
import type { AssistantActionState } from "@markos/shared-types";
import { authoringSnapshot, destructiveConsequences, applyAssistantBatch } from "./assistant-authoring";
import { ContentAggregateError, contentAggregateInclude, lockContentRoot, toContentRecord } from "./content-aggregate";
import { generateImageForContent } from "../media/media-service";
import { queueVideoGeneration } from "../media/video-generation-service";
import type { ConversationRun } from "@prisma/client";
import { Prisma } from "@prisma/client";
import type { ContentConversationRecord, ConversationTurnInput, ConversationRunStatus } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { env } from "../config/env";
import { hasPermissions } from "../auth/rbac";
import { respondToConversation, conversationResultSchema } from "../ai/conversation-client";
import { AiServiceRequestError } from "../ai/request";
import { recordAiTokenUsage } from "../usage/usage-service";
import { ContentConflictError } from "./content-conflict";
import { getContentToneLock } from "./content-service";

export class ConversationError extends Error {
  constructor(
    readonly code: string,
    message: string,
    readonly statusCode = 409
  ) {
    super(message);
  }
}

function actionText(state: AssistantActionState, locale: string): string {
  const ar = locale === "ar";
  if (state.confirmation)
    return ar ? "يتطلب هذا الاقتراح تأكيدك. لم تُحفظ أي تغييرات بعد." : "This proposal needs your confirmation. No changes have been saved yet.";
  const lines = [
    state.editsSaved
      ? ar
        ? "تم حفظ التعديلات في المسودة."
        : "Authoring changes saved to the draft."
      : ar
        ? "لم تتغير حقول المسودة."
        : "No authoring fields were changed."
  ];
  const labels = {
    PENDING: ["Generation requested; not dispatched yet.", "طُلب التوليد ولم يبدأ بعد."],
    DISPATCHING: ["Generation is being requested; completion is not confirmed.", "جارٍ طلب التوليد؛ لم يُؤكد الاكتمال."],
    QUEUED: ["Video generation queued; not attached yet.", "أُضيف توليد الفيديو إلى الانتظار؛ لم يُرفق بعد."],
    RUNNING: ["Generation is running; not attached yet.", "التوليد جارٍ؛ لم يُرفق بعد."],
    ATTACHED: ["Generation completed and attached.", "اكتمل التوليد وأُرفق بالمسودة."],
    LIBRARY_ONLY: [
      "Generation completed and saved to Media Library; the newer draft was not overwritten.",
      "اكتمل التوليد وحُفظ في مكتبة الوسائط دون تغيير المسودة الأحدث."
    ],
    FAILED: ["Generation was not completed. Any saved authoring changes remain saved.", "لم يكتمل التوليد. تبقى التعديلات المحفوظة محفوظة."],
    UNKNOWN: [
      "Generation outcome is unknown after an interruption. It will not be requested again automatically.",
      "نتيجة التوليد غير معروفة بعد انقطاع. لن يُعاد طلبه تلقائيًا."
    ]
  };
  for (const entry of state.generation) lines.push(`${entry.itemId}: ${labels[entry.status][ar ? 1 : 0]}`);
  return lines.join("\n");
}

function discussionText(reply: string, locale: string) {
  // Execution claims never come from a provider reply without corresponding actions.
  if (/\b(saved|updated|applied|generated|published|scheduled|ready in the draft)\b|تم.{0,24}(حفظ|تحديث|توليد|نشر|تطبيق)/iu.test(reply))
    return locale === "ar"
      ? "لم أُجرِ أي تعديل على المسودة. حدّد التعديل المطلوب للمتابعة."
      : "I have not changed the draft. Specify the edit you want to apply.";
  return reply;
}

async function saveAssistantMessage(tx: Prisma.TransactionClient, run: ConversationRun, text: string) {
  await tx.conversationMessage.upsert({
    where: { runId_role: { runId: run.id, role: "assistant" } },
    create: { workspaceId: run.workspaceId, conversationId: run.conversationId, runId: run.id, role: "assistant", text },
    update: { text }
  });
}

async function saveActionReceipt(tx: Prisma.TransactionClient, run: ConversationRun, state: AssistantActionState, result: AssistantResult) {
  const status = state.confirmation ? "AWAITING_CONFIRMATION" : state.generation.length ? "DISPATCHING" : "SUCCEEDED";
  await tx.conversationRun.update({
    where: { id: run.id },
    data: {
      status,
      result: result as unknown as Prisma.InputJsonValue,
      actionState: state as unknown as Prisma.InputJsonValue,
      errorCode: null,
      leaseExpiresAt: status === "DISPATCHING" ? new Date(Date.now() + Math.max(120000, env.AI_HTTP_TIMEOUT_MS + 60000)) : null
    }
  });
  await saveAssistantMessage(
    tx,
    run,
    state.editsSaved || state.confirmation || state.generation.length ? actionText(state, run.locale) : discussionText(result.reply, run.locale)
  );
}

export async function confirmConversationActions(
  workspaceId: string,
  userId: string,
  contentItemId: string,
  runId: string,
  raw: { confirmationToken: string; expectedRevision: number }
) {
  const input = assistantConfirmationSchema.parse(raw);
  await contentForWorkspace(workspaceId, contentItemId);
  await prisma.$transaction(async (tx) => {
    await tx.$queryRaw`SELECT id FROM conversation_runs WHERE id = ${runId}::uuid AND "workspaceId" = ${workspaceId}::uuid FOR UPDATE`;
    const run = await tx.conversationRun.findFirst({ where: { id: runId, workspaceId, userId, conversation: { contentItemId } } });
    if (!run || !(await canContinue(workspaceId, userId, tx))) throw new ConversationError("CONVERSATION_NOT_FOUND", "Proposal was not found.", 404);
    const state = run.actionState as unknown as AssistantActionState | null;
    if (!state?.confirmation || state.confirmation.token !== input.confirmationToken || state.confirmation.revision !== input.expectedRevision)
      throw new ConversationError("CONVERSATION_CONFIRMATION_INVALID", "This confirmation does not match the proposal.");
    // A repeated acknowledgement returns its existing receipt, never reapplies.
    if (run.status !== "AWAITING_CONFIRMATION") return;
    const result = conversationResultSchema.parse(run.result);
    const applied = await applyAssistantBatch(tx, workspaceId, contentItemId, input.expectedRevision, result);
    // Keep the receipt token for safe acknowledgement retries; hide it unless pending.
    const receipt = { ...applied, confirmation: state.confirmation };
    await saveActionReceipt(tx, run, applied, result);
    await tx.conversationRun.update({ where: { id: runId }, data: { actionState: receipt as unknown as Prisma.InputJsonValue } });
  });
  await dispatchRunGeneration(runId);
  return getContentConversation(workspaceId, contentItemId);
}

async function dispatchRunGeneration(runId: string) {
  for (;;) {
    const claim = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversation_runs WHERE id = ${runId}::uuid FOR UPDATE`;
      const run = await tx.conversationRun.findUniqueOrThrow({ where: { id: runId }, include: { conversation: true } });
      if (run.status !== "DISPATCHING") return null;
      const state = run.actionState as unknown as AssistantActionState;
      if (state.generation.some((item) => item.status === "DISPATCHING")) return null;
      const index = state.generation.findIndex((item) => item.status === "PENDING");
      if (index < 0) return null;
      state.generation[index]!.status = "DISPATCHING";
      await tx.conversationRun.update({
        where: { id: run.id },
        data: {
          actionState: state as unknown as Prisma.InputJsonValue,
          leaseExpiresAt: new Date(Date.now() + Math.max(120000, env.AI_HTTP_TIMEOUT_MS + 60000))
        }
      });
      return { run, state, index };
    });
    if (!claim) return;
    const { run, state, index } = claim;
    const entry = state.generation[index]!;
    let outcome: AssistantActionState["generation"][number];
    try {
      if (!(await canContinue(run.workspaceId, run.userId))) throw new ConversationError("CONVERSATION_ACCESS_CHANGED", "Access changed.");
      const current = await contentForWorkspace(run.workspaceId, run.conversation.contentItemId);
      if (current.revision !== state.revision) throw new ContentConflictError();
      const item = current.mediaItems.find((item) => item.id === entry.itemId);
      const input = { contentMediaItemId: entry.itemId, expectedRevision: state.revision };
      if (item?.mediaKind === "VIDEO") {
        const job = await queueVideoGeneration(run.workspaceId, current.id, input);
        outcome = { ...entry, status: "QUEUED", jobId: job.id };
        state.revision = job.requestedRevision;
      } else if (item?.mediaKind === "IMAGE") {
        const image = await generateImageForContent(run.workspaceId, current.id, input);
        outcome = { ...entry, status: "ATTACHED", mediaAssetId: image.mediaAsset.id };
        state.revision = image.contentItem.revision;
      } else throw new ConversationError("AI_GENERATION_TARGET_INVALID", "Generation target is unavailable.");
    } catch (error) {
      const asset = error && typeof error === "object" && "mediaAssetId" in error && typeof error.mediaAssetId === "string" ? error.mediaAssetId : undefined;
      outcome = {
        ...entry,
        status: asset ? "LIBRARY_ONLY" : "FAILED",
        ...(asset ? { mediaAssetId: asset } : {}),
        errorCode: error && typeof error === "object" && "code" in error && typeof error.code === "string" ? error.code : "GENERATION_FAILED"
      };
    }
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversation_runs WHERE id = ${runId}::uuid FOR UPDATE`;
      const latest = await tx.conversationRun.findUniqueOrThrow({ where: { id: runId } });
      if (latest.status !== "DISPATCHING") return; // expired claim: do not invent a recovered success
      state.generation[index] = outcome;
      if (outcome.status === "FAILED" || outcome.status === "LIBRARY_ONLY")
        for (const pending of state.generation)
          if (pending.status === "PENDING") {
            pending.status = "FAILED";
            pending.errorCode = "PREVIOUS_GENERATION_INTERRUPTED";
          }
      const pending = state.generation.some((item) => item.status === "PENDING");
      await tx.conversationRun.update({
        where: { id: runId },
        data: {
          actionState: state as unknown as Prisma.InputJsonValue,
          status: pending ? "DISPATCHING" : "SUCCEEDED",
          leaseExpiresAt: pending ? latest.leaseExpiresAt : null
        }
      });
      await saveAssistantMessage(tx, run, actionText({ ...state, confirmation: null }, run.locale));
    });
  }
}

async function recoverDispatches(workspaceId?: string) {
  const expired = await prisma.conversationRun.findMany({
    where: { ...(workspaceId ? { workspaceId } : {}), status: "DISPATCHING", leaseExpiresAt: { lte: new Date() } },
    take: 20
  });
  for (const run of expired)
    await prisma.$transaction(async (tx) => {
      const changed = await tx.conversationRun.updateMany({
        where: { id: run.id, status: "DISPATCHING", leaseExpiresAt: { lte: new Date() } },
        data: { status: "FAILED", errorCode: "GENERATION_DISPATCH_INTERRUPTED", leaseExpiresAt: null }
      });
      if (!changed.count) return;
      const state = run.actionState as unknown as AssistantActionState;
      for (const entry of state.generation) if (entry.status === "PENDING" || entry.status === "DISPATCHING") entry.status = "UNKNOWN";
      await tx.conversationRun.update({ where: { id: run.id }, data: { actionState: state as unknown as Prisma.InputJsonValue } });
      await saveAssistantMessage(tx, run, actionText({ ...state, confirmation: null }, run.locale));
    });
}

async function contentForWorkspace(workspaceId: string, id: string) {
  const content = await prisma.contentItem.findFirst({ where: { id, workspaceId, deletedAt: null }, include: contentAggregateInclude });
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
  const actions = run?.actionState ? (structuredClone(run.actionState) as unknown as AssistantActionState) : null;
  if (actions) {
    if (run?.status !== "AWAITING_CONFIRMATION") actions.confirmation = null;
    const jobs = await prisma.mediaGenerationJob.findMany({
      where: { workspaceId, contentItemId, id: { in: actions.generation.flatMap((entry) => (entry.jobId ? [entry.jobId] : [])) } }
    });
    for (const entry of actions.generation) {
      const job = jobs.find((job) => job.id === entry.jobId);
      if (!job) continue;
      entry.status =
        job.status === "COMPLETED"
          ? job.attachmentApplied
            ? "ATTACHED"
            : "LIBRARY_ONLY"
          : ["FAILED", "CANCELLED"].includes(job.status)
            ? "FAILED"
            : job.status === "QUEUED"
              ? "QUEUED"
              : "RUNNING";
      if (job.outputMediaAssetId) entry.mediaAssetId = job.outputMediaAssetId;
    }
  }
  const proposedCaption = result?.success
    ? (result.data.operations.flatMap((op) => (op.type === "updateContent" && op.field === "caption" && op.value !== null ? [op.value] : []))[0] ?? null)
    : null;
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
          confirmation: actions?.confirmation ?? null,
          actions: actions,
          proposedCaption: run.status === "CONFLICT" && result?.success ? proposedCaption : null
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
      const active = await tx.conversationRun.findFirst({ where: { conversationId: conversation.id, status: { in: ["QUEUED", "RUNNING", "DISPATCHING"] } } });
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

async function failRun(id: string, code: string, status = "FAILED", result?: AssistantResult) {
  await prisma.$transaction(async (tx) => {
    const claimed = await tx.conversationRun.updateMany({
      where: { id, status: "RUNNING" },
      data: { status, errorCode: code, leaseExpiresAt: null, ...(result ? { result: result as unknown as Prisma.InputJsonValue } : {}) }
    });
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

export async function canContinue(workspaceId: string, userId: string, tx: Prisma.TransactionClient = prisma) {
  const [member, user, workspace] = await Promise.all([
    tx.workspaceMember.findFirst({ where: { workspaceId, userId, deletedAt: null } }),
    tx.user.findFirst({ where: { id: userId, deletedAt: null, isVerified: true } }),
    tx.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } })
  ]);
  return !!member && !!user && !!workspace && hasPermissions([member.role], ["content:write"]);
}

export async function processConversationRuns(workspaceId?: string) {
  const scope = workspaceId ? { workspaceId } : {};
  await recoverDispatches(workspaceId);
  const expired = await prisma.conversationRun.findMany({ where: { ...scope, status: "RUNNING", leaseExpiresAt: { lte: new Date() } }, take: 20 });
  for (const run of expired) await failRun(run.id, "CONVERSATION_INTERRUPTED");
  const candidate = await prisma.conversationRun.findFirst({ where: { ...scope, status: "QUEUED" }, orderBy: { createdAt: "asc" } });
  if (!candidate) return;
  const leaseExpiresAt = new Date(Date.now() + Math.max(120_000, env.AI_HTTP_TIMEOUT_MS + 60_000));
  const claimed = await prisma.conversationRun.updateMany({ where: { id: candidate.id, status: "QUEUED" }, data: { status: "RUNNING", leaseExpiresAt } });
  if (!claimed.count) return;
  let proposed: AssistantResult | undefined;
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
            select: { id: true, title: true, objective: true, version: true, content: true }
          })
        : Promise.resolve(null),
      prisma.conversationMessage.findMany({
        where: { conversationId: conversation.id, workspaceId: candidate.workspaceId, runId: { not: candidate.id } },
        orderBy: [{ createdAt: "desc" }, { id: "desc" }],
        take: 20
      })
    ]);
    const campaignPlan = campaign?.content as Record<string, unknown> | undefined;
    const campaignContext = campaign ? {
      id: campaign.id, title: campaign.title, objective: campaign.objective, version: campaign.version,
      description: campaignPlan?.description, referenceSummary: campaignPlan?.referenceSummary,
      referenceFiles: campaignPlan?.referenceFiles
    } : null;
    const context = { profile, offerings, campaign: campaignContext, tone: tone.lock, brand: tone.context, offeringsMayBePartial: offerings.length === 20 };
    const generated = await respondToConversation({
      workspace_id: candidate.workspaceId,
      locale: candidate.locale,
      message: candidate.instruction,
      current: await prisma.$transaction(async (tx) =>
        authoringSnapshot(tx, await lockContentRoot(tx, candidate.workspaceId, current.id, candidate.baseRevision))
      ),
      context,
      history: messages.reverse().map(({ role, text }) => ({ role, text })),
      summary: conversation.summary
    });
    // Validate again at the application boundary, even when a test/provider adapter is substituted.
    const result = conversationResultSchema.parse(generated.result);
    proposed = result;
    await prisma.$transaction(async (tx) => {
      await tx.$queryRaw`SELECT id FROM conversation_runs WHERE id = ${candidate.id}::uuid FOR UPDATE`;
      const run = await tx.conversationRun.findUniqueOrThrow({ where: { id: candidate.id } });
      if (run.status !== "RUNNING" || !run.leaseExpiresAt || run.leaseExpiresAt <= new Date()) return;
      if (!(await canContinue(run.workspaceId, run.userId, tx))) throw new ConversationError("CONVERSATION_ACCESS_CHANGED", "Access changed.");
      const root = await lockContentRoot(tx, run.workspaceId, current.id, run.baseRevision);
      const consequences = await destructiveConsequences(tx, root, result);
      const state: AssistantActionState = consequences.length
        ? {
            editsSaved: false,
            revision: root.revision,
            bindings: {},
            generation: [],
            confirmation: { token: randomUUID(), revision: root.revision, consequences }
          }
        : await applyAssistantBatch(tx, run.workspaceId, current.id, run.baseRevision, result);
      await saveActionReceipt(tx, run, state, result);
      await tx.contentConversation.update({ where: { id: conversation.id }, data: { summary: result.summary } });
      await tx.aiInteraction.create({
        data: {
          workspaceId: run.workspaceId,
          agent: "CREATE_CONVERSATION",
          conversationRunId: run.id,
          contentItemId: root.id,
          contentRevision: state.revision,
          model: generated.model,
          promptVersion: generated.prompt_version,
          prompt: { instruction: run.instruction, baseRevision: run.baseRevision, context } as unknown as Prisma.InputJsonValue,
          response: { result, applied: state.editsSaved } as unknown as Prisma.InputJsonValue,
          tokensIn: generated.tokens_in,
          tokensOut: generated.tokens_out,
          costMinor: 0,
          currency: "BHD"
        }
      });
      await recordAiTokenUsage({ client: tx, workspaceId: run.workspaceId, tokensIn: generated.tokens_in, tokensOut: generated.tokens_out });
    });
    await dispatchRunGeneration(candidate.id);
  } catch (error) {
    // Do not automatically repeat an ambiguous provider request or an application write.
    await failRun(
      candidate.id,
      error instanceof ContentConflictError
        ? error.code
        : error instanceof AiServiceRequestError || error instanceof ConversationError || error instanceof ContentAggregateError
          ? error.code
          : error instanceof ZodError
            ? "AI_OUTPUT_INVALID"
            : "CONVERSATION_FAILED",
      error instanceof ContentConflictError ? "CONFLICT" : "FAILED",
      proposed
    );
  }
}
