import { createHash, randomUUID } from "node:crypto";
import { EmailDeliveryError, type EmailConfiguration, type TransactionalMail } from "./transactional-mail";

const tokenUrl = "https://oauth2.googleapis.com/token";
const sendUrl = "https://gmail.googleapis.com/gmail/v1/users/me/messages/send";
type Token = { value: string; expiresAt: number };
// Process-local only. Coalesce refreshes without persisting access tokens or exposing credentials.
const tokens = new Map<string, { fetchImpl: typeof fetch; pending: Promise<Token>; expiresAt: number }>();
const encoded = (text: string) =>
  Buffer.from(text, "utf8")
    .toString("base64")
    .match(/.{1,76}/g)
    ?.join("\r\n") ?? "";

function subjectHeader(subject: string): string {
  const words: string[] = [];
  let chunk = "";
  for (const point of subject) {
    if (Buffer.byteLength(chunk + point) > 42) {
      words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
      chunk = "";
    }
    chunk += point;
  }
  words.push(`=?UTF-8?B?${Buffer.from(chunk).toString("base64")}?=`);
  return words.join("\r\n ");
}

/** RFC 5322/MIME: UTF-8 bodies, multipart alternatives, and binary report attachments. */
function rawMessage(from: string, mail: TransactionalMail): string {
  const mailbox = /^[A-Za-z0-9.!#$%&'*+/=?^_`{|}~-]+@[A-Za-z0-9](?:[A-Za-z0-9.-]*[A-Za-z0-9])?\.[A-Za-z]{2,}$/;
  if (
    !mailbox.test(from) ||
    !mail.to.length ||
    mail.to.length > 50 ||
    mail.to.some((to) => to.length > 254 || !mailbox.test(to)) ||
    /[\r\n]/.test(mail.subject)
  )
    throw new EmailDeliveryError("EMAIL_REJECTED");
  const alternative = `markos-alternative-${randomUUID()}`;
  const mixed = `markos-mixed-${randomUUID()}`;
  const part = (type: string, text: string) => `Content-Type: ${type}; charset=UTF-8\r\nContent-Transfer-Encoding: base64\r\n\r\n${encoded(text)}\r\n`;
  const content = mail.html
    ? `Content-Type: multipart/alternative; boundary="${alternative}"\r\n\r\n--${alternative}\r\n${part("text/plain", mail.text)}--${alternative}\r\n${part("text/html", mail.html)}--${alternative}--\r\n`
    : part("text/plain", mail.text);
  const attachments = mail.attachments ?? [];
  const attachmentParts = attachments.map((attachment) => {
    if (
      !/^[a-z0-9!#$&^_.+-]+\/[a-z0-9!#$&^_.+-]+$/i.test(attachment.type) ||
      !attachment.filename ||
      attachment.filename.length > 150 ||
      /[\r\n\x00]/.test(attachment.filename) ||
      !/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/.test(attachment.content)
    )
      throw new EmailDeliveryError("EMAIL_REJECTED");
    const filename = encodeURIComponent(attachment.filename).replace(/[!'()*]/g, (character) => `%${character.charCodeAt(0).toString(16).toUpperCase()}`);
    return `--${mixed}\r\nContent-Type: ${attachment.type}\r\nContent-Disposition: attachment; filename*=UTF-8''${filename}\r\nContent-Transfer-Encoding: base64\r\n\r\n${attachment.content.match(/.{1,76}/g)?.join("\r\n") ?? ""}\r\n`;
  });
  const message = `From: MARKOS <${from}>\r\nTo: ${mail.to.join(",\r\n ")}\r\nSubject: ${subjectHeader(mail.subject)}\r\nDate: ${new Date().toUTCString()}\r\nMessage-ID: <${randomUUID()}@${from.split("@")[1]}>\r\nMIME-Version: 1.0\r\n${attachments.length ? `Content-Type: multipart/mixed; boundary="${mixed}"\r\n\r\n--${mixed}\r\n${content}${attachmentParts.join("")}--${mixed}--\r\n` : content}`;
  if (Buffer.byteLength(message) > 25_000_000) throw new EmailDeliveryError("EMAIL_REJECTED");
  return Buffer.from(message).toString("base64url");
}

async function accessToken(configuration: EmailConfiguration, fetchImpl: typeof fetch, signal: AbortSignal, force = false): Promise<string> {
  const credentials = configuration.gmail!;
  const key = createHash("sha256").update(JSON.stringify(credentials)).digest("hex");
  for (const [id, entry] of tokens) if (entry.expiresAt <= Date.now()) tokens.delete(id);
  const cached = tokens.get(key);
  if (!force && cached?.fetchImpl === fetchImpl) return (await cached.pending).value;
  const pending = (async (): Promise<Token> => {
    let response: Response;
    try {
      response = await fetchImpl(tokenUrl, {
        method: "POST",
        redirect: "error",
        signal,
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "refresh_token",
          client_id: credentials.clientId!,
          client_secret: credentials.clientSecret!,
          refresh_token: credentials.refreshToken!
        }).toString()
      });
    } catch {
      // No message submission has happened, so a later explicit retry cannot duplicate mail.
      throw new EmailDeliveryError("EMAIL_REJECTED", true);
    }
    if (!response.ok) throw new EmailDeliveryError("EMAIL_REJECTED", response.status === 429 || response.status >= 500, response.status);
    try {
      const body: unknown = await response.json();
      if (
        !body ||
        typeof body !== "object" ||
        !("access_token" in body) ||
        typeof body.access_token !== "string" ||
        !body.access_token ||
        !("expires_in" in body) ||
        typeof body.expires_in !== "number" ||
        body.expires_in < 120
      )
        throw new Error("Invalid token acknowledgement");
      return { value: body.access_token, expiresAt: Date.now() + Math.min(body.expires_in, 3600) * 1000 - 60_000 };
    } catch {
      throw new EmailDeliveryError("EMAIL_REJECTED");
    }
  })();
  if (tokens.size >= 8) tokens.delete(tokens.keys().next().value!);
  tokens.set(key, { fetchImpl, pending, expiresAt: Date.now() + 30_000 });
  try {
    const token = await pending;
    if (tokens.get(key)?.pending === pending) tokens.set(key, { fetchImpl, pending, expiresAt: token.expiresAt });
    return token.value;
  } catch (error) {
    if (tokens.get(key)?.pending === pending) tokens.delete(key);
    throw error;
  }
}

export async function sendGmailMail(
  configuration: EmailConfiguration,
  mail: TransactionalMail,
  fetchImpl: typeof fetch,
  timeoutMs: number
): Promise<{ messageId: string }> {
  const raw = rawMessage(configuration.from!, mail);
  const signal = AbortSignal.timeout(timeoutMs);
  for (let attempt = 0; attempt < 2; attempt++) {
    const token = await accessToken(configuration, fetchImpl, signal, attempt === 1);
    let response: Response;
    try {
      response = await fetchImpl(sendUrl, {
        method: "POST",
        redirect: "error",
        signal,
        headers: { "content-type": "application/json", Authorization: `Bearer ${token}` },
        body: JSON.stringify({ raw })
      });
    } catch {
      throw new EmailDeliveryError("EMAIL_RESULT_UNKNOWN");
    }
    // An explicit 401 rejects the send. Refresh once; never replay an ambiguous submission.
    if (response.status === 401 && attempt === 0) continue;
    if (!response.ok) {
      let limited = response.status === 429;
      if (response.status === 403) {
        try {
          const body = (await response.json()) as { error?: { errors?: { reason?: unknown }[] } };
          limited =
            body.error?.errors?.some((error) => ["rateLimitExceeded", "userRateLimitExceeded", "dailyLimitExceeded"].includes(String(error.reason))) ?? false;
        } catch {
          /* Only allowlisted quota reasons affect retry classification. */
        }
      }
      throw new EmailDeliveryError("EMAIL_REJECTED", limited || response.status >= 500, response.status);
    }
    try {
      const body: unknown = await response.json();
      if (!body || typeof body !== "object" || !("id" in body) || typeof body.id !== "string" || !/^[A-Za-z0-9_-]{1,500}$/.test(body.id))
        throw new Error("Invalid send acknowledgement");
      return { messageId: body.id };
    } catch {
      throw new EmailDeliveryError("EMAIL_RESULT_UNKNOWN");
    }
  }
  throw new EmailDeliveryError("EMAIL_REJECTED");
}
