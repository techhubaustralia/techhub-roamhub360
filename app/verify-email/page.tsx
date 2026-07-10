"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { brand } from "@/lib/brand";
import { AuthShell } from "@/components/auth-shell";

function VerifyInner() {
  const token = useSearchParams().get("token") ?? "";
  const [state, setState] = useState<"loading" | "ok" | "error">("loading");
  const [msg, setMsg] = useState("");

  useEffect(() => {
    if (!token) {
      setState("error");
      setMsg("This link is missing its token.");
      return;
    }
    let live = true;
    fetch("/api/account/verify-email", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) })
      .then((r) => r.json().then((b) => ({ ok: r.ok, b })))
      .then(({ ok, b }) => {
        if (!live) return;
        setState(ok ? "ok" : "error");
        if (!ok) setMsg(b?.error ?? "Could not verify your email.");
      })
      .catch(() => live && (setState("error"), setMsg("Network error.")));
    return () => {
      live = false;
    };
  }, [token]);

  return (
    <div className="text-center">
      <div className={`mx-auto flex h-20 w-20 items-center justify-center rounded-full text-4xl ${state === "ok" ? "bg-emerald-500/15" : state === "error" ? "bg-amber-500/15" : "bg-muted"}`}>
        {state === "loading" ? <span className="animate-pulse">•••</span> : state === "ok" ? "✅" : "⚠️"}
      </div>
      <h1 className="mt-5 text-2xl font-semibold">{state === "loading" ? "Confirming…" : state === "ok" ? "Email confirmed" : "Couldn't confirm"}</h1>
      {state === "ok" && <p className="mt-2 text-muted-foreground">Thanks — your email is verified. You can now sign in.</p>}
      {state === "error" && <p className="mt-2 text-muted-foreground">{msg}</p>}
      <Link href="/signin" className="mt-6 inline-block w-full rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground">{state === "ok" ? "Sign in" : "Back to sign in"}</Link>
    </div>
  );
}

export default function VerifyEmailPage() {
  return (
    <AuthShell>
      <Suspense fallback={<div className="text-center text-muted-foreground">Loading…</div>}>
        <VerifyInner />
      </Suspense>
      <p className="mt-10 text-center text-xs text-muted-foreground">{brand.productName}</p>
    </AuthShell>
  );
}
