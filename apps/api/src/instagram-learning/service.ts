import type { Prisma } from "@prisma/client";
import type { InstagramLearningRecord, UpdateBusinessKnowledge } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { getDecryptedCredential } from "../workspace/instagram-connection-service";
import { collectInstagramEvidence } from "./evidence";
import { generateInstagramLearning } from "../ai/instagram-learning-client";
import { learningApprovalSchema, learningResultSchema } from "./contracts";
import { applyBusinessKnowledgeChanges, readStoredKnowledge } from "../business-profile/knowledge-service";
import { lockWorkspaceKnowledge } from "../vault/vault-service";
import { recordAiTokenUsage } from "../usage/usage-service";
import { env } from "../config/env";
import { z } from "zod";

export const LEARNING_AGENT = "INSTAGRAM_INITIAL_LEARNING";
const json = (value: unknown): Prisma.InputJsonValue => JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
function failure(code: string, message: string, statusCode = 409) {
  return Object.assign(new Error(message), { code, statusCode });
}
function toRecord(row: { id: string; response: Prisma.JsonValue }): InstagramLearningRecord {
  return { ...(row.response as unknown as Omit<InstagramLearningRecord, "id">), id: row.id };
}

export async function getInstagramLearning(workspaceId: string): Promise<InstagramLearningRecord | null> {
  const row = await prisma.aiInteraction.findFirst({ where: { workspaceId, agent: LEARNING_AGENT, deletedAt: null }, orderBy: { createdAt: "desc" } });
  return row ? toRecord(row) : null;
}

export async function startInstagramLearning(workspaceId: string): Promise<InstagramLearningRecord> {
  const credential = await getDecryptedCredential(workspaceId);
  if (!credential || credential.tokenExpiresAt <= new Date()) throw failure("INSTAGRAM_NOT_CONNECTED", "Connect Instagram before learning from the account.");
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const existing = await tx.aiInteraction.findFirst({ where: { workspaceId, agent: LEARNING_AGENT, deletedAt: null }, orderBy: { createdAt: "desc" } });
    if (existing) return toRecord(existing);
    const { stored, version } = await readStoredKnowledge(tx, workspaceId);
    if (!stored.approved) throw failure("ONBOARDING_REQUIRED", "Complete business onboarding first.");
    const current = {
      toneWords: stored.modules.brand.toneWords ?? [],
      voiceNotes: stored.modules.brand.voiceNotes ?? "",
      aestheticWords: stored.modules.brand.aestheticWords ?? [],
      colors: stored.modules.brand.colors ?? [],
      contentDirection: stored.modules.objectives.contentDirection ?? ""
    };
    const row = await tx.aiInteraction.create({
      data: {
        workspaceId,
        agent: LEARNING_AGENT,
        promptVersion: "instagram-initial-learning.v1",
        prompt: { accountId: credential.providerAccountId },
        response: json({ status: "PENDING", expectedVersion: version, current }),
        accepted: false,
        regenerated: false,
        edited: false,
        tokensIn: 0,
        tokensOut: 0,
        costMinor: 0,
        currency: "BHD",
        model: "not-requested"
      }
    });
    return toRecord(row);
  });
}

async function ownedRun(tx: Prisma.TransactionClient, workspaceId: string, id: string) {
  const row = await tx.aiInteraction.findFirst({ where: { id, workspaceId, agent: LEARNING_AGENT, deletedAt: null } });
  if (!row) throw failure("LEARNING_NOT_FOUND", "This Instagram exploration was not found.", 404);
  return row;
}

