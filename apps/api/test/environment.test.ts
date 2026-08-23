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

  it("uses the locked Instagram Login graph version and release scope set by default", () => {
    const parsed = parseEnvironment({});

    expect(parsed.INSTAGRAM_GRAPH_VERSION).toBe("v25.0");
    expect(parsed.INSTAGRAM_OAUTH_SCOPES).toEqual(["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"]);
    expect(parsed.INSTAGRAM_CONTAINER_POLL_ATTEMPTS).toBe(6);
    expect(parsed.INSTAGRAM_CONTAINER_POLL_DELAY_MS).toBe(60_000);
  });

  it("canonicalizes the allowlisted Instagram release scopes", () => {
    expect(
      parseEnvironment({
        INSTAGRAM_OAUTH_SCOPES: "instagram_business_manage_insights, instagram_business_basic,instagram_business_content_publish"
      }).INSTAGRAM_OAUTH_SCOPES
    ).toEqual(["instagram_business_basic", "instagram_business_content_publish", "instagram_business_manage_insights"]);
  });

  it.each([
    ["duplicates", "instagram_business_basic,instagram_business_basic"],
    ["missing basic", "instagram_business_content_publish,instagram_business_manage_insights"],
    ["unknown scope", "instagram_business_basic,instagram_business_manage_messages"],
    ["Facebook Login scope", "instagram_business_basic,instagram_content_publish"]
  ])("rejects Instagram OAuth scopes with %s", (_case, scopes) => {
    expect(() => parseEnvironment({ INSTAGRAM_OAUTH_SCOPES: scopes })).toThrow();
  });

  it("keeps local media storage as the zero-credential development default", () => {
    const parsed = parseEnvironment({});

    expect(parsed.MEDIA_STORAGE_DRIVER).toBe("local");
    expect(parsed.SIGNED_URL_TTL).toBe(3600);
    expect(parsed.AWS_SECRET_ACCESS_KEY).toBeUndefined();
  });

  it("requires the complete Railway S3 contract only when the S3 driver is selected", () => {
    expect(() => parseEnvironment({ MEDIA_STORAGE_DRIVER: "s3", API_BASE_URL: "https://api.example.test" })).toThrow();

    expect(
      parseEnvironment({
        API_BASE_URL: "https://api.example.test",
        AWS_ACCESS_KEY_ID: "fake-access-key",
        AWS_DEFAULT_REGION: "auto",
        AWS_ENDPOINT_URL: "https://storage.railway.app",
        AWS_S3_BUCKET_NAME: "markos-staging",
        AWS_S3_URL_STYLE: "virtual",
        AWS_SECRET_ACCESS_KEY: "fake-secret-key",
        MEDIA_STORAGE_DRIVER: "s3",
        SIGNED_URL_TTL: "3600"
      })
    ).toMatchObject({
      AWS_S3_URL_STYLE: "virtual",
      MEDIA_STORAGE_DRIVER: "s3",
      SIGNED_URL_TTL: 3600
    });
  });

  it("requires HTTPS storage and stable public endpoints for the S3 driver", () => {
    const base = {
      AWS_ACCESS_KEY_ID: "fake-access-key",
      AWS_DEFAULT_REGION: "auto",
      AWS_S3_BUCKET_NAME: "markos-staging",
      AWS_S3_URL_STYLE: "virtual",
      AWS_SECRET_ACCESS_KEY: "fake-secret-key",
      MEDIA_STORAGE_DRIVER: "s3"
    };

    expect(() => parseEnvironment({ ...base, API_BASE_URL: "https://api.example.test", AWS_ENDPOINT_URL: "http://storage.example.test" })).toThrow();
    expect(() => parseEnvironment({ ...base, API_BASE_URL: "http://localhost:4000", AWS_ENDPOINT_URL: "https://storage.railway.app" })).toThrow();
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
