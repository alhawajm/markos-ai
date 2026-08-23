import { describe, expect, it } from "vitest";
import { decryptCredential, encryptCredential, redactSecrets } from "../src/security/credential-encryption";
import { consumeOAuthState, issueOAuthState, OAuthStateError, type OAuthStateStore } from "../src/security/oauth-state";
import {
  INSTAGRAM_AUTHORIZATION_URL,
  INSTAGRAM_GRAPH_BASE_URL,
  INSTAGRAM_GRAPH_VERSION,
  INSTAGRAM_LONG_LIVED_TOKEN_URL,
  INSTAGRAM_REQUESTED_SCOPES,
  INSTAGRAM_SHORT_LIVED_TOKEN_URL,
  canonicalRedirectUri
} from "../src/workspace/instagram-provider";

const secret = "oauth-state-test-secret-that-is-at-least-32-bytes";
const key = Buffer.alloc(32, 7).toString("base64");

class MemoryStore implements OAuthStateStore {
  private values = new Map<string, Date>();
  async put(nonce: string, expiresAt: Date) {
    this.values.set(nonce, expiresAt);
  }
  async consume(nonce: string) {
    return this.values.delete(nonce) ? ("consumed" as const) : ("not_found_or_expired" as const);
  }
}

describe("Instagram provider contract", () => {
  it("uses only Instagram Login v25.0 and the canonical release scopes", () => {
    expect(INSTAGRAM_AUTHORIZATION_URL).toBe("https://www.instagram.com/oauth/authorize");
    expect(INSTAGRAM_SHORT_LIVED_TOKEN_URL).toBe("https://api.instagram.com/oauth/access_token");
    expect(INSTAGRAM_LONG_LIVED_TOKEN_URL).toBe("https://graph.instagram.com/access_token");
    expect(INSTAGRAM_GRAPH_VERSION).toBe("v25.0");
    expect(INSTAGRAM_GRAPH_BASE_URL).toBe("https://graph.instagram.com/v25.0");
    expect(INSTAGRAM_REQUESTED_SCOPES).toEqual(["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"]);
  });

  it("accepts a canonical redirect and rejects ambiguous credentials or fragments", () => {
    expect(canonicalRedirectUri("https://api.markos.test/v1/instagram/callback")).toBe("https://api.markos.test/v1/instagram/callback");
    expect(() => canonicalRedirectUri("https://user:pass@api.markos.test/callback")).toThrow();
    expect(() => canonicalRedirectUri("https://api.markos.test/callback#other")).toThrow();
  });
});

describe("OAuth state", () => {
  async function state(overrides: Partial<Parameters<typeof issueOAuthState>[0]> = {}) {
    const store = new MemoryStore();
    const value = await issueOAuthState({
      returnTo: "/settings/integrations",
      secret,
      store,
      userId: "user-a",
      workspaceId: "workspace-a",
      ...overrides
    });
    return { store, value };
  }

  it("accepts a valid state exactly once", async () => {
    const { store, value } = await state();
    await expect(
      consumeOAuthState({
        state: value,
        secret,
        store,
        userId: "user-a",
        workspaceId: "workspace-a"
      })
    ).resolves.toEqual({ returnTo: "/settings/integrations" });
    await expect(
      consumeOAuthState({
        state: value,
        secret,
        store,
        userId: "user-a",
        workspaceId: "workspace-a"
      })
    ).rejects.toBeInstanceOf(OAuthStateError);
  });

  it.each([
    [
      "tampered",
      async () => {
        const x = await state();
        return { ...x, value: `${x.value.slice(0, -1)}x` };
      }
    ],
    ["expired", () => state({ now: new Date("2026-01-01T00:00:00Z"), ttlSeconds: 1 })],
    ["cross-user", () => state()],
    ["cross-workspace", () => state()]
  ])("rejects %s state", async (kind, make) => {
    const { store, value } = await make();
    const now = kind === "expired" ? new Date("2026-01-01T00:00:02Z") : undefined;
    await expect(
      consumeOAuthState({
        state: value,
        secret,
        store,
        userId: kind === "cross-user" ? "user-b" : "user-a",
        workspaceId: kind === "cross-workspace" ? "workspace-b" : "workspace-a",
        ...(now ? { now } : {})
      })
    ).rejects.toBeInstanceOf(OAuthStateError);
  });

  it("rejects unsafe return destinations", async () => {
    await expect(state({ returnTo: "https://evil.test/steal" })).rejects.toBeInstanceOf(OAuthStateError);
    await expect(state({ returnTo: "//evil.test" })).rejects.toBeInstanceOf(OAuthStateError);
  });
});

describe("credential handling", () => {
  it("round trips with randomized authenticated ciphertext", () => {
    const first = encryptCredential("token-value", key);
    const second = encryptCredential("token-value", key);
    expect(first).not.toBe(second);
    expect(decryptCredential(first, key)).toBe("token-value");
    expect(() => decryptCredential(`${first.slice(0, -1)}x`, key)).toThrow("Credential could not be processed");
  });

  it("redacts secrets recursively", () => {
    const value = redactSecrets({
      accessToken: "token-value",
      nested: { app_secret: "secret-value", safe: "visible" }
    });
    expect(JSON.stringify(value)).not.toContain("token-value");
    expect(JSON.stringify(value)).not.toContain("secret-value");
    expect(value).toEqual({
      accessToken: "[REDACTED]",
      nested: { app_secret: "[REDACTED]", safe: "visible" }
    });
  });
});
