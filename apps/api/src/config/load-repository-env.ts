import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { loadEnvFile } from "node:process";
import { fileURLToPath } from "node:url";

export const repositoryEnvPath = resolve(dirname(fileURLToPath(import.meta.url)), "../../../../.env");

export function loadRepositoryEnv(path = repositoryEnvPath): boolean {
  if (!existsSync(path)) return false;

  loadEnvFile(path);
  return true;
}

loadRepositoryEnv();
