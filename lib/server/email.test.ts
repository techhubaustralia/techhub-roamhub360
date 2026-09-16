import { describe, it, expect } from "vitest";
import { inviteEmail, confirmationEmail, recurringConfirmationEmail, cancellationEmail, type EmailBrand } from "./email";
import type { Booking } from "./db";

const STOCK: EmailBrand = { productName: "RoamHub360", accent: "#2B7DD1", appUrl: "https://app.example.com" };
const WHITE: EmailBrand = { productName: "Acme Spaces", accent: "#aa3366", appUrl: "https://app.example.com" };

const booking = (o: Partial<Booking> = {}): Booking =>
  ({
    id: "b1",
    tenantId: "default",
    userEmail: "ada@example.com",
    bookedByEmail: null,
    buildingId: "syd-hq",
    spaceKey: "desk-12",
    spaceLabel: "Desk 12",
    kind: "desk",
    durationType: "full",
    start: "2026-09-15T08:00",
    end: "2026-09-15T17:30",
    status: "Booked",
    ...o,
  }) as Booking;

describe("email shell", () => {
  it("is table-based with a hidden preheader, an eyebrow, and the MSP attribution on the stock brand", () => {
    const { html } = inviteEmail("https://x/set", { workspaceName: "MS Pty Ltd", inviter: "support@example.com", recipientName: "Abin Raju" }, STOCK);
    expect(html).toContain('role="presentation"');
    expect(html).toMatch(/display:none[^>]*>Set your password to join MS Pty Ltd/); // preheader
    expect(html).toContain(">Invitation<"); // eyebrow
    expect(html).toContain("Hi Abin,"); // first name only
    expect(html).toContain("<b>support@example.com</b> has invited you");
    expect(html).toContain("by TechHub Australia");
    expect(html).toContain('href="https://x/set"');
    expect(html).toContain("Set your password &rarr;");
  });

  it("drops the MSP attribution for a white-label tenant brand", () => {
    const { html } = inviteEmail("https://x/set", { workspaceName: "Acme" }, WHITE);
    expect(html).not.toContain("TechHub Australia");
    expect(html).toContain("Acme Spaces"); // tenant's own product name in the wordmark + footer
    expect(html).toContain('bgcolor="#aa3366"'); // tenant accent paints the button
  });

  it("escapes attacker-influenceable fields (inviter, workspace, names)", () => {
    const { html, subject } = inviteEmail("https://x/set", { workspaceName: "<img src=x onerror=1>", inviter: "<script>alert(1)</script>", recipientName: "<b>Bob</b>" }, STOCK);
    expect(html).not.toContain("<script>");
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;script&gt;");
    expect(html).toContain("Hi &lt;b&gt;Bob&lt;/b&gt;,");
    expect(subject).toContain("<img src=x onerror=1>"); // subjects are plain text, not HTML — untouched by design
  });

  it("greets without a name when none is known", () => {
    const { html } = inviteEmail("https://x/set", { workspaceName: "MS Pty Ltd" }, STOCK);
    expect(html).not.toContain("Hi ");
    expect(html).toContain("You've been invited to join");
  });
});

describe("booking emails", () => {
  it("renders a details card with a human date and a single-day time range", () => {
    const { html, subject } = confirmationEmail(booking(), STOCK);
    expect(subject).toBe("Booking confirmed — Desk 12");
    expect(html).toContain(">Space<");
    expect(html).toContain(">Desk 12<");
    expect(html).toContain("Tue 15 Sep 2026, 08:00 – 17:30");
    expect(html).not.toContain("Booked by");
  });

  it("shows a multi-day span and the booker when booked on behalf", () => {
    const { html } = confirmationEmail(booking({ end: "2026-09-17T17:30", bookedByEmail: "admin@example.com" }), STOCK);
    expect(html).toContain("Tue 15 Sep 2026 08:00 → Thu 17 Sep 2026 17:30");
    expect(html).toContain(">Booked by<");
    expect(html).toContain("admin@example.com");
  });

  it("recurring summary lists every date and the skipped ones with reasons", () => {
    const created = [booking({ id: "a" }), booking({ id: "b", start: "2026-09-22T08:00", end: "2026-09-22T17:30" })];
    const { html, subject } = recurringConfirmationEmail(created, [{ date: "2026-09-29", reason: "That space is already booked." }], STOCK);
    expect(subject).toBe("2 bookings confirmed — Desk 12");
    expect(html).toContain("Tue 15 Sep 2026, 08:00 – 17:30");
    expect(html).toContain("Tue 22 Sep 2026, 08:00 – 17:30");
    expect(html).toContain("Not booked (1)");
    expect(html).toContain("Tue 29 Sep 2026 — That space is already booked.");
  });

  it("cancellation carries the admin's reason, escaped", () => {
    const { html } = cancellationEmail(booking(), { byAdmin: "admin@example.com", reason: "<b>maintenance</b>" }, STOCK);
    expect(html).toContain("Cancelled by an administrator (admin@example.com). Reason: &lt;b&gt;maintenance&lt;/b&gt;");
  });
});
