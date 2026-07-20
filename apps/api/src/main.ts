import { env } from "./config/env";
import { buildApp } from "./http/app";
import { captureException, flushObservability } from "./observability/sentry";
import { startMaintenanceWorker, type MaintenanceWorkerHandle } from "./worker/maintenance-worker";

const app = await buildApp();
let maintenanceWorker: MaintenanceWorkerHandle | undefined;
let shuttingDown = false;
const workerShutdownTimeoutMs = 8_000;

async function stopMaintenanceWorker(): Promise<void> {
  if (!maintenanceWorker) {
    return;
  }

  let timeout: NodeJS.Timeout | undefined;
  const outcome = await Promise.race([
    maintenanceWorker.stop().then(() => "stopped" as const),
    new Promise<"timed-out">((resolve) => {
      timeout = setTimeout(() => resolve("timed-out"), workerShutdownTimeoutMs);
    })
  ]);

  if (timeout) {
    clearTimeout(timeout);
  }

  if (outcome === "timed-out") {
    app.log.warn(
      { timeoutMs: workerShutdownTimeoutMs },
      "Maintenance worker did not stop within the shutdown grace period"
    );
  }
}

async function shutdown(reason: string, exitCode: number): Promise<void> {
  if (shuttingDown) {
    return;
  }

  shuttingDown = true;
  app.log.info({ reason }, "Stopping API runtime");

  try {
    await stopMaintenanceWorker();
    await app.close();
    await flushObservability();
  } catch (error) {
    app.log.error(error, "API runtime shutdown failed");
    captureException(error);
    exitCode = 1;
  }

  process.exit(exitCode);
}

process.once("SIGINT", () => {
  void shutdown("SIGINT", 0);
});
process.once("SIGTERM", () => {
  void shutdown("SIGTERM", 0);
});
process.once("uncaughtException", (error) => {
  app.log.error(error, "Uncaught API runtime exception");
  captureException(error);
  void shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", (reason) => {
  app.log.error({ reason }, "Unhandled API runtime rejection");
  captureException(reason);
  void shutdown("unhandledRejection", 1);
});

try {
  await app.listen({ port: env.API_PORT, host: "0.0.0.0" });

  if (env.WORKER_EMBEDDED) {
    maintenanceWorker = startMaintenanceWorker({ runImmediately: true });
    app.log.info("Embedded maintenance worker started");
  }
} catch (error) {
  app.log.error(error);
  captureException(error);
  await shutdown("startupFailure", 1);
}
