import { describe, expect, it, vi } from "vitest";
import { emailConfiguration, EmailDeliveryError, sendTransactionalMail } from "../src/email/transactional-mail";
import { SendGridVerificationEmailProvider, assertVerificationEmailConfiguration } from "../src/auth/verification-email";

describe("configured transactional email", () => {
  const configuration = { provider: "brevo" as const, apiKey: "test-brevo-only", from: "support@example.test" };
  it("sends Brevo HTML and PDF attachments with the required authentication and keeps keys outside the body", async () => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ messageId: "provider-accepted" }, { status: 201 }));
    expect(
      await sendTransactionalMail(
        configuration,
        {
          to: ["recipient@example.test"],
          subject: "Report",
          text: "Report attached",
          html: '<html lang="ar" dir="rtl">تقرير</html>',
          attachments: [{ filename: "report.pdf", content: "cGRm", type: "application/pdf" }]
        },
        send
      )
    ).toEqual({ messageId: "provider-accepted" });
    const [url, init] = send.mock.calls[0]!;
    expect(url).toBe("https://api.brevo.com/v3/smtp/email");
    expect(new Headers(init?.headers).get("api-key")).toBe("test-brevo-only");
    expect(init?.redirect).toBe("error");
    const body = JSON.parse(String(init?.body));
    expect(body).toMatchObject({
      sender: { email: configuration.from },
      to: [{ email: "recipient@example.test" }],
      attachment: [{ name: "report.pdf", content: "cGRm" }],
      htmlContent: expect.stringContaining('dir="rtl"')
    });
    expect(body).not.toHaveProperty("textContent");
    expect(JSON.stringify(body)).not.toContain(configuration.apiKey);
  });
  it.each(["en", "ar"] as const)("preserves the verified link and localized guidance with Brevo (%s)", async (locale) => {
    const send = vi.fn<typeof fetch>().mockResolvedValue(Response.json({ messageId: "accepted" }, { status: 201 }));
    const provider = new SendGridVerificationEmailProvider(
      { provider: "brevo", apiKey: configuration.apiKey, fromEmail: configuration.from, webBaseUrl: "https://markos.example.test" },
      send
    );
    await provider.send({ email: "owner@example.test", locale, token: "fixture-token" });
    const payload = JSON.parse(String(send.mock.calls[0]![1]?.body));
    expect(provider.mode).toBe("brevo");
    expect(payload.htmlContent).toContain(`https://markos.example.test/${locale}/verify?token=fixture-token`);
    expect(payload.htmlContent).toContain(locale === "ar" ? "عد إلى علامة التبويب" : "return to the tab");
  });
  it("does not fall back to a paid provider after an ambiguous result or a daily limit", async () => {
    for (const response of [Response.json({}, { status: 201 }), new Response("PRIVATE_PROVIDER_BODY", { status: 429 })]) {
      const send = vi.fn<typeof fetch>().mockResolvedValue(response);
      await expect(sendTransactionalMail(configuration, { to: ["recipient@example.test"], subject: "Check", text: "Message" }, send)).rejects.toBeInstanceOf(
        EmailDeliveryError
      );
      expect(send).toHaveBeenCalledTimes(1);
    }
    const failed = vi.fn<typeof fetch>().mockRejectedValue(new Error("PRIVATE_TRANSPORT"));
    await expect(sendTransactionalMail(configuration, { to: ["recipient@example.test"], subject: "Check", text: "Message" }, failed)).rejects.toMatchObject({
      code: "EMAIL_RESULT_UNKNOWN"
    });
    expect(failed).toHaveBeenCalledTimes(1);
  });
  it("uses only the selected provider key and requires real production delivery configuration", () => {
    expect(
      emailConfiguration({ EMAIL_PROVIDER: "brevo", SENDGRID_API_KEY: "wrong-provider", BREVO_API_KEY: "selected", FROM_EMAIL: "support@example.test" }).apiKey
    ).toBe("selected");
    expect(() =>
      assertVerificationEmailConfiguration({ provider: "brevo", nodeEnv: "production", apiKey: undefined, fromEmail: configuration.from })
    ).toThrow();
    expect(() =>
      assertVerificationEmailConfiguration({ provider: "brevo", nodeEnv: "production", apiKey: "selected", fromEmail: configuration.from })
    ).not.toThrow();
  });
});
