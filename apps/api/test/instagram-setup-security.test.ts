import Fastify from "fastify";
import { afterEach, describe, expect, it, vi } from "vitest";
import { registerWorkspaceContext } from "../src/tenancy/workspace-plugin";
import { registerWorkspaceRoutes } from "../src/workspace/workspace-routes";

const state = vi.hoisted(() => ({ enabled: true, verified: true, member: true }));
vi.mock("../src/db/prisma", () => ({
  prisma: {
    workspaceMember: { findFirst: async () => (state.member ? { role: "OWNER" } : null) },
    user: { findUnique: async () => ({ deletedAt: null, isVerified: state.verified, mfaEnabled: state.enabled }) }
  }
}));
vi.mock("../src/auth/tokens", async (original) => ({
  ...(await original<typeof import("../src/auth/tokens")>()),
  verifyAccessToken: async () => ({ userId: "owner", workspaceId: "workspace", mfaVerified: false, mfaVerifiedUntil: 1 })
}));
vi.mock("../src/workspace/instagram-oauth-service", async (original) => ({
  ...(await original<typeof import("../src/workspace/instagram-oauth-service")>()),
  createInstagramOAuthStart: vi.fn(async () => ({ authorizationUrl: "https://www.instagram.com/oauth/authorize", stateExpiresAt: "2026-01-01" }))
}));

afterEach(() => {
  state.enabled = true;
  state.verified = true;
  state.member = true;
});
describe("guided Instagram connection security", () => {
  async function start() {
    const app = Fastify();
    await registerWorkspaceContext(app);
    await registerWorkspaceRoutes(app);
    try {
      return await app.inject({
        method: "POST",
        url: "/v1/workspace/instagram/oauth/start",
        headers: { authorization: "Bearer test" },
        payload: { returnTo: "/en/instagram-setup" }
      });
    } finally {
      await app.close();
    }
  }
  it("accepts enrolled MFA without an active authorization window", async () => {
    expect((await start()).statusCode).toBe(200);
  });
  it("requires enrollment", async () => {
    state.enabled = false;
    expect((await start()).json().error.code).toBe("MFA_SETUP_REQUIRED");
  });
  it("still requires email verification", async () => {
    state.verified = false;
    expect((await start()).json().error.code).toBe("EMAIL_VERIFICATION_REQUIRED");
  });
  it("still requires workspace membership", async () => {
    state.member = false;
    expect((await start()).json().error.code).toBe("WORKSPACE_FORBIDDEN");
  });
});
