import { captureException, flushObservability, initObservability } from "./observability/sentry";
import { startMaintenanceWorker } from "./worker/maintenance-worker";

initObservability();

const worker = startMaintenanceWorker({
  runImmediately: true
});

async function shutdown(signal: NodeJS.Signals): Promise<void> {
  console.info(`Received ${signal}; stopping maintenance worker`);
  worker.stop();
  await flushObservability();
  process.exit(0);
}

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});
process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});
process.on("uncaughtException", (error) => {
  console.error(error);
  captureException(error);
  void flushObservability().finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error(reason);
  captureException(reason);
  void flushObservability().finally(() => process.exit(1));
});
