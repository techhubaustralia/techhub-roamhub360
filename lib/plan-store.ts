"use client";

import { useEffect, useState } from "react";
import type { FloorPlan } from "./types";
import { getFloorPlan } from "./floorplans";

// Client API wrappers around the server persistence (/api/plans, /api/buildings).
export async function fetchPlan(id: string): Promise<FloorPlan> {
  if (!id) return getFloorPlan(id); // avoid GET /api/plans (no id) -> 404 on first render
  try {
    const r = await fetch(`/api/plans/${id}`, { cache: "no-store" });
    if (!r.ok) throw new Error();
    return (await r.json()) as FloorPlan;
  } catch {
    return getFloorPlan(id);
  }
}

export type SavePlanResult = { ok: true; plan: FloorPlan } | { ok: false; conflict: boolean; error?: string };

export async function savePlan(plan: FloorPlan): Promise<SavePlanResult> {
  const r = await fetch(`/api/plans/${plan.id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(plan),
  });
  if (r.ok) return { ok: true, plan: (await r.json()) as FloorPlan };
  const body = await r.json().catch(() => ({}));
  return { ok: false, conflict: r.status === 409, error: body.error };
}

export async function resetPlan(id: string): Promise<FloorPlan> {
  try {
    const r = await fetch(`/api/plans/${id}`, { method: "DELETE" });
    if (!r.ok) throw new Error(String(r.status));
    return (await r.json()) as FloorPlan;
  } catch {
    return getFloorPlan(id); // graceful fallback (matches fetchPlan) instead of a malformed plan
  }
}

export interface FloorRoom {
  id: string;
  name: string;
  type: "floor" | "room" | "parking";
  isDefault?: boolean;
}
export interface CustomBuilding {
  id: string;
  name: string;
  region?: string;
  country?: string;
  floors?: FloorRoom[];
  // enriched by GET /api/buildings from the saved plan:
  tz?: string;
  hours?: string;
  desks?: string;
  status?: string;
}

export async function getFloors(buildingId: string): Promise<FloorRoom[]> {
  if (!buildingId) return [];
  try {
    const r = await fetch(`/api/buildings/${buildingId}/floors`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as FloorRoom[]) : [];
  } catch {
    return [];
  }
}

export async function saveFloors(buildingId: string, floors: FloorRoom[]): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/buildings/${buildingId}/floors`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(floors),
  });
  if (r.ok) {
    announceBuildingsChanged();
    return { ok: true };
  }
  const b = await r.json().catch(() => ({}));
  return { ok: false, error: b.error ?? "Could not save floors" };
}

/** Broadcast so every open view (location picker, lists) refetches immediately. */
function announceBuildingsChanged() {
  if (typeof window !== "undefined") window.dispatchEvent(new Event("wh:buildings"));
}

export async function addCustomBuilding(b: CustomBuilding): Promise<{ ok: boolean; error?: string }> {
  try {
    const r = await fetch(`/api/buildings`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b),
    });
    if (!r.ok) {
      const body = await r.json().catch(() => ({}));
      return { ok: false, error: body.error ?? `Save failed (${r.status})` };
    }
    announceBuildingsChanged();
    return { ok: true };
  } catch {
    return { ok: false, error: "Network error" };
  }
}

export interface BuildingsMeta {
  custom: CustomBuilding[];
  hidden: string[];
}

export async function getBuildingsMeta(): Promise<BuildingsMeta> {
  try {
    const r = await fetch(`/api/buildings`, { cache: "no-store" });
    return r.ok ? ((await r.json()) as BuildingsMeta) : { custom: [], hidden: [] };
  } catch {
    return { custom: [], hidden: [] };
  }
}

export async function listCustomBuildings(): Promise<CustomBuilding[]> {
  return (await getBuildingsMeta()).custom;
}

export async function deleteBuildingApi(id: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/buildings/${id}`, { method: "DELETE" });
  if (r.ok) {
    announceBuildingsChanged();
    return { ok: true };
  }
  const body = await r.json().catch(() => ({}));
  return { ok: false, error: body.error ?? "Delete failed" };
}

export async function restoreBuildingApi(id: string): Promise<{ ok: boolean; error?: string }> {
  const r = await fetch(`/api/buildings/${id}`, { method: "POST" });
  if (r.ok) {
    announceBuildingsChanged();
    return { ok: true };
  }
  const body = await r.json().catch(() => ({}));
  return { ok: false, error: body.error ?? "Restore failed" };
}

/** Reactive hook: server-persisted plan for an id. `loading` is true until the
 *  authoritative plan is fetched, so callers can show a skeleton instead of a
 *  wrong default (prevents the stale-plan flicker on route/building change). */
export function usePlan(id: string): { plan: FloorPlan; loading: boolean } {
  const [plan, setPlan] = useState<FloorPlan>(() => getFloorPlan(id));
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    let alive = true;
    setLoading(true);
    fetchPlan(id).then((p) => {
      if (alive) {
        setPlan(p);
        setLoading(false);
      }
    });
    return () => {
      alive = false;
    };
  }, [id]);
  return { plan, loading };
}