/** Request-owned operation, with visible persisted stages. No additional worker/polling loop. */
export async function analyzeInstagramLearning(workspaceId: string, id: string, locale: "en" | "ar"): Promise<InstagramLearningRecord> {
  const claimed = await prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const row = await ownedRun(tx, workspaceId, id);
    const run = toRecord(row);
    if (!["PENDING", "FAILED"].includes(run.status)) return { run, execute: false };
    const next: InstagramLearningRecord = { ...run, status: "COLLECTING" };
    delete next.error;
    await tx.aiInteraction.update({ where: { id }, data: { response: json(next) } });
    return { run: next, execute: true };
  });
  if (!claimed.execute) return claimed.run;
  let run = claimed.run;
  try {
    // Local safe mode must never contact Instagram, even if a credential happens to exist.
    if (env.INSTAGRAM_ANALYTICS_SYNC_MODE !== "live")
      throw failure("INSTAGRAM_LEARNING_DISABLED", "Instagram exploration requires live analytics mode. Local safe mode does not read Instagram.");
    const credential = await getDecryptedCredential(workspaceId);
    if (!credential || credential.tokenExpiresAt <= new Date()) throw failure("INSTAGRAM_NOT_CONNECTED", "Reconnect Instagram before trying again.");
    const { evidence, visuals } = await collectInstagramEvidence({
      accountId: credential.providerAccountId,
      username: credential.username,
      accessToken: credential.accessToken
    });
    if (visuals.length < evidence.posts.length) evidence.warnings.push("SOME_COVERS_UNAVAILABLE");
    run = { ...run, status: "ANALYZING", evidence };
    await prisma.aiInteraction.updateMany({ where: { id, workspaceId, agent: LEARNING_AGENT }, data: { response: json(run) } });
    const generated = evidence.posts.length
      ? await generateInstagramLearning({ workspace_id: workspaceId, locale, evidence, visuals, current: run.current })
      : null;
    const result = generated
      ? learningResultSchema.parse(generated.result)
      : {
          summary: locale === "ar" ? "لا توجد منشورات متاحة للتعلم منها بعد." : "There are no available posts to learn from yet.",
          suggestions: [],
          limitations: [locale === "ar" ? "يمكنك المتابعة باستخدام ملف نشاطك الحالي." : "You can continue using your current business profile."]
        };
    const ids = new Set(evidence.posts.map((post) => post.id));
    // A palette is optional visual evidence, never a replacement for approved brand colors.
    const visualIds = new Set(visuals.map((visual) => visual.id));
    result.suggestions = result.suggestions.filter(
      (suggestion) =>
        suggestion.field !== "colors" ||
        (!run.current.colors?.length && suggestion.sourcePostIds.length > 0 && suggestion.sourcePostIds.every((id) => visualIds.has(id)))
    );
    if (result.suggestions.some((suggestion) => !suggestion.sourcePostIds.length || suggestion.sourcePostIds.some((source) => !ids.has(source)))) {
      throw failure("AI_OUTPUT_INVALID", "The learning result included unsupported evidence. Please retry.", 502);
    }
    run = { ...run, status: "READY", result };
    await prisma.$transaction(async (tx) => {
      await tx.aiInteraction.updateMany({
        where: { id, workspaceId, agent: LEARNING_AGENT },
        data: {
          response: json(run),
          ...(generated
            ? { model: generated.model, promptVersion: generated.prompt_version, tokensIn: generated.tokens_in, tokensOut: generated.tokens_out }
            : {})
        }
      });
      if (generated) await recordAiTokenUsage({ client: tx, workspaceId, tokensIn: generated.tokens_in, tokensOut: generated.tokens_out, now: new Date() });
    });
    return run;
  } catch (e) {
    const code = e instanceof Error && "code" in e && typeof e.code === "string" ? e.code : "INSTAGRAM_LEARNING_FAILED";
    run = { ...run, status: "FAILED", error: code };
    await prisma.aiInteraction.updateMany({ where: { id, workspaceId, agent: LEARNING_AGENT }, data: { response: json(run) } });
    return run;
  }
}

export async function approveInstagramLearning(
  workspaceId: string,
  id: string,
  input: z.infer<typeof learningApprovalSchema>
): Promise<InstagramLearningRecord> {
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const row = await ownedRun(tx, workspaceId, id);
    const run = toRecord(row);
    if (run.status === "APPROVED") return run;
    if (run.status !== "READY" || !run.result) throw failure("LEARNING_NOT_READY", "Review the completed exploration first.");
    if (input.expectedVersion !== run.expectedVersion)
      throw failure("KNOWLEDGE_REVISION_CONFLICT", "The profile changed. Review the current values before saving.");
    const offered = new Set(run.result.suggestions.map((item) => item.field));
    if (input.changes.some((change) => !offered.has(change.field))) throw failure("VALIDATION_ERROR", "Only reviewed proposed fields can be saved.", 400);
    if (input.changes.some((change) => change.field === "colors")) {
      const { stored } = await readStoredKnowledge(tx, workspaceId);
      if (Array.isArray(stored.modules.brand.colors) && stored.modules.brand.colors.length)
        throw failure("KNOWLEDGE_REVISION_CONFLICT", "Brand colors are already saved. Keep the current palette.");
      const palette = input.changes.find((change) => change.field === "colors")!.value;
      if (!Array.isArray(palette) || !palette.length || palette.length > 7 || palette.some((color) => !/^#[0-9a-f]{6}$/i.test(color)))
        throw failure("VALIDATION_ERROR", "Use one to seven six-digit hex colors.", 400);
    }
    const updates: UpdateBusinessKnowledge[] = (["brand", "objectives"] as const)
      .map((module) => ({
        module,
        expectedVersion: input.expectedVersion,
        changes: Object.fromEntries(
          input.changes.filter((change) => (change.field === "contentDirection") === (module === "objectives")).map((change) => [change.field, change.value])
        )
      }))
      .filter((update) => Object.keys(update.changes).length > 0);
    if (updates.length) await applyBusinessKnowledgeChanges(tx, workspaceId, updates);
    const next: InstagramLearningRecord = { ...run, status: "APPROVED" };
    await tx.aiInteraction.update({ where: { id }, data: { response: json(next), accepted: true, edited: true } });
    return next;
  });
}

export async function skipInstagramLearning(workspaceId: string, id: string): Promise<InstagramLearningRecord> {
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const run = toRecord(await ownedRun(tx, workspaceId, id));
    if (["COLLECTING", "ANALYZING"].includes(run.status)) throw failure("LEARNING_IN_PROGRESS", "Wait for the current exploration to finish.");
    if (run.status === "APPROVED") return run;
    const next: InstagramLearningRecord = { ...run, status: "SKIPPED" };
    await tx.aiInteraction.update({ where: { id }, data: { response: json(next), accepted: false } });
    return next;
  });
}
