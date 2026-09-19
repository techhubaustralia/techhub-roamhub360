# Android (Google Play) — build kit

The Android app is a **Trusted Web Activity**: a Play-store wrapper that opens
`https://app.roamhub360.com` full-screen. Everything the app does is the web app. This folder holds
what's needed to produce it in one go; the generated Android project lives **outside** this repo
(default `C:\Projects\roamhub360-android`) because it contains the keystore and build output.

| File | Purpose |
|---|---|
| `twa-manifest.json` | Bubblewrap manifest with every known value (package, colours, icons, shortcuts, start URL). The build script fills in the tenant origins and the keystore fingerprint. |
| `build-android.ps1` | One-shot: keystore (once) → manifest → Android project → signed APK + AAB. Prints the SHA-256 fingerprint the server needs. |

## Build (PowerShell, on the dev PC)

```powershell
$env:BUBBLEWRAP_KEYSTORE_PASSWORD = "<choose a strong password>"
$env:BUBBLEWRAP_KEY_PASSWORD      = "<same or another>"
.\android\build-android.ps1 -Tenants "acme,globex"     # slugs from the Tenants page; "" for none yet
Remove-Item Env:BUBBLEWRAP_KEYSTORE_PASSWORD, Env:BUBBLEWRAP_KEY_PASSWORD
```

First run: Bubblewrap offers to install its own JDK 17 and Android SDK when none are found — answer
**Y** and re-run the script if it stops there. Store the keystore passwords and a copy of
`android.keystore` in the TechHub password vault the same day.

## Then

1. **Server:** on the droplet, `ANDROID_ASSETLINKS_SHA256=<printed fingerprint>` in `.env`, then
   `docker compose -f docker-compose.cohost.yml up -d`. Check
   `curl -s https://app.roamhub360.com/.well-known/assetlinks.json` returns the statement.
2. **Phone test (no Play account needed):** `adb install -r app-release-signed.apk`, open RoamHub360.
   Full-screen with no browser bar on `app.roamhub360.com` and on each tenant subdomain = asset
   links verified. A visible URL bar = fingerprint/env mismatch (`adb shell pm get-app-links com.techhubaustralia.roamhub360`).
3. **Play Console** (when the account exists): create the app, enrol in Play App Signing, upload
   `app-release-bundle.aab` to Internal testing, copy the **App signing key** SHA-256 from
   *Setup → App signing* and append it to `ANDROID_ASSETLINKS_SHA256` (comma-separated), `up -d`.
4. Listing copy, Data safety answers, feature graphic and screenshots: `PROJECT_HANDOVER/21_ANDROID_APP.md` §6–7, `store/`.
5. Later releases: `.\android\build-android.ps1 -Tenants "…" -VersionName 1.0.1 -VersionCode 2`
   (Play requires a higher version code each upload), or wire `android-cicd` for CI releases.
