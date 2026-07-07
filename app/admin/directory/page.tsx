"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Building2 } from "lucide-react";
import { getDirectory, syncDirectoryApi, type DirectoryEntry, type DirectoryStatus } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

const initials = (name: string) =>
  name.split(/\s+/).filter(Boolean).slice(0, 2).map((w) => w[0]?.toUpperCase()).join("") || "?";

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.round(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} h ago`;
  return `${Math.round(hrs / 24)} d ago`;
}

export default function DirectoryPage() {
  const [status, setStatus] = useState<DirectoryStatus | null>(null);
  const [rows, setRows] = useState<DirectoryEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);

  async function load() {
    const { status, entries } = await getDirectory();
    setStatus(status);
    setRows(entries);
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function sync() {
    setSyncing(true);
    const res = await syncDirectoryApi();
    setSyncing(false);
    if (res.ok) {
      toast.success("Directory synced", { description: `${res.synced} people, ${res.photos} photos from Microsoft 365.` });
      load();
    } else {
      toast.error("Sync failed", { description: res.error });
    }
  }

  const canSync = status?.configured && status?.hasDb;

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Directory"
        subtitle="A cached snapshot of your Microsoft Entra directory — powers real names, photos and departments across RoamHub360."
        action={
          <button
            onClick={sync}
            disabled={!canSync || syncing}
            className="inline-flex items-center gap-2 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50"
          >
            <RefreshCw className={`size-4 ${syncing ? "animate-spin" : ""}`} /> {syncing ? "Syncing…" : "Sync from Microsoft 365"}
          </button>
        }
      />

      <div className="mb-4 flex flex-wrap items-center gap-3 text-[13px] text-txt-dim">
        <span className="rounded-full bg-panel-2 px-3 py-1"><b>{status?.count ?? 0}</b> people</span>
        <span className="rounded-full bg-panel-2 px-3 py-1">Last synced: <b>{relTime(status?.lastSync ?? null)}</b></span>
      </div>

      {!loading && !status?.configured && (
        <div className="mb-4 rounded-[12px] border border-amber/40 bg-amber/10 px-4 py-3 text-[13px]">
          Microsoft Graph isn&apos;t configured yet. Set <code>AZURE_TENANT_ID</code>, <code>GRAPH_CLIENT_ID</code> and <code>GRAPH_CLIENT_SECRET</code> and grant the
          app the <b>User.Read.All</b> permission, then sync. Until then, RoamHub360 uses names derived from email addresses.
        </div>
      )}
      {!loading && status?.configured && !status?.hasDb && (
        <div className="mb-4 rounded-[12px] border border-amber/40 bg-amber/10 px-4 py-3 text-[13px]">
          A database (<code>DATABASE_URL</code>) is required to store the directory.
        </div>
      )}

      <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">Name</th>
              <th className="border-b px-3 py-2.5">Title</th>
              <th className="border-b px-3 py-2.5">Department</th>
              <th className="border-b px-3 py-2.5">Office</th>
              <th className="border-b px-3 py-2.5">Manager</th>
            </tr>
          </thead>
          <tbody>
            {loading || rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-10 text-center text-txt-mute">
                  {loading ? "Loading…" : canSync ? "No one synced yet — click “Sync from Microsoft 365”." : "Nothing to show yet."}
                </td>
              </tr>
            ) : (
              rows.map((r) => (
                <tr key={r.email} className="hover:bg-panel-2">
                  <td className="border-b px-3 py-2.5">
                    <div className="flex items-center gap-2.5">
                      {r.photo ? (
                        <img src={r.photo} alt="" className="size-8 rounded-full object-cover" />
                      ) : (
                        <span className="grid size-8 place-items-center rounded-full bg-primary/12 text-[11px] font-bold text-primary">{initials(r.displayName || r.email)}</span>
                      )}
                      <div className="min-w-0">
                        <div className="truncate font-semibold">{r.displayName || r.email}</div>
                        <div className="truncate text-[11.5px] text-txt-mute">{r.email}</div>
                      </div>
                    </div>
                  </td>
                  <td className="border-b px-3 py-2.5">{r.jobTitle || <span className="text-txt-mute">—</span>}</td>
                  <td className="border-b px-3 py-2.5">
                    {r.department ? (
                      <span className="inline-flex items-center gap-1.5 rounded-full bg-panel-2 px-2 py-0.5 text-[12px] font-semibold"><Building2 className="size-3" /> {r.department}</span>
                    ) : (
                      <span className="text-txt-mute">—</span>
                    )}
                  </td>
                  <td className="border-b px-3 py-2.5">{r.officeLocation || <span className="text-txt-mute">—</span>}</td>
                  <td className="border-b px-3 py-2.5 text-txt-dim">{r.managerEmail || <span className="text-txt-mute">—</span>}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
