import { describe, expect, it } from "vitest";
import { env } from "../src/config/env";
import { buildApp } from "../src/http/app";

describe("Meta callback routes", () => {
  it("verifies Instagram webhook subscriptions with the configured challenge token", async () => {
    env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/meta/webhooks/instagram?hub.mode=subscribe&hub.verify_token=verify-token&hub.challenge=challenge-value"
    });

    expect(response.statusCode).toBe(200);
    expect(response.body).toBe("challenge-value");

    await app.close();
  });

  it("rejects Instagram webhook verification with the wrong token", async () => {
    env.META_WEBHOOK_VERIFY_TOKEN = "verify-token";
    const app = await buildApp();

    const response = await app.inject({
      method: "GET",
      url: "/v1/meta/webhooks/instagram?hub.mode=subscribe&hub.verify_token=wrong&hub.challenge=challenge-value"
    });

    expect(response.statusCode).toBe(403);
    expect(response.json().error.code).toBe("META_WEBHOOK_FORBIDDEN");

    await app.close();
  });

  it("acknowledges deauthorization and data deletion callbacks", async () => {
    const app = await buildApp();
    const deauthorize = await app.inject({
      method: "POST",
      payload: {
        signed_request: "test-signed-request"
      },
      url: "/v1/meta/deauthorize"
    });
    const deletion = await app.inject({
      method: "POST",
      payload: {
        signed_request: "test-signed-request"
      },
      url: "/v1/meta/data-deletion"
    });

    expect(deauthorize.statusCode).toBe(200);
    expect(deauthorize.json().data.received).toBe(true);
    expect(deletion.statusCode).toBe(200);
    expect(deletion.json()).toMatchObject({
      confirmation_code: "markos-meta-deletion-received"
    });

    await app.close();
  });
});
