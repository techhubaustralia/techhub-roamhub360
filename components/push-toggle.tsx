"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { BellRing } from "lucide-react";

// VAPID public keys are base64url; the browser wants a Uint8Array.
function urlB64ToUint8Array(base64: string): Uint8Array<ArrayBuffer> {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(b64);
  const out = new Uint8Array(new ArrayBuffer(raw.length)); // ArrayBuffer-backed (satisfies BufferSource)
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

// Opt-in device push notifications. Self-hides unless the browser supports web push AND the
// operator has enabled it (VAPID keys set → /api/push reports configured). Mirrors the Settings
// row styling so it drops into the Notifications section.
export function PushToggle() {
  const [supported] = useState(() =>
    typeof window !== "undefined" && "serviceWorker" in navigator && "PushManager" in window && "Notification" in window,
  );
  const [publicKey, setPublicKey] = useState<string | null>(null);
  const [enabled, setEnabled] = useState(false);
  const [busy, setBusy] = useState(false);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    if (!supported) return;
    let live = true;
    (async () => {
      try {
        const cfg = await fetch("/api/push").then((r) => r.json());
        if (!live) return;
        if (!cfg.configured || !cfg.publicKey) {
          setReady(true);
          return;
        }
        setPublicKey(cfg.publicKey);
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (live) {
          setEnabled(!!sub);
          setReady(true);
        }
      } catch {
        if (live) setReady(true);
      }
    })();
    return () => {
      live = false;
    };
  }, [supported]);

  if (!supported || !ready || !publicKey) return null;

  async function toggle() {
    setBusy(true);
    try {
      const reg = await navigator.serviceWorker.ready;
      if (!enabled) {
        const perm = await Notification.requestPermission();
        if (perm !== "granted") {
          toast.error("Notifications blocked", { description: "Allow notifications for this site in your browser settings." });
          return;
        }
        const sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: urlB64ToUint8Array(publicKey!),
        });
        const json = sub.toJSON() as { endpoint: string; keys: { p256dh: string; auth: string } };
        const res = await fetch("/api/push", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ endpoint: json.endpoint, keys: json.keys }),
        });
        if (!res.ok) throw new Error("save failed");
        setEnabled(true);
        toast.success("Push notifications on", { description: "This device will get booking updates." });
      } else {
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          await fetch("/api/push", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint: sub.endpoint }),
          });
          await sub.unsubscribe();
        }
        setEnabled(false);
        toast.success("Push notifications off");
      }
    } catch {
      toast.error("Could not update notifications");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex items-start justify-between gap-4 border-t px-4 py-4">
      <div className="flex gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-txt-dim">
          <BellRing className="size-[18px]" />
        </span>
        <div>
          <div className="font-semibold">Push notifications on this device</div>
          <p className="mt-0.5 text-[12.5px] text-txt-mute">
            Get instant alerts here when a booking is confirmed or changed — no email needed. On iPhone, add the app to your Home Screen first.
          </p>
        </div>
      </div>
      <button
        role="switch"
        aria-checked={enabled}
        disabled={busy}
        onClick={toggle}
        className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${enabled ? "bg-primary" : "bg-panel-2 border"}`}
      >
        <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${enabled ? "left-[22px]" : "left-0.5"}`} />
      </button>
    </div>
  );
}
