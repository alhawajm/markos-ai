import { env } from "./config/env";
import { buildApp } from "./http/app";
import { captureException, flushObservability } from "./observability/sentry";

const app = await buildApp();

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });
} catch (error) {
  app.log.error(error);
  captureException(error);
  await flushObservability();
  process.exit(1);
}
