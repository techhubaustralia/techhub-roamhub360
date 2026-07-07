"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { Check, ArrowRight, X, Rocket } from "lucide-react";

interface SetupStep {
  key: string;
  label: string;
  hint: string;
  done: boolean;
  href: string;
}
interface Setup {
  steps: SetupStep[];
  done: number;
  total: number;
  complete: boolean;
}

const DISMISS_KEY = "rh-setup-dismissed";

// Activation checklist (G1). Shown on Home to admins until setup is complete (or dismissed). Hides
// itself for non-admins (the API returns 403) and once every step is done.
export function SetupChecklist() {
  const [setup, setSetup] = useState<Setup | null>(null);
  const [dismissed, setDismissed] = useState(true); // assume hidden until we know otherwise

  useEffect(() => {
    setDismissed(localStorage.getItem(DISMISS_KEY) === "1");
    fetch("/api/onboarding", { cache: "no-store" })
      .then((r) => (r.ok ? r.json() : null))
      .then((s: Setup | null) => setSetup(s))
      .catch(() => {});
  }, []);

  if (!setup || setup.complete || dismissed) return null;

  const pct = Math.round((setup.done / setup.total) * 100);

  return (
    <div className="mb-[15px] overflow-hidden rounded-[14px] border bg-card shadow-sm">
      <div className="flex items-center gap-3 border-b bg-primary/[0.06] px-4 py-3">
        <span className="grid size-8 shrink-0 place-items-center rounded-full bg-primary/15 text-primary"><Rocket className="size-[18px]" /></span>
        <div className="flex-1">
          <div className="text-[14px] font-bold">Get RoamHub360 set up</div>
          <div className="text-[12px] text-txt-mute">{setup.done} of {setup.total} done · a few minutes to full value</div>
        </div>
        <div className="hidden h-1.5 w-28 overflow-hidden rounded-full bg-panel-2 sm:block">
          <div className="h-full rounded-full bg-primary transition-all" style={{ width: `${pct}%` }} />
        </div>
        <button aria-label="Dismiss setup" onClick={() => { localStorage.setItem(DISMISS_KEY, "1"); setDismissed(true); }} className="grid size-7 place-items-center rounded-lg text-txt-mute hover:bg-panel-2">
          <X className="size-4" />
        </button>
      </div>
      <ul className="divide-y">
        {setup.steps.map((s) => (
          <li key={s.key} className="flex items-center gap-3 px-4 py-2.5">
            <span className={`grid size-6 shrink-0 place-items-center rounded-full ${s.done ? "bg-ok/15 text-ok" : "border border-dashed text-txt-mute"}`}>
              {s.done ? <Check className="size-3.5" /> : <span className="size-1.5 rounded-full bg-current" />}
            </span>
            <div className="min-w-0 flex-1">
              <div className={`text-[13.5px] font-semibold ${s.done ? "text-txt-mute line-through" : ""}`}>{s.label}</div>
              {!s.done && <div className="truncate text-[12px] text-txt-mute">{s.hint}</div>}
            </div>
            {!s.done && (
              <Link href={s.href} className="inline-flex items-center gap-1 rounded-[9px] bg-primary px-2.5 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-orange-soft">
                Set up <ArrowRight className="size-3.5" />
              </Link>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
