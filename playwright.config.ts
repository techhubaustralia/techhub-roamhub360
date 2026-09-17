import { defineConfig, devices } from "@playwright/test";

// Playwright UI E2E config. Requires: `npm i -D @playwright/test && npx playwright install`.
// Run against a running app: E2E_BASE=http://localhost:3000 npx playwright test
//
// NOTE: production requires a real session. For local E2E run `npm run dev`, where the no-session
// dev branch of getUser() supplies a demo Workspace admin (or impersonate via the x-dev-user /
// x-dev-role / x-dev-tenant headers — see PROJECT_HANDOVER/11_TESTING_GUIDE.md).
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
