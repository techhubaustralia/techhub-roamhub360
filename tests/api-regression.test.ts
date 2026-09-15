import { describe, it, expect, afterAll } from "vitest";

// API regression / release-gate suite. Runs against a live server (dev or staging):
//   E2E_BASE=http://localhost:3000 npx vitest run tests/api-regression.test.ts
// Skipped by the normal unit run (no E2E_BASE) so `npm test` stays a pure unit suite.
//
// Identity is simulated via the dev-only x-dev-user / x-dev-role headers, honoured solely by the
// no-session dev branch of getUser() (lib/server/auth.ts; inert under NODE_ENV=production). No
// email = the base dev identity (demo global-admin) — used for seeding and admin actions. A named
// user defaults to STAFF. Each test seeds its OWN building and uses per-run-unique identities, and
// afterAll cancels every booking it made before deleting its buildings, so re-runs are idempotent.

const BASE = process.env.E2E_BASE;
const gate = BASE ? describe : describe.skip;

type DevRole = "global-admin" | "site-admin" | "staff";
const H = (email?: string, role?: DevRole) => ({
  "Content-Type": "application/json",
  ...(email ? { "x-dev-user": email } : {}),
  ...(role ? { "x-dev-role": role } : {}),
});
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
const booked: string[] = [];
const book = async (email: string | undefined, bldg: string, spaceKey: string, kind: string, start: string, end: string, durationType = "full") => {
  const r = await api(`/api/bookings`, { method: "POST", headers: H(email), body: JSON.stringify({ buildingId: bldg, spaceKey, kind, durationType, start, end, spaceLabel: spaceKey }) });
  if (r.status === 201 && r.body?.id) booked.push(r.body.id as string);
  return r;
};
const patch = (email: string | undefined, id: string, status: string, reason?: string) =>
  api(`/api/bookings/${id}`, { method: "PATCH", headers: H(email), body: JSON.stringify({ status, ...(reason ? { reason } : {}) }) });
// Deleting a plan does not release its bookings (only removing spaces via PUT does), so cancel
// every booking this run made first — otherwise leftovers accumulate in the local store.
async function cleanup() {
  for (const id of booked.splice(0)) await patch(undefined, id, "Cancelled").catch(() => {});
  for (const id of created.splice(0)) await api(`/api/plans/${id}`, { method: "DELETE", headers: H() });
}
function futureWeekday(offset = 3): string {
  let d = new Date(Date.now() + offset * 864e5);
  while (d.getUTCDay() === 0 || d.getUTCDay() === 6) d = new Date(d.getTime() + 864e5);
  return d.toISOString().slice(0, 10);
}
const D = futureWeekday();
// The site's calendar "today" — freshBuilding pins tz: "UTC", so UTC today is the site's today.
// Check-in is only permitted on the booking's own date, so check-in tests book on TODAY (with
// allowPast on the site so the booking is creatable at any time of day).
const TODAY = new Date().toISOString().slice(0, 10);
// per-run-unique identities (idempotent re-runs; avoids self-collision with the one-desk rule)
const RUN = Math.random().toString(36).slice(2, 8);
const E = (name: string) => `${name}-${RUN}@example.com`;

gate("API regression — booking business rules", () => {
  afterAll(cleanup);

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
  it("check-in is refused before the booking's date (409) — in-app path", async () => {
    const A = await freshBuilding();
    const u = E("early");
    // office, not desk: immune to the global one-desk-per-user rule if identities collapse in dev
    const b = await book(u, A, "office-1", "office", `${D}T08:00`, `${D}T17:30`);
    expect(b.status).toBe(201);
    const r = await patch(u, b.body.id, "Checked in");
    expect(r.status).toBe(409);
    expect(r.body?.error).toMatch(/only check in on the day/i);
    // still Booked — the refusal must not have touched state
    const row = ((await api(`/api/bookings`, { headers: H(u) })).body as any[]).find((x) => x.id === b.body.id);
    expect(row.status).toBe("Booked");
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
    // 24h room hours so the "90 minutes from now" slot is never outside the default 08:00–17:30
    // window whatever the time of day the suite runs — this test is about past/future only.
    const A = await freshBuilding({ openTime: "00:00", closeTime: "23:59" });
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
    await book(`Mixed.Case-${RUN}@example.com`, A, "desk-1", "desk", `${D}T15:30`, `${D}T16:30`, "hourly");
    const res = await api(`/api/bookings`, { headers: H(`mixed.case-${RUN}@example.com`) });
    expect((res.body as any[]).filter((r) => r.buildingId === A).length).toBeGreaterThan(0);
  });
});

