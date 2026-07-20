"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { RefreshCw, Building2, Users, ChevronDown, ChevronRight } from "lucide-react";
import {
  getDirectory,
  syncDirectoryApi,
  getDirectoryGroups,
  saveDirectoryGroups,
  type DirectoryEntry,
  type DirectoryStatus,
  type EntraGroupRow,
} from "@/lib/api";
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

  // Sync scope — which Entra groups to pull (empty = whole directory).
  const [showGroups, setShowGroups] = useState(false);
  const [loadedGroups, setLoadedGroups] = useState(false);
  const [groups, setGroups] = useState<EntraGroupRow[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [groupQuery, setGroupQuery] = useState("");
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [groupsError, setGroupsError] = useState<string | null>(null);
  const [savingGroups, setSavingGroups] = useState(false);

  async function loadGroups(q?: string) {
    setGroupsLoading(true);
    setGroupsError(null);
    const res = await getDirectoryGroups(q);
    setGroups(res.groups);
    if (!loadedGroups) setSelected(res.selected); // keep the admin's in-progress ticks on re-search
    setLoadedGroups(true);
    setGroupsError(res.ok ? null : (res.error ?? "Couldn't list groups."));
    setGroupsLoading(false);
  }

  async function saveGroups() {
    setSavingGroups(true);
    const res = await saveDirectoryGroups(selected);
    setSavingGroups(false);
    if (res.ok) toast.success(selected.length ? `Scope set to ${selected.length} group${selected.length === 1 ? "" : "s"}` : "Syncing everyone");
    else toast.error("Could not save", { description: res.error });
  }

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
        <span className="rounded-full bg-panel-2 px-3 py-1">Scope: <b>{selected.length ? `${selected.length} group${selected.length === 1 ? "" : "s"}` : "whole directory"}</b></span>
      </div>

      {/* Sync scope. Pulling an entire enterprise directory into a booking app is noisy and a privacy
          concern — most customers want a few groups (e.g. "Sydney Office", "Hybrid Staff"). */}
      {status?.configured && (
        <div className="mb-4 rounded-[14px] border bg-card shadow-sm">
          <button onClick={() => { setShowGroups((s) => !s); if (!loadedGroups) loadGroups(); }} className="flex w-full items-center gap-3 px-4 py-3 text-left">
            <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-primary/12 text-primary"><Users className="size-4" /></span>
            <span className="min-w-0 flex-1">
              <span className="block text-[13.5px] font-semibold">Which people should sync?</span>
              <span className="mt-0.5 block text-[12px] text-txt-mute">
                {selected.length ? `Only members of ${selected.length} selected group${selected.length === 1 ? "" : "s"}.` : "Currently syncing everyone in your Microsoft directory. Choose groups to narrow it."}
              </span>
            </span>
            {showGroups ? <ChevronDown className="size-4 shrink-0 text-txt-mute" /> : <ChevronRight className="size-4 shrink-0 text-txt-mute" />}
          </button>

          {showGroups && (
            <div className="border-t px-4 py-3">
              <div className="flex gap-2">
                <input
                  value={groupQuery}
                  onChange={(e) => setGroupQuery(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && loadGroups(groupQuery)}
                  placeholder="Search groups by name…"
                  className="ed-input text-[13px]"
                />
                <button onClick={() => loadGroups(groupQuery)} disabled={groupsLoading} className="shrink-0 rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold hover:border-primary disabled:opacity-50">
                  {groupsLoading ? "…" : "Search"}
                </button>
              </div>

              {groupsError && <p className="mt-2 text-[12.5px] text-destructive">{groupsError}</p>}

              <div className="mt-3 max-h-[260px] overflow-auto">
                {groups.length === 0 && !groupsLoading ? (
                  <p className="py-4 text-center text-[12.5px] text-txt-mute">No groups found. Your Entra app also needs <b>Group.Read.All</b> to list groups.</p>
                ) : (
                  groups.map((g) => (
                    <label key={g.id} className="flex cursor-pointer items-start gap-2.5 rounded-[8px] px-2 py-1.5 hover:bg-panel-2">
                      <input
                        type="checkbox"
                        checked={selected.includes(g.id)}
                        onChange={(e) => setSelected((s) => (e.target.checked ? [...s, g.id] : s.filter((x) => x !== g.id)))}
                        className="mt-0.5 size-4 accent-[var(--primary)]"
                      />
                      <span className="min-w-0">
                        <span className="block text-[13px] font-medium">{g.name}</span>
                        {g.description && <span className="block truncate text-[11.5px] text-txt-mute">{g.description}</span>}
                      </span>
                    </label>
                  ))
                )}
              </div>

              <div className="mt-3 flex flex-wrap items-center gap-2 border-t pt-3">
                <button onClick={saveGroups} disabled={savingGroups} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
                  {savingGroups ? "Saving…" : "Save scope"}
                </button>
                <button onClick={() => setSelected([])} className="rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold hover:border-primary">
                  Clear (sync everyone)
                </button>
                <span className="text-[11.5px] text-txt-mute">Nested groups are included. Run a sync after saving.</span>
              </div>
            </div>
          )}
        </div>
      )}

      {!loading && !status?.configured && (
        <div className="mb-4 rounded-[12px] border border-amber/40 bg-amber/10 px-4 py-3 text-[13px]">
          Microsoft isn&apos;t connected for this workspace yet. Set it up under <a href="/admin/integration" className="font-semibold text-primary">Microsoft&nbsp;365</a> —
          add your Entra app and grant <b>User.Read.All</b>, then sync. Until then, RoamHub360 uses names derived from email addresses.
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
