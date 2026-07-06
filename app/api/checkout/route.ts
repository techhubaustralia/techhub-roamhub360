import { verify } from "@/lib/server/token";
import { getBooking, setBookingStatus, audit } from "@/lib/server/db";
import { escapeHtml as esc } from "@/lib/escape-html";

const page = (title: string, msg: string, ok = true) =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:60px auto;text-align:center;color:#102733">
      <div style="font-size:40px">${ok ? "👋" : "⚠️"}</div>
      <h2>${title}</h2><p style="color:#52707b">${msg}</p>
    </div>`,
    { headers: { "Content-Type": "text/html" } },
  );

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const t = verify(token);
  if (!t || t.action !== "checkout") return page("Invalid link", "This check-out link is invalid or expired.", false);
  const b = await getBooking(t.bookingId);
  if (!b) return page("Not found", "Booking no longer exists.", false);
  // Atomic compare-and-set: only a "Checked in" booking can be checked out. Without this a stale
  // link could flip a cancelled/declined/already-checked-out (terminal) booking to "Checked out"
  // and write a misleading audit entry.
  const ok = await setBookingStatus(b.id, "Checked out", undefined, "Checked in");
  if (!ok) {
    if (b.status === "Checked out") return page("Already checked out", `${esc(b.spaceLabel)} was already released.`);
    return page("Cannot check out", "This booking is not checked in — it may have been cancelled or already closed.", false);
  }
  await audit(b.userEmail, "booking.checkout", `${b.spaceLabel} (${t.date})`);
  return page("Checked out", `${esc(b.spaceLabel)} released. Thanks!`);
}
