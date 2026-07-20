"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plug, CheckCircle2, XCircle, KeyRound, Building2, ShieldCheck, ChevronDown, ChevronRight } from "lucide-react";
import { getIntegration, saveIntegrationApi, testIntegrationApi, type IntegrationStatus } from "@/lib/api";
import { PageHeader } from "@/components/page-header";

const GUIDISH = /^[0-9a-fA-F-]{30,40}$/;

function relTime(iso: string | null): string {
  if (!iso) return "never";
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins} min ago`;
  const hrs = Math.round(mins / 60);
  return hrs < 24 ? `${hrs} h ago` : `${Math.round(hrs / 24)} d ago`;
}

interface OrgSso {
  connected: boolean;
  entraTenantId: string | null;
  connectedAt: string | null;
  connectedBy: string | null;
  platformReady: boolean;
}

export default function IntegrationPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [orgSso, setOrgSso] = useState<OrgSso | null>(null);
  const [showAdvanced, setShowAdvanced] = useState(false);
  const [encOk, setEncOk] = useState(true);
  const [azureTenantId, setAzureTenantId] = useState("");
  const [graphClientId, setGraphClientId] = useState("");
  const [mailFrom, setMailFrom] = useState("");
  const [secret, setSecret] = useState("");
  const [busy, setBusy] = useState<"" | "save" | "test">("");
  const [loading, setLoading] = useState(true);

  async function load() {
    const r = await getIntegration();
    if (r) {
      setStatus(r.status);
      setEncOk(r.encryptionAvailable);
      setAzureTenantId(r.status.azureTenantId ?? "");
      setGraphClientId(r.status.graphClientId ?? "");
      setMailFrom(r.status.mailFrom ?? "");
    }
    setLoading(false);
  }
  async function loadOrgSso() {
    const r = await fetch("/api/admin/entra").then((x) => (x.ok ? x.json() : null)).catch(() => null);
    if (r) setOrgSso(r);
  }

  useEffect(() => {
    load();
    loadOrgSso();
    // Landing back from the Microsoft consent screen (?sso=connected / ?sso=error&msg=…)
    const q = new URLSearchParams(window.location.search);
    const sso = q.get("sso");
    if (sso === "connected") toast.success("Organisation connected", { description: "Your team can now sign in with Microsoft — no invites needed." });
    else if (sso === "error") toast.error("Connection failed", { description: q.get("msg") ?? "Consent was not granted." });
    if (sso) window.history.replaceState(null, "", window.location.pathname);
  }, []);

  async function disconnectOrgSso() {
    if (!confirm("Disconnect organisation sign-in? New colleagues will need an invite to join.")) return;
    const r = await fetch("/api/admin/entra", { method: "DELETE" }).catch(() => null);
    if (r?.ok) {
      toast.success("Disconnected");
      loadOrgSso();
    } else toast.error("Could not disconnect");
  }

  async function save() {
    if (azureTenantId && !GUIDISH.test(azureTenantId)) return toast.error("Directory (tenant) ID doesn't look right");
    if (graphClientId && !GUIDISH.test(graphClientId)) return toast.error("Client ID doesn't look right");
    setBusy("save");
    const res = await saveIntegrationApi({ azureTenantId, graphClientId, mailFrom, ...(secret ? { secret } : {}) });
    setBusy("");
    if (res.ok) {
      setSecret("");
      if (res.status) setStatus(res.status);
      toast.success("Saved", { description: "Microsoft connection updated." });
    } else {
      toast.error("Could not save", { description: res.error });
    }
  }

  async function test() {
    setBusy("test");
    const res = await testIntegrationApi();
    setBusy("");
    if (res.status) setStatus(res.status);
    if (res.result?.ok) toast.success("Connection OK", { description: res.result.sampleName ? `Read ${res.result.sampleName} from your directory.` : "Directory reachable." });
    else toast.error("Connection failed", { description: res.result?.error ?? res.error });
  }

  const S = status;

  return (
    <div className="animate-fade-up max-w-2xl">
      <PageHeader title="Microsoft integration" subtitle="Connect your organisation's Microsoft 365 so RoamHub360 can sync your directory and send calendar invites — using your own Entra app." />

      {!loading && !encOk && (
        <div className="mb-4 rounded-[12px] border border-destructive/40 bg-destructive/10 px-4 py-3 text-[13px]">
          Secret storage isn&apos;t configured on the server (<code>CREDENTIAL_KEY</code> missing), so credentials can&apos;t be saved securely. Ask your administrator to set it.
        </div>
      )}

      {/* Org sign-in (Entra admin consent) — the one-click path */}
      <div className="mb-4 rounded-[14px] border bg-card p-5 shadow-sm">
        <div className="flex items-start gap-3">
          <span className="grid size-10 shrink-0 place-items-center rounded-[11px] bg-primary/12 text-primary"><Building2 className="size-5" /></span>
          <div className="min-w-0 flex-1">
            <div className="text-[14.5px] font-bold">Company sign-in with Microsoft</div>
            <p className="mt-0.5 text-[12.5px] leading-relaxed text-txt-mute">
              One click for your IT admin: approve RoamHub360 for your organisation, and everyone in your company can
              sign in with their Microsoft account — no invites, no passwords.
            </p>
            {orgSso?.connected ? (
              <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12.5px]">
                <span className="inline-flex items-center gap-1.5 font-semibold text-ok"><ShieldCheck className="size-4" /> Connected to your organisation</span>
                <span className="text-txt-mute">directory <code className="text-[11.5px]">{orgSso.entraTenantId?.slice(0, 8)}…</code>{orgSso.connectedBy ? ` · by ${orgSso.connectedBy}` : ""}{orgSso.connectedAt ? ` · ${relTime(orgSso.connectedAt)}` : ""}</span>
              </div>
            ) : null}
            <div className="mt-3 flex flex-wrap gap-2">
              {orgSso?.connected ? (
                <button onClick={disconnectOrgSso} className="rounded-[10px] border border-destructive/50 px-3 py-2 text-[12.5px] font-semibold text-destructive hover:bg-destructive/10">
                  Disconnect organisation
                </button>
              ) : (
                <a
                  href="/api/admin/entra/connect"
                  aria-disabled={orgSso ? !orgSso.platformReady : false}
                  className={`rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft ${orgSso && !orgSso.platformReady ? "pointer-events-none opacity-50" : ""}`}
                >
                  Connect your organisation
                </a>
              )}
            </div>
            {orgSso && !orgSso.platformReady && !orgSso.connected && (
              <p className="mt-2 text-[11.5px] text-txt-mute">Microsoft sign-in isn&apos;t enabled on this platform yet — contact support.</p>
            )}
            <p className="mt-2 text-[11.5px] text-txt-mute">
              Requires a Microsoft 365 admin. They&apos;ll see Microsoft&apos;s &quot;Permissions requested — consent on behalf of your
              organization&quot; screen; after approving, staff sign-in is automatic.
            </p>
          </div>
        </div>
      </div>

      {/* OPTIONAL extras. Previously this sat bare under the sign-in card showing "Not connected",
          which read as though the integration had failed even when company sign-in was connected.
          It's a SEPARATE, optional capability — collapsed and labelled as such. */}
      <button
        onClick={() => setShowAdvanced((s) => !s)}
        className="mb-4 flex w-full items-center gap-3 rounded-[12px] border bg-card px-4 py-3 text-left"
      >
        <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-panel-2 text-txt-dim"><Plug className="size-4" /></span>
        <span className="min-w-0 flex-1">
          <span className="block text-[13.5px] font-semibold">
            Directory sync &amp; calendar invites <span className="ml-1 rounded-full bg-panel-2 px-2 py-0.5 text-[10.5px] font-semibold uppercase tracking-wide text-txt-mute">Optional</span>
          </span>
          <span className="mt-0.5 block text-[12px] text-txt-mute">
            {S?.configured
              ? S.lastTestOk ? "Set up and working." : "Set up — not yet tested."
              : "Not set up. Everything above still works without this — it only adds staff photos/departments on Who's in, and Outlook calendar invites."}
          </span>
        </span>
        {showAdvanced ? <ChevronDown className="size-4 shrink-0 text-txt-mute" /> : <ChevronRight className="size-4 shrink-0 text-txt-mute" />}
      </button>

      {showAdvanced && (
      <>
      <div className="mb-4 flex items-center gap-3 rounded-[12px] border bg-card px-4 py-3">
        {S?.configured ? (
          S.lastTestOk ? <CheckCircle2 className="size-5 text-ok" /> : <Plug className="size-5 text-amber" />
        ) : (
          <Plug className="size-5 text-txt-mute" />
        )}
        <div className="flex-1 text-[13px]">
          <div className="font-semibold">
            {S?.configured ? (S.lastTestOk ? "Connected" : "Configured — not yet tested") : "Not set up"}
          </div>
          <div className="text-[12px] text-txt-mute">
            {S?.lastTestAt ? `Last test: ${relTime(S.lastTestAt)}${S.lastTestOk === false && S.lastTestError ? ` — ${S.lastTestError}` : ""}` : "Enter your app details below, then Test connection."}
          </div>
        </div>
        <button onClick={test} disabled={!S?.configured || busy !== ""} className="rounded-[10px] border bg-panel-2 px-3 py-2 text-[13px] font-semibold hover:border-primary disabled:opacity-50">
          {busy === "test" ? "Testing…" : "Test connection"}
        </button>
      </div>

      <div className="rounded-[14px] border bg-card p-5 shadow-sm">
        <div className="flex flex-col gap-4">
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Directory (tenant) ID</span>
            <input value={azureTenantId} onChange={(e) => setAzureTenantId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="ed-input font-mono text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Application (client) ID</span>
            <input value={graphClientId} onChange={(e) => setGraphClientId(e.target.value)} placeholder="00000000-0000-0000-0000-000000000000" className="ed-input font-mono text-[13px]" />
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">
              Client secret {S?.hasSecret && <span className="ml-1 inline-flex items-center gap-1 text-ok"><KeyRound className="size-3" /> saved</span>}
            </span>
            <input type="password" value={secret} onChange={(e) => setSecret(e.target.value)} placeholder={S?.hasSecret ? "•••••••• (leave blank to keep)" : "Paste the secret value"} className="ed-input font-mono text-[13px]" autoComplete="new-password" />
            <span className="mt-1 block text-[11.5px] text-txt-mute">Stored encrypted. It&apos;s never shown again after saving.</span>
          </label>
          <label className="block">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Notifications sender (mailbox)</span>
            <input value={mailFrom} onChange={(e) => setMailFrom(e.target.value)} placeholder="bookings@yourcompany.com" className="ed-input text-[13px]" />
            <span className="mt-1 block text-[11.5px] text-txt-mute">A mailbox in your tenant that RoamHub360 sends confirmations and reminders from (needs Mail.Send).</span>
          </label>

          <div className="flex gap-2">
            <button onClick={save} disabled={busy !== "" || !encOk} className="rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground hover:bg-orange-soft disabled:opacity-50">
              {busy === "save" ? "Saving…" : "Save"}
            </button>
          </div>
        </div>
      </div>

      <div className="mt-4 rounded-[12px] border bg-panel-2/40 px-4 py-3 text-[12.5px] text-txt-dim">
        <div className="mb-1 flex items-center gap-1.5 font-semibold text-foreground"><XCircle className="hidden" />Setup in Azure</div>
        Register an app in <b>Microsoft Entra ID → App registrations</b>, add the <b>application</b> permissions
        <code> User.Read.All</code> (directory sync) and, for calendar invites, <code>Calendars.ReadWrite</code> +
        <code> Mail.Send</code>, then <b>Grant admin consent</b> and create a <b>client secret</b>. Paste the three values above.
        <div className="mt-2 text-[11.5px]">
          Why separate from the one-click above? Sign-in consent is <b>delegated</b> (acts as the signed-in person).
          Directory sync and calendar invites run in the background, which Microsoft requires <b>application</b>
          permissions for — those can only be granted on your own app registration.
        </div>
      </div>
      </>
      )}
    </div>
  );
}
