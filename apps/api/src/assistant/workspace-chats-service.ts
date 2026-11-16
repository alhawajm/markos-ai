import { randomUUID } from "node:crypto";
import { Prisma, type WorkspaceChat } from "@prisma/client";
import type { WorkspaceChatRecord, WorkspaceChatPage } from "@markos/shared-types";
import { prisma } from "../db/prisma";
import { ConversationError } from "../content/conversation-service";

export const chatRecord = (row: WorkspaceChat): WorkspaceChatRecord => ({
  id: row.id,
  title: row.title,
  legacy: row.legacyKey !== null,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString()
});
const ownership = (workspaceId: string, userId: string) => ({ workspaceId, userId });
export async function requireWorkspaceChat(workspaceId: string, userId: string, id: string) {
  const row = await prisma.workspaceChat.findFirst({ where: { id, ...ownership(workspaceId, userId) } });
  if (!row) throw new ConversationError("CHAT_NOT_FOUND", "This conversation was not found.", 404);
  return row;
}
export async function legacyWorkspaceChat(workspaceId: string, userId: string, create = false) {
  const old = await prisma.aiInteraction.findFirst({
    where: { workspaceId, agent: "WORKSPACE_ASSISTANT", deletedAt: null, workspaceChatId: null, prompt: { path: ["userId"], equals: userId } },
    select: { id: true }
  });
  let chat = await prisma.workspaceChat.findUnique({ where: { workspaceId_userId_legacyKey: { workspaceId, userId, legacyKey: "HOME" } } });
  if (!chat && (old || create))
    chat = await prisma.workspaceChat.upsert({
      where: { workspaceId_userId_legacyKey: { workspaceId, userId, legacyKey: "HOME" } },
      create: { id: randomUUID(), workspaceId, userId, legacyKey: "HOME", title: "Earlier conversation" },
      update: {}
    });
  if (chat && old)
    await prisma.aiInteraction.updateMany({
      where: { workspaceId, agent: "WORKSPACE_ASSISTANT", deletedAt: null, workspaceChatId: null, prompt: { path: ["userId"], equals: userId } },
      data: { workspaceChatId: chat.id }
    });
  return chat;
}
export async function chatForMessage(workspaceId: string, userId: string, id: string | undefined, message: string) {
  if (!id) return (await legacyWorkspaceChat(workspaceId, userId, true))!;
  const existing = await prisma.workspaceChat.findUnique({ where: { id } });
  if (existing) return requireWorkspaceChat(workspaceId, userId, id);
  try {
    return await prisma.workspaceChat.create({ data: { id, workspaceId, userId, title: message.replace(/\s+/g, " ").trim().slice(0, 80) } });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") return requireWorkspaceChat(workspaceId, userId, id);
    throw error;
  }
}
export async function listWorkspaceChats(workspaceId: string, userId: string, cursor?: string): Promise<WorkspaceChatPage> {
  await legacyWorkspaceChat(workspaceId, userId);
  let after: { id: string; updatedAt: string } | undefined;
  if (cursor) {
    try {
      after = JSON.parse(Buffer.from(cursor, "base64url").toString("utf8"));
      if (!after || !/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(after.id) || !Number.isFinite(Date.parse(after.updatedAt)))
        throw Error();
    } catch {
      throw new ConversationError("VALIDATION_ERROR", "Invalid conversation page.", 400);
    }
  }
  const rows = await prisma.workspaceChat.findMany({
    where: {
      ...ownership(workspaceId, userId),
      ...(after ? { OR: [{ updatedAt: { lt: new Date(after.updatedAt) } }, { updatedAt: new Date(after.updatedAt), id: { lt: after.id } }] } : {})
    },
    orderBy: [{ updatedAt: "desc" }, { id: "desc" }],
    take: 51
  });
  const page = rows.slice(0, 50),
    last = page.at(-1);
  return {
    items: page.map(chatRecord),
    nextCursor: rows.length > 50 && last ? Buffer.from(JSON.stringify({ id: last.id, updatedAt: last.updatedAt.toISOString() })).toString("base64url") : null
  };
}
export async function renameWorkspaceChat(workspaceId: string, userId: string, id: string, title: string) {
  const updated = await prisma.workspaceChat.updateMany({ where: { id, ...ownership(workspaceId, userId) }, data: { title } });
  if (!updated.count) throw new ConversationError("CHAT_NOT_FOUND", "This conversation was not found.", 404);
  return chatRecord(await requireWorkspaceChat(workspaceId, userId, id));
}
