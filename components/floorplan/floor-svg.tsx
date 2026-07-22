"use client";

import { Fragment, type ReactNode } from "react";
import type { FloorPlan, SpaceEl, SpaceStatus } from "@/lib/types";
import { spaceKey } from "@/lib/types";

const GREEN = "#2fb350";
const GREEN_STROKE = "#269342";
const GREY = "#9aa7ad";
const GREY_STROKE = "#7d8a90";
const RED = "#dc5b43";
const RED_STROKE = "#b8462f";
const ORANGE = "#e8912e";
const ORANGE_STROKE = "#c2741c";
const SEL = "#29C5EE";

function fillFor(status: SpaceStatus) {
  return status === "locked" ? GREY : status === "booked" ? RED : status === "maintenance" ? ORANGE : GREEN;
}
function strokeFor(status: SpaceStatus, selected: boolean) {
  if (selected) return SEL;
  return status === "locked" ? GREY_STROKE : status === "booked" ? RED_STROKE : status === "maintenance" ? ORANGE_STROKE : GREEN_STROKE;
}

function Lock({ x, y, scale = 1 }: { x: number; y: number; scale?: number }) {
  return (
    <g transform={`translate(${x - 6 * scale} ${y - 7 * scale}) scale(${scale})`} opacity={0.9}>
      <circle cx={6} cy={6} r={9} fill="#fff" opacity={0.8} />
      <path d="M3 6 V4.5 a3 3 0 0 1 6 0 V6" fill="none" stroke="#5a6b72" strokeWidth={1.4} />
      <rect x={2.5} y={6} width={7} height={6} rx={1.2} fill="#5a6b72" />
    </g>
  );
}

function lines(text: string, max: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > max && cur) {
      out.push(cur);
      cur = w;
    } else cur = (cur + " " + w).trim();
  }
  if (cur) out.push(cur);
  return out;
}

// L-shaped workstation centered at (x,y); s = scale
function deskPath(x: number, y: number, s = 1): string {
  const w = 20 * s;
  return `M ${x - w} ${y - 12 * s} L ${x + w} ${y - 12 * s} L ${x + w} ${y + 2 * s} L ${x - 4 * s} ${y + 2 * s} L ${x - 4 * s} ${y + 14 * s} L ${x - w} ${y + 14 * s} Z`;
}

