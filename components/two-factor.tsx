"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { ShieldCheck } from "lucide-react";

// Self-service two-factor (TOTP) enrolment. Self-hides for SSO-only accounts (no local password).
export function TwoFactor() {
  const [state, setState] = useState<{ enabled: boolean; available: boolean } | null>(null);
  const [setup, setSetup] = useState<{ qr: string; secret: string } | null>(null);
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);

  const load = () => fetch("/api/me/2fa").then((r) => r.json()).then(setState).catch(() => setState({ enabled: false, available: false }));
  useEffect(() => {
    load();
  }, []);

  if (!state || !state.available) return null;

  async function start() {
    setBusy(true);
    const r = await fetch("/api/me/2fa", { method: "POST" }).then((x) => x.json()).catch(() => null);
    setBusy(false);
    if (r?.qr) setSetup({ qr: r.qr, secret: r.secret });
    else toast.error("Could not start setup");
  }
  async function confirm() {
    setBusy(true);
    const r = await fetch("/api/me/2fa", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token: code }) });
    setBusy(false);
    if (r.ok) {
      toast.success("Two-factor authentication is on");
      setSetup(null);
      setCode("");
      load();
    } else toast.error("Code didn't match", { description: (await r.json().catch(() => ({}))).error });
  }
  async function disable() {
    const token = window.prompt("Enter a current authenticator code to turn off two-factor:");
    if (token == null) return;
    setBusy(true);
    const r = await fetch("/api/me/2fa", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ token }) });
    setBusy(false);
    if (r.ok) {
      toast.success("Two-factor turned off");
      load();
    } else toast.error("Couldn't turn off", { description: (await r.json().catch(() => ({}))).error });
  }

  return (
    <div className="flex items-start justify-between gap-4 border-t px-4 py-4">
      <div className="flex gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-txt-dim">
          <ShieldCheck className="size-[18px]" />
        </span>
        <div className="w-full">
          <div className="font-semibold">Two-factor authentication {state.enabled && <span className="ml-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-semibold text-emerald-500">On</span>}</div>
          <p className="mt-0.5 text-[12.5px] text-txt-mute">Add a one-time code from an authenticator app (Google/Microsoft Authenticator, 1Password…) on top of your password.</p>

          {state.enabled ? (
            <button onClick={disable} disabled={busy} className="mt-3 w-fit rounded-[10px] border border-destructive/50 px-4 py-2 text-[13px] font-semibold text-destructive hover:bg-destructive/10 disabled:opacity-50">
              Turn off
            </button>
          ) : setup ? (
            <div className="mt-3 max-w-sm">
              <p className="text-[12.5px] text-txt-mute">Scan this with your authenticator app, then enter the 6-digit code to confirm.</p>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={setup.qr} alt="2FA QR code" className="mt-2 size-40 rounded-lg border bg-white p-1" />
              <p className="mt-1 break-all text-[11px] text-txt-mute">Or enter manually: <span className="font-mono">{setup.secret}</span></p>
              <div className="mt-2 flex gap-2">
                <input inputMode="numeric" value={code} onChange={(e) => setCode(e.target.value.replace(/\D/g, "").slice(0, 6))} placeholder="123456" className="ed-input tracking-[0.3em]" />
                <button onClick={confirm} disabled={busy || code.length !== 6} className="shrink-0 rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">Verify &amp; enable</button>
              </div>
            </div>
          ) : (
            <button onClick={start} disabled={busy} className="mt-3 w-fit rounded-[10px] bg-primary px-4 py-2 text-[13px] font-semibold text-primary-foreground disabled:opacity-50">
              {busy ? "Starting…" : "Set up two-factor"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
