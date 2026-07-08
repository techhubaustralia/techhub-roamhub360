"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { brand } from "@/lib/brand";

type State =
  | { phase: "loading" }
  | { phase: "ok"; label: string; message: string; already?: boolean }
  | { phase: "error"; message: string };

function CheckinInner() {
  const params = useSearchParams();
  const buildingId = params.get("b") ?? "";
  const spaceKey = params.get("s") ?? "";
  const [state, setState] = useState<State>({ phase: "loading" });

  useEffect(() => {
    if (!buildingId || !spaceKey) {
      setState({ phase: "error", message: "This check-in code is incomplete." });
      return;
    }
    let live = true;
    fetch("/api/qr-checkin", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ buildingId, spaceKey }),
    })
      .then(async (r) => ({ ok: r.ok, data: await r.json().catch(() => ({})) }))
      .then(({ ok, data }) => {
        if (!live) return;
        if (ok && data.ok) setState({ phase: "ok", label: data.spaceLabel ?? "your space", message: data.message ?? "Checked in.", already: data.already });
        else setState({ phase: "error", message: data.error ?? "Check-in failed. Please try again." });
      })
      .catch(() => live && setState({ phase: "error", message: "Network error — check your connection and try again." }));
    return () => {
      live = false;
    };
  }, [buildingId, spaceKey]);

  const ok = state.phase === "ok";
  const loading = state.phase === "loading";

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col items-center justify-center px-6 text-center">
      <div
        className={`flex h-24 w-24 items-center justify-center rounded-full text-5xl ${
          loading ? "bg-muted" : ok ? "bg-emerald-500/15" : "bg-amber-500/15"
        }`}
        aria-hidden
      >
        {loading ? <span className="animate-pulse">•••</span> : ok ? "✅" : "⚠️"}
      </div>
      <h1 className="mt-6 text-2xl font-semibold">
        {loading ? "Checking you in…" : ok ? (state.already ? "Already checked in" : "You're checked in") : "Couldn't check in"}
      </h1>
      {state.phase === "ok" && <p className="mt-2 text-muted-foreground">{state.message}</p>}
      {state.phase === "error" && <p className="mt-2 text-muted-foreground">{state.message}</p>}

      <div className="mt-8 flex w-full flex-col gap-3">
        <Link
          href="/mine"
          className="w-full rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground"
        >
          View my bookings
        </Link>
        <Link href="/book" className="w-full rounded-[12px] border px-4 py-3 text-[15px] font-medium">
          Book a space
        </Link>
      </div>
      <p className="mt-10 text-xs text-muted-foreground">{brand.productName}</p>
    </div>
  );
}

export default function CheckinPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted-foreground">Loading…</div>}>
      <CheckinInner />
    </Suspense>
  );
}
