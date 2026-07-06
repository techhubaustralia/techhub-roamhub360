import { describe, it, expect, afterAll } from "vitest";

// API regression / release-gate suite. Runs against a live server (dev or staging):
//   E2E_BASE=http://localhost:3000 npx vitest run tests/api-regression.test.ts
// Skipped by the normal unit run (no E2E_BASE) so `npm test` stays a pure unit suite.
//
// Identity is simulated via the Easy Auth header (x-ms-client-principal-name). Seeding
// requires the base identity to be admin-capable — true for local dev (empty role store
// => global-admin) and for a staging admin token. Each test seeds its OWN building and uses
// per-run-unique identities, so the suite is idempotent across repeated runs.

const BASE = process.env.E2E_BASE;
const gate = BASE ? describe : describe.skip;

const H = (email?: string) => ({ "Content-Type": "application/json", ...(email ? { "x-ms-client-principal-name": email } : {}) });
async function api(path: string, opts: RequestInit = {}) {
  const r = await fetch(`${BASE}${path}`, opts);
  let body: any = null;
  try { body = await r.json(); } catch { /* empty */ }
  return { status: r.status, body };
}
const created: string[] = [];
const DEFAULT_ELS = [
  { t: "desk", id: 1, x: 10, y: 10, label: "1" },
  { t: "office", id: 1, x: 120, y: 10, w: 80, h: 60, name: "O1" },
  { t: "room", rid: "r1", name: "R1", x: 220, y: 10, w: 80, h: 60 },
];
async function freshBuilding(extra: Record<string, unknown> = {}, els: unknown[] = DEFAULT_ELS): Promise<string> {
  const id = `qa-${Math.random().toString(36).slice(2, 8)}`;
  await api(`/api/plans/${id}`, { method: "PUT", headers: H(), body: JSON.stringify({ id, name: id, viewBox: "0 0 600 400", open: true, published: true, status: "open", tz: "UTC", maxDeskPerDay: 5, maxConcurrent: 50, els, ...extra }) });
  created.push(id);
  return id;
}
const book = (email: string | undefined, bldg: string, spaceKey: string, kind: string, start: string, end: string, durationType = "full") =>
  api(`/api/bookings`, { method: "POST", headers: H(email), body: JSON.stringify({ buildingId: bldg, spaceKey, kind, durationType, start, end, spaceLabel: spaceKey }) });
const patch = (email: string | undefined, id: string, status: string, reason?: string) =>
  api(`/api/bookings/${id}`, { method: "PATCH", headers: H(email), body: JSON.stringify({ status, ...(reason ? { reason } : {}) }) });
function futureWeekday(offset = 3): string {
  let d = new Date(Date.now() + offset * 864e5);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 864e5);
  return d.toISOString().slice(0, 10);
}
const D = futureWeekday();
// per-run-unique identities (idempotent re-runs; avoids self-collision with the one-desk rule)
const RUN = Math.random().toString(36).slice(2, 8);
const E = (name: string) => `${name}-${RUN}@sodali.com`;

