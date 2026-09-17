# RoamHub360 — Microsoft Teams app

A **Teams personal-tab app that wraps the web app**. One codebase — the tabs load the live web URLs,
so every web deploy is reflected in Teams automatically. Roles (Staff / Site admin / Workspace admin)
are enforced by the same backend; nothing role-related is duplicated here.

## What's in this folder
- `manifest.json` — Teams app manifest (personal tabs: Home, Book a space, My bookings, Who's in; a
  configurable channel tab for the Who's in board).
- `color.png` — **192×192** app icon (full colour, opaque).
- `outline.png` — **32×32** app icon (white on transparent).

## Setup

The complete, current procedure — Entra "Expose an API", pre-authorising the Teams client IDs,
filling `REPLACE_WITH_ENTRA_APP_CLIENT_ID`, packaging and sideloading — is
**`docs/DEPLOY-DROPLET.md` §13 "Microsoft Teams tab"**. Inside Teams, `/teams` exchanges the
Teams-issued Entra token for an Auth.js session via the `teams-sso` credentials provider
(`lib/server/teams-token.ts`): no password, no redirect, no separate auth bridge.

Application ID URI pattern: `api://app.roamhub360.com/<client-id>` (derived from `APP_URL`; override
with `TEAMS_SSO_AUDIENCE` only if yours differs).

## Package + upload
```bash
cd teams
zip roamhub360-teams.zip manifest.json color.png outline.png
```
Upload in **Teams admin center → Manage apps → Upload**, or sideload via **Teams → Apps → Manage your
apps → Upload a custom app** for testing. Re-upload only when the manifest itself changes (tabs,
icons, scopes) — ordinary web deploys need nothing here. Keep `manifest.json` `version` moving when
you do.
