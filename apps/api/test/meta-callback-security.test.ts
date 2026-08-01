import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { createDataDeletionConfirmationCode, verifyInstagramWebhookSignature } from "../src/meta/meta-service";

describe("Meta callback security", () => {
  it("verifies the signature over the exact raw webhook bytes", () => {
    env.INSTAGRAM_APP_SECRET = "test-instagram-app-secret";
    const body = Buffer.from('{"entry":[],"object":"instagram"}');
    const signature = `sha256=${createHmac("sha256", env.INSTAGRAM_APP_SECRET).update(body).digest("hex")}`;

    expect(verifyInstagramWebhookSignature(body, signature)).toBe(true);
    expect(verifyInstagramWebhookSignature(Buffer.from(`${body.toString()} `), signature)).toBe(false);
    expect(verifyInstagramWebhookSignature(body, undefined)).toBe(false);
    expect(verifyInstagramWebhookSignature(body, "sha256=invalid")).toBe(false);
  });

  it("creates non-predictable data-deletion confirmation codes", () => {
    const first = createDataDeletionConfirmationCode();
    const second = createDataDeletionConfirmationCode();

    expect(first).toMatch(/^[0-9a-f-]{36}$/);
    expect(second).toMatch(/^[0-9a-f-]{36}$/);
    expect(first).not.toBe(second);
  });
});
