import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { buildApp } from "../src/http/app";
import { prisma } from "../src/db/prisma";
import { issueAuthTokens } from "../src/auth/tokens";

describe("workspace team and settings boundaries", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  beforeAll(async () => {
    app = await buildApp();
  });
  afterAll(async () => {
    await app.close();
  });
  async function identity() {
    const user = await prisma.user.create({ data: { email: `team-${randomUUID()}@markos.test`, fullName: "Workspace owner", locale: "EN", isVerified: true } });
    const workspace = await prisma.workspace.create({
      data: { ownerUserId: user.id, name: "Team workspace", slug: `team-${randomUUID()}`, onboardingStatus: "COMPLETE" }
    });
    const member = await prisma.workspaceMember.create({ data: { workspaceId: workspace.id, userId: user.id, role: "OWNER" } });
    const tokens = await issueAuthTokens({ userId: user.id, workspaceId: workspace.id, roles: ["OWNER"] });
    return { user, workspace, member, refreshToken: tokens.refreshToken, headers: { authorization: `Bearer ${tokens.accessToken}` } };
  }
  async function invite(owner: Awaited<ReturnType<typeof identity>>, email: string, role = "EDITOR") {
    const response = await app.inject({ method: "POST", url: "/v1/workspace/team/invitations", headers: owner.headers, payload: { email, role } });
    expect(response.statusCode, response.body).toBe(201);
    return response.json().data as { id: string; code: string };
  }
  it("isolates invitation listing, revocation, members and data exports by workspace", async () => {
    const a = await identity(),
      b = await identity();
    const invitation = await invite(a, b.user.email);
    const listing = await app.inject({ method: "GET", url: "/v1/workspace/team", headers: b.headers });
    expect(listing.json().data.invitations).toEqual([]);
    for (const path of [`invitations/${invitation.id}`, `members/${a.member.id}`]) {
      const response = await app.inject({ method: "DELETE", url: `/v1/workspace/team/${path}`, headers: b.headers });
      expect(response.statusCode).toBe(404);
    }
    const exported = await app.inject({ method: "GET", url: "/v1/workspace/data-export", headers: a.headers });
    expect(exported.statusCode).toBe(200);
    expect(exported.json().data.records.invitations).toHaveLength(1);
    expect(exported.body).not.toContain(invitation.code);
    expect(exported.body).not.toContain("tokenHash");
    const otherExport = await app.inject({ method: "GET", url: "/v1/workspace/data-export", headers: b.headers });
    expect(otherExport.body).not.toContain(invitation.id);
  });
  it("accepts an email-bound code once, switches native workspace, and removes access immediately", async () => {
    const owner = await identity(),
      member = await identity(),
      stranger = await identity();
    const invitation = await invite(owner, member.user.email);
    const accept = (headers: Record<string, string>) =>
      app.inject({ method: "POST", url: "/v1/workspaces/accept-invitation", headers, payload: { code: invitation.code } });
    expect((await accept(stranger.headers)).statusCode).toBe(400);
    expect((await accept(member.headers)).statusCode).toBe(200);
    expect((await accept(member.headers)).statusCode).toBe(400);
    const switched = await app.inject({
      method: "POST",
      url: "/v1/auth/native/workspace",
      headers: { ...member.headers, "x-markos-session": "native" },
      payload: { workspaceId: owner.workspace.id }
    });
    expect(switched.statusCode, switched.body).toBe(200);
    expect(switched.json().data.roles).toEqual(["EDITOR"]);
    expect(switched.json().data.tokens.refreshToken).toBeTypeOf("string");
    const headers = { authorization: `Bearer ${switched.json().data.tokens.accessToken}` };
    expect((await app.inject({ method: "GET", url: "/v1/workspace/team", headers })).statusCode).toBe(403);
    const membership = await prisma.workspaceMember.findFirstOrThrow({ where: { workspaceId: owner.workspace.id, userId: member.user.id, deletedAt: null } });
    const removed = await app.inject({ method: "DELETE", url: `/v1/workspace/team/members/${membership.id}`, headers: owner.headers });
    expect(removed.statusCode).toBe(200);
    expect((await app.inject({ method: "GET", url: "/v1/account", headers })).statusCode).toBe(403);
    const forbidden = await app.inject({ method: "POST", url: "/v1/auth/workspace", headers: member.headers, payload: { workspaceId: stranger.workspace.id } });
    expect(forbidden.statusCode).toBe(403);
  });
  it("does not let an admin promote itself or another member, or remove an owner", async () => {
    const owner = await identity(),
      admin = await identity(),
      editor = await identity();
    const adminMember = await prisma.workspaceMember.create({ data: { workspaceId: owner.workspace.id, userId: admin.user.id, role: "WORKSPACE_ADMIN" } });
    const editorMember = await prisma.workspaceMember.create({ data: { workspaceId: owner.workspace.id, userId: editor.user.id, role: "EDITOR" } });
    const tokens = await issueAuthTokens({ userId: admin.user.id, workspaceId: owner.workspace.id, roles: ["WORKSPACE_ADMIN"], mfaVerified: true });
    const headers = { authorization: `Bearer ${tokens.accessToken}` };
    expect(
      (await app.inject({ method: "POST", url: "/v1/workspace/team/invitations", headers, payload: { email: "admin@example.test", role: "WORKSPACE_ADMIN" } }))
        .statusCode
    ).toBe(403);
    for (const id of [owner.member.id, adminMember.id, editorMember.id])
      expect((await app.inject({ method: "PATCH", url: `/v1/workspace/team/members/${id}`, headers, payload: { role: "WORKSPACE_ADMIN" } })).statusCode).toBe(
        403
      );
    expect((await app.inject({ method: "PATCH", url: `/v1/workspace/team/members/${editorMember.id}`, headers, payload: { role: "VIEWER" } })).statusCode).toBe(
      200
    );
    expect(
      (
        await app.inject({
          method: "POST",
          url: "/v1/workspace/team/invitations",
          headers: owner.headers,
          payload: { email: "bad@example.test", role: "SUPER_ADMIN" }
        })
      ).statusCode
    ).toBe(400);
  });
  it("rejects expired and revoked codes and never promotes an existing member through an invitation", async () => {
    const owner = await identity(),
      member = await identity();
    const expired = await invite(owner, member.user.email);
    await prisma.workspaceInvitation.update({ where: { id: expired.id }, data: { expiresAt: new Date(Date.now() - 1000) } });
    const accept = (code: string) => app.inject({ method: "POST", url: "/v1/workspaces/accept-invitation", headers: member.headers, payload: { code } });
    expect((await accept(expired.code)).statusCode).toBe(400);
    const revoked = await invite(owner, member.user.email);
    await app.inject({ method: "DELETE", url: `/v1/workspace/team/invitations/${revoked.id}`, headers: owner.headers });
    expect((await accept(revoked.code)).statusCode).toBe(400);
    await prisma.workspaceMember.create({ data: { workspaceId: owner.workspace.id, userId: member.user.id, role: "VIEWER" } });
    const fresh = await invite(owner, member.user.email, "WORKSPACE_ADMIN");
    expect((await accept(fresh.code)).json().data.role).toBe("VIEWER");
  });
  it("requires MFA enrollment to switch into an administrator workspace", async () => {
    const owner = await identity(),
      admin = await identity();
    await prisma.workspaceMember.create({ data: { workspaceId: owner.workspace.id, userId: admin.user.id, role: "WORKSPACE_ADMIN" } });
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/native/workspace",
      headers: { ...admin.headers, "x-markos-session": "native" },
      payload: { workspaceId: owner.workspace.id }
    });
    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("MFA_SETUP_REQUIRED");
  });
  it("rotates the browser workspace cookie and revokes only the previous user's refresh grant", async () => {
    const owner = await identity(), member = await identity();
    await prisma.workspaceMember.create({ data: { workspaceId: owner.workspace.id, userId: member.user.id, role: "VIEWER" } });
    const response = await app.inject({ method: "POST", url: "/v1/auth/workspace", headers: { ...member.headers, cookie: `markos_refresh=${member.refreshToken}` }, payload: { workspaceId: owner.workspace.id } });
    expect(response.statusCode).toBe(200); expect(response.json().data.workspace.id).toBe(owner.workspace.id);
    expect(response.json().data.tokens.refreshToken).toBeUndefined(); expect(response.headers["set-cookie"]).toContain("HttpOnly");
    const previous = await app.inject({ method: "POST", url: "/v1/auth/native/refresh", headers: { "x-markos-session": "native" }, payload: { refreshToken: member.refreshToken } });
    expect(previous.statusCode).toBe(401);
    const ownerStillActive = await app.inject({ method: "POST", url: "/v1/auth/native/refresh", headers: { "x-markos-session": "native" }, payload: { refreshToken: owner.refreshToken } });
    expect(ownerStillActive.statusCode).toBe(200);
  });
  it("accepts concurrent invitation attempts only once", async () => {
    const owner = await identity(), member = await identity(); const invitation = await invite(owner, member.user.email);
    const attempts = await Promise.all([1, 2].map(() => app.inject({ method: "POST", url: "/v1/workspaces/accept-invitation", headers: member.headers, payload: { code: invitation.code } })));
    expect(attempts.map((r) => r.statusCode).sort()).toEqual([200, 400]);
    expect(await prisma.workspaceMember.count({ where: { userId: member.user.id, workspaceId: owner.workspace.id, deletedAt: null } })).toBe(1);
  });
  it("keeps optimistic profile edits scoped to the current user and workspace", async () => {
    const owner = await identity(),
      other = await identity();
    const response = await app.inject({
      method: "PATCH",
      url: "/v1/account",
      headers: owner.headers,
      payload: { fullName: "Updated owner", locale: "ar", expectedUpdatedAt: owner.user.updatedAt.toISOString() }
    });
    expect(response.statusCode).toBe(200);
    const stale = await app.inject({
      method: "PATCH",
      url: "/v1/account",
      headers: owner.headers,
      payload: { fullName: "Stale edit", locale: "en", expectedUpdatedAt: owner.user.updatedAt.toISOString() }
    });
    expect(stale.statusCode).toBe(409);
    expect((await prisma.user.findUniqueOrThrow({ where: { id: other.user.id } })).fullName).toBe(other.user.fullName);
    const renamed = await app.inject({
      method: "PATCH",
      url: "/v1/workspace/settings",
      headers: owner.headers,
      payload: { name: "Renamed workspace", expectedUpdatedAt: owner.workspace.updatedAt.toISOString() }
    });
    expect(renamed.statusCode).toBe(200);
    expect((await prisma.workspace.findUniqueOrThrow({ where: { id: other.workspace.id } })).name).toBe(other.workspace.name);
  });
  it("erases only the target workspace's invitations", async () => {
    const a = await identity(),
      b = await identity();
    const first = await invite(a, b.user.email),
      second = await invite(b, a.user.email);
    const erased = await app.inject({ method: "POST", url: "/v1/workspace/data-erasure", headers: a.headers, payload: { confirm: "ERASE_WORKSPACE_DATA" } });
    expect(erased.statusCode, erased.body).toBe(200);
    expect(await prisma.workspaceInvitation.findUnique({ where: { id: first.id } })).toBeNull();
    expect(await prisma.workspaceInvitation.findUnique({ where: { id: second.id } })).not.toBeNull();
  });
});
