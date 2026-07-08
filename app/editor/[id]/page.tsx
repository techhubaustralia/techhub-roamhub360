"use client";

import { useState, useEffect, useRef, useMemo } from "react";
import { useParams, useRouter } from "next/navigation";
import { toast } from "sonner";
import { ArrowLeft, Save, RotateCcw, Plus, Trash2, Copy, UploadCloud, Rocket, X, Building2, MapPin, Clock, Layers, CalendarDays } from "lucide-react";
import type { FloorPlan, FloorEl, SpaceEl, DeskShapeKind } from "@/lib/types";
import { fetchPlan, savePlan, resetPlan, addCustomBuilding, saveFloors, getFloors, type FloorRoom } from "@/lib/plan-store";
import { TIMEZONES, winTzFor, tzLabel } from "@/lib/timezones";
import { REGIONS, COUNTRIES } from "@/lib/countries";
import { scaleEls, scaleFactors } from "@/lib/plan-scale";
import { EditorCanvas } from "@/components/floorplan/editor-canvas";

const clone = (p: FloorPlan): FloorPlan => JSON.parse(JSON.stringify(p));
const slug = (s: string) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "site";
// Short, collision-resistant suffix so each new building gets a UNIQUE id even when
// two sites share a name. Without this, id = slug(name) collided and one site overwrote another.
const shortId = () => (globalThis.crypto?.randomUUID?.() ?? `${Date.now()}-${Math.random()}`).replace(/-/g, "").slice(0, 8);

function blankPlan(): FloorPlan {
  return { id: "new", name: "New building", viewBox: "0 0 1200 800", open: true, els: [] };
}

