"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";

// Teams SSO bridge. When a tab loads inside Microsoft Teams, this page silently obtains an
// Entra token via the Teams JS SDK (getAuthToken) and exchanges it for an Auth.js session
// (the `teams-sso` credentials provider verifies the token server-side), then forwards to the
// requested page — so the user never sees a login.
//
// PREREQUISITES (infra — cannot be set or validated from the repo):
//  1. The Entra app (AUTH_MICROSOFT_ENTRA_ID_ID) must expose an API scope (access_as_user) with
//     Application ID URI `api://app.roamhub360.com/<client-id>` and pre-authorise the Teams
//     desktop/web/mobile client IDs, then admin-consent.
//  2. teams/manifest.json webApplicationInfo.resource must match that Application ID URI, so the
//     token audience lines up with what verifyTeamsSsoToken() accepts.
// UNTESTED locally (no Teams runtime / Entra app here) — validate in a Teams sideload.

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

export default function TeamsAuthBridge() {
  const [msg, setMsg] = useState("Signing you in…");
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let cancelled = false;
    const target = new URLSearchParams(location.search).get("target") || "/";
    // Only ever forward to a same-origin path (never an absolute URL) — open-redirect guard.
    const safeTarget = target.startsWith("/") && !target.startsWith("//") ? target : "/";
    (async () => {
      try {
        await loadScript("https://res.cdn.office.net/teams-js/2.24.0/js/MicrosoftTeams.min.js");
        // Minimal shape of the parts of the Teams JS SDK we use (SDK loaded from CDN at runtime,
        // so no build-time dependency on @microsoft/teams-js).
        type TeamsSdk = { app: { initialize: () => Promise<void> }; authentication: { getAuthToken: () => Promise<string> } };
        const teams = (window as unknown as { microsoftTeams?: TeamsSdk }).microsoftTeams;
        if (!teams) throw new Error("Teams SDK unavailable");
        await teams.app.initialize();
        const token = await teams.authentication.getAuthToken();
        // Exchange the Teams SSO token for an Auth.js session on this origin. redirect:false so we
        // control the forward and can surface a clean error inside the Teams tab.
        const res = await signIn("teams-sso", { token, redirect: false });
        if (!res || res.error || !res.ok) throw new Error(res?.error || "session exchange failed");
        if (!cancelled) location.replace(safeTarget);
      } catch (e) {
        if (!cancelled) {
          setFailed(true);
          setMsg(`Could not sign in automatically. Open RoamHub360 in a browser instead. (${e instanceof Error ? e.message : String(e)})`);
        }
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", fontFamily: "'Plus Jakarta Sans', Segoe UI, Arial, sans-serif", color: "#0a232d", padding: 24, textAlign: "center" }}>
      <div>
        {!failed && <div role="status" aria-label="Signing you in" style={{ margin: "0 auto 16px", width: 28, height: 28, border: "3px solid #eee", borderTopColor: "#2B7DD1", borderRadius: "50%", animation: "spin 1s linear infinite" }} />}
        <p style={{ fontSize: 14, maxWidth: 420 }}>{msg}</p>
        {failed && <a href="https://app.roamhub360.com" style={{ color: "#2B7DD1", fontWeight: 600 }}>Open in browser</a>}
      </div>
      <style>{`@keyframes spin{to{transform:rotate(360deg)}}`}</style>
    </div>
  );
}