// Pure desk visual (glyph + number/label/lock). Shared by the booking view and
// the editor canvas so both render desks identically.
export function DeskShape({ el, status, selected, showLabel = true }: { el: Extract<SpaceEl, { t: "desk" }>; status: SpaceStatus; selected: boolean; showLabel?: boolean }) {
  const locked = status === "locked";
  const fill = fillFor(status);
  const stroke = strokeFor(status, selected);
  const shape = el.shape ?? "L";
  const round = shape === "round";
  const inside = round || el.numIn; // number painted on the desk vs label below
  const num = el.label ?? String(el.id);
  const s = el.size && el.size > 0 ? el.size : 1; // uniform resize factor (default 1)
  const sw = selected ? 3 : 1.5;
  const CHAIR = "#cfd9de";
  let glyph: ReactNode;
  if (round) {
    glyph = (
      <>
        <rect x={el.x - 7 * s} y={el.y - 22 * s} width={14 * s} height={7 * s} rx={3 * s} fill={CHAIR} />
        <rect x={el.x - 7 * s} y={el.y + 15 * s} width={14 * s} height={7 * s} rx={3 * s} fill={CHAIR} />
        <rect x={el.x - 22 * s} y={el.y - 7 * s} width={7 * s} height={14 * s} rx={3 * s} fill={CHAIR} />
        <rect x={el.x + 15 * s} y={el.y - 7 * s} width={7 * s} height={14 * s} rx={3 * s} fill={CHAIR} />
        <rect x={el.x - 13 * s} y={el.y - 13 * s} width={26 * s} height={26 * s} rx={6 * s} fill={fill} stroke={stroke} strokeWidth={sw} />
      </>
    );
  } else if (shape === "rect") {
    // straight desk with a chair (matches the common single-workstation glyph)
    glyph = (
      <>
        <rect x={el.x - 9 * s} y={el.y - 17 * s} width={18 * s} height={8 * s} rx={4 * s} fill={CHAIR} />
        <rect x={el.x - 18 * s} y={el.y - 7 * s} width={36 * s} height={18 * s} rx={3 * s} fill={fill} stroke={stroke} strokeWidth={sw} />
      </>
    );
  } else if (shape === "double") {
    // back-to-back bench (two work surfaces sharing a spine)
    glyph = (
      <>
        <rect x={el.x - 13 * s} y={el.y - 24 * s} width={26 * s} height={8 * s} rx={4 * s} fill={CHAIR} />
        <rect x={el.x - 13 * s} y={el.y + 16 * s} width={26 * s} height={8 * s} rx={4 * s} fill={CHAIR} />
        <rect x={el.x - 22 * s} y={el.y - 16 * s} width={44 * s} height={32 * s} rx={3 * s} fill={fill} stroke={stroke} strokeWidth={sw} />
        <line x1={el.x - 22 * s} y1={el.y} x2={el.x + 22 * s} y2={el.y} stroke={stroke} strokeWidth={1.2} opacity={0.6} />
      </>
    );
  } else if (shape === "exec") {
    // executive desk with an L return and chair
    glyph = (
      <>
        <rect x={el.x - 6 * s} y={el.y - 24 * s} width={16 * s} height={8 * s} rx={4 * s} fill={CHAIR} />
        <rect x={el.x - 26 * s} y={el.y - 15 * s} width={52 * s} height={22 * s} rx={4 * s} fill={fill} stroke={stroke} strokeWidth={sw} />
        <rect x={el.x + 10 * s} y={el.y + 7 * s} width={16 * s} height={14 * s} rx={3 * s} fill={fill} stroke={stroke} strokeWidth={sw} />
      </>
    );
  } else {
    // default "L" workstation
    glyph = (
      <>
        <path d={deskPath(el.x, el.y, s)} fill={fill} stroke={stroke} strokeWidth={sw} strokeLinejoin="round" />
        <circle cx={el.x + 11 * s} cy={el.y + 10 * s} r={4.5 * s} fill="none" stroke={stroke} strokeWidth={1.4} />
      </>
    );
  }
  return (
    <>
      <g transform={el.rot ? `rotate(${el.rot} ${el.x} ${el.y})` : undefined}>{glyph}</g>
      {locked ? (
        <Lock x={el.x} y={el.y} scale={0.7} />
      ) : !showLabel ? null : inside ? (
        <text x={el.x} y={el.y} textAnchor="middle" dominantBaseline="central" fontSize={11} fontWeight={700} fill="#fff">
          {num}
        </text>
      ) : (
        <text x={el.x} y={el.y + 28} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--txt-dim)">
          Desk {num}
        </text>
      )}
    </>
  );
}

