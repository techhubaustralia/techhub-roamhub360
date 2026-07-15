import { describe, it, expect } from "vitest";
import { searchArticles, tokenize, type Searchable } from "./kb-search";

const ARTICLES: (Searchable & { id: string })[] = [
  { id: "desk", title: "Booking a desk", summary: "Reserve a hot desk", category: "Booking a space", text: "go to book a space and pick a desk on the floor plan" },
  { id: "room", title: "Booking a meeting room", summary: "Reserve a meeting room", category: "Booking a space", text: "choose the meeting rooms tab and pick a room" },
  { id: "checkin", title: "Checking in and out", summary: "Hold your space", category: "On the day", text: "open my bookings and tap check in, or scan the qr code" },
  { id: "cancel", title: "Changing or cancelling a booking", summary: "Reschedule or cancel", category: "Booking a space", text: "tap reschedule to change the date or time" },
  { id: "whoisin", title: "See who's in the office", summary: "Coordinate office days", category: "Teamwork", text: "the who's in page shows colleagues booked in" },
];

const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

describe("searchArticles", () => {
  it("matches a natural-language phrase to the right article (the reported bug)", () => {
    const r = searchArticles(ARTICLES, "help for booking a desk");
    expect(r[0].id).toBe("desk"); // must surface, ranked first
    expect(ids(r)).toContain("desk");
  });

  it("ignores filler words and matches on meaningful terms", () => {
    expect(ids(searchArticles(ARTICLES, "how do i book a room"))[0]).toBe("room");
    expect(ids(searchArticles(ARTICLES, "can you help me check in")).includes("checkin")).toBe(true);
  });

  it("finds matches that only appear in the body text", () => {
    // "reschedule" and "qr" appear only in the body, not the title/summary
    expect(ids(searchArticles(ARTICLES, "reschedule"))).toEqual(["cancel"]);
    expect(ids(searchArticles(ARTICLES, "qr code"))).toContain("checkin");
  });

  it("ranks title matches above body-only matches", () => {
    const r = searchArticles(ARTICLES, "booking");
    // three titles contain 'booking' — they should all come before any body-only match
    expect(r[0].title.toLowerCase()).toContain("booking");
  });

  it("returns everything for an empty query", () => {
    expect(searchArticles(ARTICLES, "")).toHaveLength(ARTICLES.length);
    expect(searchArticles(ARTICLES, "   ")).toHaveLength(ARTICLES.length);
  });

  it("returns nothing for a query that matches no article", () => {
    expect(searchArticles(ARTICLES, "printer toner refund")).toHaveLength(0);
  });

  it("is case-insensitive and apostrophe-tolerant", () => {
    expect(ids(searchArticles(ARTICLES, "WHOS in")).includes("whoisin")).toBe(true);
    expect(ids(searchArticles(ARTICLES, "who's")).includes("whoisin")).toBe(true);
  });

  it("tokenize strips apostrophes and splits on non-alphanumerics", () => {
    expect(tokenize("Who's in — the office!")).toEqual(["whos", "in", "the", "office"]);
  });
});
