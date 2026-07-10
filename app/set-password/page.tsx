"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { AuthShell } from "@/components/auth-shell";

function SetPasswordInner() {
  const token = useSearchParams().get("token") ?? "";
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const tooShort = pw.length > 0 && pw.length < 8;
  const mismatch = confirm.length > 0 && confirm !== pw;
  const canSubmit = token && pw.length >= 8 && confirm === pw && !busy;

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!canSubmit) return;
    setBusy(true);
    setError(null);
    const res = await fetch("/api/account/set-password", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, password: pw }),
    })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .catch(() => ({ ok: false, b: { error: "Network error" } }));
    setBusy(false);
    if (res.ok) setDone(true);
    else setError(res.b?.error ?? "Could not set your password.");
  }

  if (!token) {
    return <p className="text-muted-foreground">This link is missing its token. Request a new one from the sign-in page.</p>;
  }
  if (done) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-4xl">✅</div>
        <h1 className="mt-5 text-2xl font-semibold">Password set</h1>
        <p className="mt-2 text-muted-foreground">You can now sign in with your new password.</p>
        <Link href="/signin" className="mt-6 inline-block w-full rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground">Go to sign in</Link>
      </div>
    );
  }

  return (
    <>
      <h1 className="text-2xl font-semibold">Choose a password</h1>
      <p className="mt-2 text-sm text-muted-foreground">Set the password you&apos;ll use to sign in.</p>
      <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
        <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} placeholder="New password (8+ characters)" autoComplete="new-password" className="ed-input" />
        <input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} placeholder="Confirm password" autoComplete="new-password" className="ed-input" />
        {tooShort && <p className="text-[12.5px] text-amber-500">Use at least 8 characters.</p>}
        {mismatch && <p className="text-[12.5px] text-amber-500">Passwords don&apos;t match.</p>}
        {error && <p className="text-[12.5px] text-destructive">{error}</p>}
        <button type="submit" disabled={!canSubmit} className="w-full rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
          {busy ? "Saving…" : "Set password"}
        </button>
      </form>
    </>
  );
}

export default function SetPasswordPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="text-center text-muted-foreground">Loading…</div>}>
        <SetPasswordInner />
      </Suspense>
      <p className="mt-10 text-xs text-muted-foreground">{brand.productName}</p>
    </AuthShell>
  );
}