export default function EditorPage() {
  const params = useParams();
  const router = useRouter();
  const id = (Array.isArray(params.id) ? params.id[0] : params.id) ?? "new";
  const isNew = id === "new";

  const [plan, setPlan] = useState<FloorPlan>(blankPlan);
  // Timezone options grouped by region (every IANA zone), labels with the current UTC offset.
  // Memoised once per mount — offsets are re-evaluated on load so DST is reflected.
  const tzGroups = useMemo(() => {
    const groups: { region: string; zones: { iana: string; label: string }[] }[] = [];
    for (const t of TIMEZONES) {
      const g = groups[groups.length - 1];
      const entry = { iana: t.iana, label: tzLabel(t.iana) };
      if (g && g.region === t.region) g.zones.push(entry);
      else groups.push({ region: t.region, zones: [entry] });
    }
    return groups;
  }, []);
  // Stable unique id for THIS new-building session — generated once, reused across
  // every save/publish click so repeated saves can't fork or collide with another site.
  const newIdRef = useRef<string>("");
  const [selIdx, setSelIdx] = useState<number | null>(null);
  const [pendingFile, setPendingFile] = useState<File | null>(null); // new-building upload held until save
  // new-building structure wizard
  const [structure, setStructure] = useState<"single" | "multi">("single");
  const [unitKind, setUnitKind] = useState<"floor" | "room">("floor");
  const [unitCount, setUnitCount] = useState(2);
  const [role, setRole] = useState<string | undefined>(undefined);
  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then((u) => u && setRole(u.role)).catch(() => {});
  }, []);
  // Floors of the building this layout belongs to (for the per-desk "move to floor" picker).
  const [floors, setFloors] = useState<FloorRoom[]>([]);
  useEffect(() => {
    if (isNew) { setFloors([]); return; }
    getFloors(id.split("__")[0]).then(setFloors).catch(() => setFloors([]));
  }, [id, isNew]);

  useEffect(() => {
    setSelIdx(null);
    if (isNew) {
      setPlan(blankPlan());
      return;
    }
    let alive = true;
    fetchPlan(id).then((p) => {
      if (alive) setPlan(clone(p));
    });
    return () => {
      alive = false;
    };
  }, [id, isNew]);

  const [, , W, H] = plan.viewBox.split(" ").map(Number);
  const cx = (W || 1200) / 2;
  const cy = (H || 800) / 2;

  function patch(updater: (els: FloorEl[]) => FloorEl[]) {
    setPlan((p) => ({ ...p, els: updater([...p.els]) }));
  }
  function move(idx: number, x: number, y: number) {
    patch((els) => {
      const el = els[idx];
      if (el.t === "desk" || el.t === "office" || el.t === "room" || el.t === "parking" || el.t === "label") els[idx] = { ...el, x, y } as FloorEl;
      return els;
    });
  }
  function updateSel(fields: Record<string, unknown>) {
    if (selIdx == null) return;
    patch((els) => {
      els[selIdx] = { ...(els[selIdx] as FloorEl), ...fields } as FloorEl;
      return els;
    });
  }
  function del() {
    if (selIdx == null) return;
    patch((els) => els.filter((_, i) => i !== selIdx));
    setSelIdx(null);
  }

  const elLabel = (el: FloorEl): string =>
    el.t === "desk" ? `Desk ${el.label ?? el.id}` : el.t === "parking" ? `Bay ${el.label ?? el.id}` : el.t === "office" ? el.name ?? `Office ${el.id}` : el.t === "room" ? el.name : el.t;

  // Move the selected space to another floor's layout. Because each floor is its own
  // plan, this removes the element here and appends it (with a fresh, non-colliding id)
  // to the target floor's plan — persisting BOTH plans immediately.
  async function moveToFloor(targetFloorId: string) {
    if (selIdx == null || targetFloorId === id) return;
    const el = plan.els[selIdx];
    if (el.t !== "desk" && el.t !== "office" && el.t !== "room" && el.t !== "parking") return;
    const fname = floors.find((f) => f.id === targetFloorId)?.name ?? "the selected floor";
    const target = await fetchPlan(targetFloorId);
    let moved: FloorEl = el;
    if (el.t === "desk" || el.t === "office" || el.t === "parking") {
      const maxId = Math.max(0, ...target.els.filter((e): e is Extract<SpaceEl, { t: "desk" | "office" | "parking" }> => e.t === el.t).map((e) => e.id));
      moved = { ...el, id: maxId + 1 };
    } else if (el.t === "room") {
      moved = { ...el, rid: `room-${shortId()}` };
    }
    const targetSaved = await savePlan({ ...target, els: [...target.els, moved] });
    if (!targetSaved.ok) {
      toast.error("Could not move", { description: targetSaved.error ?? "The target floor changed — reload and retry." });
      return;
    }
    const cur = { ...plan, els: plan.els.filter((_, i) => i !== selIdx) };
    const curSaved = await savePlan(cur);
    setPlan(curSaved.ok ? curSaved.plan : cur);
    setSelIdx(null);
    toast.success("Moved to another floor", { description: `${elLabel(el)} moved to ${fname}.` });
  }

  const nextId = (t: "desk" | "office" | "parking") =>
    Math.max(0, ...plan.els.filter((e): e is Extract<SpaceEl, { t: "desk" | "office" | "parking" }> => e.t === t).map((e) => e.id)) + 1;

  function pushEl(el: FloorEl) {
    setPlan((p) => {
      const els = [...p.els, el];
      setSelIdx(els.length - 1);
      return { ...p, els };
    });
  }

  function add(kind: "desk" | "round" | "office" | "room" | "parking" | "label") {
    if (kind === "desk" || kind === "round") {
      const newId = nextId("desk");
      pushEl({ t: "desk", id: newId, x: cx, y: cy, shape: kind === "round" ? "round" : "L", numIn: kind === "round", label: String(newId) });
    } else if (kind === "office") {
      const newId = nextId("office");
      pushEl({ t: "office", id: newId, x: cx - 50, y: cy - 40, w: 100, h: 80, name: `Office ${newId}` });
    } else if (kind === "room") {
      pushEl({ t: "room", rid: `room-${Date.now()}`, name: "Meeting Room", x: cx - 80, y: cy - 50, w: 160, h: 100, shape: "rect", seats: 6 });
    } else if (kind === "parking") {
      const newId = nextId("parking");
      pushEl({ t: "parking", id: newId, x: cx, y: cy, label: String(newId) });
    } else {
      pushEl({ t: "label", x: cx, y: cy, text: "Label", size: 18 });
    }
  }

  function duplicate() {
    if (selIdx == null) return;
    const src = plan.els[selIdx];
    if (src.t === "wall" || src.t === "fixture") return;
    let copy = { ...src, x: src.x + 24, y: src.y + 24 } as FloorEl;
    if (copy.t === "desk" || copy.t === "office" || copy.t === "parking") copy = { ...copy, id: nextId(copy.t) };
    if (copy.t === "room") copy = { ...copy, rid: `room-${Date.now()}` };
    pushEl(copy);
  }

  const fileRef = useRef<HTMLInputElement>(null);
  const ALLOWED = ["image/png", "image/jpeg", "image/svg+xml"];

  function imageDims(file: File): Promise<{ w: number; h: number } | null> {
    return new Promise((res) => {
      const url = URL.createObjectURL(file);
      const img = new Image();
      img.onload = () => res({ w: img.naturalWidth || 1000, h: img.naturalHeight || 707 });
      img.onerror = () => res(null);
      img.src = url;
    });
  }
  async function uploadImageTo(planId: string, file: File): Promise<boolean> {
    const dims = await imageDims(file);
    const fd = new FormData();
    fd.append("file", file);
    if (dims) {
      fd.append("w", String(dims.w));
      fd.append("h", String(dims.h));
    }
    const r = await fetch(`/api/plans/${planId}/image`, { method: "POST", body: fd });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      toast.error("Upload failed", { description: body.error ?? "Could not store the image." });
      return false;
    }
    return true;
  }
  async function onUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    e.target.value = ""; // allow re-selecting the same file
    if (!file) return;
    if (!ALLOWED.includes(file.type)) {
      toast.error("Unsupported file", { description: "Upload a PNG, JPG or SVG floor plan." });
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      toast.error("File too large", { description: "Maximum size is 15 MB." });
      return;
    }
    const dims = await imageDims(file);
    if (!dims) {
      toast.error("Could not read image", { description: "The file may be corrupt or unsupported." });
      return;
    }
    // show it on the canvas immediately, rescaling any existing overlays so
    // they stay aligned with the new image instead of drifting off it
    setPlan((p) => {
      const { fx, fy } = scaleFactors(p.viewBox, dims.w, dims.h);
      return { ...p, image: URL.createObjectURL(file), viewBox: `0 0 ${dims.w} ${dims.h}`, els: scaleEls(p.els, fx, fy) };
    });
    setSelIdx(null);

    if (isNew) {
      setPendingFile(file); // stored together with the building on Save/Publish
      toast.success("Layout added", { description: "Shown below. Click Save draft or Publish to store it." });
      return;
    }
    // existing building — persist now
    if (await uploadImageTo(id, file)) {
      const fresh = await fetchPlan(id);
      setPlan(clone(fresh));
      toast.success("Floor plan uploaded", { description: "Saved. Drag resources onto it." });
    }
  }

  async function persist(published: boolean) {
    if (isNew) {
      if (!plan.name.trim()) {
        toast.error("Name required", { description: "Give the building a name before saving." });
        return;
      }
      // unique + stable id: slug(name) for readability, plus a one-time random suffix.
      if (!newIdRef.current) newIdRef.current = `${slug(plan.name)}-${shortId()}`;
      const newId = newIdRef.current;
      // save the building record + layout (image is attached via the upload below)
      const toSave: FloorPlan = { ...plan, id: newId, published, image: undefined };
      const created = await addCustomBuilding({ id: newId, name: plan.name });
      if (!created.ok) {
        toast.error("Could not create building", { description: created.error ?? "Please try again." });
        return;
      }
      const saved = await savePlan(toSave);
      if (!saved.ok) {
        toast.error("Could not save layout", { description: saved.error ?? "Please try again." });
        return;
      }
      // multi-floor/room: auto-generate the structure nodes. Node 1 is this layout
      // (id === buildingId, default); nodes 2..N start empty for layout upload.
      if (structure === "multi" && unitCount > 1) {
        const label = unitKind === "room" ? "Room" : "Floor";
        const floors: FloorRoom[] = Array.from({ length: unitCount }, (_, i) => ({
          id: i === 0 ? newId : `${newId}__${unitKind}-${i + 1}`,
          name: `${label} ${i + 1}`,
          type: unitKind,
          isDefault: i === 0,
        }));
        await saveFloors(newId, floors);
      }
      if (pendingFile && !(await uploadImageTo(newId, pendingFile))) return; // building saved; image upload failed → retry on edit page
      toast.success(published ? "Building published" : "Building saved", {
        description: structure === "multi" ? `${plan.name} — ${unitCount} ${unitKind}s created; add each layout under Buildings → Floors` : `${plan.name} — opening its editor`,
      });
      router.push(structure === "multi" ? "/buildings" : `/editor/${newId}`);
      return;
    }
    const toSave = { ...plan, published };
    const saved = await savePlan(toSave);
    if (!saved.ok) {
      if (saved.conflict) {
        const fresh = await fetchPlan(id);
        setPlan(clone(fresh));
        toast.error("Reloaded — changed elsewhere", { description: "Another admin saved this site. Your unsaved edits were not applied; please redo them on the latest version." });
      } else {
        toast.error("Save failed", { description: saved.error ?? "Please try again." });
      }
      return;
    }
    setPlan(saved.plan); // adopt the server's new rev so the next save isn't a false conflict
    toast.success(published ? "Published" : "Draft saved", { description: `${plan.name} updated` });
  }
  const save = () => persist(plan.published ?? false);
  const publish = () => persist(true);

  async function reset() {
    const def = await resetPlan(id);
    setPlan(clone(def));
    setSelIdx(null);
    toast("Reset to default", { description: "Reverted to the built-in layout" });
  }

  const sel: FloorEl | null = selIdx != null ? plan.els[selIdx] : null;
  const selRot = sel && "rot" in sel ? (sel.rot ?? 0) : 0;
  const counts = {
    desk: plan.els.filter((e) => e.t === "desk").length,
    office: plan.els.filter((e) => e.t === "office").length,
    room: plan.els.filter((e) => e.t === "room").length,
    parking: plan.els.filter((e) => e.t === "parking").length,
  };

  if (role && role !== "global-admin") {
    return (
      <div className="animate-fade-up grid h-full place-items-center">
        <div className="max-w-md rounded-[14px] border bg-card p-8 text-center shadow-sm">
          <p className="text-[14px] font-semibold">Global Admin access required</p>
          <p className="mt-1 text-[12.5px] text-txt-mute">Floor plans and layouts can only be edited by a Global Admin.</p>
          <button onClick={() => router.push("/book")} className="mt-4 rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground">
            Go to Book a space
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up flex h-full flex-col">
      <div className="mb-3 flex flex-wrap items-center gap-3">
        <button onClick={() => router.push("/buildings")} className="flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold">
          <ArrowLeft className="size-4" /> Buildings
        </button>
        {isNew ? (
          <input value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} className="rounded-[10px] border bg-panel-2 px-3 py-2 text-[15px] font-bold font-heading" />
        ) : (
          <h1 className="text-xl font-heading">{plan.name}</h1>
        )}
        <span className="text-[12px] text-txt-mute">{counts.desk} desks · {counts.office} offices · {counts.room} rooms · {counts.parking} parking</span>
        <span className="text-[12px] font-semibold text-txt-mute">{plan.published ? "Published" : "Draft"}</span>
        <div className="flex-1" />
        <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/svg+xml" className="hidden" onChange={onUpload} />
        <button onClick={() => fileRef.current?.click()} className="flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold"><UploadCloud className="size-4" /> Upload plan</button>
        {!isNew && (
          <button onClick={reset} className="flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold"><RotateCcw className="size-4" /> Reset</button>
        )}
        <button onClick={save} className="flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold"><Save className="size-4" /> Save draft</button>
        <button onClick={publish} className="flex items-center gap-1.5 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft"><Rocket className="size-4" /> Publish</button>
      </div>

      <div className="grid min-h-0 flex-1 gap-[15px] lg:grid-cols-[1fr_340px]">
        <div className="rounded-[14px] border bg-card p-3 shadow-sm">
          <div className="mb-2 flex flex-wrap gap-2">
            <Add label="+ Desk" onClick={() => add("desk")} />
            <Add label="+ Round desk" onClick={() => add("round")} />
            <Add label="+ Office" onClick={() => add("office")} />
            <Add label="+ Meeting room" onClick={() => add("room")} />
            <Add label="+ Parking" onClick={() => add("parking")} />
            <Add label="+ Text" onClick={() => add("label")} />
          </div>
          <div className="relative flex w-full items-center justify-center overflow-hidden rounded-[11px] border bg-panel-2" style={{ height: "70vh", minHeight: 420 }}>
            <EditorCanvas plan={plan} selIdx={selIdx} onSelect={setSelIdx} onMove={move} />
          </div>
          <p className="mt-2 text-[12px] text-txt-mute">Drag any element to reposition. Click to select and edit. Changes save to this site only.</p>
        </div>

        <div className="rounded-[14px] border bg-card p-5 shadow-sm">
          {!sel ? (
            <div className="flex flex-col gap-5 text-[13px]">
              <div className="flex items-center gap-2.5 border-b pb-3">
                <div className="grid size-8 place-items-center rounded-[9px] bg-primary/10 text-primary"><Building2 className="size-4" /></div>
                <div>
                  <div className="font-heading text-[15px] font-bold leading-tight">Building details</div>
                  <div className="text-[11.5px] text-txt-mute">Applies to this site only</div>
                </div>
              </div>

              <Field label="Building name"><input value={plan.name} onChange={(e) => setPlan((p) => ({ ...p, name: e.target.value }))} className="ed-input" /></Field>

              {isNew && (
                <Section icon={<Layers className="size-3.5" />} title="Structure">
                  <Field label="Type">
                    <select value={structure} onChange={(e) => setStructure(e.target.value as "single" | "multi")} className="ed-input">
                      <option value="single">Single floor / room</option>
                      <option value="multi">Multiple floors / rooms</option>
                    </select>
                  </Field>
                  {structure === "multi" && (
                    <div className="grid grid-cols-2 gap-3">
                      <Field label="Unit">
                        <select value={unitKind} onChange={(e) => setUnitKind(e.target.value as "floor" | "room")} className="ed-input">
                          <option value="floor">Floors</option>
                          <option value="room">Rooms</option>
                        </select>
                      </Field>
                      <Field label="How many">
                        <input type="number" min={2} max={50} value={unitCount} onChange={(e) => setUnitCount(Math.max(2, Math.min(50, +e.target.value || 2)))} className="ed-input" />
                      </Field>
                    </div>
                  )}
                  {structure === "multi" && (
                    <p className="rounded-[9px] bg-panel-2 px-3 py-2 text-[11.5px] text-txt-mute">
                      This layout becomes <b className="font-semibold text-txt">{unitKind === "room" ? "Room" : "Floor"} 1</b> (default). {unitKind === "room" ? "Rooms" : "Floors"} 2–{unitCount} are created empty — add each layout under <b className="font-semibold text-txt">Buildings → Floors</b>.
                    </p>
                  )}
                </Section>
              )}

              <Section icon={<MapPin className="size-3.5" />} title="Location">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Region">
                    <select value={plan.region ?? ""} onChange={(e) => setPlan((p) => ({ ...p, region: e.target.value }))} className="ed-input">
                      <option value="">Select…</option>
                      {REGIONS.map((r) => <option key={r} value={r}>{r}</option>)}
                    </select>
                  </Field>
                  <Field label="Country">
                    <select value={plan.country ?? ""} onChange={(e) => setPlan((p) => ({ ...p, country: e.target.value }))} className="ed-input">
                      <option value="">Select…</option>
                      {COUNTRIES.map((c) => <option key={c} value={c}>{c}</option>)}
                    </select>
                  </Field>
                </div>
                <Field label="Timezone">
                  <select
                    value={plan.tz ?? ""}
                    onChange={(e) => setPlan((p) => ({ ...p, tz: e.target.value, winTz: winTzFor(e.target.value) }))}
                    className="ed-input"
                  >
                    <option value="">Select…</option>
                    {tzGroups.map((g) => (
                      <optgroup key={g.region} label={g.region}>
                        {g.zones.map((z) => (
                          <option key={z.iana} value={z.iana}>{z.label}</option>
                        ))}
                      </optgroup>
                    ))}
                  </select>
                </Field>
              </Section>

              <Section icon={<Clock className="size-3.5" />} title="Opening hours">
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Opens"><input type="time" value={plan.openTime ?? "08:00"} onChange={(e) => setPlan((p) => ({ ...p, openTime: e.target.value }))} className="ed-input" /></Field>
                  <Field label="Closes"><input type="time" value={plan.closeTime ?? "17:30"} onChange={(e) => setPlan((p) => ({ ...p, closeTime: e.target.value }))} className="ed-input" /></Field>
                </div>
                <Field label="Status">
                  <select value={plan.status ?? "open"} onChange={(e) => setPlan((p) => ({ ...p, status: e.target.value as "open" | "closed" }))} className="ed-input">
                    <option value="open">Open</option>
                    <option value="closed">Closed</option>
                  </select>
                </Field>
              </Section>

              <Section icon={<CalendarDays className="size-3.5" />} title="Booking policy">
                <Field label="Advance limit (days ahead, 0 = unlimited)">
                  <input type="number" min={0} max={365} value={plan.advanceDays ?? 0} onChange={(e) => setPlan((p) => ({ ...p, advanceDays: Math.max(0, +e.target.value || 0) }))} className="ed-input" />
                </Field>
                <div className="grid grid-cols-2 gap-3">
                  <Field label="Max desks / user / day (0 = unlimited)">
                    <input type="number" min={0} max={20} value={plan.maxDeskPerDay ?? 1} onChange={(e) => setPlan((p) => ({ ...p, maxDeskPerDay: Math.max(0, +e.target.value || 0) }))} className="ed-input" />
                  </Field>
                  <Field label="Max active desks / user (0 = unlimited)">
                    <input type="number" min={0} max={100} value={plan.maxConcurrent ?? 10} onChange={(e) => setPlan((p) => ({ ...p, maxConcurrent: Math.max(0, +e.target.value || 0) }))} className="ed-input" />
                  </Field>
                </div>
                <div>
                  <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Bookable days</span>
                  <div className="flex gap-1">
                    {["S", "M", "T", "W", "T", "F", "S"].map((d, i) => {
                      const days = plan.allowedWeekdays ?? [true, true, true, true, true, true, true];
                      const on = days[i];
                      return (
                        <button
                          key={i}
                          type="button"
                          onClick={() => setPlan((p) => { const a = [...(p.allowedWeekdays ?? [true, true, true, true, true, true, true])]; a[i] = !a[i]; return { ...p, allowedWeekdays: a }; })}
                          className={`size-7 rounded-[7px] text-[11px] font-bold ${on ? "bg-primary text-primary-foreground" : "border bg-panel-2 text-txt-mute"}`}
                        >
                          {d}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <label className="flex items-center gap-2 text-[12.5px]">
                  <input type="checkbox" checked={plan.allowPast ?? false} onChange={(e) => setPlan((p) => ({ ...p, allowPast: e.target.checked }))} className="size-4 accent-[var(--orange)]" />
                  Allow booking past dates
                </label>
              </Section>

              <p className="rounded-[9px] bg-panel-2 px-3 py-2 text-[11.5px] text-txt-mute">Saved on <b className="font-semibold text-txt">Save draft</b> or <b className="font-semibold text-txt">Publish</b>. Click any resource on the plan to edit it.</p>
            </div>
          ) : (
            <div className="flex flex-col gap-3 text-[13px]">
              <div className="flex items-center justify-between">
                <div className="font-heading text-[15px] font-bold capitalize">{sel.t} properties</div>
                <button onClick={() => setSelIdx(null)} title="Close" className="grid size-7 place-items-center rounded-[8px] border bg-panel-2 text-txt-mute hover:text-foreground">
                  <X className="size-4" />
                </button>
              </div>
              {sel.t === "desk" && (
                <>
                  <Field label="Label"><input value={sel.label ?? ""} onChange={(e) => updateSel({ label: e.target.value })} className="ed-input" /></Field>
                  <Field label="Shape">
                    <select value={sel.shape ?? "L"} onChange={(e) => updateSel({ shape: e.target.value as DeskShapeKind, numIn: e.target.value === "round" })} className="ed-input">
                      <option value="L">L-desk</option>
                      <option value="round">Round</option>
                      <option value="rect">Straight (with chair)</option>
                      <option value="double">Double / bench</option>
                      <option value="exec">Executive</option>
                    </select>
                  </Field>
                  <Field label={`Size: ${Math.round((sel.size ?? 1) * 100)}%`}>
                    <input type="range" min={0.6} max={2} step={0.1} value={sel.size ?? 1} onChange={(e) => updateSel({ size: +e.target.value })} className="w-full" />
                  </Field>
                </>
              )}
              {sel.t === "parking" && (
                <>
                  <Field label="Bay label"><input value={sel.label ?? ""} onChange={(e) => updateSel({ label: e.target.value })} className="ed-input" /></Field>
                  <Field label={`Size: ${Math.round((sel.size ?? 1) * 100)}%`}>
                    <input type="range" min={0.6} max={2} step={0.1} value={sel.size ?? 1} onChange={(e) => updateSel({ size: +e.target.value })} className="w-full" />
                  </Field>
                </>
              )}
              {(sel.t === "office" || sel.t === "room") && (
                <>
                  <Field label="Name"><input value={sel.name ?? ""} onChange={(e) => updateSel({ name: e.target.value })} className="ed-input" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Width"><input type="number" value={sel.w} onChange={(e) => updateSel({ w: +e.target.value })} className="ed-input" /></Field>
                    <Field label="Height"><input type="number" value={sel.h} onChange={(e) => updateSel({ h: +e.target.value })} className="ed-input" /></Field>
                  </div>
                </>
              )}
              {sel.t === "room" && (
                <>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Seats"><input type="number" value={sel.seats ?? 0} onChange={(e) => updateSel({ seats: +e.target.value })} className="ed-input" /></Field>
                    <Field label="Max booking (hrs, 0 = no limit)"><input type="number" min={0} max={24} value={sel.maxHours ?? 0} onChange={(e) => updateSel({ maxHours: Math.max(0, +e.target.value || 0) })} className="ed-input" /></Field>
                  </div>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Shape">
                      <select value={sel.shape ?? "rect"} onChange={(e) => updateSel({ shape: e.target.value as "rect" | "oval" })} className="ed-input">
                        <option value="rect">Rect</option>
                        <option value="oval">Oval</option>
                      </select>
                    </Field>
                  </div>
                  <Field label="M365 room mailbox">
                    <input type="email" value={sel.mailbox ?? ""} placeholder="room@company.com" onChange={(e) => updateSel({ mailbox: e.target.value.trim() })} className="ed-input" />
                    {sel.mailbox && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(sel.mailbox) ? (
                      <p className="mt-1 text-[11px] font-semibold text-destructive">Enter a valid email address.</p>
                    ) : sel.mailbox ? (
                      <p className="mt-1 text-[11px] text-ok">✓ Calendar auto-connects via Graph — no manual setup.</p>
                    ) : null}
                  </Field>
                  <Field label="Notes"><input value={sel.notes ?? ""} onChange={(e) => updateSel({ notes: e.target.value })} className="ed-input" /></Field>
                </>
              )}
              {sel.t === "label" && (
                <>
                  <Field label="Text"><input value={sel.text} onChange={(e) => updateSel({ text: e.target.value })} className="ed-input" /></Field>
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Font size"><input type="number" value={sel.size ?? 18} onChange={(e) => updateSel({ size: +e.target.value })} className="ed-input" /></Field>
                    <Field label="Colour"><input type="color" value={sel.color ?? "#52707b"} onChange={(e) => updateSel({ color: e.target.value })} className="ed-input h-9 p-1" /></Field>
                  </div>
                </>
              )}
              {floors.length > 1 && (sel.t === "desk" || sel.t === "office" || sel.t === "room" || sel.t === "parking") && (
                <Field label="Floor">
                  <select value={id} onChange={(e) => moveToFloor(e.target.value)} className="ed-input">
                    {floors.map((f) => (
                      <option key={f.id} value={f.id}>{f.name}{f.isDefault ? " (default)" : ""}</option>
                    ))}
                  </select>
                  <p className="mt-1 text-[11px] text-txt-mute">Changing the floor moves this {sel.t} to that floor’s layout.</p>
                </Field>
              )}
              {sel.t !== "wall" && sel.t !== "fixture" && (
                <Field label={`Rotation: ${selRot}°`}>
                  <input type="range" min={-180} max={180} value={selRot} onChange={(e) => updateSel({ rot: +e.target.value })} className="w-full" />
                </Field>
              )}
              <div className="mt-2 flex gap-2">
                <button onClick={duplicate} className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border bg-panel-2 px-3 py-2 font-semibold">
                  <Copy className="size-4" /> Duplicate
                </button>
                <button onClick={del} className="flex flex-1 items-center justify-center gap-2 rounded-[10px] border border-destructive/40 bg-destructive/10 px-3 py-2 font-semibold text-destructive">
                  <Trash2 className="size-4" /> Delete
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

function Add({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button onClick={onClick} className="flex items-center gap-1 rounded-[9px] border bg-panel-2 px-3 py-1.5 text-[12.5px] font-semibold hover:border-primary">
      <Plus className="size-3.5" /> {label.replace("+ ", "")}
    </button>
  );
}
function Section({ icon, title, children }: { icon: React.ReactNode; title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-[0.06em] text-txt-mute">
        {icon} {title}
      </div>
      {children}
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
