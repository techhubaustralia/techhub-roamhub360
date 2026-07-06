import { defineConfig, devices } from "@playwright/test";

// Playwright UI E2E config. Requires: `npm i -D @playwright/test && npx playwright install`.
// Run against a running app: E2E_BASE=http://localhost:3000 npx playwright test
//
// NOTE: the app sits behind Entra Easy Auth in prod. For local/staging E2E, run the app
// with a dev identity (no Easy Auth) or inject the x-ms-client-principal-name header via a
// proxy. The specs below assume the dev server (default identity = global-admin).
export default defineConfig({
  testDir: "./e2e",
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: false, // bookings mutate shared state; keep serial for determinism
  retries: process.env.CI ? 2 : 0,
  reporter: [["list"], ["html", { open: "never" }]],
  use: {
    baseURL: process.env.E2E_BASE || "http://localhost:3000",
    trace: "on-first-retry",
    screenshot: "only-on-failure",
  },
  projects: [{ name: "chromium", use: { ...devices["Desktop Chrome"] } }],
});
