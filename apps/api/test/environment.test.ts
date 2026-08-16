import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { afterEach, describe, expect, it } from "vitest";
import { parseEnvironment } from "../src/config/env";
import { loadRepositoryEnv, repositoryEnvPath } from "../src/config/load-repository-env";

const temporaryDirectories: string[] = [];
const originalApiPort = process.env.API_PORT;

afterEach(() => {
  delete process.env.MARKOS_ENV_LOADING_TEST;
  delete process.env.MARKOS_ENV_LOADING_NEW;
  if (originalApiPort === undefined) delete process.env.API_PORT;
  else process.env.API_PORT = originalApiPort;
  for (const directory of temporaryDirectories.splice(0)) rmSync(directory, { force: true, recursive: true });
});

describe("environment configuration", () => {
  it("resolves the default file at the repository root", () => {
    expect(repositoryEnvPath).toBe(resolve(dirname(fileURLToPath(import.meta.url)), "../../../.env"));
  });

  it.each([
    ["omitted", {}, undefined],
    ["empty", { MEDIA_PUBLIC_BASE_URL: "" }, undefined],
    ["configured", { MEDIA_PUBLIC_BASE_URL: "https://api.example.test" }, "https://api.example.test"]
  ])("accepts MEDIA_PUBLIC_BASE_URL when %s", (_case, input, expected) => {
    expect(parseEnvironment(input).MEDIA_PUBLIC_BASE_URL).toBe(expected);
  });

  it("uses the provisional v25.0 publishing and analytics Graph version by default", () => {
    expect(parseEnvironment({}).META_GRAPH_VERSION).toBe("v25.0");
  });

  it("loads an explicit environment file without overwriting existing process values", () => {
    const directory = mkdtempSync(join(tmpdir(), "markos-env-test-"));
    temporaryDirectories.push(directory);
    const path = join(directory, ".env");
    writeFileSync(path, "MARKOS_ENV_LOADING_TEST=from-file\nMARKOS_ENV_LOADING_NEW=from-file\nAPI_PORT=4567\n", { mode: 0o600 });
    process.env.MARKOS_ENV_LOADING_TEST = "from-process";
    process.env.API_PORT = "7654";

    expect(loadRepositoryEnv(path)).toBe(true);
    expect(process.env.MARKOS_ENV_LOADING_TEST).toBe("from-process");
    expect(process.env.MARKOS_ENV_LOADING_NEW).toBe("from-file");
    expect(process.env.API_PORT).toBe("7654");
  });

  it("does nothing when the environment file is absent", () => {
    expect(loadRepositoryEnv(join(tmpdir(), "markos-env-file-does-not-exist"))).toBe(false);
  });
});
