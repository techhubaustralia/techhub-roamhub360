import { defineConfig, configDefaults } from "vitest/config";

// Keep Playwright E2E specs (e2e/**) out of the vitest run — they import @playwright/test
// and are executed by `npx playwright test`, not vitest.
export default defineConfig({
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
