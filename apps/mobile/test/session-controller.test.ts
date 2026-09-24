import { describe, expect, it, vi } from "vitest";
import type { NativeAuthSession } from "@markos/shared-types";
import { MarkosApiError } from "@markos/api-client";
import { SessionController } from "../src/auth/session-controller";

function grant(token = "refresh-1", workspace = "workspace-a"): NativeAuthSession {
  return {
    user: { id: "owner", email: "owner@example.test", fullName: "Owner", locale: "en", isVerified: true },
    workspace: { id: workspace, name: "Business", slug: "business" },
    roles: ["OWNER"],
    mfaVerified: false,
    mfaVerifiedUntil: null,
    tokens: { accessToken: "access-" + token, refreshToken: token, expiresIn: 900 }
  };
}
function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}
function setup() {
  let stored: string | null = null;
  const store = {
    read: vi.fn(async () => stored),
    write: vi.fn(async (value: string) => {
      stored = value;
    }),
    clear: vi.fn(async () => {
      stored = null;
    })
  };
  const transport = {
    verifyMfa: vi.fn(async (_code: string, _access: string) => ({
      ...grant("step-up"),
      mfaVerified: true,
      mfaVerifiedUntil: Math.floor(Date.now() / 1000) + 600
    })),
    register: vi.fn(async () => ({ ...grant(), user: { ...grant().user, isVerified: false } })),
    login: vi.fn(async () => grant()),
    refresh: vi.fn(async () => grant("refresh-2")),
    logout: vi.fn(async () => {})
  };
  return { controller: new SessionController(store, transport), store, transport, stored: () => stored };
}
const credentials = { email: "owner@example.test", password: "fixture-password" };

