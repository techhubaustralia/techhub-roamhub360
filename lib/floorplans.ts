import type { FloorPlan } from "./types";

// No built-in/demo floor plans. Every layout is created by an admin in the editor
// and persisted per-floor (see lib/server/store.ts, keyed by the floor id).
//
// IMPORTANT: getFloorPlan must NEVER return another building's layout. It used to
// fall back to a hard-coded "New York" demo plan, so any floor/building without a
// stored layout yet (e.g. a freshly added Floor 2) inherited New York's desks,
// offices and rooms — a data-integrity bug. The fallback is now an empty plan
// carrying only the requested id.

/** A brand-new, empty floor plan for an id that has no stored layout yet. */
export function blankPlan(id: string): FloorPlan {
  return { id, name: "", viewBox: "0 0 1200 800", open: true, els: [] };
}

export function getFloorPlan(id: string): FloorPlan {
  return blankPlan(id);
}
