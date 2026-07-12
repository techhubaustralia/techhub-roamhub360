import { NextResponse } from "next/server";
import { verifyConnectState, saveOrgSso } from "@/lib/server/entra-sso";
import { workspaceOrigin } from "@/lib/server/tenant";
import { audit } from "@/lib/server/db";

// Microsoft redirects here after the admin-consent screen (on the MAIN host — this exact URL is a
// registered redirect URI on the platform's Entra app). Public route: the IT admin who consents may
// have no session here. Integrity comes from the HMAC-signed `state` we issued minutes earlier;
// the directory id (`tenant`) is supplied by Microsoft in the redirect.
export const runtime = "nodejs";

export async function GET(req: Request) {
  const q = new URL(req.url).searchParams;
  const st = verifyConnectState(q.get("state") || "");
  // Without a valid state we don't even know which workspace to bounce back to — plain error.
  if (!st) return NextResponse.json({ error: "This connection link has expired. Start again from Settings → Microsoft integration." }, { status: 400 });

  const back = (params: string) => NextResponse.redirect(`${workspaceOrigin(st.tenantId)}/admin/integration?${params}`);

  if (q.get("error")) {
    // Admin declined (or Entra error). Send them back with the reason, never a dead end.
    return back(`sso=error&msg=${encodeURIComponent(q.get("error_description") || q.get("error") || "Consent was not granted.")}`);
  }
  const tid = q.get("tenant") || "";
  const consented = (q.get("admin_consent") || "").toLowerCase() === "true";
  if (!consented || !tid) return back(`sso=error&msg=${encodeURIComponent("Microsoft did not confirm organisation consent.")}`);

  try {
    await saveOrgSso(st.tenantId, tid, st.byEmail);
    await audit(st.byEmail, "sso.org.connect", `entra:${tid}`);
    return back("sso=connected");
  } catch (e) {
    return back(`sso=error&msg=${encodeURIComponent(e instanceof Error ? e.message : "Could not save the connection.")}`);
  }
}
