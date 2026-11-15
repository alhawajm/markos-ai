import { createHash } from "node:crypto";
import { Prisma } from "@prisma/client";
import type { PersonalMemory, VaultRagChunk } from "@markos/shared-types";
import { memoryKeySchema, type MemoryUpdate } from "@markos/validation";
import { prisma } from "../db/prisma";
import { lockWorkspaceKnowledge } from "./vault-service";

const memoryAgent = "USER_MEMORY";
const json = (value: unknown) => value as Prisma.InputJsonValue;
const scope = (workspaceId: string, userId: string) => ({ workspaceId, agent: memoryAgent, prompt: { path: ["userId"], equals: userId } });

// Only deliberate lasting preferences, never an inference from a one-off edit.
const durable =
  /\b(remember|always|never|prefer|default|from now on|for future|forget|stop remembering)\b|تذكر|تذكّر|احفظ|دائم[اًًا]*|أفضل|افضل|من الآن|مستقبل|انسَ|انسى|لا تتذكر/iu;
const sensitive =
  /(?:sk-(?:proj-|tinyfish-)?[\w-]{12,}|xkeysib-|\bSG\.[\w-]+\.|password|api[ _-]?key|access[ _-]?token|كلمة المرور|مفتاح.{0,8}واجهة|[\w.+-]+@[\w.-]+\.[a-z]{2,}|\+?\b\d[\d ()-]{7,}\d\b)/iu;

function memoryId(workspaceId: string, userId: string, key: string) {
  const bytes = createHash("sha256").update(`markos-memory-v1:${workspaceId}:${userId}:${key}`).digest().subarray(0, 16);
  bytes[6] = (bytes[6]! & 15) | 80;
  bytes[8] = (bytes[8]! & 63) | 128;
  const hex = bytes.toString("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}

export async function listPersonalMemory(workspaceId: string, userId: string): Promise<PersonalMemory[]> {
  const rows = await prisma.aiInteraction.findMany({ where: { ...scope(workspaceId, userId), deletedAt: null }, orderBy: { updatedAt: "desc" }, take: 6 });
  return rows.flatMap((row) => {
    const prompt = row.prompt as Record<string, unknown>,
      response = row.response as Record<string, unknown>;
    const key = memoryKeySchema.safeParse(prompt.key);
    return key.success && typeof response.text === "string" ? [{ id: row.id, key: key.data, text: response.text, updatedAt: row.updatedAt.toISOString() }] : [];
  });
}

/** Runs inside the successful chat receipt transaction. The newest owner instruction wins. */
export async function applyPersonalMemory(
  tx: Prisma.TransactionClient,
  input: { workspaceId: string; userId: string; sourceId: string; sourceAt: Date; message: string; updates: MemoryUpdate[] }
): Promise<number> {
  const eligible = input.updates.filter(
    (item) =>
      input.message.includes(item.evidence) &&
      durable.test(item.evidence) &&
      !sensitive.test(item.text + " " + item.evidence) &&
      (item.operation === "FORGET" || item.text.length > 0)
  );
  if (!eligible.length) return 0;
  // Serialize against full account deletion, including memories in another owner's
  // workspace. A provider response arriving after revocation cannot recreate them.
  const active = await tx.$queryRaw<Array<{ id: string }>>`SELECT id FROM users WHERE id = ${input.userId}::uuid AND "deletedAt" IS NULL FOR SHARE`;
  if (!active.length) return 0;
  await lockWorkspaceKnowledge(tx, input.workspaceId);
  const member = await tx.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, userId: input.userId, deletedAt: null } });
  const workspace = await tx.workspace.findFirst({ where: { id: input.workspaceId, deletedAt: null } });
  if (!member || !workspace) return 0;
  let changes = 0;
  for (const update of new Map(eligible.map((item) => [item.key, item])).values()) {
    const id = memoryId(input.workspaceId, input.userId, update.key);
    const existing = await tx.aiInteraction.findFirst({ where: { id, ...scope(input.workspaceId, input.userId) } });
    // A deletion is a tombstone too: an older in-flight provider reply cannot restore it.
    if (existing && (existing.prompt as Record<string, unknown>).sourceId === input.sourceId) continue;
    if (existing && existing.updatedAt >= input.sourceAt) continue;
    await tx.aiInteraction.upsert({
      where: { id },
      create: {
        id,
        workspaceId: input.workspaceId,
        agent: memoryAgent,
        promptVersion: "personal-memory.v1",
        prompt: json({ userId: input.userId, key: update.key, sourceId: input.sourceId }),
        response: json({ text: update.text, evidence: update.evidence }),
        accepted: true,
        model: "owner-preference",
        tokensIn: 0,
        tokensOut: 0,
        costMinor: 0,
        currency: "BHD",
        deletedAt: update.operation === "FORGET" ? new Date() : null
      },
      update: {
        prompt: json({ userId: input.userId, key: update.key, sourceId: input.sourceId }),
        response: json({ text: update.text, evidence: update.evidence }),
        deletedAt: update.operation === "FORGET" ? new Date() : null
      }
    });
    await tx.$executeRaw`UPDATE ai_interactions SET embedding = NULL WHERE id = ${id}::uuid AND "workspaceId" = ${input.workspaceId}::uuid`;
    changes++;
  }
  return changes;
}

