import { sendGmailMail } from "./gmail-mail";

export type EmailProvider = "sendgrid" | "brevo" | "gmail";
export type GmailCredentials = { clientId: string | undefined; clientSecret: string | undefined; refreshToken: string | undefined };
export type EmailConfiguration = { provider: EmailProvider; apiKey: string | undefined; from: string | undefined; gmail?: GmailCredentials | undefined };
export type TransactionalMail = {
  to: string[];
  subject: string;
  text: string;
  html?: string;
  attachments?: { content: string; filename: string; type: string }[];
};
export class EmailDeliveryError extends Error {
  constructor(
    readonly code: "EMAIL_NOT_CONFIGURED" | "EMAIL_REJECTED" | "EMAIL_RESULT_UNKNOWN",
    readonly retryable = false,
    readonly status?: number
  ) {
    super(code);
  }
}

export function emailConfiguration(values: {
  EMAIL_PROVIDER?: string | undefined;
  SENDGRID_API_KEY?: string | undefined;
  BREVO_API_KEY?: string | undefined;
  GMAIL_CLIENT_ID?: string | undefined;
  GMAIL_CLIENT_SECRET?: string | undefined;
  GMAIL_REFRESH_TOKEN?: string | undefined;
  FROM_EMAIL?: string | undefined;
}): EmailConfiguration {
  const provider = values.EMAIL_PROVIDER === "gmail" ? "gmail" : values.EMAIL_PROVIDER === "brevo" ? "brevo" : "sendgrid";
  return {
    provider,
    apiKey: provider === "gmail" ? undefined : provider === "brevo" ? values.BREVO_API_KEY : values.SENDGRID_API_KEY,
    from: values.FROM_EMAIL,
    ...(provider === "gmail"
      ? { gmail: { clientId: values.GMAIL_CLIENT_ID, clientSecret: values.GMAIL_CLIENT_SECRET, refreshToken: values.GMAIL_REFRESH_TOKEN } }
      : {})
  };
}

export function isEmailConfigured(configuration: EmailConfiguration): boolean {
  return (
    !!configuration.from &&
    (configuration.provider === "gmail"
      ? !!configuration.gmail?.clientId && !!configuration.gmail.clientSecret && !!configuration.gmail.refreshToken
      : !!configuration.apiKey)
  );
}

/** No provider fallback or ambiguous-send replay. Gmail permits one refresh after an explicit 401 rejection. */
export async function sendTransactionalMail(
  configuration: EmailConfiguration,
  mail: TransactionalMail,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10000
): Promise<{ messageId: string }> {
  if (!isEmailConfigured(configuration)) throw new EmailDeliveryError("EMAIL_NOT_CONFIGURED");
  if (configuration.provider === "gmail") return sendGmailMail(configuration, mail, fetchImpl, timeoutMs);
  const brevo = configuration.provider === "brevo";
  const payload = brevo
    ? {
        sender: { email: configuration.from, name: "MARKOS" },
        to: mail.to.map((email) => ({ email })),
        subject: mail.subject,
        ...(mail.html ? { htmlContent: mail.html } : { textContent: mail.text }),
        ...(mail.attachments?.length ? { attachment: mail.attachments.map((a) => ({ content: a.content, name: a.filename })) } : {})
      }
    : {
        personalizations: [{ to: mail.to.map((email) => ({ email })) }],
        from: { email: configuration.from, name: "MARKOS" },
        subject: mail.subject,
        content: [{ type: "text/plain", value: mail.text }, ...(mail.html ? [{ type: "text/html", value: mail.html }] : [])],
        ...(mail.attachments?.length ? { attachments: mail.attachments.map((a) => ({ ...a, disposition: "attachment" })) } : {}),
        tracking_settings: { click_tracking: { enable: false, enable_text: false }, open_tracking: { enable: false } }
      };
  let response: Response;
  try {
    response = await fetchImpl(brevo ? "https://api.brevo.com/v3/smtp/email" : "https://api.sendgrid.com/v3/mail/send", {
      method: "POST",
      redirect: "error",
      signal: AbortSignal.timeout(timeoutMs),
      headers: { "content-type": "application/json", ...(brevo ? { "api-key": configuration.apiKey } : { Authorization: `Bearer ${configuration.apiKey}` }) },
      body: JSON.stringify(payload)
    });
  } catch {
    throw new EmailDeliveryError("EMAIL_RESULT_UNKNOWN");
  }
  if (response.status !== (brevo ? 201 : 202))
    throw new EmailDeliveryError("EMAIL_REJECTED", response.status === 429 || response.status >= 500, response.status);
  if (!brevo) return { messageId: response.headers.get("x-message-id")?.slice(0, 500) || "accepted" };
  try {
    const body: unknown = await response.json();
    const messageId = body && typeof body === "object" && "messageId" in body ? body.messageId : undefined;
    if (typeof messageId !== "string" || !messageId || messageId.length > 500) throw new Error("Invalid acknowledgement");
    return { messageId };
  } catch {
    throw new EmailDeliveryError("EMAIL_RESULT_UNKNOWN");
  }
}
