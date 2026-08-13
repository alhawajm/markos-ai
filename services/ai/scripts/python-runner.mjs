import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";

const localPython = process.platform === "win32" ? join(".venv", "Scripts", "python.exe") : join(".venv", "bin", "python");
const python = existsSync(localPython) ? localPython : "python";
const result = spawnSync(python, process.argv.slice(2), {
  shell: process.platform === "win32",
  stdio: "inherit"
});

process.exit(result.status ?? 1);
