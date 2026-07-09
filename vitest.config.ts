import { defineConfig, configDefaults } from "vitest/config";

// Keep Playwright E2E specs (e2e/**) out of the vitest run — they import @playwright/test
// and are executed by `npx playwright test`, not vitest.
export default defineConfig({
  resolve: {
    // `server-only` is a Next.js build-time guard with no Node entry point; stub it so server
    // modules (which import it to stay off the client bundle) are unit-testable.
    alias: { "server-only": new URL("./test/stubs/server-only.ts", import.meta.url).pathname },
  },
  test: {
    exclude: [...configDefaults.exclude, "e2e/**"],
  },
});
