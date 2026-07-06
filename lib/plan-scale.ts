import type { FloorEl } from "./types";

/** Rescale every element's coordinates when the plan's viewBox changes (e.g. a
 *  floor-plan image of different dimensions is uploaded), so desks/offices/rooms
 *  stay in the same relative position on the plan instead of drifting off it.
 *  Wall paths (`d`) are left untouched — custom plans rarely use them. */
export function scaleEls(els: FloorEl[], fx: number, fy: number): FloorEl[] {
  if (!isFinite(fx) || !isFinite(fy) || (Math.abs(fx - 1) < 1e-6 && Math.abs(fy - 1) < 1e-6)) return els;
  const fAvg = (fx + fy) / 2;
  return els.map((el) => {
    const e = { ...el } as Record<string, unknown>;
    if (typeof e.x === "number") e.x = Math.round(e.x * fx);
    if (typeof e.y === "number") e.y = Math.round(e.y * fy);
    if (typeof e.w === "number") e.w = Math.round(e.w * fx);
    if (typeof e.h === "number") e.h = Math.round(e.h * fy);
    if (typeof e.lx === "number") e.lx = Math.round(e.lx * fx);
    if (typeof e.ly === "number") e.ly = Math.round(e.ly * fy);
    if (typeof e.size === "number") e.size = Math.round(e.size * fAvg);
    return e as unknown as FloorEl;
  });
}

/** Factors to map an old viewBox dimension pair to a new one. */
export function scaleFactors(oldVb: string, w: number, h: number): { fx: number; fy: number } {
  const [, , ow, oh] = oldVb.split(" ").map(Number);
  return { fx: ow > 0 ? w / ow : 1, fy: oh > 0 ? h / oh : 1 };
}
