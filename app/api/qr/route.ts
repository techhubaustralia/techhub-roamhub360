import QRCode from "qrcode";
import { getUser } from "@/lib/server/auth";

// Renders a QR code as SVG for a given text (used by the printable desk-label page). Signed-in
// only. Returns image/svg+xml so it can be dropped straight into an <img src>. The QR just encodes
// a URL — no secrets — so any authenticated user may generate one.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const me = await getUser();
  if (!me.email) return new Response("Unauthorized", { status: 401 });

  const text = new URL(req.url).searchParams.get("text") ?? "";
  if (!text || text.length > 512) return new Response("Bad request", { status: 400 });

  const svg = await QRCode.toString(text, {
    type: "svg",
    margin: 1,
    errorCorrectionLevel: "M",
    color: { dark: "#0a1830", light: "#ffffff" },
  });

  return new Response(svg, {
    headers: { "Content-Type": "image/svg+xml", "Cache-Control": "public, max-age=86400" },
  });
}
