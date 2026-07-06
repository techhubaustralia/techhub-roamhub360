import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

const tagColors = {
  desk: "bg-[#2a6b8f]",
  room: "bg-[#7a4cae]",
  office: "bg-[#b8762a]",
  parking: "bg-[#2f7d55]",
} as const;

export function BookingItem({
  kind,
  tag,
  title,
  sub,
  trailing,
}: {
  kind: keyof typeof tagColors;
  tag: string;
  title: string;
  sub: string;
  trailing?: ReactNode;
}) {
  return (
    <div className="mb-2.5 flex items-center gap-3.5 rounded-[11px] border bg-panel-2 p-[11px]">
      <div
        className={cn(
          "grid size-[46px] shrink-0 place-items-center rounded-[10px] text-center font-heading text-[10.5px] font-extrabold leading-tight text-white",
          tagColors[kind],
        )}
      >
        {tag}
      </div>
      <div className="min-w-0 flex-1">
        <b className="block text-[13.5px]">{title}</b>
        <span className="text-xs text-txt-dim">{sub}</span>
      </div>
      {trailing}
    </div>
  );
}
