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

    let response: Response;

    try {
      response = await this.fetchImpl("https://api.sendgrid.com/v3/mail/send", {
        body: JSON.stringify({
          personalizations: [{ to: [{ email: input.email }] }],
          from: { email: this.configuration.fromEmail },
          subject,
          content: [
            {
              type: "text/plain",
              value: `${body}\n\n${verificationUrl.toString()}`
            },
            {
              type: "text/html",
              value: `<p>${body}</p><p><a href="${verificationUrl.toString()}">${action}</a></p>`
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
