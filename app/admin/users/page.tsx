"use client";

import { useEffect, useState, useCallback } from "react";
import { toast } from "sonner";
import { Trash2, Shield, MapPin } from "lucide-react";
import { BUILDINGS } from "@/lib/data";
import { getBuildingsMeta } from "@/lib/plan-store";
import { PageHeader } from "@/components/page-header";
import { UserCsvImport } from "@/components/user-csv-import";
import { StatusPill } from "@/components/status-pill";

type Role = "global-admin" | "site-admin" | "staff";
interface User {
  id: string;
  email: string;
  name: string | null;
  role: Role;
  sites?: string[];
  multiBook?: boolean;
  provider: string; // credentials | google | microsoft-entra-id | entra
}
interface SiteOpt {
  id: string;
  name: string;
}
interface FormState {
  id?: string;
  email: string;
  name: string;
  password: string;
  role: Role;
  sites: string[];
  multiBook: boolean;
  provider?: string;
  invite?: boolean; // email a set-password link instead of setting one (new users only)
}

const EMAIL_RE = /^[^@\s]+@[^@\s]+\.[^@\s]+$/;
const blank = (): FormState => ({ email: "", name: "", password: "", role: "staff", sites: [], multiBook: false, invite: true });

function roleLabel(r: Role): string {
  return r === "global-admin" ? "Global Admin" : r === "site-admin" ? "Site Admin" : "Staff";
}
function providerLabel(p: string): string {
  if (p === "google") return "Google";
  if (p === "microsoft-entra-id" || p === "entra") return "Microsoft";
  return "Password";
}