function Desk({
  el,
  status,
  selected,
  dim,
  onPick,
  onHover,
  onLeave,
}: {
  el: Extract<SpaceEl, { t: "desk" }>;
  status: SpaceStatus;
  selected: boolean;
  dim?: boolean;
  onPick: () => void;
  onHover?: (e: React.MouseEvent) => void;
  onLeave?: () => void;
}) {
  return (
    <g
      style={{ cursor: "pointer" }}
      opacity={dim ? 0.18 : 1}
      onClick={onPick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      role="button"
      tabIndex={0}
      aria-label={`Desk ${el.label ?? el.id} — ${status}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
      className={`fp-anim fp-hot${!selected ? " hover:brightness-110" : ""}`}
    >
      <DeskShape el={el} status={status} selected={selected} showLabel={false} />
    </g>
  );
}

// Pure parking-bay visual (bay outline + "P" + car mark). Behaves like a desk: a point
// glyph positioned at (x,y), rotatable and resizable via `size`, coloured by status.
export function ParkingShape({ el, status, selected }: { el: Extract<SpaceEl, { t: "parking" }>; status: SpaceStatus; selected: boolean }) {
  const fill = fillFor(status);
  const stroke = strokeFor(status, selected);
  const s = el.size && el.size > 0 ? el.size : 1;
  const sw = selected ? 3 : 1.5;
  const locked = status === "locked";
  const num = el.label ?? String(el.id);
  const w = 32 * s;
  const h = 40 * s;
  return (
    <>
      <g transform={el.rot ? `rotate(${el.rot} ${el.x} ${el.y})` : undefined}>
        <rect x={el.x - w / 2} y={el.y - h / 2} width={w} height={h} rx={5 * s} fill={fill} stroke={stroke} strokeWidth={sw} />
        {locked ? (
          <Lock x={el.x} y={el.y} scale={0.9 * s} />
        ) : (
          <>
            <text x={el.x} y={el.y - 5 * s} textAnchor="middle" dominantBaseline="central" fontSize={21 * s} fontWeight={800} fill="#fff">P</text>
            {/* small car mark */}
            <rect x={el.x - 10 * s} y={el.y + 8 * s} width={20 * s} height={7 * s} rx={3.5 * s} fill="#fff" opacity={0.75} />
            <circle cx={el.x - 6 * s} cy={el.y + 16 * s} r={2.2 * s} fill="#fff" opacity={0.75} />
            <circle cx={el.x + 6 * s} cy={el.y + 16 * s} r={2.2 * s} fill="#fff" opacity={0.75} />
          </>
        )}
      </g>
      <text x={el.x} y={el.y + h / 2 + 11 * s} textAnchor="middle" fontSize={11} fontWeight={600} fill="var(--txt-dim)">
        {/^\d+$/.test(num) ? `Bay ${num}` : num}
      </text>
    </>
  );
}

function Parking({ el, status, selected, dim, onPick }: { el: Extract<SpaceEl, { t: "parking" }>; status: SpaceStatus; selected: boolean; dim?: boolean; onPick: () => void }) {
  return (
    <g
      style={{ cursor: "pointer" }}
      opacity={dim ? 0.18 : 1}
      onClick={onPick}
      role="button"
      tabIndex={0}
      aria-label={`Parking bay ${el.label ?? el.id} — ${status}`}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
      className={`fp-anim fp-hot${!selected ? " hover:brightness-110" : ""}`}
    >
      <ParkingShape el={el} status={status} selected={selected} />
    </g>
  );
}

// Pure office/room visual (rect + label + furniture), no rotation/interactivity.
// Shared by the booking view and the editor canvas. Consumers apply rotation.
export function RoomShape({ el: raw, status, selected, showLabel = true }: { el: Extract<SpaceEl, { t: "office" | "room" }>; status: SpaceStatus; selected: boolean; showLabel?: boolean }) {
  // Defensive: never let a room/office vanish because of missing/invalid coords.
  const fin = (v: unknown, d: number) => (typeof v === "number" && Number.isFinite(v) ? v : d);
  const el = {
    ...raw,
    x: fin(raw.x, 0),
    y: fin(raw.y, 0),
    w: fin(raw.w, 120) > 0 ? fin(raw.w, 120) : 120,
    h: fin(raw.h, 90) > 0 ? fin(raw.h, 90) : 90,
  };
  const locked = status === "locked";
  const isRoom = el.t === "room";
  const fill = fillFor(status);
  const stroke = strokeFor(status, false);
  const cx = el.x + el.w / 2;
  const label = isRoom ? el.name : el.name ?? `Office ${el.id}`;
  const ls = lines(label, 14);

  // furniture
  let furniture;
  if (!isRoom) {
    furniture = (
      <>
        <path d={deskPath(el.x + 30, el.y + el.h - 34, 0.9)} fill={fill} stroke={stroke} strokeWidth={1.3} strokeLinejoin="round" />
        {locked && <Lock x={el.x + 26} y={el.y + el.h - 32} scale={0.7} />}
      </>
    );
  } else if (el.shape === "oval") {
    const rx = Math.min(el.w * 0.32, 34);
    const tcy = el.y + el.h * 0.6;
    const tabs = Array.from({ length: 6 }, (_, i) => {
      const a = (i / 6) * Math.PI * 2;
      return <circle key={i} cx={cx + Math.cos(a) * (rx + 8)} cy={tcy + Math.sin(a) * (rx + 8)} r={4.5} fill="#cfd9de" />;
    });
    furniture = (
      <>
        {tabs}
        <circle cx={cx} cy={tcy} r={rx} fill={fill} stroke={stroke} strokeWidth={1.5} />
        {locked && <Lock x={cx} y={tcy} scale={0.8} />}
      </>
    );
  } else {
    // long table
    const tw = Math.min(el.w - 40, 150);
    const vertical = el.h > el.w;
    const tcx = cx;
    const tcy = el.y + el.h - (vertical ? el.h / 2 - 6 : 36);
    const W = vertical ? 30 : tw;
    const H = vertical ? Math.min(el.h - 70, 130) : 24;
    const seatsPer = Math.ceil((el.seats ?? 8) / 2);
    const tabs = [];
    for (let i = 0; i < seatsPer; i++) {
      if (vertical) {
        const yy = tcy - H / 2 + (H / seatsPer) * (i + 0.5);
        tabs.push(<rect key={`l${i}`} x={tcx - W / 2 - 9} y={yy - 6} width={7} height={12} rx={3} fill="#cfd9de" />);
        tabs.push(<rect key={`r${i}`} x={tcx + W / 2 + 2} y={yy - 6} width={7} height={12} rx={3} fill="#cfd9de" />);
      } else {
        const xx = tcx - W / 2 + (W / seatsPer) * (i + 0.5);
        tabs.push(<rect key={`t${i}`} x={xx - 6} y={tcy - H / 2 - 9} width={12} height={7} rx={3} fill="#cfd9de" />);
        tabs.push(<rect key={`b${i}`} x={xx - 6} y={tcy + H / 2 + 2} width={12} height={7} rx={3} fill="#cfd9de" />);
      }
    }
    furniture = (
      <>
        {tabs}
        <rect x={tcx - W / 2} y={tcy - H / 2} width={W} height={H} rx={6} fill={fill} stroke={stroke} strokeWidth={1.5} />
        {locked && <Lock x={tcx} y={tcy} scale={0.85} />}
      </>
    );
  }

  return (
    <>
      <rect
        x={el.x}
        y={el.y}
        width={el.w}
        height={el.h}
        rx={5}
        fill={selected ? "rgba(250,100,0,0.06)" : "transparent"}
        stroke={selected ? SEL : "var(--txt-mute)"}
        strokeWidth={selected ? 2.5 : 1.4}
        strokeOpacity={selected ? 1 : 0.45}
      />
      {showLabel &&
        ls.map((ln, i) => (
          <text key={i} x={cx} y={el.y + 16 + i * 12} textAnchor="middle" fontSize={isRoom ? 10.5 : 11} fontWeight={700} fill="var(--txt-dim)">
            {ln}
          </text>
        ))}
      {furniture}
    </>
  );
}

function RoomBox({
  el,
  status,
  selected,
  dim,
  onPick,
  onHover,
  onLeave,
}: {
  el: Extract<SpaceEl, { t: "office" | "room" }>;
  status: SpaceStatus;
  selected: boolean;
  dim?: boolean;
  onPick: () => void;
  onHover?: (e: React.MouseEvent) => void;
  onLeave?: () => void;
}) {
  const cx = el.x + el.w / 2;
  // Rotation goes on an inner group: the outer .fp-anim group sets
  // transform-box: fill-box (for hover scale), which would otherwise reinterpret
  // the rotate() pivot and fling the element off-canvas.
  const aria = `${el.t === "room" ? "Meeting room" : "Office"} ${el.name ?? (el.t === "office" ? el.id : "")} — ${status}`;
  return (
    <g
      style={{ cursor: "pointer" }}
      opacity={dim ? 0.18 : 1}
      onClick={onPick}
      onMouseEnter={onHover}
      onMouseLeave={onLeave}
      role="button"
      tabIndex={0}
      aria-label={aria}
      onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onPick(); } }}
      className="fp-anim fp-hot"
    >
      <g transform={el.rot ? `rotate(${el.rot} ${cx} ${el.y + el.h / 2})` : undefined}>
        <RoomShape el={el} status={status} selected={selected} showLabel={false} />
      </g>
    </g>
  );
}

export function FloorSvg({
  plan,
  status,
  selectedKey,
  onPick,
  onHoverSpace,
  query = "",
  occupants = {},
  className = "",
  style,
}: {
  plan: FloorPlan;
  status: Record<string, SpaceStatus>;
  selectedKey: string | null;
  onPick: (el: SpaceEl) => void;
  /** Fires on desk mouse enter/leave (el=null on leave) for the hover card. Pointer devices only. */
  onHoverSpace?: (el: SpaceEl | null, clientX: number, clientY: number) => void;
  query?: string;
  occupants?: Record<string, string>;
  className?: string;
  style?: React.CSSProperties;
}) {
  const stOf = (el: SpaceEl): SpaceStatus => status[spaceKey(el)] ?? "free";
  const [, , wStr, hStr] = plan.viewBox.split(" ");
  const vw = Number(wStr) || 1000;
  const vh = Number(hStr) || 700;

  return (
    // intrinsic width/height + max-* lets the SVG fit-and-center like an image,
    // so the whole plan always shows regardless of portrait/landscape aspect.
    <svg
      viewBox={plan.viewBox}
      width={vw}
      height={vh}
      preserveAspectRatio="xMidYMid meet"
      style={style}
      className={`block max-w-full ${className}`}
    >
      {/* uploaded floor-plan image as background, filling the viewBox exactly so
          overlays stay aligned — identical to the editor canvas */}
      {plan.image && (
        <image href={plan.image} x={0} y={0} width={Number(wStr)} height={Number(hStr)} preserveAspectRatio="none" />
      )}
      {/* fixtures with fill (dead-zone, kitchen) first */}
      {plan.els.map((el, i) => (el.t === "fixture" && el.fill ? <rect key={i} x={el.x} y={el.y} width={el.w} height={el.h} rx={4} fill={el.fill} opacity={0.7} /> : null))}

      {/* walls */}
      {plan.els.map((el, i) =>
        el.t === "wall" ? (
          <path key={i} d={el.d} fill="none" stroke="var(--txt-mute)" strokeWidth={5} strokeLinejoin="round" strokeLinecap="round" opacity={0.55} />
        ) : null,
      )}

      {/* fixture outlines + labels */}
      {plan.els.map((el, i) => {
        if (el.t === "fixture")
          return (
            <Fragment key={i}>
              {!el.fill && <rect x={el.x} y={el.y} width={el.w} height={el.h} rx={3} fill="none" stroke="var(--txt-mute)" strokeWidth={1.4} opacity={0.35} />}
              {el.label && (
                <text
                  x={el.lx ?? el.x + el.w / 2}
                  y={el.ly ?? el.y + el.h / 2}
                  textAnchor="middle"
                  dominantBaseline="central"
                  fontSize={9.5}
                  fontWeight={600}
                  fill="var(--txt-mute)"
                  transform={el.rot ? `rotate(${el.rot} ${el.lx ?? el.x + el.w / 2} ${el.ly ?? el.y + el.h / 2})` : undefined}
                >
                  {el.label}
                </text>
              )}
            </Fragment>
          );
        if (el.t === "label")
          return (
            <text
              key={i}
              x={el.x}
              y={el.y}
              textAnchor="middle"
              dominantBaseline="central"
              fontSize={el.size ?? 10}
              fontWeight={600}
              letterSpacing={0.5}
              fill="var(--txt-mute)"
              transform={el.rot ? `rotate(${el.rot} ${el.x} ${el.y})` : undefined}
            >
              {el.text}
            </text>
          );
        return null;
      })}

      {/* interactive spaces */}
      {plan.els.map((el, i) => {
        const q = query.trim().toLowerCase();
        const label = el.t === "desk" ? `desk ${el.label ?? el.id}` : el.t === "parking" ? `bay ${el.label ?? el.id}` : el.t === "office" || el.t === "room" ? el.name ?? "" : "";
        const occupant = el.t === "desk" || el.t === "office" || el.t === "room" || el.t === "parking" ? occupants[spaceKey(el)] ?? "" : ""; // who booked it (colleague search)
        const dim = q.length > 0 && !label.toLowerCase().includes(q) && !occupant.toLowerCase().includes(q);
        if (el.t === "desk")
          return (
            <Desk
              key={i}
              el={el}
              status={stOf(el)}
              selected={spaceKey(el) === selectedKey}
              dim={dim}
              onPick={() => onPick(el)}
              onHover={(e) => onHoverSpace?.(el, e.clientX, e.clientY)}
              onLeave={() => onHoverSpace?.(null, 0, 0)}
            />
          );
        if (el.t === "parking")
          return <Parking key={i} el={el} status={stOf(el)} selected={spaceKey(el) === selectedKey} dim={dim} onPick={() => onPick(el)} />;
        if (el.t === "office" || el.t === "room")
          return (
            <RoomBox
              key={i}
              el={el}
              status={stOf(el)}
              selected={spaceKey(el) === selectedKey}
              dim={dim}
              onPick={() => onPick(el)}
              onHover={(e) => onHoverSpace?.(el, e.clientX, e.clientY)}
              onLeave={() => onHoverSpace?.(null, 0, 0)}
            />
          );
        return null;
      })}
    </svg>
  );
}
