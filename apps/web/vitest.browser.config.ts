import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    hookTimeout: 30_000,
    include: [
      "test/settings-panel.browser.test.ts",
      "test/presentation-journey.browser.test.ts",
      "test/design-preview.browser.test.ts",
      "test/auth-preview.browser.test.ts",
      "test/settings-preview.browser.test.ts",
    ],
    testTimeout: 30_000,
  },
});
