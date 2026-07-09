"use client";

import { Suspense, useEffect } from "react";
import { useSearchParams } from "next/navigation";
import { signIn } from "next-auth/react";

// Start OAuth on the MAIN host (so the redirect URI is the single one registered with the identity
// provider), then return to /sso/relay which hands the session to the target subdomain.
function Start() {
  const p = useSearchParams();
  useEffect(() => {
    const provider = p.get("provider") || "";
    const to = p.get("to") || "";
    if (!["microsoft-entra-id", "google"].includes(provider)) {
      window.location.href = "/signin";
      return;
    }
    signIn(provider, { callbackUrl: `/sso/relay?to=${encodeURIComponent(to)}` });
  }, [p]);
  return <div className="p-10 text-center text-muted-foreground">Redirecting to sign in…</div>;
}

export default function SsoStartPage() {
  return (
    <Suspense fallback={<div className="p-10 text-center text-muted-foreground">Loading…</div>}>
      <Start />
    </Suspense>
  );
}
