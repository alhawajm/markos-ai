import type { Locale } from "@markos/shared-types";
import { env } from "../config/env";

export interface VerificationEmailProvider {
  readonly mode: "local" | "sendgrid";
  send(input: { email: string; locale: Locale; token: string }): Promise<void>;
}

export class VerificationEmailConfigurationError extends Error {
  constructor() {
    super("Email verification delivery is not configured");
  }
}

export class VerificationEmailDeliveryError extends Error {
  constructor() {
    super("Email verification could not be delivered");
  }
}

export function assertVerificationEmailConfiguration(
  configuration: {
    apiKey: string | undefined;
    fromEmail: string | undefined;
    nodeEnv: "development" | "test" | "production";
    provider: "local" | "sendgrid";
  } = {
    apiKey: env.SENDGRID_API_KEY,
    fromEmail: env.FROM_EMAIL,
    nodeEnv: env.NODE_ENV,
    provider: env.EMAIL_PROVIDER
  }
): void {
  if (configuration.nodeEnv !== "production") {
    return;
  }

  if (configuration.provider !== "sendgrid" || configuration.apiKey === undefined || configuration.fromEmail === undefined) {
    throw new VerificationEmailConfigurationError();
  }
}

export class LocalVerificationEmailProvider implements VerificationEmailProvider {
  readonly mode = "local" as const;

  async send(_input: { email: string; locale: Locale; token: string }): Promise<void> {
    return Promise.resolve();
  }
}

export class SendGridVerificationEmailProvider implements VerificationEmailProvider {
  readonly mode = "sendgrid" as const;

  constructor(
    private readonly configuration: {
      apiKey: string | undefined;
      fromEmail: string | undefined;
      webBaseUrl: string;
    },
    private readonly fetchImpl: typeof fetch = fetch
  ) {}

  async send(input: { email: string; locale: Locale; token: string }): Promise<void> {
    if (this.configuration.apiKey === undefined || this.configuration.fromEmail === undefined) {
      throw new VerificationEmailConfigurationError();
    }

    const verificationUrl = new URL(`/${input.locale}/verify`, this.configuration.webBaseUrl);
    verificationUrl.searchParams.set("token", input.token);
    const arabic = input.locale === "ar";
    const subject = arabic ? "تأكيد بريدك الإلكتروني في MARKOS AI" : "Verify your MARKOS AI email";
    const body = arabic
      ? "أكد بريدك الإلكتروني للمتابعة إلى إعداد نشاطك في MARKOS AI."
      : "Verify your email to continue setting up your business in MARKOS AI.";
    const action = arabic ? "تأكيد البريد الإلكتروني" : "Verify email";
    const returnHint = arabic
      ? "بعد التأكيد، عد إلى علامة التبويب التي أنشأت منها الحساب واختر متابعة الإعداد."
      : "After verifying, return to the tab where you created your account and continue setup.";
    const expiry = arabic
      ? "تنتهي صلاحية الرابط خلال " + Math.ceil(env.EMAIL_VERIFICATION_TTL / 60) + " دقيقة."
      : "This link expires in " + Math.ceil(env.EMAIL_VERIFICATION_TTL / 60) + " minutes.";
    const ignore = arabic ? "إذا لم تنشئ هذا الحساب، يمكنك تجاهل هذه الرسالة." : "If you did not create this account, you can ignore this email.";
    const backup = arabic ? "إذا لم يعمل الزر، انسخ هذا الرابط إلى متصفحك:" : "If the button does not work, copy this link into your browser:";
    const url = verificationUrl.toString().replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
    const html =
      '<!doctype html><html lang="' +
      input.locale +
      '" dir="' +
      (arabic ? "rtl" : "ltr") +
      '"><body style="margin:0;background:#f7fafa;color:#20212b;font-family:Arial,sans-serif;line-height:1.6">' +
      '<table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td style="padding:32px 16px"><table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;margin:auto;background:#ffffff;border:1px solid #dce4e4;border-radius:16px"><tr><td style="padding:32px">' +
      '<p style="margin:0 0 24px;font-size:20px;font-weight:bold">MARKOS AI</p><h1 style="font-size:26px;line-height:1.3;margin:0 0 16px">' +
      action +
      '</h1><p style="font-size:16px">' +
      body +
      "</p>" +
      '<p style="margin:28px 0"><a href="' +
      url +
      '" style="display:inline-block;background:#d88fa3;color:#20212b;text-decoration:none;font-size:16px;font-weight:bold;padding:13px 24px;border-radius:8px">' +
      action +
      '</a></p><p style="font-size:16px">' +
      returnHint +
      '</p><p style="font-size:14px">' +
      expiry +
      "</p>" +
      '<hr style="border:0;border-top:1px solid #dce4e4;margin:24px 0"><p style="font-size:14px">' +
      backup +
      '</p><p dir="ltr" style="overflow-wrap:anywhere;word-break:break-all;font-size:14px"><a style="color:#6c3ce8" href="' +
      url +
      '">' +
      url +
      '</a></p><p style="font-size:14px;color:#535964">' +
      ignore +
      "</p></td></tr></table></td></tr></table></body></html>";

    let response: Response;

    try {
      response = await this.fetchImpl("https://api.sendgrid.com/v3/mail/send", {
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.email }] }],
          from: { email: this.configuration.fromEmail, name: "MARKOS AI" },
          subject,
          content: [
            {
              type: "text/plain",
              value: `${body}\n\n${verificationUrl.toString()}\n\n${returnHint}\n${expiry}\n\n${ignore}`
            },
            {
              type: "text/html",
              value: html
            }
          ]
        }),
        headers: {
          Authorization: `Bearer ${this.configuration.apiKey}`,
          "content-type": "application/json"
        },
        method: "POST",
        signal: AbortSignal.timeout(10_000)
      });
    } catch {
      throw new VerificationEmailDeliveryError();
    }

    if (response.status !== 202) {
      throw new VerificationEmailDeliveryError();
    }
  }
}

export function createVerificationEmailProvider(fetchImpl: typeof fetch = fetch): VerificationEmailProvider {
  if (env.EMAIL_PROVIDER === "local") {
    if (env.NODE_ENV === "production") {
      throw new VerificationEmailConfigurationError();
    }

    return new LocalVerificationEmailProvider();
  }

  return new SendGridVerificationEmailProvider(
    {
      apiKey: env.SENDGRID_API_KEY,
      fromEmail: env.FROM_EMAIL,
      webBaseUrl: env.WEB_BASE_URL
    },
    fetchImpl
  );
}
