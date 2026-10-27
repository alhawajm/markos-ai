import { describe, expect, it, vi } from "vitest";
vi.mock("../src/config/env", () => ({
  env: {
    EMAIL_PROVIDER: "sendgrid",
    NODE_ENV: "test",
    SENDGRID_API_KEY: "test-only-key",
    FROM_EMAIL: "verify@example.test",
    DATABASE_URL: "postgresql://unused:unused@localhost:5432/unused"
  }
}));
import { sendAuthMail } from "../src/auth/auth-email";

describe("recovery email delivery", () => {
  it.each(["en", "ar"] as const)("sends readable %s codes without tracking or exposing credentials", async (locale) => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(new Response(null, { status: 202 }));
    await sendAuthMail({ kind: "RESET_CODE", locale, email: "owner@example.test", code: "01234567" }, fetcher);
    const [url, init] = fetcher.mock.calls[0]!;
    const body = JSON.parse(String(init!.body));
    expect(url).toBe("https://api.sendgrid.com/v3/mail/send");
    expect(body.content[0].value).toContain("01234567");
    expect(body.content[1].value).toContain(`dir="${locale === "ar" ? "rtl" : "ltr"}"`);
    expect(body.content[0].value).toContain(locale === "ar" ? "استعادة كلمة المرور" : "password reset code");
    expect(JSON.stringify(body)).not.toContain("test-only-key");
    expect(body.tracking_settings.click_tracking.enable).toBe(false);
    expect(init!.signal).toBeInstanceOf(AbortSignal);
  });
  it("requires provider acceptance and conceals provider errors", async () => {
    const mail = { kind: "PASSWORD_CHANGED", locale: "en", email: "owner@example.test" } as const;
    await expect(sendAuthMail(mail, vi.fn().mockResolvedValue(new Response("private provider detail", { status: 403 })))).rejects.toThrow(
      "AUTH_EMAIL_DELIVERY_FAILED"
    );
    await expect(sendAuthMail(mail, vi.fn().mockRejectedValue(new Error("private network detail")))).rejects.toThrow("AUTH_EMAIL_DELIVERY_FAILED");
  });
});
