import { describe, expect, it, vi } from "vitest";
import { emailConfiguration, isEmailConfigured, sendTransactionalMail } from "../src/email/transactional-mail";
import { assertVerificationEmailConfiguration, SendGridVerificationEmailProvider } from "../src/auth/verification-email";
import { createFailureReporter } from "../src/observability/failure-alerts";

const configuration = emailConfiguration({
  EMAIL_PROVIDER: "gmail",
  FROM_EMAIL: "sender@gmail.com",
  GMAIL_CLIENT_ID: "fixture-client",
  GMAIL_CLIENT_SECRET: "fixture-secret",
  GMAIL_REFRESH_TOKEN: "fixture-refresh",
  SENDGRID_API_KEY: "unused-paid-key",
  BREVO_API_KEY: "unused-brevo-key"
});
const mail = { to: ["recipient@example.test"], subject: "MARKOS", text: "Your code: 01234567" };
const tokenResponse = () => Response.json({ access_token: "fixture-access", expires_in: 3600 });
const accepted = () => Response.json({ id: "gmail-accepted-id" });
const message = (fetcher: ReturnType<typeof vi.fn<typeof fetch>>, index = 1) =>
  Buffer.from(JSON.parse(String(fetcher.mock.calls[index]![1]!.body)).raw, "base64url").toString("utf8");

