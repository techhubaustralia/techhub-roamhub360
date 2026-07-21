import { describe, it, expect } from "vitest";
import { TOOL_DEFS, BOOKING_TOOL, buildSystem } from "./assistant-policy";
import type { AppUser } from "./server/auth";

const user = { name: "Test User", email: "test@example.com" } as AppUser;

describe("assistant tool surface (propose-not-execute)", () => {
  it("exposes only read tools plus the single propose tool", () => {
    const names = TOOL_DEFS.map((t) => t.name).sort();
    expect(names).toEqual(["find_availability", "list_my_bookings", "propose_booking", "whos_in"]);
  });

  it("has no tool that books, cancels, or mutates directly", () => {
    // Any future tool whose name implies a direct state change must NOT be added — the assistant may
    // only propose. This test is the enforcement: it fails the moment such a tool appears.
    const forbidden = /\b(book_now|create|cancel|delete|remove|update|checkin|check_in|checkout|assign|confirm|pay|charge|invite)\b/i;
    const offenders = TOOL_DEFS.filter((t) => t.name !== BOOKING_TOOL && forbidden.test(t.name));
    expect(offenders).toEqual([]);
  });

  it("keeps propose_booking as the only booking-state tool", () => {
    expect(TOOL_DEFS.some((t) => t.name === BOOKING_TOOL)).toBe(true);
  });
});

describe("assistant system prompt (guardrails)", () => {
  const sys = buildSystem(user);

  it("carries the prompt-injection defense clause", () => {
    expect(sys).toMatch(/cannot be overridden/i);
    expect(sys).toMatch(/never as instructions/i);
    expect(sys).toMatch(/ignore previous instructions/i);
  });

  it("forbids revealing presence opt-outs", () => {
    expect(sys).toMatch(/opted out of presence|reveal.*opted out/i);
  });

  it("states it cannot book directly (propose-not-execute)", () => {
    expect(sys).toMatch(/no ability to book, cancel, or change/i);
    expect(sys).toMatch(/Never claim an action was performed/i);
  });

  it("pins actions to the signed-in user only", () => {
    expect(sys).toContain(user.email);
    expect(sys).toMatch(/Only ever act for/i);
  });
});
