"use client";

import { useEffect, useState } from "react";

// Teams tab configuration page (Team Build-Up E). Shown when someone adds the "Who's in" tab to
// a Teams channel or group chat. It tells Teams which URL to render — our /teams SSO bridge
// pointed at the presence board — and enables the Save button. Loaded inside Teams only.

function loadScript(src: string): Promise<void> {
  return new Promise((resolve, reject) => {
    const s = document.createElement("script");
    s.src = src;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error(`failed to load ${src}`));
    document.head.appendChild(s);
  });
}

type TeamsConfig = {
  app: { initialize: () => Promise<void> };
  pages: {
    config: {
      registerOnSaveHandler: (cb: (e: { notifySuccess: () => void; notifyFailure: (r?: string) => void }) => void) => void;
      setValidityState: (valid: boolean) => void;
      setConfig: (c: Record<string, string>) => Promise<void> | void;
    };
  };
};

export default function TeamsConfigPage() {
  const [ready, setReady] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        await loadScript("https://res.cdn.office.net/teams-js/2.24.0/js/MicrosoftTeams.min.js");
        const teams = (window as unknown as { microsoftTeams?: TeamsConfig }).microsoftTeams;
        if (!teams) throw new Error("Teams SDK unavailable");
        await teams.app.initialize();
        const contentUrl = `${location.origin}/teams?target=%2Fteam`;
        teams.pages.config.registerOnSaveHandler((saveEvent) => {
          try {
            teams.pages.config.setConfig({
              entityId: "roamhub-whosin",
              contentUrl,
              websiteUrl: `${location.origin}/team`,
              suggestedDisplayName: "Who's in",
            });
            saveEvent.notifySuccess();
          } catch (e) {
            saveEvent.notifyFailure(e instanceof Error ? e.message : "config failed");
          }
        });
        teams.pages.config.setValidityState(true); // enable the Save button
        setReady(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : String(e));
      }
    })();
  }, []);

  return (
    <div style={{ display: "grid", placeItems: "center", minHeight: "60vh", fontFamily: "'Plus Jakarta Sans', Segoe UI, Arial, sans-serif", color: "#0a232d", padding: 24, textAlign: "center" }}>
      <div style={{ maxWidth: 420 }}>
        <div style={{ fontSize: 40 }}>👋</div>
        <h1 style={{ fontSize: 20, fontWeight: 700, margin: "8px 0" }}>Add “Who's in” to this channel</h1>
        <p style={{ fontSize: 14, color: "#546" }}>
          {error
            ? `Couldn't set up the tab: ${error}. Open RoamHub360 in a browser instead.`
            : ready
              ? "Press Save to pin the RoamHub360 presence board here — everyone in this channel can see who's booked or checked in."
              : "Setting up…"}
        </p>
      </div>
    </div>
  );
}
