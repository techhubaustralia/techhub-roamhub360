"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { RoamHubMark } from "@/components/roamhub-mark";
import { brand } from "@/lib/brand";

export function SignInForm({ entraEnabled, googleEnabled, bare = false }: { entraEnabled: boolean; googleEnabled: boolean; bare?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [totp, setTotp] = useState("");
  const [showTotp, setShowTotp] = useState(false);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false); // a sign-in attempt was rejected
  const [resent, setResent] = useState(false);

  async function resendVerification() {
    await fetch("/api/account/resend-verification", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email }),
    }).catch(() => {});
    setResent(true);
  }

  // OAuth providers require a fixed, pre-registered redirect URI, which a dynamic customer subdomain
  // can't have. So on a subdomain we route SSO through the main host (/sso/start), which runs OAuth
  // and hands the session back here. On the main host we sign in directly.
  function startSso(provider: "google" | "microsoft-entra-id") {
    const host = window.location.host;
    const parts = host.split(".");
    const sub = parts.length > 2 ? parts[0] : "";
    const onSubdomain = !!sub && !["app", "www"].includes(sub) && !/^\d+\.\d+\.\d+\.\d+/.test(host);
    if (onSubdomain) {
      const apex = parts.slice(1).join(".");
      window.location.href = `https://app.${apex}/sso/start?provider=${provider}&to=${encodeURIComponent(sub)}`;
    } else {
      signIn(provider, { callbackUrl: "/" });
    }
  }

  async function onSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    const res = await signIn("credentials", { email, password, totp, redirect: false });
    setLoading(false);
    if (!res?.error) {
      window.location.assign("/");
      return;
    }
    // The server returns a specific reason (auth.ts). Only the 2FA codes reveal the code field —
    // previously EVERY failure did, which made a wrong password look like it needed a code.
    const code = res.code ?? "";
    setFailed(true);
    switch (code) {
      case "totp_required":
        setShowTotp(true);
        setError("Enter the 6-digit code from your authenticator app.");
        break;
      case "totp_invalid":
        setShowTotp(true);
        setError("That authentication code isn't right — check the current code and try again.");
        break;
      case "unverified":
        setError("Verify your email address before signing in — check your inbox for the link.");
        break;
      case "wrong_workspace":
        setError("This account belongs to a different workspace. Sign in from your own workspace's web address.");
        break;
      case "rate_limited":
        setError("Too many sign-in attempts. Wait a few minutes and try again.");
        break;
      default:
        // bad_credentials (or anything unmapped) — deliberately generic, no account enumeration.
        setError("Incorrect email or password. If you were invited, use the link in your invite email to set a password first.");
    }
  }

  const inner = (
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex flex-col items-center text-center">
          <RoamHubMark className="size-12" />
          <h1 className="font-heading mt-3 text-xl font-bold">{brand.productName}</h1>
          <p className="text-sm text-txt-mute">{brand.tagline}</p>
        </div>

        <div className="rounded-2xl border bg-card p-6 shadow-lg">
          {(entraEnabled || googleEnabled) && (
            <>
              <div className="flex flex-col gap-2">
                {googleEnabled && (
                  <button
                    type="button"
                    onClick={() => startSso("google")}
                    className="flex w-full items-center justify-center gap-2 rounded-[11px] border bg-panel-2 px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary"
                  >
                    <GoogleLogo /> Continue with Google
                  </button>
                )}
                {entraEnabled && (
                  <button
                    type="button"
                    onClick={() => startSso("microsoft-entra-id")}
                    className="flex w-full items-center justify-center gap-2 rounded-[11px] border bg-panel-2 px-3 py-2.5 text-sm font-semibold transition-colors hover:border-primary"
                  >
                    <MsLogo /> Continue with Microsoft
                  </button>
                )}
              </div>
              <div className="my-4 flex items-center gap-3 text-[11px] uppercase tracking-wider text-txt-mute">
                <span className="h-px flex-1 bg-border" /> or <span className="h-px flex-1 bg-border" />
              </div>
            </>
          )}

          <form onSubmit={onSubmit} className="flex flex-col gap-3">
            <label className="flex flex-col gap-1 text-[13px] font-medium">
              Email
              <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} className="ed-input" placeholder="you@company.com" autoComplete="email" />
            </label>
            <label className="flex flex-col gap-1 text-[13px] font-medium">
              Password
              <input type="password" required value={password} onChange={(e) => setPassword(e.target.value)} className="ed-input" placeholder="••••••••" autoComplete="current-password" />
            </label>
            <a href="/forgot" className="-mt-1 self-end text-[12px] text-primary hover:underline">Forgot password?</a>
            {showTotp && (
              <label className="flex flex-col gap-1 text-[13px] font-medium">
                Authentication code
                <input
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  value={totp}
                  onChange={(e) => setTotp(e.target.value.replace(/\D/g, "").slice(0, 6))}
                  className="ed-input tracking-[0.3em]"
                  placeholder="123456"
                />
              </label>
            )}
            {error && (
              <p className="text-[13px] text-destructive" role="alert">
                {error}
              </p>
            )}
            {failed && (
              resent ? (
                <p className="text-[12px] text-txt-mute">If your account needs verifying, we&apos;ve resent the link — check your inbox.</p>
              ) : (
                <button type="button" onClick={resendVerification} className="self-start text-[12px] text-primary hover:underline">
                  Resend verification email
                </button>
              )
            )}
            <button
              type="submit"
              disabled={loading}
              className="mt-1 rounded-[11px] bg-primary px-3 py-2.5 text-sm font-bold text-primary-foreground transition-colors hover:bg-orange-soft disabled:opacity-60"
            >
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
        <p className="mt-4 text-center text-[11px] text-txt-mute">A {brand.company} product</p>
      </div>
  );

  if (bare) return inner;
  return <div className="fixed inset-0 z-[100] grid place-items-center overflow-auto bg-background p-6">{inner}</div>;
}

function MsLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 23 23" aria-hidden="true">
      <path fill="#f35325" d="M1 1h10v10H1z" />
      <path fill="#81bc06" d="M12 1h10v10H12z" />
      <path fill="#05a6f0" d="M1 12h10v10H1z" />
      <path fill="#ffba08" d="M12 12h10v10H12z" />
    </svg>
  );
}

function GoogleLogo() {
  return (
    <svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true">
      <path fill="#ffc107" d="M43.6 20.5H42V20H24v8h11.3c-1.6 4.7-6.1 8-11.3 8-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 13.2 4.5 4.5 13.2 4.5 24S13.2 43.5 24 43.5 43.5 34.8 43.5 24c0-1.2-.1-2.3-.4-3.5z" />
      <path fill="#ff3d00" d="M6.3 14.7l6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.5 6.5 29.6 4.5 24 4.5 16.3 4.5 9.7 8.9 6.3 14.7z" />
      <path fill="#4caf50" d="M24 43.5c5.5 0 10.3-1.9 13.8-5.1l-6.4-5.4C29.4 34.6 26.8 35.5 24 35.5c-5.2 0-9.6-3.3-11.3-7.9l-6.5 5C9.6 38.9 16.2 43.5 24 43.5z" />
      <path fill="#1976d2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.3-2.2 4.2-4 5.6l6.4 5.4c-.5.4 6.8-4.9 6.8-15 0-1.2-.1-2.3-.4-3.5z" />
    </svg>
  );
}
