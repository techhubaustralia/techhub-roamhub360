"use client";

import { useState } from "react";
import { toast } from "sonner";
import { KeyRound } from "lucide-react";

// Self-service password change for local accounts. SSO-only users get a clear message from the API.
export function ChangePassword() {
  const [cur, setCur] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const canSave = cur && next.length >= 8 && next === confirm && !busy;

  async function save() {
    setBusy(true);
    const res = await fetch("/api/me/password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ currentPassword: cur, newPassword: next }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .catch(() => ({ ok: false, b: { error: "Network error" } }));
    setBusy(false);
    if (res.ok) {
      toast.success("Password changed");
      setCur("");
      setNext("");
      setConfirm("");
    } else {
      toast.error("Could not change password", { description: res.b?.error });
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4">
      <div className="flex gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-txt-dim">
          <KeyRound className="size-[18px]" />
        </span>
        <div className="w-full">
          <div className="font-semibold">Change password</div>
          <p className="mt-0.5 text-[12.5px] text-txt-mute">Update the password you use to sign in. If you sign in with Microsoft or Google, manage it there instead.</p>
          <div className="mt-3 grid max-w-sm gap-2">
            <input type="password" value={cur} onChange={(e) => setCur(e.target.value)} placeholder="Current password" autoComplete="current-password" className="ed-input" />
            <input type="password" value={next} onChange={(e) => setNext(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className="ed-input" />
            <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm new password" autoComplete="new-password" className="ed-input" />
            {confirm.length > 0 && confirm !== next && <p className="text-[12px] text-amber-500">Passwords don&apos;t match.</p>}
            <button onClick={save} disabled={!canSave} className="mt-1 w-fit rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Saving…" : "Update password"}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
