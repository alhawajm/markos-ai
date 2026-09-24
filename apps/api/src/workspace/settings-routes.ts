import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { prisma } from "../db/prisma";
import { errorEnvelope, ok } from "../http/envelope";
import { requireWorkspaceContext } from "../tenancy/workspace-context";
import { acceptTeamInvitation, changeTeamMember, inviteTeamMember, listTeam, revokeTeamInvitation, teamError } from "./team-service";

const role = z.enum(["WORKSPACE_ADMIN", "EDITOR", "VIEWER"]);
const memberInput = z.object({ role }).strict();
const inviteInput = z
  .object({
    email: z
      .string()
      .trim()
      .email()
      .max(254)
      .transform((s) => s.toLowerCase()),
    role
  })
  .strict();
const codeInput = z.object({ code: z.string().regex(/^[a-f0-9]{64}$/) }).strict();
const idInput = z.object({ id: z.string().uuid() });
const accountInput = z.object({ fullName: z.string().trim().min(2).max(120), locale: z.enum(["ar", "en"]), expectedUpdatedAt: z.string().datetime() }).strict();
const workspaceInput = z.object({ name: z.string().trim().min(2).max(120), expectedUpdatedAt: z.string().datetime() }).strict();
const config = { workspaceRequired: true, verifiedUserRequired: true } as const;

export async function registerSettingsRoutes(app: FastifyInstance) {
  app.get("/v1/account", { config }, async () => {
    const { userId, workspaceId } = requireWorkspaceContext();
    const user = await prisma.user.findFirstOrThrow({
      where: { id: userId, deletedAt: null },
      select: { id: true, fullName: true, email: true, locale: true, updatedAt: true, mfaEnabled: true }
    });
    const workspace = await prisma.workspace.findFirstOrThrow({
      where: { id: workspaceId, deletedAt: null },
      select: { id: true, name: true, ownerUserId: true, updatedAt: true }
    });
    return ok({ user: { ...user, locale: user.locale === "AR" ? "ar" : "en" }, workspace });
  });
  app.patch("/v1/account", { config }, async (request, reply) => {
    const input = accountInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check your account details"));
    const { userId, workspaceId } = requireWorkspaceContext();
    const changed = await prisma.$transaction(async (tx) => {
      const result = await tx.user.updateMany({
        where: { id: userId, deletedAt: null, updatedAt: new Date(input.data.expectedUpdatedAt) },
        data: { fullName: input.data.fullName, locale: input.data.locale === "ar" ? "AR" : "EN" }
      });
      if (!result.count) throw teamError("SETTINGS_REVISION_CONFLICT", "Your details changed elsewhere. Reload before saving again", 409);
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: "ACCOUNT_PROFILE_UPDATED", targetType: "User", targetId: userId } });
      return { saved: true };
    });
    return ok(changed);
  });
  app.patch("/v1/workspace/settings", { config }, async (request, reply) => {
    const input = workspaceInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Check the workspace name"));
    const { userId, workspaceId } = requireWorkspaceContext();
    await prisma.$transaction(async (tx) => {
      const changed = await tx.workspace.updateMany({
        where: { id: workspaceId, ownerUserId: userId, deletedAt: null, updatedAt: new Date(input.data.expectedUpdatedAt) },
        data: { name: input.data.name }
      });
      if (!changed.count) throw teamError("SETTINGS_REVISION_CONFLICT", "Only the owner can rename the current workspace. Reload before saving again", 409);
      await tx.auditLog.create({ data: { workspaceId, actorId: userId, action: "WORKSPACE_RENAMED", targetType: "Workspace", targetId: workspaceId } });
    });
    return ok({ saved: true });
  });
  app.get("/v1/workspaces", { config }, async () => {
    const { userId } = requireWorkspaceContext();
    const memberships = await prisma.workspaceMember.findMany({ where: { userId, deletedAt: null } });
    const workspaces = await prisma.workspace.findMany({
      where: { id: { in: memberships.map((m) => m.workspaceId) }, deletedAt: null },
      select: { id: true, name: true, ownerUserId: true },
      orderBy: { createdAt: "asc" }
    });
    return ok(workspaces.map((w) => ({ ...w, roles: memberships.filter((m) => m.workspaceId === w.id).map((m) => m.role) })));
  });
  app.get("/v1/workspace/team", { config }, async () => {
    const { userId, workspaceId } = requireWorkspaceContext();
    return ok(await listTeam(workspaceId, userId));
  });
  app.post("/v1/workspace/team/invitations", { config }, async (request, reply) => {
    const input = inviteInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Choose an email address and team role"));
    const { userId, workspaceId } = requireWorkspaceContext();
    return reply.code(201).send(ok(await inviteTeamMember(workspaceId, userId, input.data)));
  });
  app.delete("/v1/workspace/team/invitations/:id", { config }, async (request, reply) => {
    const params = idInput.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid invitation"));
    const { userId, workspaceId } = requireWorkspaceContext();
    return ok(await revokeTeamInvitation(workspaceId, userId, params.data.id));
  });
  app.patch("/v1/workspace/team/members/:id", { config }, async (request, reply) => {
    const params = idInput.safeParse(request.params),
      input = memberInput.safeParse(request.body);
    if (!params.success || !input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Choose a member and role"));
    const { userId, workspaceId } = requireWorkspaceContext();
    return ok(await changeTeamMember(workspaceId, userId, params.data.id, input.data.role));
  });
  app.delete("/v1/workspace/team/members/:id", { config }, async (request, reply) => {
    const params = idInput.safeParse(request.params);
    if (!params.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Invalid team member"));
    const { userId, workspaceId } = requireWorkspaceContext();
    return ok(await changeTeamMember(workspaceId, userId, params.data.id, null));
  });
  app.post("/v1/workspaces/accept-invitation", { config }, async (request, reply) => {
    const input = codeInput.safeParse(request.body);
    if (!input.success) return reply.code(400).send(errorEnvelope("VALIDATION_ERROR", "Enter the complete invitation code"));
    return ok(await acceptTeamInvitation(requireWorkspaceContext().userId, input.data.code));
  });
}
