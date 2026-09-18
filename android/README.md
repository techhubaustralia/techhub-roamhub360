# Android (Google Play) — reference material

The Android app is a **Trusted Web Activity** generated with Bubblewrap and kept in its **own
repository** (`techhub-roamhub360-android`). Nothing in this folder is built by this repo; it is the
reference the Android repo is created from.

- `twa-manifest.template.json` — the Bubblewrap `twa-manifest.json` with every value we already know
  (package, colours, icons, shortcuts, start URL). Two placeholders remain: the **Play App Signing**
  and **upload-key** SHA-256 fingerprints (Play Console → Setup → App signing) and the list of
  **customer subdomains** in `additionalTrustedOrigins` (the Tenants page). Fingerprints here must
  match `ANDROID_ASSETLINKS_SHA256` on the droplet — the web side serves the matching statement at
  `/.well-known/assetlinks.json`.
- Store listing copy, Data safety answers, the feature graphic and the screenshot script are in
  `PROJECT_HANDOVER/21_ANDROID_APP.md` and `store/`.

Full runbook: `PROJECT_HANDOVER/21_ANDROID_APP.md`.
