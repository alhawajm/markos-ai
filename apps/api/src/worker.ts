import { captureException, flushObservability, initObservability } from "./observability/sentry";
import { startMaintenanceWorker } from "./worker/maintenance-worker";

initObservability();

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
  process.exit(drained ? 0 : 1);
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