gate("API regression — booking business rules", () => {
  afterAll(async () => { for (const id of created) await api(`/api/plans/${id}`, { method: "DELETE", headers: H() }); });

  it("creates a valid desk booking (201)", async () => {
    expect((await book(E("u1"), await freshBuilding(), "desk-1", "desk", `${D}T09:00`, `${D}T11:00`, "hourly")).status).toBe(201);
  });
  it("rejects a duplicate booking on the same space/time (409)", async () => {
    const A = await freshBuilding();
    expect((await book(E("a"), A, "office-1", "office", `${D}T08:00`, `${D}T17:30`)).status).toBe(201);
    expect((await book(E("b"), A, "office-1", "office", `${D}T08:00`, `${D}T17:30`)).status).toBe(409);
  });
  it("rejects a ghost space (400)", async () => {
    expect((await book(E("g"), await freshBuilding(), "desk-999", "desk", `${D}T08:00`, `${D}T17:30`)).status).toBe(400);
  });
  it("rejects a room booked as a desk — kind mismatch (400)", async () => {
    expect((await book(E("k"), await freshBuilding(), "room-r1", "desk", `${D}T08:00`, `${D}T17:30`)).status).toBe(400);
  });
  it("state machine — cancelled cannot be resurrected (409)", async () => {
    const A = await freshBuilding();
    const u = E("sm");
    const b = await book(u, A, "desk-1", "desk", `${D}T13:00`, `${D}T15:00`, "hourly");
    expect(b.status).toBe(201);
    expect((await patch(u, b.body.id, "Cancelled")).status).toBe(200);
    expect((await patch(u, b.body.id, "Booked")).status).toBe(409);
  });
  it("state machine — cancelled cannot be checked in (409)", async () => {
    const A = await freshBuilding();
    const u = E("sm2");
    const b = await book(u, A, "desk-1", "desk", `${D}T13:00`, `${D}T15:00`, "hourly");
    await patch(u, b.body.id, "Cancelled");
    expect((await patch(u, b.body.id, "Checked in")).status).toBe(409);
  });
  it("ONE DESK per user at any time — blocks overlapping desk in another building (409)", async () => {
    const A = await freshBuilding(), B = await freshBuilding();
    const u = E("onedesk");
    expect((await book(u, A, "desk-1", "desk", `${D}T09:00`, `${D}T11:00`, "hourly")).status).toBe(201);
    expect((await book(u, B, "desk-1", "desk", `${D}T10:00`, `${D}T12:00`, "hourly")).status).toBe(409);
  });
  it("offices and meeting rooms are EXEMPT from the one-desk rule", async () => {
    const A = await freshBuilding(), B = await freshBuilding();
    const u = E("exempt");
    expect((await book(u, A, "desk-1", "desk", `${D}T09:00`, `${D}T11:00`, "hourly")).status).toBe(201);
    expect((await book(u, B, "office-1", "office", `${D}T08:00`, `${D}T17:30`)).status).toBe(201);
    expect((await book(u, B, "room-r1", "room", `${D}T09:30`, `${D}T10:30`, "hourly")).status).toBe(201);
  });
  it("rejects past-time bookings (office tz); allows future", async () => {
    const A = await freshBuilding();
    const at = (m: number) => { const d = new Date(Date.now() + m * 60000); const p = (n: number) => String(n).padStart(2, "0"); return `${d.toISOString().slice(0, 10)}T${p(d.getUTCHours())}:${p(d.getUTCMinutes())}`; };
    expect((await book(E("t1"), A, "room-r1", "room", at(-120), at(-60), "hourly")).status).toBe(400);
    expect((await book(E("t2"), A, "room-r1", "room", at(-30), at(30), "hourly")).status).toBe(400);
    expect((await book(E("t3"), A, "room-r1", "room", at(90), at(150), "hourly")).status).toBe(201);
  });
  it("rejects bookings for a CLOSED site (409)", async () => {
    const C = await freshBuilding({ status: "closed" });
    expect((await book(E("c"), C, "desk-1", "desk", `${D}T08:00`, `${D}T17:30`)).status).toBe(409);
  });
  it("identity is casing-insensitive — booking visible under any principal casing", async () => {
    const A = await freshBuilding();
    await book(`Mixed.Case-${RUN}@sodali.com`, A, "desk-1", "desk", `${D}T15:30`, `${D}T16:30`, "hourly");
    const res = await api(`/api/bookings`, { headers: H(`mixed.case-${RUN}@sodali.com`) });
    expect((res.body as any[]).filter((r) => r.buildingId === A).length).toBeGreaterThan(0);
  });
});

gate("API regression — admin cancellation", () => {
  afterAll(async () => { for (const id of created) await api(`/api/plans/${id}`, { method: "DELETE", headers: H() }); });

  it("admin cancels a user's booking; owner sees it flagged, with reason; terminal", async () => {
    const A = await freshBuilding();
    const owner = E("ac.owner");
    const b = await book(owner, A, "desk-1", "desk", `${D}T09:00`, `${D}T10:00`, "hourly");
    expect(b.status).toBe(201);
    const cancel = await api(`/api/bookings/${b.body.id}`, { method: "PATCH", headers: H(), body: JSON.stringify({ status: "Cancelled", reason: "Space needed for maintenance" }) });
    expect(cancel.status).toBe(200);
    expect(cancel.body.adminCancel).toBe(true);
    const row = ((await api(`/api/bookings`, { headers: H(owner) })).body as any[]).find((r) => r.id === b.body.id);
    expect(row.status).toBe("Cancelled");
    expect(String(row.cancelledBy).toLowerCase()).not.toBe(owner.toLowerCase());
    expect(row.cancelReason).toBe("Space needed for maintenance");
    expect((await patch(owner, b.body.id, "Booked")).status).toBe(409);
  });
  it("self-cancel is NOT flagged as admin", async () => {
    const A = await freshBuilding();
    const u = E("self");
    const b = await book(u, A, "desk-1", "desk", `${D}T11:00`, `${D}T12:00`, "hourly");
    await patch(u, b.body.id, "Cancelled");
    const row = ((await api(`/api/bookings`, { headers: H(u) })).body as any[]).find((r) => r.id === b.body.id);
    expect(String(row.cancelledBy).toLowerCase()).toBe(u.toLowerCase());
  });
  it("concurrent conflicting transitions leave a valid, consistent final state", async () => {
    // On SQL the conditional update (updateMany WHERE status = expected) is an ATOMIC
    // compare-and-set, so exactly one transition wins (one 200, one 409). The file dev
    // backend can't do atomic CAS, so both may land (last-write-wins). Either way the
    // INVARIANT below must hold — no invalid state, and cancelled stays terminal.
    const A = await freshBuilding();
    const u = E("race");
    const b = await book(u, A, "office-1", "office", `${D}T08:00`, `${D}T17:30`);
    const [a, c] = await Promise.all([patch(u, b.body.id, "Cancelled"), patch(u, b.body.id, "Checked in")]);
    expect([a.status, c.status]).toContain(200); // at least one succeeded
    const row = ((await api(`/api/bookings`, { headers: H(u) })).body as any[]).find((r) => r.id === b.body.id);
    expect(["Cancelled", "Checked in"]).toContain(row.status); // valid terminal/active state, never corrupt
    if (row.status === "Cancelled") expect((await patch(u, b.body.id, "Booked")).status).toBe(409); // stays terminal
  });
});

