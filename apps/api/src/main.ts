import { env } from "./config/env";
import { buildApp } from "./http/app";
import { captureException, flushObservability } from "./observability/sentry";
import { startOperationalAlerts } from "./observability/operational-alerts";

const app = await buildApp();
const stopAlerts = startOperationalAlerts();
app.addHook("onClose", stopAlerts);

try {
  await app.listen({ port: env.PORT ?? env.API_PORT, host: env.API_HOST });
} catch (error) {
  app.log.error(error);
  captureException(error);
  await flushObservability();
  process.exit(1);
}
