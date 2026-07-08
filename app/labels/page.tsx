import Link from "next/link";
import { headers } from "next/headers";
import { getUser, canAccessBuilding } from "@/lib/server/auth";
import { listCustomBuildings } from "@/lib/server/store";
import { listSpaces } from "@/lib/server/availability";
import { PrintButton } from "@/components/print-button";

export const dynamic = "force-dynamic";

// Printable QR desk-label sheet. An admin picks a building and prints one QR card per space; stick
// each on its desk. Scanning it opens /checkin?b=&s= and checks the scanner into their booking for
// that desk today. Chrome is hidden on print (see .no-print in globals.css).
export default async function LabelsPage({ searchParams }: { searchParams: Promise<{ b?: string }> }) {
  const me = await getUser();
  const isAdmin = me.role === "global-admin" || me.role === "site-admin" || me.platformAdmin;
  if (!isAdmin) {
    return <p className="text-muted-foreground">Only administrators can print check-in labels.</p>;
  }

  const buildings = (await listCustomBuildings()).filter((b) => canAccessBuilding(me, b.id));
  const { b } = await searchParams;
  const selected = b ? buildings.find((x) => x.id === b) : undefined;

  const h = await headers();
  const proto = h.get("x-forwarded-proto") ?? "https";
  const host = h.get("host") ?? "";
  const origin = `${proto}://${host}`;

  const spaces = selected ? await listSpaces(selected.id) : [];

  return (
    <div className="mx-auto max-w-5xl">
      <div className="no-print mb-6 flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-2xl font-semibold">QR check-in labels</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Print, then stick one on each desk. Staff scan it to check in to their booking for that day.
          </p>
        </div>
        {selected && spaces.length > 0 && (
          <PrintButton className="rounded-[10px] bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground" />
        )}
      </div>

      {/* Building picker */}
      <div className="no-print mb-8 flex flex-wrap gap-2">
        {buildings.length === 0 && <p className="text-sm text-muted-foreground">No sites available.</p>}
        {buildings.map((bld) => (
          <Link
            key={bld.id}
            href={`/labels?b=${encodeURIComponent(bld.id)}`}
            className={`rounded-[10px] border px-3 py-1.5 text-sm ${
              selected?.id === bld.id ? "border-primary bg-primary/10 font-medium" : "hover:bg-muted"
            }`}
          >
            {bld.name}
          </Link>
        ))}
      </div>

      {selected && spaces.length === 0 && (
        <p className="no-print text-sm text-muted-foreground">This site has no bookable spaces yet.</p>
      )}

      {selected && spaces.length > 0 && (
        <>
          <p className="no-print mb-4 text-sm text-muted-foreground">
            {spaces.length} label{spaces.length === 1 ? "" : "s"} for <span className="font-medium text-foreground">{selected.name}</span>
          </p>
          <div className="grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 print:grid-cols-3">
            {spaces.map((s) => {
              const url = `${origin}/checkin?b=${encodeURIComponent(selected.id)}&s=${encodeURIComponent(s.key)}`;
              return (
                <div
                  key={s.key}
                  className="flex break-inside-avoid flex-col items-center rounded-[12px] border bg-white p-3 text-center text-[#0a1830]"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={`/api/qr?text=${encodeURIComponent(url)}`} alt={`QR for ${s.label}`} width={150} height={150} className="h-auto w-full max-w-[150px]" />
                  <div className="mt-2 text-sm font-semibold">{s.label}</div>
                  <div className="text-[11px] uppercase tracking-wide text-[#52707b]">Scan to check in</div>
                </div>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