describe("native session isolation", () => {
  it("serializes MFA with refresh and persists the new grant without changing workspace scope", async () => {
    const s = setup();
    await s.controller.login(credentials);
    const epoch = s.controller.getEpoch();
    const response = deferred<NativeAuthSession>();
    s.transport.refresh.mockReturnValueOnce(response.promise);
    const renewal = s.controller.renew();
    const step = s.controller.verifyMfa("123456");
    expect(s.controller.verifyMfa("123456")).toBe(step);
    response.resolve(grant("refreshed"));
    await Promise.all([renewal, step]);
    expect(s.transport.verifyMfa).toHaveBeenCalledWith("123456", "access-refreshed");
    expect(s.stored()).toBe("step-up");
    expect(s.controller.getEpoch()).toBe(epoch);
    expect(s.controller.getSnapshot().session?.mfaVerified).toBe(true);
    expect(s.controller.getSnapshot().session?.tokens).not.toHaveProperty("refreshToken");
  });
  it("renews an expired access token once before retrying MFA", async () => {
    const s = setup();
    await s.controller.login(credentials);
    s.transport.verifyMfa.mockRejectedValueOnce(new MarkosApiError("expired", 401, "INVALID_TOKEN"));
    await s.controller.verifyMfa("123456");
    expect(s.transport.refresh).toHaveBeenCalledTimes(1);
    expect(s.transport.verifyMfa).toHaveBeenLastCalledWith("123456", "access-refresh-2");
    expect(s.stored()).toBe("step-up");
  });
  it("keeps a valid session on an incorrect code", async () => {
    const s = setup();
    await s.controller.login(credentials);
    s.transport.verifyMfa.mockRejectedValueOnce(new MarkosApiError("wrong code", 401, "MFA_INVALID"));
    await expect(s.controller.verifyMfa("123456")).rejects.toThrow("wrong code");
    expect(s.transport.refresh).not.toHaveBeenCalled();
    expect(s.stored()).toBe("refresh-1");
  });
  it("does not accept a late MFA grant after logout or block a new account", async () => {
    const s = setup();
    await s.controller.login(credentials);
    const response = deferred<NativeAuthSession>();
    s.transport.verifyMfa.mockReturnValueOnce(response.promise as ReturnType<typeof s.transport.verifyMfa>);
    const pending = s.controller.verifyMfa("123456");
    const rejected = expect(pending).rejects.toThrow("Session changed");
    await Promise.resolve();
    await s.controller.logout();
    await s.controller.login(credentials);
    await s.controller.verifyMfa("654321");
    response.resolve(grant("late"));
    await rejected;
    expect(s.stored()).toBe("step-up");
  });
  it("stores a new account's credential securely while retaining the verification gate", async () => {
    const s = setup();
    await s.controller.register({ ...credentials, fullName: "Owner", locale: "en", acceptedTerms: true, policyVersion: "2026-09-22" });
    expect(s.stored()).toBe("refresh-1");
    expect(s.controller.getSnapshot().session?.user.isVerified).toBe(false);
    expect(s.controller.getSnapshot().session?.tokens).not.toHaveProperty("refreshToken");
  });
  it("does not restore a cancelled registration after its response arrives", async () => {
    const s = setup();
    const response = deferred<NativeAuthSession>();
    s.transport.register.mockReturnValue(response.promise);
    const pending = s.controller.register({ ...credentials, fullName: "Owner", locale: "en", acceptedTerms: true, policyVersion: "2026-09-22" });
    const rejected = expect(pending).rejects.toThrow("Session changed");
    await s.controller.logout();
    response.resolve(grant());
    await rejected;
    expect(s.stored()).toBeNull();
    expect(s.controller.getSnapshot().status).toBe("signedOut");
  });
  it("keeps only refresh credentials in secure storage and strips them from UI state", async () => {
    const s = setup();
    await s.controller.login(credentials);
    expect(s.stored()).toBe("refresh-1");
    expect(s.controller.getSnapshot().session?.tokens).not.toHaveProperty("refreshToken");
  });
  it("single-flights rotating credentials across concurrent expired requests", async () => {
    const s = setup();
    await s.controller.login(credentials);
    const next = deferred<NativeAuthSession>();
    s.transport.refresh.mockReturnValue(next.promise);
    const a = s.controller.renew();
    const b = s.controller.renew();
    expect(a).toBe(b);
    next.resolve(grant("refresh-2"));
    await Promise.all([a, b]);
    expect(s.transport.refresh).toHaveBeenCalledTimes(1);
    expect(s.stored()).toBe("refresh-2");
  });
  it("does not resurrect a logged-out session when a refresh arrives late", async () => {
    const s = setup();
    await s.controller.login(credentials);
    const next = deferred<NativeAuthSession>();
    s.transport.refresh.mockReturnValue(next.promise);
    const renewal = s.controller.renew();
    const rejected = expect(renewal).rejects.toThrow("Session changed");
    await s.controller.logout();
    next.resolve(grant("late"));
    await rejected;
    expect(s.stored()).toBeNull();
    expect(s.controller.getSnapshot().status).toBe("signedOut");
  });
  it("clears a secure write that was already in progress at logout", async () => {
    const s = setup();
    const writing = deferred<void>();
    s.store.write.mockImplementationOnce(async () => {
      await writing.promise;
    });
    const login = s.controller.login(credentials);
    const rejected = expect(login).rejects.toThrow("Session changed");
    await Promise.resolve();
    await Promise.resolve();
    const logout = s.controller.logout();
    writing.resolve();
    await Promise.all([logout, rejected]);
    expect(s.store.clear).toHaveBeenCalledTimes(1);
    expect(s.controller.getSnapshot().session).toBeNull();
  });
  it("preserves the credential during an offline restore", async () => {
    const s = setup();
    await s.store.write("saved");
    s.transport.refresh.mockRejectedValue(new TypeError("Network request failed"));
    await s.controller.restore();
    expect(s.controller.getSnapshot().status).toBe("offline");
    expect(s.stored()).toBe("saved");
  });
  it("expires reused credentials without retrying them", async () => {
    const s = setup();
    await s.store.write("used");
    s.transport.refresh.mockRejectedValue(new MarkosApiError("Used", 401, "REFRESH_TOKEN_REUSE_DETECTED"));
    await s.controller.restore();
    expect(s.stored()).toBeNull();
    expect(s.transport.refresh).toHaveBeenCalledTimes(1);
  });
  it("invalidates the previous workspace scope when another account signs in", async () => {
    const s = setup();
    await s.controller.login(credentials);
    const oldEpoch = s.controller.getEpoch();
    s.transport.login.mockResolvedValue(grant("other", "workspace-b"));
    await s.controller.login(credentials);
    expect(() => s.controller.assertEpoch(oldEpoch)).toThrow("Session changed");
    expect(s.controller.getSnapshot().session?.workspace.id).toBe("workspace-b");
  });
  it("rejects a refresh response for a different workspace", async () => {
    const s = setup();
    await s.controller.login(credentials);
    s.transport.refresh.mockResolvedValue(grant("other", "workspace-b"));
    await expect(s.controller.renew()).rejects.toThrow("Session identity changed");
    expect(s.controller.getSnapshot().status).toBe("signedOut");
    expect(s.stored()).toBeNull();
  });
});
