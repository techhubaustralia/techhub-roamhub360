"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Shield, Settings2, ExternalLink } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";
import { getTenantDetail, patchTenant, impersonateTenant, type TenantDetail } from "@/lib/api";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;
const FEATURES = [
  { key: "presence", label: "Who's in (team presence)" },
  { key: "directory", label: "Directory sync" },
  { key: "digest", label: "Daily who's-in digest" },
];
const TIERS = ["trial", "standard", "professional", "enterprise"];

export default function TenantsPage() {
  const [me, setMe] = useState<{ platformAdmin?: boolean } | null>(null);
  const [rows, setRows] = useState<Tenant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);
  const [manageSlug, setManageSlug] = useState<string | null>(null);

  const load = useCallback(async () => {
    const r = await fetch("/api/tenants");
    if (r.ok) {
      setRows((await r.json()) as Tenant[]);
      setLoadError(null);
    } else if (r.status === 503) {
      setLoadError("Tenant management needs the database, which runs on the deployed instance.");
    } else if (r.status !== 403) {
      const e = await r.json().catch(() => ({}));
      setLoadError(e.error || "Could not load workspaces.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => setMe({}));
    load();
  }, [load]);

  const slugValid = SLUG_RE.test(slug);
  const canSave = slugValid && name.trim().length > 0 && !saving;

  async function create() {
    if (!canSave) return;
    setSaving(true);
    const res = await fetch("/api/tenants", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slug: slug.toLowerCase().trim(), name: name.trim() }) });
    setSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error("Could not create workspace", { description: e.error });
      return;
    }
    toast("Workspace created", { description: `${name.trim()} · ${slug}.roamhub360.com` });
    setSlug("");
    setName("");
    load();
  }

  if (me && !me.platformAdmin) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Tenants" subtitle="Platform operator area" />
        <div className="rounded-[14px] border bg-card p-8 text-center shadow-sm">
          <Shield className="mx-auto mb-3 size-7 text-txt-mute" />
          <p className="text-[14px] font-semibold">Platform access required</p>
          <p className="mt-1 text-[12.5px] text-txt-mute">Only TechHub Australia platform operators can manage customer workspaces.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader title="Partner control plane" subtitle="Customer workspaces on RoamHub360 — provision, licence, monitor and support." />

      {loadError && <div className="mb-6 rounded-[12px] border border-amber/40 bg-amber/10 px-4 py-3 text-[12.5px] text-txt">{loadError}</div>}

      <div className="mb-6 rounded-[14px] border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-[13.5px] font-semibold">Add a customer workspace</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-txt-mute">Company name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Acme Corporation" className="w-full rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-txt-mute">Subdomain</span>
            <div className="flex items-center gap-1.5">
              <input value={slug} onChange={(e) => setSlug(e.target.value.toLowerCase())} placeholder="acme" className="w-full rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px]" />
              <span className="whitespace-nowrap text-[12.5px] text-txt-mute">.roamhub360.com</span>
            </div>
            {slug.length > 0 && !slugValid && <span className="mt-1 block text-[11px] text-destructive">3–32 lowercase letters, numbers or hyphens.</span>}
          </label>
        </div>
        <div className="mt-5">
          <button onClick={create} disabled={!canSave} className="rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-orange-soft disabled:opacity-50">
            {saving ? "Creating…" : "Create workspace"}
          </button>
        </div>
      </div>

      <div className="overflow-x-auto rounded-[14px] border bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">Workspace</th>
              <th className="border-b px-3 py-2.5">Address</th>
              <th className="border-b px-3 py-2.5">Status</th>
              <th className="border-b px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-8 text-center text-[12.5px] text-txt-mute">{loadError ? "—" : "No workspaces yet. Add one above."}</td></tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="hover:bg-panel-2">
                  <td className="border-b px-3 py-3"><b>{t.name}</b><div className="text-[11.5px] text-txt-mute">{t.slug}</div></td>
                  <td className="border-b px-3 py-3 text-[12px] text-txt-mute">{t.slug}.roamhub360.com</td>
                  <td className="border-b px-3 py-3">
                    {t.status === "active" ? <StatusPill variant="ok">Active</StatusPill> : t.status === "suspended" ? <StatusPill variant="bad">Suspended</StatusPill> : <StatusPill variant="soon">{t.status}</StatusPill>}
                  </td>
                  <td className="border-b px-3 py-3 text-right">
                    {t.slug !== "default" && (
                      <button onClick={() => setManageSlug(t.slug)} className="inline-flex items-center gap-1.5 rounded-[9px] border bg-panel-2 px-2.5 py-1.5 text-[12.5px] font-semibold hover:border-primary">
                        <Settings2 className="size-3.5" /> Manage
                      </button>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-txt-mute">Each workspace is fully isolated. Customers reach theirs at <b>&lt;subdomain&gt;.roamhub360.com</b> and see only their own data.</p>

      {manageSlug && <ManagePanel slug={manageSlug} onClose={() => setManageSlug(null)} onChanged={load} />}
    </div>
  );
}

