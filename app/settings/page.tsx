"use client";

import { useEffect, useState } from "react";
import { toast } from "sonner";
import { Eye, Bell } from "lucide-react";
import { getPrefs, updatePrefs, type UserPrefs } from "@/lib/api";
import { PageHeader } from "@/components/page-header";
import { PushToggle } from "@/components/push-toggle";

function Toggle({ on, disabled, onChange }: { on: boolean; disabled?: boolean; onChange: () => void }) {
  return (
    <button
      role="switch"
      aria-checked={on}
      disabled={disabled}
      onClick={onChange}
      className={`relative h-6 w-11 shrink-0 rounded-full transition-colors disabled:opacity-50 ${on ? "bg-primary" : "bg-panel-2 border"}`}
    >
      <span className={`absolute top-0.5 size-5 rounded-full bg-white shadow transition-all ${on ? "left-[22px]" : "left-0.5"}`} />
    </button>
  );
}

function Row({ icon: Icon, title, desc, on, saving, onToggle }: { icon: typeof Eye; title: string; desc: string; on: boolean; saving: boolean; onToggle: () => void }) {
  return (
    <div className="flex items-start justify-between gap-4 px-4 py-4">
      <div className="flex gap-3">
        <span className="mt-0.5 grid size-9 shrink-0 place-items-center rounded-full bg-panel-2 text-txt-dim"><Icon className="size-[18px]" /></span>
        <div>
          <div className="font-semibold">{title}</div>
          <p className="mt-0.5 text-[12.5px] text-txt-mute">{desc}</p>
        </div>
      </div>
      <Toggle on={on} disabled={saving} onChange={onToggle} />
    </div>
  );
}

export default function SettingsPage() {
  const [prefs, setPrefs] = useState<UserPrefs | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getPrefs().then((p) => setPrefs(p ?? { hidePresence: false, notifyPresence: false }));
  }, []);

  async function toggle(key: keyof UserPrefs) {
    if (!prefs) return;
    const next = !prefs[key];
    setPrefs({ ...prefs, [key]: next }); // optimistic
    setSaving(true);
    const res = await updatePrefs({ [key]: next });
    setSaving(false);
    if (res.ok && res.prefs) {
      setPrefs(res.prefs);
      toast.success("Preferences saved");
    } else {
      setPrefs({ ...prefs, [key]: !next }); // revert
      toast.error("Could not save", { description: res.error });
    }
  }

  return (
    <div className="animate-fade-up max-w-2xl">
      <PageHeader title="Settings" subtitle="Control your visibility and notifications." />

      <section className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
        <div className="border-b bg-panel-2/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Privacy</div>
        <Row
          icon={Eye}
          title={`Show me on "Who's in"`}
          desc="When on, colleagues in your workspace can see that you're booked or checked in on a given day. When off, only you can see your own bookings there."
          on={!(prefs?.hidePresence ?? false)}
          saving={saving || !prefs}
          onToggle={() => toggle("hidePresence")}
        />
      </section>

      <section className="mt-5 overflow-hidden rounded-[14px] border bg-card shadow-sm">
        <div className="border-b bg-panel-2/60 px-4 py-2.5 text-[11px] font-semibold uppercase tracking-[0.05em] text-txt-mute">Notifications</div>
        <Row
          icon={Bell}
          title="Daily “who's in” digest"
          desc="Get a morning email listing which colleagues are booked at your site today, so you can plan when to come in. Sent only on days you have a booking."
          on={prefs?.notifyPresence ?? false}
          saving={saving || !prefs}
          onToggle={() => toggle("notifyPresence")}
        />
        <PushToggle />
      </section>
    </div>
  );
}
