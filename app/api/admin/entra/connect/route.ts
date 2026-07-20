import { NextResponse } from "next/server";
import { getUser } from "@/lib/server/auth";
import { currentTenantId, DEFAULT_TENANT } from "@/lib/server/tenant";
import { signConnectState } from "@/lib/server/entra-sso";

// Starts the Entra ADMIN CONSENT flow: sends the customer's IT admin to Microsoft's
// "consent on behalf of your organization" screen. Global-admin only, from their own workspace.
// The redirect lands on the MAIN host callback (a fixed, registered redirect URI) — the state
// carries which workspace initiated it.
export const runtime = "nodejs";

export async function GET() {
  const me = await getUser();
  if (me.role !== "global-admin") return NextResponse.json({ error: "Forbidden" }, { status: 403 });

  const clientId = process.env.AUTH_MICROSOFT_ENTRA_ID_ID;
  const appUrl = process.env.APP_URL;
  if (!clientId || !appUrl) {
    return NextResponse.json({ error: "Microsoft sign-in is not configured on this platform." }, { status: 400 });
  }
  const tenantId = await currentTenantId();
  if (tenantId === DEFAULT_TENANT) {
    return NextResponse.json({ error: "Connect org sign-in from the customer workspace, not the platform host." }, { status: 400 });
  }

  const url = new URL("https://login.microsoftonline.com/organizations/v2.0/adminconsent");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", `${appUrl.replace(/\/$/, "")}/api/admin/entra/callback`);
  url.searchParams.set("state", signConnectState(tenantId, me.email));
  // REQUIRED by the v2.0 adminconsent endpoint — omitting it fails with
  // "AADSTS900144: The request body must contain the following parameter: 'scope'".
  // Microsoft expects FULLY-QUALIFIED resource scopes here.
  //
  // Exactly one scope, and no more: User.Read — sign in and read the signed-in user's profile.
  // Deliberately NOT `.default`, which would consent the customer's tenant to EVERY permission this
  // app declares (including our app-only mail permissions) — over-permissioned, and an alarming
  // consent screen for a client's IT admin.
  //
  // NOTE: this grants DELEGATED access only, which is all sign-in needs. Directory sync is a
  // background job and therefore needs APPLICATION permissions (an app-only token), which this
  // endpoint cannot grant without `.default` — so directory sync stays on the customer's own Entra
  // app (the Advanced section of the integration page). Do not conflate the two on the UI.
  url.searchParams.set("scope", "https://graph.microsoft.com/User.Read");
  return NextResponse.redirect(url);
}
