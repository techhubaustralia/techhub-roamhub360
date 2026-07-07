"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Shield } from "lucide-react";
import { PageHeader } from "@/components/page-header";
import { StatusPill } from "@/components/status-pill";

interface Tenant {
  id: string;
  slug: string;
  name: string;
  status: string;
  createdAt?: string;
}

const SLUG_RE = /^[a-z0-9][a-z0-9-]{1,30}[a-z0-9]$/;

export default function TenantsPage() {
  const [me, setMe] = useState<{ platformAdmin?: boolean } | null>(null);
  const [rows, setRows] = useState<Tenant[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [slug, setSlug] = useState("");
  const [name, setName] = useState("");
  const [saving, setSaving] = useState(false);

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
    const res = await fetch("/api/tenants", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ slug: slug.toLowerCase().trim(), name: name.trim() }),
    });
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
      <PageHeader title="Tenants" subtitle="Customer workspaces on RoamHub360 — TechHub Australia control plane." />

      {loadError && <div className="mb-6 rounded-[12px] border border-amber/40 bg-amber/10 px-4 py-3 text-[12.5px] text-txt">{loadError}</div>}

      {/* Create */}
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
              <input
                value={slug}
                onChange={(e) => setSlug(e.target.value.toLowerCase())}
                placeholder="acme"
                className="w-full rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px]"
              />
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

      {/* List */}
      <div className="overflow-x-auto rounded-[14px] border bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">Workspace</th>
              <th className="border-b px-3 py-2.5">Address</th>
              <th className="border-b px-3 py-2.5">Status</th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={3} className="px-3 py-8 text-center text-[12.5px] text-txt-mute">{loadError ? "—" : "No workspaces yet. Add one above."}</td>
              </tr>
            ) : (
              rows.map((t) => (
                <tr key={t.id} className="hover:bg-panel-2">
                  <td className="border-b px-3 py-3">
                    <b>{t.name}</b>
                    <div className="text-[11.5px] text-txt-mute">{t.slug}</div>
                  </td>
                  <td className="border-b px-3 py-3 text-[12px] text-txt-mute">{t.slug}.roamhub360.com</td>
                  <td className="border-b px-3 py-3">
                    {t.status === "active" ? <StatusPill variant="ok">Active</StatusPill> : t.status === "suspended" ? <StatusPill variant="soon">Suspended</StatusPill> : <StatusPill>{t.status}</StatusPill>}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-txt-mute">
        Each workspace is fully isolated. Customers reach theirs at <b>&lt;subdomain&gt;.roamhub360.com</b> and see only their own data. Licence management and monitoring arrive with the Partner Portal.
      </p>
    </div>
  );
}
