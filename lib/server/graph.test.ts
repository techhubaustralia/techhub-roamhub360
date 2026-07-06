import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

// graph.ts is server-only; stub the marker so it can be imported under vitest (node).
vi.mock("server-only", () => ({}));

const ok = (status: number, json: unknown) => ({ ok: true, status, json: async () => json, text: async () => (json == null ? "" : JSON.stringify(json)) });

describe("graph booking events", () => {
  const OLD = { ...process.env };
  beforeEach(() => {
    vi.resetModules();
    process.env.GRAPH_TENANT_ID = "tenant";
    process.env.GRAPH_CLIENT_ID = "client";
    process.env.GRAPH_CLIENT_SECRET = "secret";
  });
  afterEach(() => {
    process.env = { ...OLD };
    vi.restoreAllMocks();
  });

  it("createBookingEvent posts to the OWNER's calendar with the room as a resource attendee + Teams", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(200, { access_token: "tok", expires_in: 3600 })) // token
      .mockResolvedValueOnce(ok(201, { id: "EVT-123" })); // create event
    vi.stubGlobal("fetch", fetchMock);

    const { createBookingEvent } = await import("./graph");
    const id = await createBookingEvent({
      ownerEmail: "user@sodali.com",
      subject: "s",
      startLocal: "2026-06-01T09:00",
      endLocal: "2026-06-01T10:00",
      roomMailbox: "room@sodali.com",
      online: true,
    });

    expect(id).toBe("EVT-123");
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain("/users/user%40sodali.com/events"); // owner's calendar, not the room's
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.attendees).toContainEqual({ emailAddress: { address: "room@sodali.com" }, type: "resource" });
    expect(body.isOnlineMeeting).toBe(true);
    expect(body.onlineMeetingProvider).toBe("teamsForBusiness");
  });

  it("createBookingEvent never lists the owner as their own attendee", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(200, { access_token: "tok", expires_in: 3600 }))
      .mockResolvedValueOnce(ok(201, { id: "EVT-9" }));
    vi.stubGlobal("fetch", fetchMock);

    const { createBookingEvent } = await import("./graph");
    await createBookingEvent({
      ownerEmail: "user@sodali.com",
      subject: "s",
      startLocal: "2026-06-01T09:00",
      endLocal: "2026-06-01T10:00",
      attendees: ["user@sodali.com", "colleague@sodali.com"],
    });
    const body = JSON.parse(fetchMock.mock.calls[1][1].body);
    const addrs = body.attendees.map((a: { emailAddress: { address: string } }) => a.emailAddress.address);
    expect(addrs).toEqual(["colleague@sodali.com"]);
  });

  it("cancelBookingEvent calls /cancel on the owner's event", async () => {
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(ok(200, { access_token: "tok", expires_in: 3600 })) // token
      .mockResolvedValueOnce(ok(202, null)); // cancel
    vi.stubGlobal("fetch", fetchMock);

    const { cancelBookingEvent } = await import("./graph");
    const result = await cancelBookingEvent("user@sodali.com", "EVT-123");

    expect(result).toBe(true);
    const [url, init] = fetchMock.mock.calls[1];
    expect(url).toContain("/users/user%40sodali.com/events/EVT-123/cancel");
    expect(init.method).toBe("POST");
  });

  it("no-ops (no network) when Graph is not configured", async () => {
    delete process.env.GRAPH_TENANT_ID;
    delete process.env.AZURE_TENANT_ID;
    delete process.env.GRAPH_CLIENT_ID;
    delete process.env.GRAPH_CLIENT_SECRET;
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    const { createBookingEvent, cancelBookingEvent } = await import("./graph");
    expect(await createBookingEvent({ ownerEmail: "u", subject: "s", startLocal: "a", endLocal: "b" })).toBeNull();
    expect(await cancelBookingEvent("u", "e")).toBe(false);
    expect(fetchMock).not.toHaveBeenCalled();
  });
});
