"use client";

import { useRef, useState } from "react";
import type { FloorPlan, SpaceEl } from "@/lib/types";
import { DeskShape, RoomShape, ParkingShape } from "./floor-svg";

function svgPoint(svg: SVGSVGElement, e: { clientX: number; clientY: number }) {
  const pt = svg.createSVGPoint();
  pt.x = e.clientX;
  pt.y = e.clientY;
  const m = svg.getScreenCTM();
  if (!m) return { x: 0, y: 0 };
  const p = pt.matrixTransform(m.inverse());
  return { x: p.x, y: p.y };
}

const isSpace = (e: FloorPlan["els"][number]): e is SpaceEl =>
  e.t === "desk" || e.t === "office" || e.t === "room" || e.t === "parking";

export function EditorCanvas({
  plan,
  selIdx,
  onSelect,
  onMove,
}: {
  plan: FloorPlan;
  selIdx: number | null;
  onSelect: (idx: number | null) => void;
  onMove: (idx: number, x: number, y: number) => void;
}) {
  const svgRef = useRef<SVGSVGElement>(null);
  const [drag, setDrag] = useState<{ idx: number; ox: number; oy: number } | null>(null);

  function down(e: React.PointerEvent, idx: number, ex: number, ey: number) {
    e.stopPropagation();
    onSelect(idx);
    const p = svgPoint(svgRef.current!, e);
    setDrag({ idx, ox: p.x - ex, oy: p.y - ey });
    // Guard: a released/synthetic pointer has no active id and would throw.
    try { (e.target as Element).setPointerCapture?.(e.pointerId); } catch {}
  }
  function move(e: React.PointerEvent) {
    if (!drag) return;
    const p = svgPoint(svgRef.current!, e);
    onMove(drag.idx, Math.round(p.x - drag.ox), Math.round(p.y - drag.oy));
  }

  const [, , wStr, hStr] = plan.viewBox.split(" ");
  const vw = Number(wStr) || 1000;
  const vh = Number(hStr) || 700;

  return (
    <svg
      ref={svgRef}
      viewBox={plan.viewBox}
      width={vw}
      height={vh}
      preserveAspectRatio="xMidYMid meet"
      style={{ maxWidth: "100%", maxHeight: "100%" }}
      className="block touch-none"
      onPointerMove={move}
      onPointerUp={() => setDrag(null)}
    >
      {/* Layer 1 — uploaded floor plan (locked background) */}
      {plan.image && (
        <image href={plan.image} x={0} y={0} width={Number(wStr)} height={Number(hStr)} preserveAspectRatio="none" />
      )}
      {plan.els.map((el, i) =>
        el.t === "wall" ? (
          <path key={i} d={el.d} fill="none" stroke="var(--txt-mute)" strokeWidth={5} strokeLinejoin="round" opacity={0.5} />
        ) : null,
      )}
      {/* Layer 4 — text labels */}
      {plan.els.map((el, i) =>
        el.t === "label" ? (
          <text
            key={`lab${i}`}
            x={el.x}
            y={el.y}
            textAnchor="middle"
            dominantBaseline="central"
            fontSize={el.size ?? 14}
            fontWeight={700}
            fill={i === selIdx ? "#29C5EE" : el.color ?? "var(--txt-dim)"}
            transform={el.rot ? `rotate(${el.rot} ${el.x} ${el.y})` : undefined}
            style={{ cursor: "move" }}
            onPointerDown={(e) => down(e, i, el.x, el.y)}
          >
            {el.text}
          </text>
        ) : null,
      )}
      {/* Resources use the SAME shapes as the booking view (DeskShape / RoomShape),
          so what an admin builds is exactly what staff see. */}
      {plan.els.map((el, i) => {
        if (!isSpace(el)) return null;
        const sel = i === selIdx;
        if (el.t === "desk") {
          return (
            <g key={i} style={{ cursor: "move" }} onPointerDown={(e) => down(e, i, el.x, el.y)}>
              <DeskShape el={el} status="free" selected={sel} />
            </g>
          );
        }
        if (el.t === "parking") {
          return (
            <g key={i} style={{ cursor: "move" }} onPointerDown={(e) => down(e, i, el.x, el.y)}>
              <ParkingShape el={el} status="free" selected={sel} />
            </g>
          );
        }
        // office / room
        const cx = el.x + el.w / 2;
        return (
          <g
            key={i}
            style={{ cursor: "move" }}
            onPointerDown={(e) => down(e, i, el.x, el.y)}
            transform={el.rot ? `rotate(${el.rot} ${cx} ${el.y + el.h / 2})` : undefined}
          >
            <RoomShape el={el} status="free" selected={sel} />
          </g>
        );
      })}
    </svg>
  );
}
