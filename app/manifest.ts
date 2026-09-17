import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

// PWA manifest — makes RoamHub360 installable ("Add to Home Screen") and run standalone (no
// browser chrome), which is what makes the scan-a-QR-at-your-desk check-in feel like an app.
// Served at /manifest.webmanifest (public, see auth.config PUBLIC). Icons live in /public/icons.
// The Android app is a Trusted Web Activity over this same manifest: it reads name, colours,
// icons and shortcuts from here, so keep the 512px maskable icon and theme colours in sync with
// the store listing. Relative paths mean every customer subdomain serves its own valid manifest.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.productName} · ${brand.company}`,
    short_name: brand.productName,
    description: brand.descriptor,
    id: "/",
    start_url: "/?src=pwa",
    scope: "/",
    lang: "en-AU",
    dir: "ltr",
    display: "standalone",
    display_override: ["standalone", "minimal-ui"],
    orientation: "portrait",
    background_color: "#0a1830",
    theme_color: "#0a1830",
    categories: ["business", "productivity"],
    prefer_related_applications: false,
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
    // Launcher long-press shortcuts (Android / desktop). Deep links into the three daily actions.
    shortcuts: [
      { name: "Book a space", short_name: "Book", url: "/book?src=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "My bookings", short_name: "Mine", url: "/mine?src=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
      { name: "Who's in", short_name: "Team", url: "/team?src=shortcut", icons: [{ src: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }] },
    ],
  };
}
