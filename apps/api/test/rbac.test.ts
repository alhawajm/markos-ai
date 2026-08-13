import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { hasPermission } from "../src/auth/rbac";
import { prisma } from "../src/db/prisma";
import { buildApp } from "../src/http/app";

describe("workspace RBAC", () => {
  it("maps read, edit, and admin permissions by role", () => {
    expect(hasPermission(["VIEWER"], "vault:read")).toBe(true);
    expect(hasPermission(["VIEWER"], "vault:write")).toBe(false);
    expect(hasPermission(["EDITOR"], "content:write")).toBe(true);
    expect(hasPermission(["EDITOR"], "workspace:audit:read")).toBe(false);
    expect(hasPermission(["OWNER"], "instagram:manage")).toBe(true);
    expect(hasPermission(["READONLY_ADMIN"], "workspace:audit:read")).toBe(true);
  });

  it("allows viewer reads and blocks viewer mutations", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    await updateMemberRole(session.user.id, session.workspace.id, "VIEWER");

    const readResponse = await app.inject({
      method: "GET",
      url: "/v1/vault",
      headers: authHeaders(session.tokens.accessToken)
    });
    const writeResponse = await app.inject({
      method: "PUT",
      url: "/v1/vault/company",
      headers: authHeaders(session.tokens.accessToken),
      payload: {
        entries: [
          {
            key: "name",
            value: {
              name: "Viewer Cafe"
            }
          }
        ]
      }
    });

    expect(readResponse.statusCode).toBe(200);
    expect(writeResponse.statusCode).toBe(403);
    expect(writeResponse.json().error).toMatchObject({
      code: "RBAC_FORBIDDEN",
      details: [
        {
          requiredPermissions: ["vault:write"],
          roles: ["VIEWER"]
        }
      ]
    });

    await app.close();
  });

  it("blocks editors from workspace admin actions", async () => {
    const app = await buildApp();
    const session = await registerTestUser(app);

    await updateMemberRole(session.user.id, session.workspace.id, "EDITOR");

    const auditResponse = await app.inject({
      method: "GET",
      url: "/v1/workspace/audit-logs",
      headers: authHeaders(session.tokens.accessToken)
    });
    const instagramResponse = await app.inject({
      method: "POST",
      url: "/v1/workspace/instagram/oauth/start",
      headers: authHeaders(session.tokens.accessToken),
      payload: { returnTo: "/en/app/settings" }
    });

    expect(auditResponse.statusCode).toBe(403);
    expect(auditResponse.json().error.details[0]).toMatchObject({
      requiredPermissions: ["workspace:audit:read"],
      roles: ["EDITOR"]
    });
    expect(instagramResponse.statusCode).toBe(403);
    expect(instagramResponse.json().error.details[0]).toMatchObject({
      requiredPermissions: ["instagram:manage"],
      roles: ["EDITOR"]
    });

    await app.close();
  });
});

async function registerTestUser(app: Awaited<ReturnType<typeof buildApp>>) {
  const response = await app.inject({
    method: "POST",
    url: "/v1/auth/register",
    payload: {
      email: `rbac-${randomUUID()}@markos.test`,
      password: "CorrectHorseBattery99!",
      fullName: "RBAC User",
      workspaceName: `RBAC Workspace ${randomUUID()}`,
      locale: "en"
    }
  });

  const session = response.json().data;

  await prisma.user.update({
    data: {
      isVerified: true
    },
    where: {
      id: session.user.id
    }
  });

  return {
    ...session,
    user: {
      ...session.user,
      isVerified: true
    }
  };
}

async function updateMemberRole(userId: string, workspaceId: string, role: "EDITOR" | "VIEWER"): Promise<void> {
  await prisma.workspaceMember.updateMany({
    data: {
      role
    },
    where: {
      userId,
      workspaceId
    }
  });
}

function authHeaders(accessToken: string): Record<string, string> {
  return {
    authorization: `Bearer ${accessToken}`
  };
}
