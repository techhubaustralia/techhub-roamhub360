import { verify } from "@/lib/server/token";
import { getBooking, setBookingStatus, audit } from "@/lib/server/db";
import { escapeHtml as esc } from "@/lib/escape-html";

const page = (title: string, msg: string, ok = true) =>
  new Response(
    `<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><div style="font-family:Segoe UI,Arial,sans-serif;max-width:460px;margin:60px auto;text-align:center;color:#102733">
      <div style="font-size:40px">${ok ? "✅" : "⚠️"}</div>
      <h2>${title}</h2><p style="color:#52707b">${msg}</p>
    </div>`,
    { headers: { "Content-Type": "text/html" } },
  );

export async function GET(req: Request) {
  const token = new URL(req.url).searchParams.get("token") || "";
  const t = verify(token);
  if (!t || t.action !== "checkin") return page("Invalid link", "This check-in link is invalid or expired.", false);
  const b = await getBooking(t.bookingId);
  if (!b) return page("Not found", "Booking no longer exists.", false);
  // Atomic compare-and-set: only a still-"Booked" booking can be checked in. This guards the
  // TOCTOU race with the 09:30 auto-cancel job (and any concurrent admin cancel) — a link
  // opened after the booking was cancelled/checked-out can never resurrect a terminal booking.
  const ok = await setBookingStatus(b.id, "Checked in", undefined, "Booked");
  if (!ok) {
    if (b.status === "Checked in") return page("Already checked in", `${esc(b.spaceLabel)} is already confirmed.`);
    return page("Cannot check in", "This booking was cancelled or is no longer active.", false);
  }
  await audit(b.userEmail, "booking.checkin", `${b.spaceLabel} (${t.date})`);
  return page("Checked in", `${esc(b.spaceLabel)} is confirmed for ${esc(b.start.replace("T", " "))}. Enjoy your day.`);
}
