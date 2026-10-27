import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    setupFiles: ["./test/setup.ts"],
    fileParallelism: false,
    hookTimeout: 20000,
    testTimeout: 20000
  }
});
