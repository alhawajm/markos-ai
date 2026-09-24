import { createHash, randomBytes } from "node:crypto";
import type { Prisma } from "@prisma/client";
import { prisma } from "../db/prisma";

export type TeamRole = "WORKSPACE_ADMIN" | "EDITOR" | "VIEWER";
export const teamError = (code: string, message: string, statusCode = 403) => Object.assign(new Error(message), { code, statusCode });

async function lockTeam(tx: Prisma.TransactionClient, workspaceId: string, actorId: string, ownerOnly = false) {
  await tx.$queryRaw`SELECT id FROM workspaces WHERE id=${workspaceId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
  const workspace = await tx.workspace.findFirst({ where: { id: workspaceId, deletedAt: null } });
  if (!workspace) throw teamError("WORKSPACE_NOT_FOUND", "Workspace not found", 404);
  const isOwner = workspace.ownerUserId === actorId;
  const member = await tx.workspaceMember.findFirst({ where: { workspaceId, userId: actorId, deletedAt: null, role: "WORKSPACE_ADMIN" } });
  if (!isOwner && (ownerOnly || !member)) throw teamError("TEAM_OWNER_REQUIRED", "The workspace owner must make this change");
  return workspace;
}

export async function listTeam(workspaceId: string, actorId: string) {
  return prisma.$transaction(async (tx) => {
    const workspace = await lockTeam(tx, workspaceId, actorId);
    const members = await tx.workspaceMember.findMany({ where: { workspaceId, deletedAt: null }, orderBy: { createdAt: "asc" } });
    const users = await tx.user.findMany({
      where: { id: { in: members.map((m) => m.userId) }, deletedAt: null },
      select: { id: true, fullName: true, email: true }
    });
    const invitations = await tx.workspaceInvitation.findMany({
      where: { workspaceId, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } },
      orderBy: { createdAt: "desc" },
      select: { id: true, email: true, role: true, expiresAt: true, createdAt: true }
    });
    return {
      ownerUserId: workspace.ownerUserId,
      members: members.flatMap((m) => {
        const user = users.find((u) => u.id === m.userId);
        return user ? [{ id: m.id, userId: user.id, fullName: user.fullName, email: user.email, role: m.role }] : [];
      }),
      invitations
    };
  });
}

export async function inviteTeamMember(workspaceId: string, actorId: string, input: { email: string; role: TeamRole }) {
  const code = randomBytes(32).toString("hex");
  return prisma.$transaction(async (tx) => {
    await lockTeam(tx, workspaceId, actorId, input.role === "WORKSPACE_ADMIN");
    const administratorInvite = await tx.workspaceInvitation.findFirst({
      where: { workspaceId, email: input.email, role: "WORKSPACE_ADMIN", revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } }
    });
    if (administratorInvite) await lockTeam(tx, workspaceId, actorId, true);
    const pending = await tx.workspaceInvitation.count({ where: { workspaceId, revokedAt: null, acceptedAt: null, expiresAt: { gt: new Date() } } });
    if (pending >= 50) throw teamError("TEAM_INVITE_LIMIT", "Revoke unused invitations before creating more", 409);
    await tx.workspaceInvitation.updateMany({ where: { workspaceId, email: input.email, revokedAt: null, acceptedAt: null }, data: { revokedAt: new Date() } });
    const invitation = await tx.workspaceInvitation.create({
      data: {
        workspaceId,
        createdBy: actorId,
        email: input.email,
        role: input.role,
        tokenHash: createHash("sha256").update(code).digest("hex"),
        expiresAt: new Date(Date.now() + 7 * 86400_000)
      }
    });
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorId,
        action: "TEAM_INVITATION_CREATED",
        targetType: "WorkspaceInvitation",
        targetId: invitation.id,
        metadata: { role: input.role }
      }
    });
    return { id: invitation.id, email: invitation.email, role: invitation.role, expiresAt: invitation.expiresAt, code };
  });
}

export async function revokeTeamInvitation(workspaceId: string, actorId: string, id: string) {
  return prisma.$transaction(async (tx) => {
    await lockTeam(tx, workspaceId, actorId);
    const row = await tx.workspaceInvitation.findFirst({ where: { id, workspaceId, acceptedAt: null, revokedAt: null } });
    if (!row) throw teamError("TEAM_INVITATION_NOT_FOUND", "Invitation not found", 404);
    if (row.role === "WORKSPACE_ADMIN") await lockTeam(tx, workspaceId, actorId, true);
    await tx.workspaceInvitation.update({ where: { id }, data: { revokedAt: new Date() } });
    await tx.auditLog.create({ data: { workspaceId, actorId, action: "TEAM_INVITATION_REVOKED", targetType: "WorkspaceInvitation", targetId: id } });
    return { revoked: true };
  });
}

export async function changeTeamMember(workspaceId: string, actorId: string, id: string, role: TeamRole | null) {
  return prisma.$transaction(async (tx) => {
    const workspace = await lockTeam(tx, workspaceId, actorId);
    const member = await tx.workspaceMember.findFirst({ where: { id, workspaceId, deletedAt: null } });
    if (!member) throw teamError("TEAM_MEMBER_NOT_FOUND", "Team member not found", 404);
    if (member.userId === workspace.ownerUserId || !["WORKSPACE_ADMIN", "EDITOR", "VIEWER"].includes(member.role))
      throw teamError("TEAM_OWNER_PROTECTED", "The owner's access cannot be changed here");
    if (member.role === "WORKSPACE_ADMIN" || role === "WORKSPACE_ADMIN") await lockTeam(tx, workspaceId, actorId, true);
    if (member.userId === actorId) throw teamError("TEAM_SELF_CHANGE", "Ask the workspace owner to change your role");
    await tx.workspaceMember.updateMany({ where: { workspaceId, userId: member.userId, deletedAt: null }, data: { deletedAt: new Date() } });
    await tx.workspaceInvitation.updateMany({
      where: { workspaceId, createdBy: member.userId, acceptedAt: null, revokedAt: null },
      data: { revokedAt: new Date() }
    });
    if (role)
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId_role: { workspaceId, userId: member.userId, role } },
        create: { workspaceId, userId: member.userId, role },
        update: { deletedAt: null }
      });
    await tx.auditLog.create({
      data: {
        workspaceId,
        actorId,
        action: role ? "TEAM_ROLE_CHANGED" : "TEAM_MEMBER_REMOVED",
        targetType: "WorkspaceMember",
        targetId: member.id,
        metadata: { previousRole: member.role, role }
      }
    });
    return { changed: true };
  });
}

export async function acceptTeamInvitation(userId: string, code: string) {
  const hash = createHash("sha256").update(code).digest("hex");
  return prisma.$transaction(async (tx) => {
    const invitation = await tx.workspaceInvitation.findUnique({ where: { tokenHash: hash } });
    if (!invitation) throw teamError("TEAM_INVITATION_INVALID", "Invitation is invalid or expired", 400);
    await tx.$queryRaw`SELECT id FROM workspaces WHERE id=${invitation.workspaceId}::uuid AND "deletedAt" IS NULL FOR UPDATE`;
    const user = await tx.user.findFirst({ where: { id: userId, deletedAt: null, isVerified: true } });
    const workspace = await tx.workspace.findFirst({ where: { id: invitation.workspaceId, deletedAt: null } });
    if (!workspace || !user || user.email.toLowerCase() !== invitation.email || invitation.expiresAt <= new Date())
      throw teamError("TEAM_INVITATION_INVALID", "Use the verified email address this invitation was issued to", 400);
    const accepted = await tx.workspaceInvitation.updateMany({
      where: { id: invitation.id, acceptedAt: null, revokedAt: null, expiresAt: { gt: new Date() } },
      data: { acceptedAt: new Date(), acceptedBy: userId }
    });
    if (accepted.count !== 1) throw teamError("TEAM_INVITATION_INVALID", "Invitation is invalid or already used", 400);
    const existing = await tx.workspaceMember.findFirst({ where: { workspaceId: workspace.id, userId, deletedAt: null } });
    // Accepting a stale invitation must never escalate or demote an existing member.
    if (!existing)
      await tx.workspaceMember.upsert({
        where: { workspaceId_userId_role: { workspaceId: workspace.id, userId, role: invitation.role } },
        create: { workspaceId: workspace.id, userId, role: invitation.role },
        update: { deletedAt: null }
      });
    await tx.auditLog.create({
      data: { workspaceId: workspace.id, actorId: userId, action: "TEAM_INVITATION_ACCEPTED", targetType: "WorkspaceInvitation", targetId: invitation.id }
    });
    return { workspaceId: workspace.id, name: workspace.name, role: existing?.role ?? invitation.role };
  });
}
