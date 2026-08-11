import { describe, expect, it, vi } from "vitest";
import {
  assertVerificationEmailConfiguration,
  LocalVerificationEmailProvider,
  SendGridVerificationEmailProvider,
  VerificationEmailConfigurationError,
  VerificationEmailDeliveryError
} from "../src/auth/verification-email";

describe("verification email providers", () => {
  it("fails API startup when production delivery is not fully configured", () => {
    expect(() =>
      assertVerificationEmailConfiguration({
        apiKey: undefined,
        fromEmail: undefined,
        nodeEnv: "production",
        provider: "local"
      })
    ).toThrow(VerificationEmailConfigurationError);
    expect(() =>
      assertVerificationEmailConfiguration({
        apiKey: undefined,
        fromEmail: "verify@markos.test",
        nodeEnv: "production",
        provider: "sendgrid"
      })
    ).toThrow(VerificationEmailConfigurationError);
  });

  it("accepts local development and complete production delivery configuration", () => {
    expect(() =>
      assertVerificationEmailConfiguration({
        apiKey: undefined,
        fromEmail: undefined,
        nodeEnv: "development",
        provider: "local"
      })
    ).not.toThrow();
    expect(() =>
      assertVerificationEmailConfiguration({
        apiKey: "sendgrid-test-key",
        fromEmail: "verify@markos.test",
        nodeEnv: "production",
        provider: "sendgrid"
      })
    ).not.toThrow();
  });

  it("keeps the local adapter side-effect free", async () => {
    const provider = new LocalVerificationEmailProvider();

    await expect(
      provider.send({
        email: "owner@markos.test",
        locale: "en",
        token: "local-token"
      })
    ).resolves.toBeUndefined();
  });

  it("sends a localized verification link through SendGrid", async () => {
    let callCount = 0;
    let requestUrl: string | URL | Request | undefined;
    let requestInit: RequestInit | undefined;
    const fetchImpl: typeof fetch = async (input, init) => {
      callCount += 1;
      requestUrl = input;
      requestInit = init;
      return new Response(null, { status: 202 });
    };
    const provider = new SendGridVerificationEmailProvider(
      {
        apiKey: "sendgrid-test-key",
        fromEmail: "verify@markos.test",
        webBaseUrl: "https://app.markos.test"
      },
      fetchImpl
    );

    await provider.send({
      email: "owner@markos.test",
      locale: "ar",
      token: "secret-token"
    });

    const payload = JSON.parse(String(requestInit?.body));

    expect(callCount).toBe(1);
    expect(requestUrl).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(requestInit?.headers).toMatchObject({
      Authorization: "Bearer sendgrid-test-key",
      "content-type": "application/json"
    });
    expect(payload).toMatchObject({
      from: { email: "verify@markos.test" },
      personalizations: [{ to: [{ email: "owner@markos.test" }] }]
    });
    expect(payload.subject).toContain("تأكيد");
    expect(payload.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: expect.stringContaining("https://app.markos.test/ar/verify?token=secret-token")
        })
      ])
    );
  });

  it("fails safely when SendGrid is misconfigured or unavailable", async () => {
    const misconfigured = new SendGridVerificationEmailProvider({
      apiKey: undefined,
      fromEmail: undefined,
      webBaseUrl: "https://app.markos.test"
    });
    const unavailable = new SendGridVerificationEmailProvider(
      {
        apiKey: "sendgrid-test-key",
        fromEmail: "verify@markos.test",
        webBaseUrl: "https://app.markos.test"
      },
      vi.fn(async () => new Response(null, { status: 500 })) as typeof fetch
    );

    await expect(
      misconfigured.send({
        email: "owner@markos.test",
        locale: "en",
        token: "secret-token"
      })
    ).rejects.toBeInstanceOf(VerificationEmailConfigurationError);
    await expect(
      unavailable.send({
        email: "owner@markos.test",
        locale: "en",
        token: "secret-token"
      })
    ).rejects.toBeInstanceOf(VerificationEmailDeliveryError);
  });
});
