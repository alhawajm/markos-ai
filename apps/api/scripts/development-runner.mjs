import { spawn } from "node:child_process";

const watchArguments = process.platform === "win32" ? ["--watch-path=src", "--watch-preserve-output"] : ["--watch"];
const child = spawn(process.execPath, [...watchArguments, "--import", "tsx", "src/main.ts"], {
  shell: false,
  stdio: "inherit"
});

child.on("error", (error) => {
  console.error(`Unable to start the API development watcher: ${error.message}`);
  process.exitCode = 1;
});

child.on("exit", (code, signal) => {
  if (signal !== null) {
    process.kill(process.pid, signal);
    return;
  }
  process.exitCode = code ?? 1;
});
