import { env } from "../src/config/env";

/** Individual suites and CI share the same loopback-only, explicitly named test boundary. */
export function requireDisposableDatabase(localName: string): void {
  const database = new URL(env.DATABASE_URL);
  if (
    env.NODE_ENV !== "test" ||
    !["localhost", "127.0.0.1", "[::1]"].includes(database.hostname) ||
    ![`/${localName}`, "/markos_ci_test"].includes(database.pathname)
  )
    throw new Error(`Use the named local disposable database ${localName} or markos_ci_test`);
}
