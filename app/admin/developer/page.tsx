"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Copy, KeyRound, Webhook, Trash2, Plus, MessageSquare } from "lucide-react";
import { PageHeader } from "@/components/page-header";

interface ApiKeyPublic { id: string; name: string; prefix: string; createdAt: string; lastUsedAt?: string }
interface WebhookEndpoint { id: string; url: string; secret: string; events: string[]; createdAt: string }
interface Integrations { endpoints: WebhookEndpoint[]; slackUrl?: string }

const EVENTS = ["booking.created", "booking.updated", "booking.cancelled", "booking.checkin"];

function copy(text: string) {
  navigator.clipboard?.writeText(text).then(
    () => toast.success("Copied"),
    () => toast.error("Copy failed"),
  );
}

const card = "overflow-hidden rounded-[14px] border bg-card shadow-sm";
const head = "flex items-center gap-2 border-b bg-panel-2/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute";
const btn = "inline-flex items-center gap-1.5 rounded-[10px] bg-primary px-3 py-1.5 text-sm font-semibold text-primary-foreground disabled:opacity-50";
const ghost = "inline-flex items-center gap-1.5 rounded-[10px] border px-2.5 py-1.5 text-sm hover:bg-panel-2";

export default function DeveloperPage() {
  const [origin, setOrigin] = useState("");
  const [keys, setKeys] = useState<ApiKeyPublic[] | null>(null);
  const [newName, setNewName] = useState("");
  const [freshKey, setFreshKey] = useState<string | null>(null);
  const [integ, setInteg] = useState<Integrations | null>(null);
  const [hookUrl, setHookUrl] = useState("");
  const [hookEvents, setHookEvents] = useState<string[]>([]);
  const [slack, setSlack] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    setOrigin(window.location.origin);
    fetch("/api/admin/apikeys").then((r) => r.json()).then((d) => setKeys(d.keys ?? []));
    fetch("/api/admin/webhooks").then((r) => r.json()).then((d: Integrations) => {
      setInteg(d);
      setSlack(d.slackUrl ?? "");
    });
  }, []);

  async function createKey() {
    setBusy(true);
    const res = await fetch("/api/admin/apikeys", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ name: newName }) });
    setBusy(false);
    if (!res.ok) return toast.error("Could not create key");
    const d = await res.json();
    setFreshKey(d.key);
    setNewName("");
    setKeys((k) => [...(k ?? []), d.record]);
  }
  async function revokeKey(id: string) {
    setKeys((k) => (k ?? []).filter((x) => x.id !== id));
    await fetch("/api/admin/apikeys", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    toast.success("Key revoked");
  }
  async function addHook() {
    setBusy(true);
    const res = await fetch("/api/admin/webhooks", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ url: hookUrl, events: hookEvents }) });
    setBusy(false);
    if (!res.ok) return toast.error((await res.json()).error ?? "Could not add webhook");
    const ep = await res.json();
    setInteg((i) => ({ endpoints: [...(i?.endpoints ?? []), ep], slackUrl: i?.slackUrl }));
    setHookUrl("");
    setHookEvents([]);
  }
  async function removeHook(id: string) {
    setInteg((i) => ({ endpoints: (i?.endpoints ?? []).filter((e) => e.id !== id), slackUrl: i?.slackUrl }));
    await fetch("/api/admin/webhooks", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ id }) });
    toast.success("Webhook removed");
  }
  async function saveSlack() {
    setBusy(true);
    const res = await fetch("/api/admin/webhooks", { method: "PUT", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ slackUrl: slack || null }) });
    setBusy(false);
    if (res.ok) toast.success(slack ? "Slack connected" : "Slack disconnected");
  }

  return (
    <div className="animate-fade-up max-w-3xl">
      <PageHeader title="Developer & API" subtitle="Automate RoamHub360 — REST API, webhooks and Slack." />

      {/* API keys */}
      <section className={card}>
        <div className={head}><KeyRound className="size-3.5" /> API keys</div>
        <div className="p-4">
          <p className="text-[13px] text-txt-mute">
            Call the REST API at <code className="rounded bg-panel-2 px-1.5 py-0.5">{origin || "https://your-workspace.roamhub360.com"}/api/v1</code> with{" "}
            <code className="rounded bg-panel-2 px-1.5 py-0.5">Authorization: Bearer &lt;key&gt;</code>. Endpoints: <code>/bookings</code>, <code>/spaces</code>, <code>/availability?date=yyyy-mm-dd</code>.
          </p>

          {freshKey && (
            <div className="mt-3 rounded-[10px] border border-emerald-500/40 bg-emerald-500/10 p-3">
              <div className="text-[12.5px] font-semibold text-emerald-500">Copy your key now — it won't be shown again.</div>
              <div className="mt-2 flex items-center gap-2">
                <code className="min-w-0 flex-1 truncate rounded bg-panel-2 px-2 py-1.5 text-[13px]">{freshKey}</code>
                <button className={ghost} onClick={() => copy(freshKey)}><Copy className="size-4" /></button>
              </div>
            </div>
          )}

          <div className="mt-3 flex gap-2">
            <input value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Key name (e.g. Zapier)" className="min-w-0 flex-1 rounded-[10px] border bg-transparent px-3 py-1.5 text-sm" />
            <button className={btn} disabled={busy} onClick={createKey}><Plus className="size-4" /> Create key</button>
          </div>

          <div className="mt-4 divide-y">
            {keys?.length === 0 && <p className="text-[13px] text-txt-mute">No keys yet.</p>}
            {keys?.map((k) => (
              <div key={k.id} className="flex items-center justify-between gap-3 py-2.5">
                <div className="min-w-0">
                  <div className="truncate text-sm font-medium">{k.name} <span className="font-normal text-txt-mute">· {k.prefix}…</span></div>
                  <div className="text-[11.5px] text-txt-mute">Added {k.createdAt.slice(0, 10)}{k.lastUsedAt ? ` · last used ${k.lastUsedAt.slice(0, 10)}` : " · never used"}</div>
                </div>
                <button className={ghost} onClick={() => revokeKey(k.id)}><Trash2 className="size-4" /> Revoke</button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Webhooks */}
      <section className={`${card} mt-5`}>
        <div className={head}><Webhook className="size-3.5" /> Webhooks</div>
        <div className="p-4">
          <p className="text-[13px] text-txt-mute">
            We POST a signed JSON payload to your URL on booking events. Verify the{" "}
            <code className="rounded bg-panel-2 px-1.5 py-0.5">X-RoamHub-Signature: sha256=…</code> header (HMAC of the raw body with the endpoint secret).
          </p>

          <div className="mt-3 flex flex-wrap gap-2">
            {EVENTS.map((ev) => {
              const on = hookEvents.includes(ev);
              return (
                <button key={ev} onClick={() => setHookEvents((s) => (on ? s.filter((x) => x !== ev) : [...s, ev]))}
                  className={`rounded-full border px-2.5 py-1 text-[12px] ${on ? "border-primary bg-primary/10 font-medium" : "hover:bg-panel-2"}`}>
                  {ev}
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-2">
            <input value={hookUrl} onChange={(e) => setHookUrl(e.target.value)} placeholder="https://example.com/webhooks/roamhub" className="min-w-0 flex-1 rounded-[10px] border bg-transparent px-3 py-1.5 text-sm" />
            <button className={btn} disabled={busy || !hookUrl} onClick={addHook}><Plus className="size-4" /> Add</button>
          </div>
          <p className="mt-1 text-[11.5px] text-txt-mute">No events selected = all events.</p>

          <div className="mt-4 divide-y">
            {integ?.endpoints.map((e) => (
              <div key={e.id} className="py-2.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="min-w-0 truncate text-sm font-medium">{e.url}</div>
                  <button className={ghost} onClick={() => removeHook(e.id)}><Trash2 className="size-4" /></button>
                </div>
                <div className="mt-1 text-[11.5px] text-txt-mute">{e.events.join(", ")}</div>
                <div className="mt-1 flex items-center gap-2">
                  <code className="min-w-0 flex-1 truncate rounded bg-panel-2 px-2 py-1 text-[12px]">{e.secret}</code>
                  <button className={ghost} onClick={() => copy(e.secret)}><Copy className="size-3.5" /></button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Slack */}
      <section className={`${card} mt-5`}>
        <div className={head}><MessageSquare className="size-3.5" /> Slack</div>
        <div className="p-4">
          <p className="text-[13px] text-txt-mute">Paste a Slack Incoming Webhook URL to post booking activity to a channel.</p>
          <div className="mt-3 flex gap-2">
            <input value={slack} onChange={(e) => setSlack(e.target.value)} placeholder="https://hooks.slack.com/services/…" className="min-w-0 flex-1 rounded-[10px] border bg-transparent px-3 py-1.5 text-sm" />
            <button className={btn} disabled={busy} onClick={saveSlack}>Save</button>
          </div>
        </div>
      </section>
    </div>
  );
}
