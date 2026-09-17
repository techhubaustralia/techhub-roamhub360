# Google Play listing assets

Sources for the RoamHub360 Play listing (see `PROJECT_HANDOVER/21_ANDROID_APP.md` §6 for the copy).

| Asset | Source | Output | Play requirement |
|---|---|---|---|
| Feature graphic | `feature-graphic.svg` | `out/feature-graphic.png` | 1024×500 PNG/JPEG, no alpha |
| App icon | `../public/icons/icon-512.png` | `out/icon-512.png` | 512×512 PNG |
| Phone screenshots | `scripts/store-screenshots.mjs` against a demo workspace | `out/screenshots/*.png` (1080×2340) | 2–8, 16:9 or 9:16, ≥ 320px |

Render the graphic: `node scripts/store-assets.mjs` (uses `sharp`, already installed). `out/` is git-ignored.

Screenshots (Playwright, one-off install `npm i -D @playwright/test && npx playwright install chromium`):

```
$env:SHOT_BASE="https://<demo-workspace>.roamhub360.com"
$env:SHOT_EMAIL="<password account on that workspace>"; $env:SHOT_PASSWORD="<its password>"
node scripts/store-screenshots.mjs
Remove-Item Env:SHOT_PASSWORD
```

It captures Home, Book a space, Who's in, My bookings and Office bookings in light mode with the
install banner hidden. Use a **demo** workspace with a few bookings on the day so the floor plan and
the presence board aren't empty, and never a real customer's data. Pick the best 2–8 in Play Console.