export default function UsersPage() {
  const [me, setMe] = useState<{ role?: string } | null>(null);
  const [rows, setRows] = useState<User[]>([]);
  const [sites, setSites] = useState<SiteOpt[]>([]);
  const [form, setForm] = useState<FormState>(blank());
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);

  const loadUsers = useCallback(async () => {
    const r = await fetch("/api/users");
    if (r.ok) {
      setRows((await r.json()) as User[]);
      setLoadError(null);
    } else {
      const e = await r.json().catch(() => ({}));
      setLoadError(r.status === 503 ? "User management needs the database, which runs on the deployed instance." : e.error || "Could not load users.");
    }
  }, []);

  useEffect(() => {
    fetch("/api/me").then((r) => (r.ok ? r.json() : null)).then(setMe).catch(() => setMe({}));
    loadUsers();
    getBuildingsMeta().then(({ custom, hidden }) => {
      const builtIn = BUILDINGS.filter((b) => !hidden.includes(b.id)).map((b) => ({ id: b.id, name: b.name }));
      const customRows = custom.filter((c) => !hidden.includes(c.id) && !builtIn.some((b) => b.id === c.id)).map((c) => ({ id: c.id, name: c.name }));
      setSites([...builtIn, ...customRows]);
    });
  }, [loadUsers]);

  const emailValid = EMAIL_RE.test(form.email.trim());
  const isSso = Boolean(form.provider && form.provider !== "credentials");
  const inviting = !editing && !isSso && !!form.invite;
  const passwordValid = editing ? form.password.length === 0 || form.password.length >= 8 : inviting || form.password.length >= 8;
  const sitesValid = form.role !== "site-admin" || form.sites.length > 0;
  const canSave = (editing || emailValid) && form.name.trim().length > 0 && (isSso || passwordValid) && sitesValid && !saving;

  function startEdit(u: User) {
    setForm({ id: u.id, email: u.email, name: u.name ?? "", password: "", role: u.role, sites: u.sites ?? [], multiBook: !!u.multiBook, provider: u.provider });
    setEditing(true);
    window.scrollTo({ top: 0, behavior: "smooth" });
  }
  function reset() {
    setForm(blank());
    setEditing(false);
  }
  function toggleSite(id: string) {
    setForm((f) => ({ ...f, sites: f.sites.includes(id) ? f.sites.filter((s) => s !== id) : [...f.sites, id] }));
  }

  async function save() {
    if (!canSave) return;
    setSaving(true);
    const sitesOut = form.role === "site-admin" ? form.sites : [];
    const multiOut = form.role === "site-admin" && form.multiBook;
    let res: Response;
    if (editing && form.id) {
      const body: Record<string, unknown> = { name: form.name.trim(), role: form.role, sites: sitesOut, multiBook: multiOut };
      if (form.password) body.password = form.password;
      res = await fetch(`/api/users/${form.id}`, { method: "PATCH", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    } else {
      res = await fetch("/api/users", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: form.email.trim().toLowerCase(), name: form.name.trim(), password: inviting ? undefined : form.password, role: form.role, sites: sitesOut, multiBook: multiOut, invite: inviting }),
      });
    }
    setSaving(false);
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error(editing ? "Could not save changes" : "Could not create user", { description: e.error });
      return;
    }
    toast(editing ? "User updated" : inviting ? "Invite sent" : "User created", { description: `${form.name.trim()} → ${roleLabel(form.role)}` });
    reset();
    loadUsers();
  }

  async function remove(u: User) {
    if (!window.confirm(`Delete ${u.name || u.email}? They will lose all access. This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: "DELETE" });
    if (!res.ok) {
      const e = await res.json().catch(() => ({}));
      toast.error("Could not delete", { description: e.error });
      return;
    }
    toast("User deleted", { description: u.email });
    loadUsers();
  }

  if (me && me.role !== "global-admin") {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Users & roles" subtitle="Manage who can access and administer RoamHub360" />
        <div className="rounded-[14px] border bg-card p-8 text-center shadow-sm">
          <Shield className="mx-auto mb-3 size-7 text-txt-mute" />
          <p className="text-[14px] font-semibold">Global Admin access required</p>
          <p className="mt-1 text-[12.5px] text-txt-mute">Only a Global Admin can view and manage users.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Users & roles"
        subtitle="Create accounts and set roles. Microsoft & Google sign-ins are added automatically on first login."
        action={<UserCsvImport onImported={loadUsers} />}
      />

      {loadError && (
        <div className="mb-6 rounded-[12px] border border-amber/40 bg-amber/10 px-4 py-3 text-[12.5px] text-txt">{loadError}</div>
      )}

      {/* Add / edit form */}
      <div className="mb-6 rounded-[14px] border bg-card p-5 shadow-sm">
        <h2 className="mb-4 text-[13.5px] font-semibold">{editing ? "Edit user" : "Add a user"}</h2>
        <div className="grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-txt-mute">Work email</span>
            <input
              type="email"
              autoComplete="off"
              value={form.email}
              disabled={editing}
              onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))}
              placeholder="name@company.com"
              className="w-full rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] disabled:opacity-60"
            />
            {form.email.length > 0 && !emailValid && <span className="mt-1 block text-[11px] text-destructive">Enter a valid email address.</span>}
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-txt-mute">Full name</span>
            <input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="Jane Doe" className="w-full rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-txt-mute">Role</span>
            <select value={form.role} onChange={(e) => setForm((f) => ({ ...f, role: e.target.value as Role }))} className="w-full rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px]">
              <option value="staff">Staff — can book spaces</option>
              <option value="site-admin">Site Admin — manages assigned site(s)</option>
              <option value="global-admin">Global Admin — full control</option>
            </select>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11.5px] font-medium text-txt-mute">
              {isSso ? "Password (sign-in via " + providerLabel(form.provider!) + ")" : editing ? "Password (leave blank to keep)" : inviting ? "Password (they set their own)" : "Password"}
            </span>
            <input
              type="password"
              autoComplete="new-password"
              value={inviting ? "" : form.password}
              disabled={isSso || inviting}
              onChange={(e) => setForm((f) => ({ ...f, password: e.target.value }))}
              placeholder={isSso ? "Managed by identity provider" : inviting ? "Sent as a secure email link" : "At least 8 characters"}
              className="w-full rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] disabled:opacity-60"
            />
            {!isSso && !inviting && form.password.length > 0 && form.password.length < 8 && <span className="mt-1 block text-[11px] text-destructive">At least 8 characters.</span>}
            {!editing && !isSso && (
              <label className="mt-2 flex items-center gap-2 text-[12px] text-txt-mute">
                <input type="checkbox" checked={!!form.invite} onChange={(e) => setForm((f) => ({ ...f, invite: e.target.checked }))} className="size-3.5 accent-[var(--primary)]" />
                Invite by email (they set their own password)
              </label>
            )}
          </label>
        </div>

        {form.role === "site-admin" && (
          <div className="mt-4">
            <span className="mb-2 block text-[11.5px] font-medium text-txt-mute">Assigned sites</span>
            {sites.length === 0 ? (
              <p className="text-[12px] text-txt-mute">No buildings available yet.</p>
            ) : (
              <div className="flex flex-wrap gap-2">
                {sites.map((s) => {
                  const on = form.sites.includes(s.id);
                  return (
                    <button
                      key={s.id}
                      type="button"
                      onClick={() => toggleSite(s.id)}
                      className={`inline-flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-[12px] transition-colors ${on ? "border-primary bg-primary/10 font-semibold text-primary" : "bg-panel-2 text-txt hover:bg-panel"}`}
                    >
                      <MapPin className="size-3" /> {s.name}
                    </button>
                  );
                })}
              </div>
            )}
            {!sitesValid && <span className="mt-1 block text-[11px] text-destructive">Select at least one site.</span>}
          </div>
        )}

        {form.role === "site-admin" && (
          <label className="mt-4 flex items-start gap-2.5 rounded-[10px] border bg-panel-2 px-3 py-2.5">
            <input type="checkbox" checked={form.multiBook} onChange={(e) => setForm((f) => ({ ...f, multiBook: e.target.checked }))} className="mt-0.5 size-4 accent-[var(--orange)]" />
            <span className="text-[12.5px]">
              <b className="font-semibold">Office Manager</b> — may book more than one desk per day
              <span className="mt-0.5 block text-[11px] text-txt-mute">Bypasses the one-desk-per-day rule and per-building desk quota. Normal staff are unaffected.</span>
            </span>
          </label>
        )}

        <div className="mt-5 flex items-center gap-3">
          <button onClick={save} disabled={!canSave} className="rounded-[10px] bg-primary px-4 py-2.5 text-[13px] font-semibold text-primary-foreground transition-colors hover:bg-orange-soft disabled:opacity-50">
            {saving ? "Saving…" : editing ? "Save changes" : "Add user"}
          </button>
          {editing && (
            <button onClick={reset} className="text-[13px] font-semibold text-txt-mute hover:text-txt">
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Users table */}
      <div className="overflow-x-auto rounded-[14px] border bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">User</th>
              <th className="border-b px-3 py-2.5">Role</th>
              <th className="border-b px-3 py-2.5">Sign-in</th>
              <th className="border-b px-3 py-2.5">Sites</th>
              <th className="border-b px-3 py-2.5"></th>
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-3 py-8 text-center text-[12.5px] text-txt-mute">
                  {loadError ? "—" : "No users yet. Add one above."}
                </td>
              </tr>
            ) : (
              rows.map((u) => (
                <tr key={u.id} className="hover:bg-panel-2">
                  <td className="border-b px-3 py-3">
                    <b>{u.name || "—"}</b>
                    <div className="text-[11.5px] text-txt-mute">{u.email}</div>
                  </td>
                  <td className="border-b px-3 py-3">
                    <span className="flex flex-wrap items-center gap-1.5">
                      {u.role === "global-admin" ? <StatusPill variant="soon">Global Admin</StatusPill> : u.role === "site-admin" ? <StatusPill variant="ok">Site Admin</StatusPill> : <StatusPill>Staff</StatusPill>}
                      {u.multiBook && <StatusPill variant="soon">Office Manager</StatusPill>}
                    </span>
                  </td>
                  <td className="border-b px-3 py-3 text-[12px] text-txt-mute">{providerLabel(u.provider)}</td>
                  <td className="border-b px-3 py-3 text-[12px] text-txt-mute">
                    {u.role === "global-admin" ? "All sites" : (u.sites ?? []).map((id) => sites.find((s) => s.id === id)?.name ?? id).join(", ") || "—"}
                  </td>
                  <td className="border-b px-3 py-3 text-right">
                    <button onClick={() => startEdit(u)} className="mr-4 font-semibold text-primary hover:underline">
                      Edit
                    </button>
                    <button onClick={() => remove(u)} title="Delete user" className="font-semibold text-destructive hover:underline">
                      <Trash2 className="inline size-3.5" /> Delete
                    </button>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="mt-3 text-[12px] text-txt-mute">
        Local accounts sign in with email &amp; password. Users who sign in with Microsoft or Google are added automatically as Staff on first login — promote them here. Changes take effect on their next sign-in.
      </p>
    </div>
  );
}
