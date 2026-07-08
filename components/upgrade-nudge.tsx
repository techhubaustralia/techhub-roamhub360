"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { AlertTriangle, TrendingUp, Ban, ArrowRight } from "lucide-react";
import { getLicense, type LicenseSummary } from "@/lib/api";

// Growth G2 — contextual upgrade/renewal nudges. Turns CP2 site limits + CP4 expiry into revenue
// prompts. Admin-only (getLicense 403s others → hidden); shows nothing for an unlimited/healthy
// licence, so the demo/default tenant stays clean. `kind` scopes which nudge a page shows.
type Kind = "auto" | "site" | "expiry";
type Tone = "info" | "warn" | "bad";

function nudge(s: LicenseSummary, kind: Kind): { tone: Tone; icon: typeof Ban; title: string; body: string } | null {
  const siteAtLimit = s.maxSites > 0 && s.sitesUsed >= s.maxSites;
  const site = siteAtLimit
    ? { tone: "info" as Tone, icon: TrendingUp, title: `You're using all ${s.maxSites} of your site${s.maxSites === 1 ? "" : "s"}.`, body: "Upgrade your plan to add more locations." }
    : null;

  let expiry: { tone: Tone; icon: typeof Ban; title: string; body: string } | null = null;
  if (s.effective === "expired") expiry = { tone: "bad", icon: Ban, title: "Your licence has expired.", body: "The workspace is read-only until you renew — existing bookings stay visible." };
  else if (s.effective === "grace") expiry = { tone: "warn", icon: AlertTriangle, title: `Your licence expired${s.daysLeft != null ? ` ${Math.abs(s.daysLeft)} day${Math.abs(s.daysLeft) === 1 ? "" : "s"} ago` : ""}.`, body: "Renew now to avoid interruption for your team." };
  else if (s.daysLeft != null && s.daysLeft >= 0 && s.daysLeft <= 14) expiry = { tone: "warn", icon: AlertTriangle, title: `Your licence renews in ${s.daysLeft} day${s.daysLeft === 1 ? "" : "s"}.`, body: "Renew soon to keep everything running." };

  if (kind === "site") return site;
  if (kind === "expiry") return expiry;
  return expiry ?? site; // auto: expiry is more urgent than a site limit
}

export function UpgradeNudge({ kind = "auto" }: { kind?: Kind }) {
  const [lic, setLic] = useState<LicenseSummary | null>(null);
  useEffect(() => {
    getLicense().then(setLic);
  }, []);
  if (!lic) return null;
  const n = nudge(lic, kind);
  if (!n) return null;

  const c = n.tone === "bad" ? "border-destructive/40 bg-destructive/10" : n.tone === "warn" ? "border-amber/40 bg-amber/10" : "border-primary/30 bg-primary/[0.06]";
  const ic = n.tone === "bad" ? "text-destructive" : n.tone === "warn" ? "text-amber" : "text-primary";
  const Icon = n.icon;
  return (
    <div className={`mb-[15px] flex items-center gap-3 rounded-[12px] border px-4 py-3 ${c}`}>
      <Icon className={`size-5 shrink-0 ${ic}`} />
      <div className="min-w-0 flex-1">
        <span className="text-[13.5px] font-semibold">{n.title}</span> <span className="text-[12.5px] text-txt-dim">{n.body}</span>
      </div>
      <Link href="/admin/license" className="inline-flex shrink-0 items-center gap-1 rounded-[9px] bg-primary px-3 py-1.5 text-[12.5px] font-semibold text-primary-foreground hover:bg-orange-soft">
        View plan <ArrowRight className="size-3.5" />
      </Link>
    </div>
  );
}
