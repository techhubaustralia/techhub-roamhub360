"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { signIn } from "next-auth/react";
import { brand } from "@/lib/brand";

// Subdomain side of the SSO handoff: exchange the short-lived token from the main host for a session
// on THIS workspace. Fails cleanly if the user isn't a member here.
function Handoff() {
  const token = useSearchParams().get("token") ?? "";
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!token) {
      setFailed(true);
      return;
    }
    signIn("sso-handoff", { token, redirect: false }).then((res) => {
      if (res?.error) setFailed(true);
      else window.location.assign("/");
    });
  }, [token]);

  if (failed) {
    return (
      <div className="text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-amber-500/15 text-4xl">⚠️</div>
        <h1 className="mt-5 text-2xl font-semibold">Couldn&apos;t sign you in</h1>
        <p className="mt-2 text-muted-foreground">This sign-in link has expired, or your account isn&apos;t a member of this workspace. Ask your administrator to add you, then try again.</p>
        <Link href="/signin" className="mt-6 inline-block w-full rounded-[12px] bg-primary px-4 py-3 text-[15px] font-semibold text-primary-foreground">Back to sign in</Link>
      </div>
    );
  }
  return <div className="p-10 text-center text-muted-foreground">Signing you in…</div>;
}

export default function SsoHandoffPage() {
  return (
    <div className="mx-auto flex min-h-[80vh] max-w-sm flex-col justify-center px-6">
      <Suspense fallback={<div className="p-10 text-center text-muted-foreground">Loading…</div>}>
        <Handoff />
      </Suspense>
      <p className="mt-10 text-center text-xs text-muted-foreground">{brand.productName}</p>
    </div>
  );
}