gate("API regression — admin cancellation", () => {
  afterAll(cleanup);

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
    const A = await freshBuilding({ allowPast: true });
    const u = E("race");
    const b = await book(u, A, "office-1", "office", `${TODAY}T08:00`, `${TODAY}T17:30`); // today: check-in must be a live contender
    const [a, c] = await Promise.all([patch(u, b.body.id, "Cancelled"), patch(u, b.body.id, "Checked in")]);
    expect([a.status, c.status]).toContain(200); // at least one succeeded
    const row = ((await api(`/api/bookings`, { headers: H(u) })).body as any[]).find((r) => r.id === b.body.id);
    expect(["Cancelled", "Checked in"]).toContain(row.status); // valid terminal/active state, never corrupt
    if (row.status === "Cancelled") expect((await patch(u, b.body.id, "Booked")).status).toBe(409); // stays terminal
  });
});

gate("API regression — reschedule & check-out", () => {
  afterAll(cleanup);

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
    const A = await freshBuilding({ allowPast: true });
    const z = E("co.z");
    const b = await book(z, A, "office-1", "office", `${TODAY}T08:00`, `${TODAY}T17:30`); // today: check-in is only allowed on the booking's date
    expect(b.status).toBe(201);
    expect((await patch(z, b.body.id, "Checked in")).status).toBe(200);
    expect((await patch(z, b.body.id, "Checked out")).status).toBe(200);
    const row = ((await api(`/api/bookings`, { headers: H(z) })).body as any[]).find((r) => r.id === b.body.id);
    expect(row.status).toBe("Checked out");
    expect((await patch(z, b.body.id, "Checked in")).status).toBe(409); // terminal
  });
});

