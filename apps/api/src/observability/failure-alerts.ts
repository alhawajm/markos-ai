import { createHash } from "node:crypto";
import { EmailDeliveryError, sendTransactionalMail, type EmailProvider } from "../email/transactional-mail";

export type OperationalFailure = { service: "api" | "worker" | "backup"; code: string; task: string };
type AlertResult = "ACCEPTED" | "FAILED" | "UNKNOWN" | "SUPPRESSED";
let reporter: ((failure: OperationalFailure) => Promise<AlertResult>) | undefined;
export function setFailureReporter(next: typeof reporter): void {
  reporter = next;
}
export function reportOperationalFailure(failure: OperationalFailure): void {
  if (reporter) void reporter(failure).catch(() => console.error("Operational alert delivery failed"));
}

/** At most one email per classified failure/cooldown; raw exceptions never enter the message. */
export function createFailureReporter(options: {
  provider?: EmailProvider;
  apiKey: string;
  from: string;
  to: string;
  cooldownSeconds: number;
  claim: (key: string, seconds: number) => Promise<boolean>;
  fetchImpl?: typeof fetch;
  now?: () => number;
}) {
  const recent = new Map<string, number>();
  return async (input: OperationalFailure): Promise<AlertResult> => {
    const valid = (value: string) => /^[A-Za-z][A-Za-z0-9_.-]{0,99}$/.test(value);
    if (!valid(input.code) || !valid(input.task) || !["api", "worker", "backup"].includes(input.service)) return "SUPPRESSED";
    const now = (options.now ?? Date.now)();
    for (const [key, until] of recent) if (until <= now) recent.delete(key);
    const key = `markos:ops-alert:${createHash("sha256").update(JSON.stringify(input)).digest("hex")}`;
    if ((recent.get(key) ?? 0) > now) return "SUPPRESSED";
    recent.set(key, now + options.cooldownSeconds * 1000);
    try {
      if (!(await options.claim(key, options.cooldownSeconds))) return "SUPPRESSED";
    } catch {
      /* Keep the bounded in-process guard when Redis itself is the failing dependency. */
    }
    const text = `MARKOS needs attention.\nService: ${input.service}\nTask: ${input.task}\nCode: ${input.code}\nTime: ${new Date(now).toISOString()}\n\nCheck Railway service health and sanitized logs. This alert contains no customer content or credentials.`;
    try {
      await sendTransactionalMail(
        { provider: options.provider ?? "sendgrid", apiKey: options.apiKey, from: options.from },
        { to: [options.to], subject: `MARKOS: ${input.service} ${input.code}`, text },
        options.fetchImpl ?? fetch,
        8000
      );
      return "ACCEPTED";
    } catch (error) {
      return error instanceof EmailDeliveryError && error.code !== "EMAIL_RESULT_UNKNOWN" ? "FAILED" : "UNKNOWN";
    }
  };
}
