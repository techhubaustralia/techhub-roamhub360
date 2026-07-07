"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Plug, CheckCircle2, XCircle, KeyRound } from "lucide-react";
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

export default function IntegrationPage() {
  const [status, setStatus] = useState<IntegrationStatus | null>(null);
  const [encOk, setEncOk] = useState(true);
  const [azureTenantId, setAzureTenantId] = useState("");
  const [graphClientId, setGraphClientId] = useState("");
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
    }
    setLoading(false);
  }
  useEffect(() => {
    load();
  }, []);

  async function save() {
    if (azureTenantId && !GUIDISH.test(azureTenantId)) return toast.error("Directory (tenant) ID doesn't look right");
    if (graphClientId && !GUIDISH.test(graphClientId)) return toast.error("Client ID doesn't look right");
    setBusy("save");
    const res = await saveIntegrationApi({ azureTenantId, graphClientId, ...(secret ? { secret } : {}) });
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

      {/* Connection status */}
      <div className="mb-4 flex items-center gap-3 rounded-[12px] border bg-card px-4 py-3">
        {S?.configured ? (
          S.lastTestOk ? <CheckCircle2 className="size-5 text-ok" /> : <Plug className="size-5 text-amber" />
        ) : (
          <Plug className="size-5 text-txt-mute" />
        )}
        <div className="flex-1 text-[13px]">
          <div className="font-semibold">
            {S?.configured ? (S.lastTestOk ? "Connected" : "Configured — not yet tested") : "Not connected"}
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
      </div>
    </div>
  );
}
