"use client";

import { useMemo, useState } from "react";
import { toast } from "sonner";
import { CloudDownload, Search, X } from "lucide-react";
import { Avatar } from "@/components/avatar";
import { getDirectory, importDirectoryUsersApi, type DirectoryEntry } from "@/lib/api";
import { pendingDirectoryEntries, matchesImportQuery, summariseImport } from "@/lib/directory-import";
import { ROLE_LABELS } from "@/lib/role-labels";

// "Import from Microsoft 365" — pick people from the synced Entra directory and pre-provision them
// as SSO users of this workspace. Sits beside "Import CSV" on Users & roles. The directory itself is
// managed under Directory (sidebar); this only reads what has already been synced.
export function DirectoryImport({ existingEmails, onImported }: { existingEmails: string[]; onImported: () => void }) {
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [entries, setEntries] = useState<DirectoryEntry[]>([]);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [role, setRole] = useState("staff");
  const [busy, setBusy] = useState(false);

  async function start() {
    setLoading(true);
    const { status, entries } = await getDirectory();
    setLoading(false);
    if (!status.hasDb) return toast.error("Directory import needs the database", { description: "Available on the deployed instance." });
    if (!status.count) {
      return toast.error("No directory synced yet", { description: status.configured ? "Open Directory in the sidebar and run Sync from Microsoft 365 first." : "Connect Microsoft under Settings → Microsoft integration, then sync the Directory." });
    }
    setEntries(entries);
    setPicked(new Set());
    setQ("");
    setOpen(true);
  }

  const pending = useMemo(() => pendingDirectoryEntries(entries, existingEmails), [entries, existingEmails]);
  const visible = useMemo(() => pending.filter((e) => matchesImportQuery(e, q)), [pending, q]);
  const allVisiblePicked = visible.length > 0 && visible.every((e) => picked.has(e.email.toLowerCase()));

  function toggle(email: string) {
    const k = email.toLowerCase();
    setPicked((s) => { const n = new Set(s); if (n.has(k)) n.delete(k); else n.add(k); return n; });
  }
  function toggleAllVisible() {
    setPicked((s) => {
      const n = new Set(s);
      for (const e of visible) { if (allVisiblePicked) n.delete(e.email.toLowerCase()); else n.add(e.email.toLowerCase()); }
      return n;
    });
  }

  async function run() {
    if (!picked.size) return;
    setBusy(true);
    const r = await importDirectoryUsersApi([...picked], role);
    setBusy(false);
    if (!r.ok) return toast.error("Import failed", { description: r.error });
    const s = summariseImport(r);
    toast.success(s.title, { description: s.description });
    setOpen(false);
    onImported();
  }

  return (
    <>
      <button
        onClick={start}
        disabled={loading}
        className="inline-flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-1.5 text-[13px] font-semibold hover:border-primary disabled:opacity-50"
      >
        <CloudDownload className="size-3.5" /> {loading ? "Loading…" : "Import from Microsoft 365"}
      </button>

      {open && (
        <div className="fixed inset-0 z-50 grid place-items-center bg-black/40 p-4" onClick={() => setOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-lg flex-col rounded-[14px] border bg-card shadow-xl" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-start justify-between gap-3 p-5 pb-3">
              <div>
                <h2 className="font-heading text-[16px] font-bold">Import from Microsoft 365</h2>
                <p className="mt-0.5 text-[12.5px] text-txt-mute">
                  {pending.length === 0
                    ? "Everyone in the synced directory is already a user."
                    : `${pending.length} ${pending.length === 1 ? "person" : "people"} in the directory ${pending.length === 1 ? "isn't" : "aren't"} users yet. They'll sign in with Microsoft — no password, no invite email.`}
                </p>
              </div>
              <button onClick={() => setOpen(false)} className="grid size-7 shrink-0 place-items-center rounded-lg text-txt-mute hover:bg-panel-2" aria-label="Close"><X className="size-4" /></button>
            </div>

            {pending.length > 0 && (
              <>
                <div className="flex items-center gap-2 px-5 pb-2">
                  <label className="relative flex-1">
                    <Search className="pointer-events-none absolute left-2.5 top-1/2 size-3.5 -translate-y-1/2 text-txt-mute" />
                    <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search name, email, title, department" className="w-full rounded-[10px] border bg-panel-2 py-1.5 pl-8 pr-3 text-[13px]" />
                  </label>
                  <label className="flex items-center gap-1.5 whitespace-nowrap text-[12.5px]">
                    <input type="checkbox" checked={allVisiblePicked} onChange={toggleAllVisible} className="size-4 accent-[var(--primary)]" />
                    All shown
                  </label>
                </div>
                <div className="min-h-0 flex-1 overflow-y-auto border-y">
                  {visible.length === 0 && <div className="p-5 text-center text-[12.5px] text-txt-mute">No one matches “{q}”.</div>}
                  {visible.map((e) => {
                    const k = e.email.toLowerCase();
                    const sub = [e.jobTitle, e.department].filter(Boolean).join(" · ");
                    return (
                      <label key={k} className="flex cursor-pointer items-center gap-3 px-5 py-2 hover:bg-panel-2">
                        <input type="checkbox" checked={picked.has(k)} onChange={() => toggle(e.email)} className="size-4 accent-[var(--primary)]" />
                        <Avatar name={e.displayName || e.email} photo={e.photo} size={30} />
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-[13px] font-medium">{e.displayName || e.email}</span>
                          <span className="block truncate text-[11.5px] text-txt-mute">{e.email}{sub ? ` · ${sub}` : ""}</span>
                        </span>
                      </label>
                    );
                  })}
                </div>
                <div className="flex flex-wrap items-center justify-between gap-3 p-5 pt-3">
                  <label className="flex items-center gap-2 text-[12.5px]">
                    <span className="text-txt-mute">Role</span>
                    <select value={role} onChange={(e) => setRole(e.target.value)} className="rounded-[9px] border bg-panel-2 px-2 py-1.5 text-[13px]">
                      <option value="staff">{ROLE_LABELS.staff}</option>
                      <option value="site-admin">{ROLE_LABELS["site-admin"]}</option>
                      <option value="global-admin">{ROLE_LABELS["global-admin"]}</option>
                    </select>
                  </label>
                  <div className="flex gap-2">
                    <button onClick={() => setOpen(false)} className="rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold">Cancel</button>
                    <button onClick={run} disabled={busy || picked.size === 0} className="rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
                      {busy ? "Importing…" : `Import ${picked.size || ""}`.trim()}
                    </button>
                  </div>
                </div>
              </>
            )}
            {pending.length === 0 && (
              <div className="flex justify-end p-5 pt-2">
                <button onClick={() => setOpen(false)} className="rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold">Close</button>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
