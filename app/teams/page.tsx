"use client";

import { useEffect, useState } from "react";

// Teams SSO bridge. When a tab loads inside Microsoft Teams, this page silently obtains an
// Entra token via the Teams JS SDK (getAuthToken) and exchanges it for a Container Apps
// Easy Auth session, then forwards to the requested page — so the user never sees a login.
//
// PREREQUISITES (infra — cannot be set or validated from the repo):
//  1. Easy Auth on the Container App must let THIS route load without a redirect
//     (unauthenticatedClientAction = Return401/AllowAnonymous), or the server redirects
//     before this script can run.
//  2. Entra app 29c0b446-4e76-4a61-a5ff-c265e5f75ab2: expose api scope access_as_user,
//     pre-authorise the Teams client IDs, admin-consent, and Easy Auth must trust its audience.
// UNTESTED locally (no Teams runtime / Easy Auth here) — validate in a Teams sideload.

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
        // Exchange the Teams SSO token for an Easy Auth session cookie on this origin.
        const r = await fetch("/.auth/login/aad", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ access_token: token }),
        });
        if (!r.ok) throw new Error(`Easy Auth exchange failed (${r.status})`);
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
