"use client";

import { useEffect, useState } from "react";
import { Shield, Download } from "lucide-react";
import { PageHeader } from "@/components/page-header";

interface Entry { at: string; actor: string; action: string; detail?: string; target?: string; ip?: string }

const LABEL: Record<string, string> = {
  "booking.create": "Booked a space",
  "booking.edit": "Rescheduled a booking",
  "booking.status": "Changed a booking status",
  "booking.admin-cancel": "Cancelled a booking (admin)",
  "booking.auto-cancel": "Auto-cancelled (no check-in)",
  "booking.auto-checkout": "Auto checked-out",
  "booking.checkin": "Checked in",
  "booking.checkout": "Checked out",
  "space.remove": "Removed a space (bookings cancelled)",
  "building.delete": "Removed a building",
  "building.restore": "Restored a building",
  "building.floors.set": "Updated floors",
  "plan.image.upload": "Uploaded a floor plan",
  "role.set": "Set a role",
  "role.revert": "Reverted a role",
  "desk.assign": "Assigned a permanent desk",
  "desk.unassign": "Released a permanent desk",
};

export default function AuditPage() {
  const [rows, setRows] = useState<Entry[] | null>(null);
  const [forbidden, setForbidden] = useState(false);
  const [errDetail, setErrDetail] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/audit").then(async (r) => {
      if (r.status === 403) { setForbidden(true); return []; }
      if (!r.ok) { const b = await r.json().catch(() => ({})); setErrDetail(b.detail || b.error || `HTTP ${r.status}`); return []; }
      return r.json();
    }).then((d) => setRows(d || [])).catch((e) => { setErrDetail(String(e)); setRows([]); });
  }, []);

  if (forbidden) {
    return (
      <div className="animate-fade-up">
        <PageHeader title="Activity log" subtitle="System audit trail" />
        <div className="rounded-[14px] border bg-card p-8 text-center shadow-sm">
          <Shield className="mx-auto mb-3 size-7 text-txt-mute" />
          <p className="text-[14px] font-semibold">Global Admin access required</p>
        </div>
      </div>
    );
  }

  return (
    <div className="animate-fade-up">
      <PageHeader
        title="Activity log"
        subtitle="Recent administrative and booking activity (latest 200)"
        action={
          <a
            href="/api/audit?format=csv"
            className="inline-flex items-center gap-1.5 rounded-[10px] border bg-card px-3 py-1.5 text-[12.5px] font-medium shadow-sm hover:bg-panel-2"
          >
            <Download className="size-3.5" /> Export CSV
          </a>
        }
      />
      {errDetail && (
        <div className="mb-4 rounded-[14px] border border-destructive/40 bg-destructive/10 p-4 text-[12.5px] text-destructive">
          <b className="font-semibold">Activity log unavailable.</b> {errDetail}
          {/AuditLog|Invalid object/i.test(errDetail) && <div className="mt-1 text-txt-mute">The AuditLog table is missing — run <code>prisma db push</code> against the production database to create it.</div>}
        </div>
      )}
      <div className="overflow-hidden rounded-[14px] border bg-card shadow-sm">
        <table className="w-full border-collapse text-[13px]">
          <thead>
            <tr className="text-left text-[10.5px] uppercase tracking-[0.05em] text-txt-mute">
              <th className="border-b px-3 py-2.5">When</th>
              <th className="border-b px-3 py-2.5">Who</th>
              <th className="border-b px-3 py-2.5">Action</th>
              <th className="border-b px-3 py-2.5">Detail</th>
            </tr>
          </thead>
          <tbody>
            {rows === null ? (
              <tr><td colSpan={4} className="px-3 py-10 text-center text-[12.5px] text-txt-mute">Loading…</td></tr>
            ) : rows.length === 0 ? (
              <tr><td colSpan={4} className="px-3 py-10 text-center text-[12.5px] text-txt-mute">No activity recorded yet.</td></tr>
            ) : (
              rows.map((e, i) => (
                <tr key={i} className="hover:bg-panel-2">
                  <td className="whitespace-nowrap border-b px-3 py-2.5 text-txt-mute">{e.at.replace("T", " ").slice(0, 16)}</td>
                  <td className="border-b px-3 py-2.5">{e.actor}</td>
                  <td className="border-b px-3 py-2.5 font-semibold">{LABEL[e.action] ?? e.action}</td>
                  <td className="border-b px-3 py-2.5 text-txt-mute">{e.detail}</td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
