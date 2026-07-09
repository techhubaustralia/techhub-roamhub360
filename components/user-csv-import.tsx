"use client";

import { useRef, useState } from "react";
import { toast } from "sonner";
import { Upload } from "lucide-react";

// Bulk-import users from a CSV. Accepts columns email,name,role (a header row is optional; role
// defaults to staff). Each imported user is emailed a set-password invite. Parsing is client-side;
// the server creates the accounts.
type Row = { email: string; name?: string; role?: string };

const ROLE_MAP: Record<string, string> = {
  "global-admin": "global-admin", global: "global-admin", admin: "global-admin",
  "site-admin": "site-admin", site: "site-admin",
  staff: "staff", user: "staff", member: "staff",
};

function parseCsv(text: string): Row[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
  if (!lines.length) return [];
  const cells = (l: string) => l.split(",").map((c) => c.trim().replace(/^"|"$/g, ""));
  const first = cells(lines[0]).map((c) => c.toLowerCase());
  const hasHeader = first.includes("email");
  const idx = {
    email: hasHeader ? first.indexOf("email") : 0,
    name: hasHeader ? first.indexOf("name") : 1,
    role: hasHeader ? first.indexOf("role") : 2,
  };
  const rows: Row[] = [];
  for (const line of lines.slice(hasHeader ? 1 : 0)) {
    const c = cells(line);
    const email = (c[idx.email] ?? "").toLowerCase();
    if (!email || !email.includes("@")) continue;
    const role = ROLE_MAP[(c[idx.role] ?? "").toLowerCase()] ?? "staff";
    rows.push({ email, name: c[idx.name] || undefined, role });
  }
  return rows;
}

export function UserCsvImport({ onImported }: { onImported: () => void }) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);

  async function onFile(file: File | undefined) {
    if (!file) return;
    const rows = parseCsv(await file.text());
    if (!rows.length) return toast.error("No valid rows found", { description: "Expected columns: email, name, role." });
    if (rows.length > 500) return toast.error("Too many rows", { description: "Import up to 500 at a time." });
    setBusy(true);
    const res = await fetch("/api/users/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ rows }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .catch(() => ({ ok: false, b: { error: "Network error" } }));
    setBusy(false);
    if (fileRef.current) fileRef.current.value = "";
    if (!res.ok) return toast.error("Import failed", { description: res.b?.error });
    const { created, failed } = res.b as { created: number; failed: { email: string; error: string }[] };
    toast.success(`Imported ${created} user${created === 1 ? "" : "s"}`, {
      description: failed.length ? `${failed.length} skipped (e.g. ${failed[0].email}: ${failed[0].error})` : "Invites emailed.",
    });
    onImported();
  }

  return (
    <>
      <input ref={fileRef} type="file" accept=".csv,text/csv" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <button
        onClick={() => fileRef.current?.click()}
        disabled={busy}
        className="inline-flex items-center gap-1.5 rounded-[10px] border bg-panel-2 px-3 py-1.5 text-[13px] font-semibold hover:border-primary disabled:opacity-50"
      >
        <Upload className="size-3.5" /> {busy ? "Importing…" : "Import CSV"}
      </button>
    </>
  );
}
