// Capture Google Play phone screenshots from a running RoamHub360 (a signed-in demo workspace).
//
//   npm i -D @playwright/test && npx playwright install chromium        # one-off
//   $env:SHOT_BASE="https://demo.roamhub360.com"                        # workspace to shoot
//   $env:SHOT_EMAIL="demo@example.com"; $env:SHOT_PASSWORD="…"          # a password (not SSO) account
//   node scripts/store-screenshots.mjs                                  # → store/out/screenshots/*.png
//   Remove-Item Env:SHOT_PASSWORD
//
// Credentials are read from the environment only, never logged, never written. Against localhost
// (dev identity, no login) leave SHOT_EMAIL/SHOT_PASSWORD unset. Output is 1080×2340 PNGs (9:19.5,
// within Play's limits), light theme. Pick 2–8 of them in Play Console; retake any that show real
// customer names — use the demo workspace.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const out = path.join(root, "store", "out", "screenshots");
await mkdir(out, { recursive: true });

const BASE = (process.env.SHOT_BASE || "http://localhost:3000").replace(/\/+$/, "");
const EMAIL = process.env.SHOT_EMAIL || "";
const PASSWORD = process.env.SHOT_PASSWORD || "";

// The pages worth showing, in listing order. `settle` gives client-side fetches time to paint.
const SHOTS = [
  { file: "01-home.png", path: "/", settle: 1500 },
  { file: "02-book.png", path: "/book", settle: 2500 },
  { file: "03-whos-in.png", path: "/team", settle: 2000 },
  { file: "04-my-bookings.png", path: "/mine", settle: 1500 },
  { file: "05-office-bookings.png", path: "/office-booking", settle: 2000 },
];

const browser = await chromium.launch();
const ctx = await browser.newContext({
  viewport: { width: 360, height: 780 }, // ×3 = 1080×2340
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  colorScheme: "light",
  locale: "en-AU",
  timezoneId: "Australia/Sydney",
  userAgent: "Mozilla/5.0 (Linux; Android 14; Pixel 8) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/128.0 Mobile Safari/537.36",
});
const page = await ctx.newPage();

// Hide the install banner / cookie notice so every frame is clean.
await ctx.addInitScript(() => {
  try {
    localStorage.setItem("rh-cookie-ack", "1");
    localStorage.setItem("rh-install-dismissed", "1");
  } catch {
    /* storage blocked — banners may appear; harmless */
  }
});

if (EMAIL && PASSWORD) {
  await page.goto(`${BASE}/signin`, { waitUntil: "networkidle" });
  await page.getByLabel("Email").fill(EMAIL);
  await page.getByLabel("Password").fill(PASSWORD);
  await page.getByRole("button", { name: /^sign in$/i }).click();
  await page.waitForURL((u) => !u.pathname.startsWith("/signin"), { timeout: 20_000 }).catch(() => {});
  if (page.url().includes("/signin")) {
    console.error("Sign-in did not complete (wrong credentials, 2FA on the account, or SSO-only user).");
    await browser.close();
    process.exit(1);
  }
  console.log("signed in");
}

for (const s of SHOTS) {
  await page.goto(`${BASE}${s.path}`, { waitUntil: "networkidle" });
  await page.waitForTimeout(s.settle);
  const file = path.join(out, s.file);
  await page.screenshot({ path: file, fullPage: false });
  console.log(`wrote store/out/screenshots/${s.file}`);
}

await browser.close();
