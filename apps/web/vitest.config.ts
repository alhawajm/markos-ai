import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    exclude: ["test/**/*.browser.test.ts"],
    include: ["test/**/*.test.ts"],
    hookTimeout: 30_000,
    testTimeout: 30_000,
  },
});
