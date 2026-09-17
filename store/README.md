# Google Play listing assets

Sources for the RoamHub360 Play listing (see `PROJECT_HANDOVER/21_ANDROID_APP.md` §6 for the copy).

| Asset | Source | Output | Play requirement |
|---|---|---|---|
| Feature graphic | `feature-graphic.svg` | `out/feature-graphic.png` | 1024×500 PNG/JPEG, no alpha |
| App icon | `../public/icons/icon-512.png` | `out/icon-512.png` | 512×512 PNG |
| Phone screenshots | the deployed app | take manually | 2–8, 16:9 or 9:16, ≥ 320px |

Render: `node scripts/store-assets.mjs` (uses `sharp`, already installed). `out/` is git-ignored.

Screenshots to take on a phone-sized viewport of `https://app.roamhub360.com` signed in to a demo
workspace: **Book a space** (floor plan with a desk selected), **Who's in**, **My bookings**, and the
**QR check-in** success screen. Avoid real customer names — use the demo workspace.
