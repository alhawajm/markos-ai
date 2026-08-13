import { randomBytes, randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { persistInstagramConnection } from "../src/workspace/instagram-connection-service";

const base = {
  workspaceId: randomUUID(),
  actorId: randomUUID(),
  profile: {
    professionalAccountId: "synthetic-professional",
    username: "synthetic-user",
    media: []
  },
  accessToken: "synthetic-token",
  issuedAt: new Date("2026-08-03T00:00:00Z"),
  expiresAt: new Date("2026-09-03T00:00:00Z")
};

describe("Instagram OAuth credential diagnostics", () => {
  it("distinguishes missing and invalid encryption configuration", async () => {
    await expect(persistInstagramConnection({ ...base, encryptionKeyOverride: null })).rejects.toMatchObject({
      diagnostic: {
        stage: "credential_configuration",
        category: "encryption_key_missing",
        retryable: false
      }
    });
    await expect(persistInstagramConnection({ ...base, encryptionKeyOverride: "invalid" })).rejects.toMatchObject({
      diagnostic: {
        stage: "credential_configuration",
        category: "encryption_key_invalid",
        retryable: false
      }
    });
  });

  it("distinguishes serialization and runtime encryption failures before a transaction", async () => {
    const key = randomBytes(32).toString("base64");
    await expect(
      persistInstagramConnection({
        ...base,
        encryptionKeyOverride: key,
        profile: {
          ...base.profile,
          media: [{ id: "media", mediaType: "IMAGE", timestamp: "invalid" }]
        }
      })
    ).rejects.toMatchObject({
      diagnostic: {
        stage: "credential_serialization",
        category: "credential_serialization_failed"
      }
    });
    await expect(
      persistInstagramConnection({
        ...base,
        encryptionKeyOverride: key,
        beforeOperation(stage) {
          if (stage === "credential_encryption") throw new Error("CANARY_SECRET");
        }
      })
    ).rejects.toMatchObject({
      diagnostic: {
        stage: "credential_encryption",
        category: "credential_encryption_failed"
      }
    });
  });
});
