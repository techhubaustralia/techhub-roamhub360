"use client";

import { useEffect, useState } from "react";
import { BadgeCheck, AlertTriangle, Ban, Clock } from "lucide-react";
import { getLicense, type LicenseSummary } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

const TIER_LABEL: Record<string, string> = { trial: "Trial", standard: "Standard", professional: "Professional", enterprise: "Enterprise" };

function fmtDate(iso: string | null): string {
  if (!iso) return "No expiry";
  return new Date(iso).toLocaleDateString(undefined, { day: "numeric", month: "long", year: "numeric" });
}

function StatusBanner({ s }: { s: LicenseSummary }) {
  if (s.effective === "suspended")
    return <Banner tone="bad" icon={Ban} title="Workspace suspended" body="This workspace is read-only. Contact TechHub Australia to reactivate it." />;
  if (s.effective === "expired")
    return <Banner tone="bad" icon={Ban} title="Licence expired" body="This workspace is read-only — existing bookings are visible but no new ones can be made. Renew to restore full access." />;
  if (s.effective === "grace")
    return <Banner tone="warn" icon={AlertTriangle} title={`Licence expired ${s.daysLeft != null ? `${Math.abs(s.daysLeft)} day(s) ago` : ""}`} body={`You're in a ${s.graceDays}-day grace period. Renew soon to avoid interruption.`} />;
  if (s.daysLeft != null && s.daysLeft <= 30)
    return <Banner tone="warn" icon={Clock} title={`Licence renews in ${s.daysLeft} day(s)`} body={`Expires ${fmtDate(s.expiresAt)}.`} />;
  return <Banner tone="ok" icon={BadgeCheck} title="Licence active" body={s.expiresAt ? `Valid until ${fmtDate(s.expiresAt)}.` : "No expiry set."} />;
}

function Banner({ tone, icon: Icon, title, body }: { tone: "ok" | "warn" | "bad"; icon: typeof Clock; title: string; body: string }) {
  const c = tone === "ok" ? "border-ok/40 bg-ok/10" : tone === "warn" ? "border-amber/40 bg-amber/10" : "border-destructive/40 bg-destructive/10";
  const ic = tone === "ok" ? "text-ok" : tone === "warn" ? "text-amber" : "text-destructive";
  return (
    <div className={`mb-5 flex items-start gap-3 rounded-[12px] border px-4 py-3 ${c}`}>
      <Icon className={`mt-0.5 size-5 shrink-0 ${ic}`} />
      <div>
        <div className="text-[13.5px] font-semibold">{title}</div>
        <div className="text-[12.5px] text-txt-dim">{body}</div>
      </div>
    </div>
  );
}

function Stat({ label, value, sub }: { label: string; value: string; sub?: string }) {
  return (
    <div className="rounded-[12px] border bg-card p-4">
      <div className="text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">{label}</div>
      <div className="mt-1 text-[22px] font-bold">{value}</div>
      {sub && <div className="text-[12px] text-txt-mute">{sub}</div>}
    </div>
  );
}

export default function LicensePage() {
  const [s, setS] = useState<LicenseSummary | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    getLicense().then((x) => {
      setS(x);
      setLoading(false);
    });
  }, []);

  return (
    <div className="animate-fade-up max-w-2xl">
      <PageHeader title="Plan & licence" subtitle="Your RoamHub360 subscription, usage and renewal." />

      {loading ? (
        <div className="rounded-[14px] border bg-card px-3 py-14 text-center text-txt-mute">Loading…</div>
      ) : !s ? (
        <div className="rounded-[14px] border bg-card px-3 py-14 text-center text-txt-mute">Licence information isn&apos;t available.</div>
      ) : (
        <>
          <StatusBanner s={s} />
          <div className="mb-4 flex items-center gap-3">
            <span className="rounded-full bg-primary/12 px-3 py-1 text-[13px] font-bold text-primary">{TIER_LABEL[s.tier] ?? s.tier} plan</span>
            <span className="text-[12.5px] text-txt-mute">Sites are billed at AUD $2,000 / site / year.</span>
          </div>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            <Stat label="Sites" value={`${s.sitesUsed} / ${s.maxSites}`} sub={s.sitesUsed >= s.maxSites ? "At your limit" : `${s.maxSites - s.sitesUsed} available`} />
            <Stat label="Floors per site" value={`${s.maxFloorsPerSite}`} sub="Maximum" />
            <Stat label="Renews" value={s.daysLeft != null ? `${s.daysLeft} d` : "—"} sub={fmtDate(s.expiresAt)} />
          </div>
          <p className="mt-5 text-[12px] text-txt-mute">
            Need more sites, floors or a longer term? Contact TechHub Australia — changes take effect immediately.
            {s.billing && !s.billing.configured && <span className="ml-1">Billing is managed directly by TechHub Australia.</span>}
          </p>
        </>
      )}
    </div>
  );
}
