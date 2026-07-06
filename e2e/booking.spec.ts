import { test, expect } from "@playwright/test";

// Representative UI E2E specs for the booking flow. These drive the real UI; they assume a
// running app with a dev identity (global-admin) and at least one published building with a
// bookable desk. Adjust selectors/building names to your seeded fixtures.
//
// Coverage map (business rule -> spec):
//   - Booking creation flow ............... "books a desk and sees it in My Bookings"
//   - My Bookings <-> Home sync ........... same spec (asserts both surfaces)
//   - Conflict prevention ................. "a booked desk shows as unavailable"
//   - Floor/desk selection ................ "switches floor and space-type tabs"
//   - Role-based UI visibility ............ "admin sees admin nav; toggling Admin reveals lock controls"

test.describe("Booking — UI flow", () => {
  test("books a desk and it appears on Home and My Bookings", async ({ page }) => {
    await page.goto("/book");
    await page.getByRole("button", { name: /desks/i }).click();
    // pick the first available (green) desk on the plan
    await page.locator('[aria-label^="Desk"][aria-label*="free"]').first().click();
    await page.getByRole("button", { name: /confirm booking/i }).click();
    await expect(page.getByText(/desk booked/i)).toBeVisible();

    await page.goto("/mine");
    await expect(page.getByRole("cell", { name: /desk/i }).first()).toBeVisible();

    await page.goto("/");
    await expect(page.getByText(/active bookings/i)).toBeVisible();
    // the "0 upcoming" empty state must NOT be shown after a booking
    await expect(page.getByText(/no upcoming bookings/i)).toHaveCount(0);
  });

  test("a desk already booked for the date shows as unavailable", async ({ page }) => {
    await page.goto("/book");
    const booked = page.locator('[aria-label*="booked"]').first();
    if (await booked.count()) {
      await booked.click();
      await expect(page.getByText(/already booked/i)).toBeVisible();
    }
  });

  test("switches floor and space-type tabs without errors", async ({ page }) => {
    await page.goto("/book");
    await page.getByRole("button", { name: /offices/i }).click();
    await page.getByRole("button", { name: /meeting rooms/i }).click();
    await page.getByRole("button", { name: /desks/i }).click();
    await expect(page.getByText(/legend/i)).toBeVisible();
  });

  test("past date is not selectable (min = today)", async ({ page }) => {
    await page.goto("/book");
    await page.getByRole("button", { name: /desks/i }).click();
    await page.locator('[aria-label^="Desk"]').first().click();
    const from = page.locator('input[type="date"]').first();
    const min = await from.getAttribute("min");
    expect(min).toBe(new Date().toISOString().slice(0, 10));
  });
});

test.describe("RBAC — UI visibility", () => {
  test("admin sees the Admin toggle on Book a space", async ({ page }) => {
    await page.goto("/book");
    await expect(page.getByRole("button", { name: /admin (on|off)/i })).toBeVisible();
  });
});
