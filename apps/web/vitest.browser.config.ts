import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    fileParallelism: false,
    hookTimeout: 30_000,
    include: [
      "test/settings-panel.browser.test.ts",
      "test/presentation-journey.browser.test.ts",
      "test/marketing-landing.browser.test.ts",
      "test/auth-page.browser.test.ts",
      "test/onboarding-profile-review.browser.test.ts",
      "test/legal-document.browser.test.ts"
    ],
    testTimeout: 30_000
  }
});
