export type EmailProvider = "sendgrid" | "brevo";
export type EmailConfiguration = { provider: EmailProvider; apiKey: string | undefined; from: string | undefined };
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
  FROM_EMAIL?: string | undefined;
}): EmailConfiguration {
  const provider = values.EMAIL_PROVIDER === "brevo" ? "brevo" : "sendgrid";
  return { provider, apiKey: provider === "brevo" ? values.BREVO_API_KEY : values.SENDGRID_API_KEY, from: values.FROM_EMAIL };
}

/** One send attempt, no automatic provider fallback. Acceptance never means inbox delivery. */
export async function sendTransactionalMail(
  configuration: EmailConfiguration,
  mail: TransactionalMail,
  fetchImpl: typeof fetch = fetch,
  timeoutMs = 10000
): Promise<{ messageId: string }> {
  if (!configuration.apiKey || !configuration.from) throw new EmailDeliveryError("EMAIL_NOT_CONFIGURED");
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
