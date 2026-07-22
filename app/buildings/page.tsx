"use client";

import { Fragment, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { toast } from "sonner";
import { Trash2, RotateCcw, Layers, Plus, Star, Car } from "lucide-react";
import { BUILDINGS } from "@/lib/data";
import type { BuildingRow } from "@/lib/types";
import { deleteBuildingApi, restoreBuildingApi, getFloors, saveFloors, type CustomBuilding, type FloorRoom } from "@/lib/plan-store";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { UpgradeNudge } from "@/components/upgrade-nudge";

export default function BuildingsPage() {
  // null = not loaded yet; never seed with the static list, or deleted/hidden
  // sites would flash (or stick, on a fetch error) before server truth arrives.
  const [rows, setRows] = useState<BuildingRow[] | null>(null);
  const [hiddenRows, setHiddenRows] = useState<BuildingRow[]>([]);
  const [me, setMe] = useState<{ role?: string; sites?: string[] }>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const isGlobalAdmin = me.role === "global-admin";
  const canManage = () => isGlobalAdmin;

  const load = useCallback(async () => {
    // Fetch directly so a non-200 is distinguishable from "nothing hidden":
    // on failure we keep what we have rather than re-showing deleted sites.
    let meta: { custom: CustomBuilding[]; hidden: string[] };
    try {
      const r = await fetch("/api/buildings", { cache: "no-store" });
      if (!r.ok) throw new Error(String(r.status));
      meta = await r.json();
    } catch {
      setRows((prev) => prev ?? []);
      return;
    }
    const hidden = meta.hidden ?? [];
    const builtIn = BUILDINGS.filter((b) => !hidden.includes(b.id));
    const customRows: BuildingRow[] = (meta.custom ?? [])
      .filter((c) => !hidden.includes(c.id) && !builtIn.some((b) => b.id === c.id))
      .map((c) => ({ id: c.id, name: c.name, address: c.region || "Custom site", country: c.country || "—", tz: c.tz || "—", desks: c.desks || "—", hours: c.hours || "—", status: (c.status as BuildingRow["status"]) || "Open" }));
    setRows([...builtIn, ...customRows]);
    setHiddenRows(BUILDINGS.filter((b) => hidden.includes(b.id)));
  }, []);

  useEffect(() => {
    load();
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((u) => u && setMe({ role: u.role, sites: u.sites })).catch(() => {});
    const onVis = () => document.visibilityState === "visible" && load();
    window.addEventListener("wh:buildings", load);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("wh:buildings", load);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [load]);

  const isBuiltIn = (id: string) => BUILDINGS.some((b) => b.id === id);

  async function remove(b: BuildingRow) {
    const note = isBuiltIn(b.id)
      ? `Remove "${b.name}"? It will be hidden from booking. You can restore it later from this page.`
      : `Delete "${b.name}"? This removes its floor plan permanently and cannot be undone.`;
    if (!window.confirm(note)) return;
    setRows((rs) => (rs ?? []).filter((r) => r.id !== b.id));
    const res = await deleteBuildingApi(b.id);
    if (!res.ok) {
      toast.error("Delete failed", { description: res.error });
    } else {
      toast("Building removed", { description: `${b.name} hidden from booking` });
    }
    load();
  }

  async function restore(b: BuildingRow) {
    setHiddenRows((hs) => hs.filter((h) => h.id !== b.id));
    const res = await restoreBuildingApi(b.id);
    if (!res.ok) {
      toast.error("Restore failed", { description: res.error });
    } else {
      toast("Building restored", { description: `${b.name} is bookable again` });
    }
    load();
  }

  if (me.role && !isGlobalAdmin) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Buildings" subtitle="Manage sites and floor plans" />
        <div className="rounded-[14px] border bg-card p-8 text-center shadow-sm">
          <p className="text-[14px] font-semibold">Global Admin access required</p>
          <p className="mt-1 text-[12.5px] text-txt-mute">Buildings and floor plans can only be managed by a Global Admin.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Buildings"
        subtitle="One record per site — create, edit floor plans, or remove"
        action={
          <Link href="/editor/new" className="rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft">
            + Create building
          </Link>
        }
      />

      <UpgradeNudge kind="site" />

      <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">Building</th>
              <th className="border-b px-3 py-2.5">Country</th>
              <th className="border-b px-3 py-2.5">Time zone</th>
              <th className="border-b px-3 py-2.5">Desks</th>
              <th className="border-b px-3 py-2.5">Hours</th>
              <th className="border-b px-3 py-2.5">Status</th>
              <th className="border-b px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-[12.5px] text-txt-mute">Loading buildings…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={7} className="px-3 py-10 text-center text-[12.5px] text-txt-mute">No buildings yet. Use “+ Create building” to add one.</td></tr>
            ) : (
              rows.map((b) => (
              <Fragment key={b.id}>
              <tr className="hover:bg-panel-2">
                <td className="border-b px-3 py-3">
                  <b>{b.name}</b>
                  <div className="text-[11.5px] text-txt-mute">{b.address}</div>
                </td>
                <td className="border-b px-3 py-3">{b.country}</td>
                <td className="border-b px-3 py-3">{b.tz}</td>
                <td className="border-b px-3 py-3">{b.desks}</td>
                <td className="border-b px-3 py-3">{b.hours}</td>
                <td className="border-b px-3 py-3">
                  {b.status === "Open" ? <StatusPill variant="ok">Open</StatusPill> : <StatusPill variant="soon">Closed now</StatusPill>}
                </td>
                <td className="border-b px-3 py-3 text-right whitespace-nowrap">
                  {canManage() && (
                    <button onClick={() => setExpanded(expanded === b.id ? null : b.id)} className="mr-4 font-semibold text-txt-dim hover:text-foreground">
                      <Layers className="inline size-3.5" /> Floors
                    </button>
                  )}
                  <Link href={`/editor/${b.id}`} className="mr-4 font-semibold text-primary hover:underline">Edit floor plan</Link>
                  {canManage() && (
                    <button onClick={() => remove(b)} title="Remove building" className="font-semibold text-destructive hover:underline">
                      <Trash2 className="inline size-3.5" /> Remove
                    </button>
                  )}
                </td>
              </tr>
              {canManage() && expanded === b.id && (
                <tr>
                  <td colSpan={7} className="border-b bg-panel-2 px-3 py-3">
                    <FloorManager buildingId={b.id} />
                  </td>
                </tr>
              )}
              </Fragment>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 text-[12px] text-txt-mute">
        Removing a built-in site only hides it from booking — restore it below anytime. Deleting a custom site is
        permanent. Timezone, hours and closures live on the building record.
      </p>

      {hiddenRows.length > 0 && canManage() && (
        <div className="mt-6">
          <h2 className="mb-2 text-[12px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Removed sites</h2>
          <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
            {hiddenRows.map((b) => (
              <div key={b.id} className="flex items-center justify-between border-b px-3 py-2.5 last:border-b-0">
                <div className="text-[13px]">
                  <b className="text-txt-mute">{b.name}</b>
                  <span className="ml-2 text-[11.5px] text-txt-mute">{b.address} · hidden from booking</span>
                </div>
                <button
                  onClick={() => restore(b)}
                  className="inline-flex items-center gap-1.5 rounded-[9px] border bg-panel-2 px-3 py-1.5 text-[12.5px] font-semibold text-primary hover:border-primary"
                >
                  <RotateCcw className="size-3.5" /> Restore
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "floor";

function FloorManager({ buildingId }: { buildingId: string }) {
  const [floors, setFloors] = useState<FloorRoom[] | null>(null);
  useEffect(() => {
    getFloors(buildingId).then(setFloors);
  }, [buildingId]);

  async function persist(next: FloorRoom[]) {
    setFloors(next);
    const res = await saveFloors(buildingId, next);
    if (!res.ok) {
      toast.error("Could not save floors", { description: res.error });
      getFloors(buildingId).then(setFloors);
    }
  }
  function add(type: "floor" | "room" | "parking") {
    const label = type === "room" ? "Room name" : type === "parking" ? "Parking level name (e.g. Car Park B1)" : "Floor name";
    const name = window.prompt(label, "");
    if (!name?.trim()) return;
    const list = floors ?? [];
    // first add migrates the implicit single floor to a real one; keep its layout
    const base = list.length ? list : [{ id: buildingId, name: "Main floor", type: "floor" as const, isDefault: true }];
    const id = `${buildingId}__${slug(name)}-${base.length + 1}`;
    persist([...base, { id, name: name.trim(), type, isDefault: base.length === 0 }]);
  }
  function makeDefault(id: string) {
    if (!floors) return;
    persist(floors.map((f) => ({ ...f, isDefault: f.id === id })));
  }
  function rename(f: FloorRoom) {
    if (!floors) return;
    const name = window.prompt(f.type === "room" ? "Rename room" : f.type === "parking" ? "Rename parking level" : "Rename floor", f.name);
    if (name === null) return; // cancelled
    const trimmed = name.trim();
    if (!trimmed || trimmed === f.name) return;
    // Only the display name changes — the floor id (and its layout/bookings) stay intact.
    // If this is the implicit single floor, saving here materialises it under the new name.
    const base = floors.length ? floors : [{ id: buildingId, name: "Main floor", type: "floor" as const, isDefault: true }];
    persist(base.map((x) => (x.id === f.id ? { ...x, name: trimmed } : x)));
  }
  function remove(f: FloorRoom) {
    if (!floors) return;
    if (f.isDefault) { toast.error("Set another floor as default first."); return; }
    if (!window.confirm(`Remove "${f.name}"? Its layout stays stored but it won't be bookable.`)) return;
    persist(floors.filter((x) => x.id !== f.id));
  }

  if (!floors) return <div className="text-[12px] text-txt-mute">Loading floors…</div>;

  return (
    <div>
      <div className="mb-2 flex items-center justify-between">
        <span className="text-[11px] font-semibold uppercase tracking-[0.06em] text-txt-mute">Floors &amp; rooms</span>
        <div className="flex gap-2">
          <button onClick={() => add("floor")} className="inline-flex items-center gap-1 rounded-[8px] border bg-card px-2.5 py-1 text-[12px] font-semibold hover:border-primary"><Plus className="size-3" /> Floor</button>
          <button onClick={() => add("room")} className="inline-flex items-center gap-1 rounded-[8px] border bg-card px-2.5 py-1 text-[12px] font-semibold hover:border-primary"><Plus className="size-3" /> Room</button>
          <button onClick={() => add("parking")} className="inline-flex items-center gap-1 rounded-[8px] border bg-card px-2.5 py-1 text-[12px] font-semibold hover:border-primary"><Car className="size-3" /> Parking</button>
        </div>
      </div>
      <div className="overflow-hidden rounded-[10px] border bg-card">
        {floors.map((f) => (
          <div key={f.id} className="flex items-center justify-between border-b px-3 py-2 text-[13px] last:border-b-0">
            <span className="flex items-center gap-2">
              {f.type === "parking" && <Car className="size-3.5 text-txt-mute" />}
              <b>{f.name}</b>
              <span className="text-[11px] uppercase tracking-wide text-txt-mute">{f.type}</span>
              {f.isDefault && <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2 py-0.5 text-[10.5px] font-semibold text-primary"><Star className="size-2.5" /> Default</span>}
            </span>
            <span className="flex items-center gap-3">
              <button onClick={() => rename(f)} className="font-semibold text-txt-dim hover:text-foreground">Rename</button>
              <Link href={`/editor/${f.id}`} className="font-semibold text-primary hover:underline">Edit layout</Link>
              {!f.isDefault && f.type !== "parking" && <button onClick={() => makeDefault(f.id)} className="font-semibold text-txt-dim hover:text-foreground">Set default</button>}
              {!f.isDefault && <button onClick={() => remove(f)} className="font-semibold text-destructive hover:underline"><Trash2 className="inline size-3.5" /></button>}
            </span>
          </div>
        ))}
      </div>
      <p className="mt-2 text-[11.5px] text-txt-mute">Each floor, room, and parking level has its own layout (edit separately). The default floor loads first in Book a space.</p>
    </div>
  );
}
