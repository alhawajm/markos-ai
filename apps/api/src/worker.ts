import { startMaintenanceWorker } from "./worker/maintenance-worker";

const worker = startMaintenanceWorker({
  runImmediately: true
});

function shutdown(signal: NodeJS.Signals): void {
  console.info(`Received ${signal}; stopping maintenance worker`);
  worker.stop();
  process.exit(0);
}

process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