gate("API regression — RBAC & PII", () => {
  afterAll(cleanup);
  const staff = E("nobody.staff"); // named dev users default to the staff role

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

gate("API regression — office bookings overview", () => {
  afterAll(cleanup);

  it("lists a colleague's booking by name; email + id only for admins", async () => {
    const A = await freshBuilding();
    const u = E("ob.user"), viewer = E("ob.viewer");
    expect((await book(u, A, "office-1", "office", `${D}T08:00`, `${D}T17:30`)).status).toBe(201);
    const asStaff = await api(`/api/office-bookings?from=${D}&to=${D}&site=${A}`, { headers: H(viewer) });
    expect(asStaff.status).toBe(200);
    expect(asStaff.body.enabled).toBe(true);
    expect(asStaff.body.isAdmin).toBe(false);
    expect(asStaff.body.total).toBe(1);
    expect(asStaff.body.rows[0].name).toBeTruthy();
    expect(asStaff.body.rows[0].space).toBe("office-1");
    expect(asStaff.body.rows[0].userEmail).toBeUndefined();
    expect(asStaff.body.rows[0].id).toBeUndefined();
    const asAdmin = await api(`/api/office-bookings?from=${D}&to=${D}&site=${A}`, { headers: H() });
    expect(asAdmin.body.isAdmin).toBe(true);
    expect(String(asAdmin.body.rows[0].userEmail).toLowerCase()).toBe(u.toLowerCase());
    expect(asAdmin.body.rows[0].id).toBeTruthy();
  });
  it("search matches the space label but never a hidden email", async () => {
    const A = await freshBuilding();
    const u = E("ob.search");
    expect((await book(u, A, "room-r1", "room", `${D}T09:00`, `${D}T10:00`, "hourly")).status).toBe(201);
    const bySpace = await api(`/api/office-bookings?from=${D}&to=${D}&site=${A}&q=room-r1`, { headers: H(E("ob.other")) });
    expect(bySpace.body.total).toBe(1);
    const byEmail = await api(`/api/office-bookings?from=${D}&to=${D}&site=${A}&q=${encodeURIComponent("@example.com")}`, { headers: H(E("ob.other")) });
    expect(byEmail.body.total).toBe(0); // staff cannot search by email
  });
  it("rejects a window longer than 62 days (400)", async () => {
    expect((await api(`/api/office-bookings?from=2026-01-01&to=2026-04-01`, { headers: H() })).status).toBe(400);
  });
});

gate("API regression — recurring bookings", () => {
  afterAll(cleanup);
  const addDays = (d: string, n: number) => new Date(new Date(`${d}T00:00:00Z`).getTime() + n * 864e5).toISOString().slice(0, 10);
  const onlyDow = (d: string) => Array.from({ length: 7 }, (_, i) => i === new Date(`${d}T00:00:00Z`).getUTCDay());
  const recur = (email: string | undefined, body: Record<string, unknown>) => {
    // recorded for cleanup like book(): created ids come back in the body
    return api(`/api/bookings/recurring`, { method: "POST", headers: H(email), body: JSON.stringify(body) }).then((r) => {
      for (const c of (r.body?.created ?? []) as { id: string }[]) booked.push(c.id);
      return r;
    });
  };

  it("books every matching date in ONE request and reports the count (201)", async () => {
    const A = await freshBuilding();
    const u = E("rec.user");
    // D's weekday only, over D..D+7 → exactly 2 occurrences
    const r = await recur(u, { buildingId: A, spaceKey: "office-1", kind: "office", durationType: "full", spaceLabel: "office-1", startDate: D, until: addDays(D, 7), weekdays: onlyDow(D) });
    expect(r.status).toBe(201);
    expect(r.body.requested).toBe(2);
    expect(r.body.created).toHaveLength(2);
    expect(r.body.skipped).toEqual([]);
    expect(r.body.created.map((c: { start: string }) => c.start.slice(0, 10))).toEqual([D, addDays(D, 7)]);
  });
  it("skips a conflicting date with the real reason and still books the rest", async () => {
    const A = await freshBuilding();
    const u = E("rec.conflict"), other = E("rec.other");
    expect((await book(other, A, "office-1", "office", `${D}T08:00`, `${D}T17:30`)).status).toBe(201); // D taken
    const r = await recur(u, { buildingId: A, spaceKey: "office-1", kind: "office", durationType: "full", spaceLabel: "office-1", startDate: D, until: addDays(D, 7), weekdays: onlyDow(D) });
    expect(r.status).toBe(201);
    expect(r.body.created).toHaveLength(1);
    expect(r.body.skipped).toHaveLength(1);
    expect(r.body.skipped[0].date).toBe(D);
    expect(r.body.skipped[0].reason).toMatch(/already booked/i);
  });
  it("refuses more than 60 occurrences up front (400) — nothing is created", async () => {
    const A = await freshBuilding();
    const r = await recur(E("rec.many"), { buildingId: A, spaceKey: "office-1", kind: "office", durationType: "full", startDate: D, until: addDays(D, 120), weekdays: [true, true, true, true, true, true, true] });
    expect(r.status).toBe(400);
    expect(r.body.error).toMatch(/more than 60/i);
  });
  it("staff cannot book a series on behalf of someone else (403)", async () => {
    const A = await freshBuilding();
    const r = await recur(E("rec.staff"), { buildingId: A, spaceKey: "office-1", kind: "office", durationType: "full", startDate: D, until: addDays(D, 7), weekdays: onlyDow(D), userEmail: E("rec.victim") });
    expect(r.status).toBe(403);
  });
});
