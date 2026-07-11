"use client";

import { useState, useRef, useEffect } from "react";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";
import type { FlatOffice } from "@/lib/data";
import { useLocation } from "./location-context";

export function LocationPicker() {
  const { office, offices, setOfficeId } = useLocation();
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDoc(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener("click", onDoc);
    return () => document.removeEventListener("click", onDoc);
  }, []);

  // group visible offices by region -> country
  const groups: Record<string, Record<string, FlatOffice[]>> = {};
  for (const o of offices) {
    (groups[o.region] ??= {});
    (groups[o.region][o.country] ??= []).push(o);
  }

  const full = office
    ? [office.flag, office.region, office.country, office.b].filter((s) => s && s !== "—").join(" › ")
    : "No buildings";
  const short = office ? office.b : "No buildings"; // just the building name — compact for phones

  return (
    <div className="relative min-w-0" ref={ref}>
      <button
        onClick={(e) => {
          e.stopPropagation();
          setOpen((o) => !o);
        }}
        className="flex min-w-0 max-w-[52vw] items-center gap-2 rounded-lg border bg-panel-2 px-2.5 py-1.5 text-[12.5px] font-semibold text-foreground md:max-w-none"
      >
        <span className="truncate md:hidden">{short}</span>
        <span className="hidden truncate md:inline">{full}</span>
        <ChevronDown className="size-3.5 shrink-0 opacity-60" />
      </button>

      {open && (
        <div className="pop-in absolute left-0 top-[42px] z-50 max-h-[420px] min-w-[300px] overflow-auto rounded-xl border bg-popover p-1.5 shadow-lg">
          {offices.length === 0 && (
            <div className="px-3 py-4 text-center text-[12.5px] text-txt-mute">No buildings. Create one under Buildings.</div>
          )}
          {Object.entries(groups).map(([region, countries]) => (
            <div key={region}>
              <div className="px-3 pb-1 pt-2.5 text-[10px] font-bold uppercase tracking-[0.1em] text-txt-mute">{region}</div>
              {Object.entries(countries).map(([country, list]) => (
                <div key={country || "none"}>
                  {country && country !== "—" && (
                    <div className="flex items-center gap-1.5 px-3 pb-0.5 pt-1.5 text-xs font-semibold text-txt-dim">
                      {list[0].flag} {country}
                    </div>
                  )}
                  {list.map((o) => (
                    <button
                      key={o.id}
                      onClick={() => {
                        setOfficeId(o.id);
                        setOpen(false);
                      }}
                      className={cn(
                        "flex w-full items-center justify-between rounded-[9px] py-2 pl-7 pr-3 text-left text-[13px]",
                        office?.id === o.id ? "bg-primary text-primary-foreground" : "hover:bg-panel-2",
                      )}
                    >
                      <span>
                        <span className="block">{o.b}</span>
                        <span className={cn("text-[11px]", office?.id === o.id ? "text-white/80" : "text-txt-mute")}>{o.sub}</span>
                      </span>
                      {!o.open && <span className="text-[10px] font-semibold text-amber">Closed now</span>}
                    </button>
                  ))}
                </div>
              ))}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
