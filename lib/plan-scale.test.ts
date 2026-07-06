import { describe, it, expect } from "vitest";
import { scaleEls, scaleFactors } from "./plan-scale";
import type { FloorEl } from "./types";

describe("scaleFactors", () => {
  it("computes x/y factors from an old viewBox to new dims", () => {
    expect(scaleFactors("0 0 1000 800", 2000, 1600)).toEqual({ fx: 2, fy: 2 });
    expect(scaleFactors("0 0 500 500", 250, 1000)).toEqual({ fx: 0.5, fy: 2 });
  });
  it("falls back to 1 when old dims are missing/zero", () => {
    expect(scaleFactors("0 0 0 0", 1000, 800)).toEqual({ fx: 1, fy: 1 });
  });
});

describe("scaleEls", () => {
  const els: FloorEl[] = [
    { t: "desk", id: 1, x: 100, y: 200, shape: "L", label: "1" },
    { t: "office", id: 1, x: 50, y: 60, w: 120, h: 80, name: "O1" },
    { t: "wall", d: "M0 0 L10 10" },
  ];
  it("scales desk/office coords and sizes; leaves walls untouched", () => {
    const out = scaleEls(els, 2, 3);
    expect(out[0]).toMatchObject({ x: 200, y: 600 });
    expect(out[1]).toMatchObject({ x: 100, y: 180, w: 240, h: 240 });
    expect(out[2]).toEqual(els[2]); // wall unchanged
  });
  it("is a no-op at factor 1,1", () => {
    expect(scaleEls(els, 1, 1)).toBe(els);
  });
});
