export interface WorkerLogger {
  error(message: string, meta?: Record<string, unknown>): void;
  info(message: string, meta?: Record<string, unknown>): void;
  warn(message: string, meta?: Record<string, unknown>): void;
}

export const workerLogger: WorkerLogger = {
  error: (message, meta) => console.error(message, meta ?? {}),
  info: (message, meta) => console.info(message, meta ?? {}),
  warn: (message, meta) => console.warn(message, meta ?? {})
};

/** A failed sibling must not make shutdown forget work that is still in flight. */
export async function settleWorkerBatch<T>(tasks: Promise<T>[]): Promise<T[]> {
  const results = await Promise.allSettled(tasks);
  const failure = results.find((result) => result.status === "rejected");
  if (failure?.status === "rejected") throw failure.reason;
  return results.flatMap((result) => (result.status === "fulfilled" ? [result.value] : []));
}

/** Log identifiers and classified codes, never provider bodies, prompts or credentials. */
export function workerErrorCode(error: unknown): string {
  const code = error && typeof error === "object" && "code" in error ? error.code : undefined;
  return typeof code === "string" && /^[A-Z][A-Z0-9_]{1,100}$/.test(code) ? code : "WORKER_UNEXPECTED_ERROR";
}

export async function observeWorkerTask<T>(logger: WorkerLogger, task: string, work: () => Promise<T>): Promise<T> {
  const started = performance.now();
  logger.info("Worker task started", { task });
  try {
    const result = await work();
    logger.info("Worker task completed", { task, durationMs: Math.round(performance.now() - started) });
    return result;
  } catch (error) {
    logger.error("Worker task failed", { task, durationMs: Math.round(performance.now() - started), errorCode: workerErrorCode(error) });
    throw error;
  }
}
