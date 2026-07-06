"use client";

import { useCallback, useEffect, useState } from "react";
import { toast } from "sonner";
import { Star, Trash2, Plus } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { getBuildingsMeta, getFloors, fetchPlan, type CustomBuilding, type FloorRoom } from "@/lib/plan-store";
import { spaceKey, type SpaceEl, type FloorPlan } from "@/lib/types";

interface Assignment { floorId: string; building: string; floor: string; spaceKey: string; label: string; assignee: string }

export default function AssignPage() {
  const [role, setRole] = useState<string | undefined>(undefined);
  const [rows, setRows] = useState<Assignment[]>([]);
  const [buildings, setBuildings] = useState<CustomBuilding[]>([]);
  const [bId, setBId] = useState("");
  const [floors, setFloors] = useState<FloorRoom[]>([]);
  const [floorId, setFloorId] = useState("");
  const [plan, setPlan] = useState<FloorPlan | null>(null);
  const [spaceK, setSpaceK] = useState("");
  const [assignee, setAssignee] = useState("");
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((u) => u && setRole(u.role)).catch(() => {});
    getBuildingsMeta().then((m) => setBuildings(m.custom.filter((c) => !m.hidden.includes(c.id))));
  }, []);

  const loadRows = useCallback(() => {
    fetch("/api/assignments").then((r) => (r.ok ? r.json() : [])).then(setRows).catch(() => {});
  }, []);
  useEffect(() => { loadRows(); }, [loadRows]);

  // building -> floors -> default floor -> plan
  useEffect(() => {
    if (!bId) { setFloors([]); setFloorId(""); return; }
    getFloors(bId).then((fl) => { setFloors(fl); setFloorId((fl.find((f) => f.isDefault) ?? fl[0])?.id ?? bId); });
  }, [bId]);
  useEffect(() => {
    if (!floorId) { setPlan(null); return; }
    fetchPlan(floorId).then(setPlan);
    setSpaceK("");
  }, [floorId]);

  const spaces = (plan?.els ?? []).filter((e): e is Extract<SpaceEl, { t: "desk" | "office" | "parking" }> => e.t === "desk" || e.t === "office" || e.t === "parking");
  const taken = new Set(rows.filter((r) => r.floorId === floorId).map((r) => r.spaceKey));

  async function assign() {
    if (!floorId || !spaceK || !assignee.trim()) return;
    setSaving(true);
    const res = await fetch("/api/assignments", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ floorId, spaceKey: spaceK, assignee: assignee.trim() }) });
    setSaving(false);
    if (!res.ok) { toast.error("Could not assign", { description: (await res.json().catch(() => ({}))).error }); return; }
    toast.success("Desk assigned", { description: `Reserved for ${assignee.trim()}` });
    setAssignee(""); setSpaceK(""); loadRows();
  }
  async function remove(a: Assignment) {
    setRows((rs) => rs.filter((r) => !(r.floorId === a.floorId && r.spaceKey === a.spaceKey)));
    const res = await fetch(`/api/assignments?floorId=${encodeURIComponent(a.floorId)}&spaceKey=${encodeURIComponent(a.spaceKey)}`, { method: "DELETE" });
    if (!res.ok) { toast.error("Could not release"); loadRows(); return; }
    toast("Assignment released", { description: a.label });
  }

  if (role === "staff") {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Permanent desk assignments" subtitle="Reserved spaces" />
        <div className="rounded-[14px] border bg-card p-8 text-center shadow-sm">
          <p className="text-[14px] font-semibold">Admin access required</p>
          <p className="mt-1 text-[12.5px] text-txt-mute">Permanent desk assignments are managed by Site or Global Admins.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Permanent desk assignments" subtitle="Reserve a desk, office or parking bay for a person — hidden from standard booking" />

      <div className="mb-5 rounded-[14px] border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-[13.5px] font-semibold">Assign a space</h2>
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Building">
            <select value={bId} onChange={(e) => setBId(e.target.value)} className="ed-input">
              <option value="">Select…</option>
              {buildings.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </Field>
          <Field label="Floor / room">
            <select value={floorId} onChange={(e) => setFloorId(e.target.value)} disabled={!floors.length} className="ed-input">
              {floors.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
            </select>
          </Field>
          <Field label="Space">
            <select value={spaceK} onChange={(e) => setSpaceK(e.target.value)} disabled={!spaces.length} className="ed-input">
              <option value="">Select…</option>
              {spaces.map((s) => {
                const k = spaceKey(s);
                const label = s.t === "desk" ? `Desk ${s.label ?? s.id}` : s.t === "parking" ? `Bay ${s.label ?? s.id}` : s.name ?? `Office ${s.id}`;
                return <option key={k} value={k} disabled={taken.has(k)}>{label}{taken.has(k) ? " (assigned)" : ""}</option>;
              })}
            </select>
          </Field>
          <Field label="Assign to (person)">
            <input value={assignee} onChange={(e) => setAssignee(e.target.value)} placeholder="Name or email" className="ed-input" />
          </Field>
        </div>
        <button onClick={assign} disabled={!floorId || !spaceK || !assignee.trim() || saving} className="mt-4 inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
          <Plus className="size-4" /> {saving ? "Assigning…" : "Assign desk"}
        </button>
      </div>

      <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">Space</th>
              <th className="border-b px-3 py-2.5">Building</th>
              <th className="border-b px-3 py-2.5">Floor</th>
              <th className="border-b px-3 py-2.5">Assigned to</th>
              <th className="border-b px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={5} className="px-3 py-10 text-center text-[12.5px] text-txt-mute">No permanent assignments yet.</td></tr>
            ) : (
              rows.map((a) => (
                <tr key={`${a.floorId}:${a.spaceKey}`} className="hover:bg-panel-2">
                  <td className="border-b px-3 py-3"><b>{a.label}</b></td>
                  <td className="border-b px-3 py-3">{a.building}</td>
                  <td className="border-b px-3 py-3">{a.floor}</td>
                  <td className="border-b px-3 py-3">{a.assignee}</td>
                  <td className="border-b px-3 py-3 text-right">
                    <button onClick={() => remove(a)} className="font-semibold text-destructive hover:underline"><Trash2 className="inline size-3.5" /> Release</button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
      <p className="mt-3 flex items-center gap-1.5 text-[12px] text-txt-mute"><Star className="size-3.5" /> Assigned spaces show as locked in Book a space and are excluded from standard booking.</p>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">{label}</span>
      {children}
    </label>
  );
}
