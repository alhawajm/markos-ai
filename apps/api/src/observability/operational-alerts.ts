import { env } from "../config/env";
import { createRedisClient } from "../cache/redis";
import { createFailureReporter, setFailureReporter } from "./failure-alerts";
import { emailConfiguration } from "../email/transactional-mail";

export function startOperationalAlerts(): () => Promise<void> {
  if (!env.OPS_ALERTS_ENABLED) return async () => {};
  const configuration = emailConfiguration(env);
  if (!env.OPS_ALERT_EMAIL || !configuration.apiKey || !configuration.from) throw new Error("OPS_ALERTS_NOT_CONFIGURED");
  const redis = createRedisClient();
  redis.on("error", () => {});
  let connection: Promise<unknown> | undefined;
  setFailureReporter(
    createFailureReporter({
      apiKey: configuration.apiKey,
      from: configuration.from,
      provider: configuration.provider,
      to: env.OPS_ALERT_EMAIL,
      cooldownSeconds: env.OPS_ALERT_COOLDOWN_SECONDS,
      claim: async (key, seconds) => {
        if (redis.status !== "ready") {
          connection ??= redis.connect().finally(() => {
            connection = undefined;
          });
          await connection;
        }
        return (await redis.set(key, "1", "EX", seconds, "NX")) === "OK";
      }
    })
  );
  return async () => {
    setFailureReporter(undefined);
    redis.disconnect();
  };
}