describe("Gmail HTTPS transactional delivery", () => {
  it("requires all send-only OAuth credentials and never uses other providers' keys", async () => {
    expect(configuration.apiKey).toBeUndefined();
    expect(isEmailConfigured(configuration)).toBe(true);
    expect(() => assertVerificationEmailConfiguration({ ...configuration, fromEmail: configuration.from, nodeEnv: "production" })).not.toThrow();
    for (const missing of ["clientId", "clientSecret", "refreshToken"] as const) {
      const incomplete = { ...configuration, gmail: { ...configuration.gmail!, [missing]: undefined } };
      const fetcher = vi.fn<typeof fetch>();
      expect(() => assertVerificationEmailConfiguration({ ...incomplete, fromEmail: incomplete.from, nodeEnv: "production" })).toThrow();
      await expect(sendTransactionalMail(incomplete, mail, fetcher)).rejects.toMatchObject({ code: "EMAIL_NOT_CONFIGURED" });
      expect(fetcher).not.toHaveBeenCalled();
    }
  });

  it("refreshes over HTTPS and submits UTF-8 MIME alternatives and a PDF attachment without leaking credentials", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(accepted());
    const arabic = "تقرير ماركوس — رمز التأكيد 01234567";
    await expect(
      sendTransactionalMail(
        configuration,
        {
          ...mail,
          subject: arabic,
          text: arabic,
          html: `<html lang="ar" dir="rtl"><p>${arabic}</p></html>`,
          attachments: [{ content: Buffer.from("%PDF-fixture").toString("base64"), filename: "تقرير.pdf", type: "application/pdf" }]
        },
        fetcher
      )
    ).resolves.toEqual({ messageId: "gmail-accepted-id" });
    expect(fetcher.mock.calls[0]![0]).toBe("https://oauth2.googleapis.com/token");
    const grant = new URLSearchParams(String(fetcher.mock.calls[0]![1]!.body));
    expect(grant.get("grant_type")).toBe("refresh_token");
    expect(grant.get("refresh_token")).toBe("fixture-refresh");
    const [url, init] = fetcher.mock.calls[1]!;
    expect(url).toBe("https://gmail.googleapis.com/gmail/v1/users/me/messages/send");
    expect(new Headers(init!.headers).get("authorization")).toBe("Bearer fixture-access");
    expect(init!.redirect).toBe("error");
    expect(init!.signal).toBeInstanceOf(AbortSignal);
    const mime = message(fetcher);
    expect(mime).toContain("From: MARKOS <sender@gmail.com>\r\n");
    expect(mime).toContain("To: recipient@example.test\r\n");
    expect(mime).toContain("multipart/alternative;");
    expect(mime).toContain("multipart/mixed;");
    expect(mime).toContain("Content-Type: application/pdf\r\n");
    expect(mime).toContain("filename*=UTF-8''%D8%AA%D9%82%D8%B1%D9%8A%D8%B1.pdf");
    const decodedParts = [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g)].map((match) =>
      Buffer.from(match[1]!.replaceAll(/\s/g, ""), "base64").toString("utf8")
    );
    expect(decodedParts).toContain(arabic);
    expect(decodedParts).toContain(`<html lang="ar" dir="rtl"><p>${arabic}</p></html>`);
    expect(decodedParts).toContain("%PDF-fixture");
    const subject = mime.match(/Subject: ([\s\S]*?)\r\nDate:/)![1]!;
    expect([...subject.matchAll(/=\?UTF-8\?B\?([^?]+)\?=/g)].map((part) => Buffer.from(part[1]!, "base64").toString("utf8")).join("")).toBe(arabic);
    for (const secret of ["fixture-refresh", "fixture-secret", "fixture-access", "unused-paid-key"]) expect(mime).not.toContain(secret);
  });

  it("coalesces simultaneous token refreshes and reuses only unexpired access tokens", async () => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(async (url) => (String(url).endsWith("/token") ? tokenResponse() : accepted()));
    await Promise.all([sendTransactionalMail(configuration, mail, fetcher), sendTransactionalMail(configuration, mail, fetcher)]);
    await sendTransactionalMail(configuration, mail, fetcher);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/token"))).toHaveLength(1);
    expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/send"))).toHaveLength(3);
    vi.useFakeTimers();
    try {
      vi.setSystemTime(Date.now() + 3600_000);
      await sendTransactionalMail(configuration, mail, fetcher);
      expect(fetcher.mock.calls.filter(([url]) => String(url).endsWith("/token"))).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("refreshes once after an explicit 401 rejection", async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(new Response(null, { status: 401 }))
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(accepted());
    await expect(sendTransactionalMail(configuration, mail, fetcher)).resolves.toEqual({ messageId: "gmail-accepted-id" });
    expect(fetcher).toHaveBeenCalledTimes(4);
  });

  it("never replays an ambiguous message submission or falls back to another provider", async () => {
    for (const response of [Response.json({}), new Error("PRIVATE_NETWORK_DETAIL")]) {
      const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse());
      if (response instanceof Error) fetcher.mockRejectedValueOnce(response);
      else fetcher.mockResolvedValueOnce(response);
      await expect(sendTransactionalMail(configuration, mail, fetcher)).rejects.toMatchObject({ code: "EMAIL_RESULT_UNKNOWN" });
      expect(fetcher).toHaveBeenCalledTimes(2);
    }
  });

  it("classifies quota rejection and revoked grants without exposing Google responses", async () => {
    const limited = vi
      .fn<typeof fetch>()
      .mockResolvedValueOnce(tokenResponse())
      .mockResolvedValueOnce(Response.json({ error: { errors: [{ reason: "userRateLimitExceeded" }], message: "PRIVATE_PROVIDER_DETAIL" } }, { status: 403 }));
    await expect(sendTransactionalMail(configuration, mail, limited)).rejects.toMatchObject({
      code: "EMAIL_REJECTED",
      retryable: true,
      status: 403,
      message: "EMAIL_REJECTED"
    });
    expect(limited).toHaveBeenCalledTimes(2);
    const revoked = vi
      .fn<typeof fetch>()
      .mockResolvedValue(Response.json({ error: "invalid_grant", error_description: "PRIVATE_TOKEN_DETAIL" }, { status: 400 }));
    await expect(sendTransactionalMail(configuration, mail, revoked)).rejects.toMatchObject({
      code: "EMAIL_REJECTED",
      retryable: false,
      message: "EMAIL_REJECTED"
    });
    expect(revoked).toHaveBeenCalledTimes(1);
  });

  it("rejects email-header injection before asking Google for a token", async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const bad of [
      { ...mail, subject: "OK\r\nBcc: attacker@example.test" },
      { ...mail, to: ["recipient@example.test\r\nBcc: attacker@example.test"] }
    ])
      await expect(sendTransactionalMail(configuration, bad, fetcher)).rejects.toMatchObject({ code: "EMAIL_REJECTED" });
    expect(fetcher).not.toHaveBeenCalled();
  });

  it.each(["en", "ar"] as const)("sends the existing localized verification template through Gmail (%s)", async (locale) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(accepted());
    const provider = new SendGridVerificationEmailProvider(
      { ...configuration, fromEmail: configuration.from, webBaseUrl: "https://markos.example.test" },
      fetcher
    );
    expect(provider.mode).toBe("gmail");
    await provider.send({ email: mail.to[0]!, locale, token: "fixture-link-token" });
    const mime = message(fetcher);
    const html = [...mime.matchAll(/Content-Transfer-Encoding: base64\r\n\r\n([A-Za-z0-9+/=\r\n]+)/g)]
      .map((part) => Buffer.from(part[1]!.replaceAll(/\s/g, ""), "base64").toString("utf8"))
      .find((body) => body.startsWith("<!doctype"))!;
    expect(html).toContain(`/${locale}/verify?token=fixture-link-token`);
    expect(html).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
  });

  it("preserves sanitized operations alerts and suppression with Gmail", async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValueOnce(tokenResponse()).mockResolvedValueOnce(accepted());
    const report = createFailureReporter({
      ...configuration,
      from: configuration.from!,
      to: mail.to[0]!,
      cooldownSeconds: 900,
      claim: async () => true,
      fetchImpl: fetcher
    });
    const failure = { service: "worker", task: "publishing", code: "PROVIDER_TIMEOUT" } as const;
    expect(await report(failure)).toBe("ACCEPTED");
    expect(await report(failure)).toBe("SUPPRESSED");
    expect(fetcher).toHaveBeenCalledTimes(2);
  });
});
