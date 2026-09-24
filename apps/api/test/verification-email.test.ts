import { describe, expect, it, vi } from "vitest";
import {
  assertVerificationEmailConfiguration,
  forwardEmailVerification,
  LocalVerificationEmailProvider,
  SendGridVerificationEmailProvider,
  VerificationEmailConfigurationError,
  VerificationEmailDeliveryError
} from "../src/auth/verification-email";

describe("verification email providers", () => {
  it.each(["/v1/auth/verification/request", "/v1/auth/verify-email"] as const)("uses the hosted email/token service for %s and preserves its errors", async (path) => {
    const payload = path.endsWith("request") ? { email: "owner@markos.test", locale: "en" } : { token: "example-token" };
    const body = { error: { code: "EMAIL_VERIFICATION_INVALID", message: "Expired token" } };
    const fetchImpl = vi.fn<typeof fetch>().mockResolvedValue(new Response(JSON.stringify(body), { status: 400 }));
    await expect(forwardEmailVerification(path, payload, "https://api.markos.test/", fetchImpl)).resolves.toEqual({ status: 400, body });
    expect(fetchImpl).toHaveBeenCalledWith(`https://api.markos.test${path}`, expect.objectContaining({
      method: "POST", body: JSON.stringify(payload), headers: { "content-type": "application/json" }, redirect: "error"
    }));
  });

  it("reports hosted verification outages without exposing transport details", async () => {
    const fetchImpl = vi.fn<typeof fetch>().mockRejectedValue(new Error("internal transport detail"));
    await expect(forwardEmailVerification("/v1/auth/verify-email", { token: "example-token" }, "https://api.markos.test", fetchImpl)).rejects.toThrow(VerificationEmailDeliveryError);
  });

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

  it.each(["en", "ar"] as const)("sends a localized verification link and return-to-tab guidance through SendGrid (%s)", async (locale) => {
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
      locale,
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
    expect(payload.subject).toContain(locale === "ar" ? "تأكيد" : "Verify");
    const html = payload.content.find((item: { type: string }) => item.type === "text/html").value;
    const plain = payload.content.find((item: { type: string }) => item.type === "text/plain").value;
    expect(html).toContain(`lang="${locale}" dir="${locale === "ar" ? "rtl" : "ltr"}"`);
    expect(html).toContain('role="presentation"');
    for (const body of [html, plain]) {
      expect(body).toContain(locale === "ar" ? "عد إلى علامة التبويب" : "return to the tab");
      expect(body).toContain(locale === "ar" ? "تنتهي صلاحية" : "expires in");
    }
    expect(payload.content).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          value: expect.stringContaining(`https://app.markos.test/${locale}/verify?token=secret-token`)
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
