import type { MetadataRoute } from "next";
import { brand } from "@/lib/brand";

// PWA manifest — makes RoamHub360 installable ("Add to Home Screen") and run standalone (no
// browser chrome), which is what makes the scan-a-QR-at-your-desk check-in feel like an app.
// Served at /manifest.webmanifest. Icons live in /public/icons.
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: `${brand.productName} · ${brand.company}`,
    short_name: brand.productName,
    description: brand.descriptor,
    id: "/",
    start_url: "/?src=pwa",
    scope: "/",
    display: "standalone",
    orientation: "portrait",
    background_color: "#0a1830",
    theme_color: "#0a1830",
    icons: [
      { src: "/icons/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
      { src: "/icons/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
      { src: "/icons/maskable-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
    ],
  };
}
