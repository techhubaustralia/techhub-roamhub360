"use client";

import { useState } from "react";
import Link from "next/link";
import { brand } from "@/lib/brand";

export default function ForgotPage() {
  const [email, setEmail] = useState("");
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    await fetch("/api/account/forgot", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setBusy(false);
    setSent(true); // always show the same confirmation (no account enumeration)
  }

  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <h1 className="text-2xl font-semibold">Reset your password</h1>
      {sent ? (
        <p className="mt-3 text-muted-foreground">
          If an account exists for <span className="font-medium text-foreground">{email}</span>, we&apos;ve sent a link to reset your password. Check your inbox (and spam) — the link expires in 24 hours.
        </p>
      ) : (
        <>
          <p className="mt-2 text-sm text-muted-foreground">Enter your email and we&apos;ll send you a reset link.</p>
          <form onSubmit={submit} className="mt-5 flex flex-col gap-3">
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
              autoComplete="email"
              className="ed-input"
            />
            <button type="submit" disabled={busy} className="w-full rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Sending…" : "Send reset link"}
            </button>
          </form>
        </>
      )}
      <Link href="/signin" className="mt-6 text-sm text-primary hover:underline">← Back to sign in</Link>
      <p className="mt-10 text-xs text-muted-foreground">{brand.productName}</p>
    </div>
  );
}