gate("API regression — reschedule & check-out", () => {
  afterAll(async () => { for (const id of created) await api(`/api/plans/${id}`, { method: "DELETE", headers: H() }); });

  it("reschedule: free time 200, space conflict 409, past 400, cancelled 409", async () => {
    const A = await freshBuilding();
    const x = E("ed.x"), y = E("ed.y");
    expect((await book(x, A, "desk-1", "desk", `${D}T09:00`, `${D}T11:00`, "hourly")).status).toBe(201); // occupies 09–11
    const by = await book(y, A, "desk-1", "desk", `${D}T13:00`, `${D}T15:00`, "hourly");
    expect(by.status).toBe(201);
    const edit = (s: string, e: string) => api(`/api/bookings/${by.body.id}`, { method: "PATCH", headers: H(y), body: JSON.stringify({ start: `${D}T${s}`, end: `${D}T${e}`, durationType: "hourly" }) });
    expect((await edit("09:30", "10:30")).status).toBe(409); // overlaps x on the same desk
    expect((await edit("16:00", "17:00")).status).toBe(200); // free -> reschedules
    // confirm the new time persisted
    const row = ((await api(`/api/bookings`, { headers: H(y) })).body as any[]).find((r) => r.id === by.body.id);
    expect(row.start).toBe(`${D}T16:00`);
    // past reschedule rejected
    expect((await api(`/api/bookings/${by.body.id}`, { method: "PATCH", headers: H(y), body: JSON.stringify({ start: "2020-01-01T09:00", end: "2020-01-01T10:00", durationType: "hourly" }) })).status).toBe(400);
    // cancelled booking cannot be rescheduled
    await patch(y, by.body.id, "Cancelled");
    expect((await edit("16:00", "17:00")).status).toBe(409);
  });

  it("check-out: checked-in -> checked out (200), terminal, releases the space", async () => {
    const A = await freshBuilding();
    const z = E("co.z");
    const b = await book(z, A, "office-1", "office", `${D}T08:00`, `${D}T17:30`);
    expect(b.status).toBe(201);
    expect((await patch(z, b.body.id, "Checked in")).status).toBe(200);
    expect((await patch(z, b.body.id, "Checked out")).status).toBe(200);
    const row = ((await api(`/api/bookings`, { headers: H(z) })).body as any[]).find((r) => r.id === b.body.id);
    expect(row.status).toBe("Checked out");
    expect((await patch(z, b.body.id, "Checked in")).status).toBe(409); // terminal
  });
});

gate("API regression — RBAC & PII", () => {
  afterAll(async () => { for (const id of created) await api(`/api/plans/${id}`, { method: "DELETE", headers: H() }); });
  const staff = E("nobody.staff");

  it("staff cannot read another user's bookings (403)", async () => {
    expect((await api(`/api/bookings?user=${E("someone")}`, { headers: H(staff) })).status).toBe(403);
  });
  it("staff cannot lock a space (403)", async () => {
    const A = await freshBuilding();
    expect((await api(`/api/locks/${A}`, { method: "PUT", headers: H(staff), body: JSON.stringify({ spaceKey: "desk-1", locked: true }) })).status).toBe(403);
  });
  it("occupant search returns names, not raw emails, to non-admins", async () => {
    const A = await freshBuilding();
    await book(E("occupant"), A, "desk-1", "desk", `${D}T09:00`, `${D}T10:00`, "hourly");
    const rows = (await api(`/api/bookings?building=${A}&date=${D}`, { headers: H(staff) })).body as any[];
    expect(rows.length).toBeGreaterThan(0);
    expect(rows[0].name).toBeTruthy();
    expect(rows[0].userEmail).toBeUndefined();
  });
});
