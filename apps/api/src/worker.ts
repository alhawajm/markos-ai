import { captureException, flushObservability, initObservability } from "./observability/sentry";
import { startMaintenanceWorker } from "./worker/maintenance-worker";
import { safeErrorLog } from "./http/safe-logging";
import { startOperationalAlerts } from "./observability/operational-alerts";

initObservability();
const stopAlerts = startOperationalAlerts();

const worker = startMaintenanceWorker({
  runImmediately: true
});

let shuttingDown = false;
async function shutdown(signal: NodeJS.Signals): Promise<void> {
  if (shuttingDown) return;
  shuttingDown = true;
  console.info(`Received ${signal}; stopping maintenance worker`);
  worker.stop();
  const drained = await worker.drain();
  await flushObservability();
  await stopAlerts();
  process.exit(drained ? 0 : 1);
}

process.on("SIGINT", (signal) => {
  void shutdown(signal);
});
process.on("SIGTERM", (signal) => {
  void shutdown(signal);
});
process.on("uncaughtException", (error) => {
  console.error("Worker uncaught exception", safeErrorLog(error));
  captureException(error);
  void flushObservability().finally(() => process.exit(1));
});
process.on("unhandledRejection", (reason) => {
  console.error("Worker unhandled rejection", safeErrorLog(reason));
  captureException(reason);
  void flushObservability().finally(() => process.exit(1));
});
