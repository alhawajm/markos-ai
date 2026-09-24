import Fastify from "fastify";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../src/auth/auth-service", () => ({
  login: vi.fn(),
  register: vi.fn(),
  AuthConflictError: class extends Error {},
  refreshSession: vi.fn(),
  verifyMfaTotpSession: vi.fn(),
  InvalidCredentialsError: class extends Error {},
  MfaInvalidError: class extends Error {},
  MfaRequiredError: class extends Error {},
  MfaSetupRequiredError: class extends Error {}
}));
vi.mock("../src/auth/tokens", () => ({
  revokeRefreshToken: vi.fn(),
  RefreshTokenInvalidError: class extends Error {},
  RefreshTokenReuseDetectedError: class extends Error {}
}));
import { login, refreshSession, MfaRequiredError } from "../src/auth/auth-service";
import { revokeRefreshToken, RefreshTokenReuseDetectedError } from "../src/auth/tokens";
import { registerNativeAuthRoutes } from "../src/auth/native-auth-routes";

const headers = { "x-markos-session": "native" };
const grant = {
  refreshToken: "rotated-refresh-fixture",
  session: { user: { id: "owner" }, workspace: { id: "workspace-a" }, tokens: { accessToken: "access-fixture", expiresIn: 900 } }
};
describe("native auth transport (no database)", () => {
  let app: ReturnType<typeof Fastify>;
  beforeEach(async () => {
    vi.resetAllMocks();
    app = Fastify();
    await registerNativeAuthRoutes(app);
  });
  afterEach(async () => {
    await app.close();
  });
  it("returns a native rotating credential with no browser cookie", async () => {
    vi.mocked(login).mockResolvedValue(grant as Awaited<ReturnType<typeof login>>);
    const result = await app.inject({
      method: "POST",
      url: "/v1/auth/native/login",
      headers,
      payload: { email: "owner@example.test", password: "test-password", totpCode: "123456" }
    });
    expect(result.statusCode).toBe(200);
    expect(result.json().data.tokens.refreshToken).toBe(grant.refreshToken);
    expect(result.headers["set-cookie"]).toBeUndefined();
    expect(result.headers["cache-control"]).toBe("no-store");
    expect(login).toHaveBeenCalledWith(expect.objectContaining({ totpCode: "123456" }));
  });
  it.each([{}, { ...headers, origin: "https://example.test" }])("rejects browser or missing transport headers", async (requestHeaders) => {
    const response = await app.inject({ method: "POST", url: "/v1/auth/native/login", headers: requestHeaders, payload: {} });
    expect(response.statusCode).toBe(400);
    expect(login).not.toHaveBeenCalled();
  });
  it("uses the existing refresh service and preserves workspace/MFA session claims", async () => {
    vi.mocked(refreshSession).mockResolvedValue(grant as Awaited<ReturnType<typeof refreshSession>>);
    const result = await app.inject({ method: "POST", url: "/v1/auth/native/refresh", headers, payload: { refreshToken: "previous-refresh-fixture" } });
    expect(refreshSession).toHaveBeenCalledWith("previous-refresh-fixture");
    expect(result.json().data.workspace.id).toBe("workspace-a");
  });
  it("reports reuse without returning credentials", async () => {
    vi.mocked(refreshSession).mockRejectedValue(new RefreshTokenReuseDetectedError());
    const response = await app.inject({ method: "POST", url: "/v1/auth/native/refresh", headers, payload: { refreshToken: "previous-refresh-fixture" } });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("REFRESH_TOKEN_REUSE_DETECTED");
    expect(response.json().data).toBeUndefined();
  });
  it("preserves required MFA challenges", async () => {
    vi.mocked(login).mockRejectedValue(new MfaRequiredError());
    const response = await app.inject({
      method: "POST",
      url: "/v1/auth/native/login",
      headers,
      payload: { email: "owner@example.test", password: "test-password" }
    });
    expect(response.statusCode).toBe(401);
    expect(response.json().error.code).toBe("MFA_REQUIRED");
  });
  it("revokes the supplied native credential on logout", async () => {
    const response = await app.inject({ method: "POST", url: "/v1/auth/native/logout", headers, payload: { refreshToken: "previous-refresh-fixture" } });
    expect(response.statusCode).toBe(200);
    expect(revokeRefreshToken).toHaveBeenCalledWith("previous-refresh-fixture");
  });
});