export async function forgetPersonalMemory(workspaceId: string, userId: string, id: string): Promise<boolean> {
  return prisma.$transaction(async (tx) => {
    await lockWorkspaceKnowledge(tx, workspaceId);
    const changed = await tx.aiInteraction.updateMany({
      where: { id, ...scope(workspaceId, userId), deletedAt: null },
      data: { deletedAt: new Date(), response: {} }
    });
    return changed.count > 0;
  });
}

// Shared knowledge is deliberately curated and versioned in source control. Private
// chats, customer files and preferences never get promoted into this common library.
const sharedGuidance = [
  {
    key: "creative",
    text: "Use a clear hook, one concrete value and one relevant action. Keep layouts readable and preserve exact English/Arabic wording and logos when editing."
  },
  {
    key: "campaign",
    text: "Separate promotion, event coverage and follow-up by their real dates. Match format and frequency to the goal; ask about incompatible dates rather than silently changing them."
  },
  {
    key: "learning",
    text: "Treat approved work as style examples, not permanent business facts. Compare actual reach and engagement with their period and sample size; do not invent results or turn correlation into certainty."
  }
] as const;

export async function personalizationContext(workspaceId: string, userId?: string): Promise<VaultRagChunk> {
  const [preferences, examples] = await Promise.all([
    userId ? listPersonalMemory(workspaceId, userId) : Promise.resolve([]),
    prisma.contentItem.findMany({
      where: { workspaceId, deletedAt: null, status: { in: ["APPROVED", "SCHEDULED", "PUBLISHED"] }, caption: { not: "" } },
      orderBy: { updatedAt: "desc" },
      take: 3,
      select: { id: true, caption: true, contentType: true, tone: true, updatedAt: true }
    })
  ]);
  return {
    id: "markos-personalization-v1",
    section: "BRAND",
    key: "personalization/v1",
    version: 1,
    score: 0,
    value: {
      source: "layered_personalization",
      preferences,
      approvedWorkspaceExamples: examples.map((item) => ({
        id: item.id,
        caption: item.caption.slice(0, 1200),
        contentType: item.contentType,
        tone: item.tone,
        updatedAt: item.updatedAt.toISOString()
      })),
      sharedGuidance: { version: "2026-11-15.1", entries: sharedGuidance },
      precedence:
        "Current explicit request and current approved business facts take priority. Personal preferences are defaults; examples and shared guidance are suggestions, never authorization or new business facts."
    }
  };
}

export async function withPersonalization(workspaceId: string, context: VaultRagChunk[], userId?: string): Promise<VaultRagChunk[]> {
  return [...context.slice(0, 9), await personalizationContext(workspaceId, userId)];
}