function ManagePanel({ slug, onClose, onChanged }: { slug: string; onClose: () => void; onChanged: () => void }) {
  const [d, setD] = useState<TenantDetail | null>(null);
  const [busy, setBusy] = useState(false);
  // licence form
  const [tier, setTier] = useState("trial");
  const [maxSites, setMaxSites] = useState(1);
  const [maxFloors, setMaxFloors] = useState(2);
  const [expiry, setExpiry] = useState("");
  const [graceDays, setGraceDays] = useState(14);
  // branding form
  const [brandName, setBrandName] = useState("");
  const [brandAccent, setBrandAccent] = useState("#2B7DD1");
  const [brandLogo, setBrandLogo] = useState<string | null>(null);

  useEffect(() => {
    getTenantDetail(slug).then((x) => {
      setD(x);
      if (x) {
        setTier(x.license.tier);
        setMaxSites(x.license.maxSites);
        setMaxFloors(x.license.maxFloorsPerSite);
        setExpiry(x.license.expiresAt ? x.license.expiresAt.slice(0, 10) : "");
        setGraceDays(x.license.graceDays);
        setBrandName(x.tenant.brandName ?? "");
        setBrandAccent(x.tenant.brandAccent ?? "#2B7DD1");
        setBrandLogo(x.tenant.brandLogo ?? null);
      }
    });
  }, [slug]);

  async function apply(patch: Parameters<typeof patchTenant>[1], msg: string) {
    setBusy(true);
    const res = await patchTenant(slug, patch);
    setBusy(false);
    if (res.ok && res.detail) {
      setD(res.detail);
      toast.success(msg);
      onChanged();
    } else toast.error("Could not save", { description: res.error });
  }

  const saveLicence = () =>
    apply({ license: { tier, maxSites: Number(maxSites), maxFloorsPerSite: Number(maxFloors), graceDays: Number(graceDays), expiresAt: expiry ? `${expiry}T00:00:00.000Z` : null } }, "Licence updated");

  const saveBranding = () => apply({ branding: { name: brandName || null, accent: brandAccent, logo: brandLogo } }, "Branding updated");
  function onLogoFile(file: File | undefined) {
    if (!file) return;
    if (file.size > 200_000) return toast.error("Logo too large", { description: "Use an image under 200 KB." });
    const reader = new FileReader();
    reader.onload = () => setBrandLogo(String(reader.result));
    reader.readAsDataURL(file);
  }

  const suspended = d?.tenant.status === "suspended";
  const disabled = d?.tenant.features ?? [];
  const toggleFeature = (key: string) => {
    const next = disabled.includes(key) ? disabled.filter((k) => k !== key) : [...disabled, key];
    apply({ features: next }, "Features updated");
  };

  async function open() {
    const res = await impersonateTenant(slug);
    if (res.ok && res.url) window.open(res.url, "_blank");
    else toast.error("Could not open", { description: res.error });
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-lg overflow-auto rounded-[14px] border bg-card p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
        {!d ? (
          <div className="py-10 text-center text-txt-mute">Loading…</div>
        ) : (
          <>
            <div className="mb-4 flex items-start justify-between">
              <div>
                <h2 className="font-heading text-[17px] font-bold">{d.tenant.name}</h2>
                <div className="text-[12px] text-txt-mute">{d.workspaceUrl.replace("https://", "")}</div>
              </div>
              <button onClick={open} className="inline-flex items-center gap-1.5 rounded-[9px] border bg-panel-2 px-2.5 py-1.5 text-[12px] font-semibold hover:border-primary"><ExternalLink className="size-3.5" /> Open</button>
            </div>

            {/* Monitoring */}
            <div className="mb-4 grid grid-cols-3 gap-2 text-center">
              {[["Users", d.stats.users], ["Bookings", d.stats.bookings], ["Directory", d.stats.directory]].map(([l, v]) => (
                <div key={l} className="rounded-[10px] border bg-panel-2/50 py-2">
                  <div className="text-[18px] font-bold">{v as number}</div>
                  <div className="text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">{l as string}</div>
                </div>
              ))}
            </div>

            {/* Licence */}
            <div className="mb-4 rounded-[12px] border p-3">
              <div className="mb-2 flex items-center justify-between">
                <span className="text-[12px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Licence</span>
                <StatusPill variant={d.license.effective === "active" ? "ok" : d.license.effective === "grace" ? "soon" : "bad"}>{d.license.effective}</StatusPill>
              </div>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Tier</span>
                  <select value={tier} onChange={(e) => setTier(e.target.value)} className="w-full rounded-[9px] border bg-panel-2 px-2 py-1.5 text-[13px]">{TIERS.map((t) => <option key={t} value={t}>{t}</option>)}</select>
                </label>
                <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Expiry</span>
                  <input type="date" value={expiry} onChange={(e) => setExpiry(e.target.value)} className="w-full rounded-[9px] border bg-panel-2 px-2 py-1.5 text-[13px]" />
                </label>
                <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Max sites</span>
                  <input type="number" min={0} value={maxSites} onChange={(e) => setMaxSites(+e.target.value)} className="w-full rounded-[9px] border bg-panel-2 px-2 py-1.5 text-[13px]" />
                </label>
                <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Floors / site</span>
                  <input type="number" min={1} value={maxFloors} onChange={(e) => setMaxFloors(+e.target.value)} className="w-full rounded-[9px] border bg-panel-2 px-2 py-1.5 text-[13px]" />
                </label>
                <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Grace days</span>
                  <input type="number" min={0} value={graceDays} onChange={(e) => setGraceDays(+e.target.value)} className="w-full rounded-[9px] border bg-panel-2 px-2 py-1.5 text-[13px]" />
                </label>
              </div>
              <button onClick={saveLicence} disabled={busy} className="mt-3 rounded-[9px] bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">Save licence</button>
            </div>

            {/* Feature flags */}
            <div className="mb-4 rounded-[12px] border p-3">
              <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Features</span>
              {FEATURES.map((f) => (
                <label key={f.key} className="flex items-center justify-between py-1.5 text-[13px]">
                  <span>{f.label}</span>
                  <input type="checkbox" checked={!disabled.includes(f.key)} disabled={busy} onChange={() => toggleFeature(f.key)} className="size-4 accent-[var(--primary)]" />
                </label>
              ))}
            </div>

            {/* White-label branding */}
            <div className="mb-4 rounded-[12px] border p-3">
              <span className="mb-2 block text-[12px] font-semibold uppercase tracking-[0.05em] text-txt-mute">White-label branding</span>
              <div className="grid grid-cols-2 gap-2.5">
                <label className="col-span-2 block"><span className="mb-1 block text-[11px] text-txt-mute">Product name</span>
                  <input value={brandName} onChange={(e) => setBrandName(e.target.value)} placeholder="RoamHub360" className="w-full rounded-[9px] border bg-panel-2 px-2 py-1.5 text-[13px]" />
                </label>
                <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Accent colour</span>
                  <div className="flex items-center gap-2">
                    <input type="color" value={brandAccent} onChange={(e) => setBrandAccent(e.target.value)} className="h-8 w-10 rounded border bg-panel-2" />
                    <input value={brandAccent} onChange={(e) => setBrandAccent(e.target.value)} className="w-full rounded-[9px] border bg-panel-2 px-2 py-1.5 font-mono text-[12px]" />
                  </div>
                </label>
                <label className="block"><span className="mb-1 block text-[11px] text-txt-mute">Logo</span>
                  <div className="flex items-center gap-2">
                    {brandLogo && <img src={brandLogo} alt="" className="size-8 rounded object-contain" />}
                    <input type="file" accept="image/*" onChange={(e) => onLogoFile(e.target.files?.[0])} className="text-[11px]" />
                    {brandLogo && <button onClick={() => setBrandLogo(null)} className="text-[11px] text-destructive">clear</button>}
                  </div>
                </label>
              </div>
              <button onClick={saveBranding} disabled={busy} className="mt-3 rounded-[9px] bg-primary px-3 py-2 text-[12.5px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">Save branding</button>
            </div>

            {/* Suspend */}
            <div className="flex items-center justify-between gap-3">
              <button onClick={() => apply({ status: suspended ? "active" : "suspended" }, suspended ? "Reactivated" : "Suspended")} disabled={busy}
                className={`rounded-[9px] px-3 py-2 text-[12.5px] font-semibold disabled:opacity-50 ${suspended ? "bg-ok text-white" : "border border-destructive/50 text-destructive hover:bg-destructive/10"}`}>
                {suspended ? "Reactivate workspace" : "Suspend workspace"}
              </button>
              <button onClick={onClose} className="rounded-[9px] border bg-panel-2 px-3 py-2 text-[12.5px] font-semibold">Close</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
