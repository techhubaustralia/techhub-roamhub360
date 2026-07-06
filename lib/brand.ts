// RoamHub360 — central brand configuration (a TechHub Australia product).
//
// Single source of truth for product strings and the few brand colours needed
// OUTSIDE the CSS token system (emails, PDF exports, inline SVG). The canonical
// *visual* palette lives in app/globals.css; this file centralises names + the
// hex values that CSS variables can't reach.
//
// Kept env-free so it is safe to import from client components. Server code that
// needs runtime overrides (APP_URL, MAIL_FROM) reads process.env and falls back
// to the defaults here.
//
// Later this becomes a per-tenant lookup for white-label / per-customer theming.

export const brand = {
  productName: "RoamHub360",
  company: "TechHub Australia",
  tagline: "Space managed. Teams connected.",
  descriptor: "Smart Desk Booking & Workplace Management",

  // Defaults (overridable via env in server code — see email.ts / graph.ts)
  defaultAppUrl: "https://app.roamhub360.com",
  defaultMailFrom: "bookings@roamhub360.com",
  supportEmail: "support@techhubaustralia.com.au",

  // Brand colours for non-CSS contexts (emails, PDF). Mirror app/globals.css.
  colors: {
    primary: "#2B7DD1", // Hub Blue — CTAs, links
    primaryHover: "#3C93E8",
    accent: "#29C5EE", // Orbit Cyan
    navy: "#0A232D", // deep foundation (email header)
    ink: "#EDF3FC",
    available: "#2FBE86", // free desk
    booked: "#F5821F", // reserved
    occupied: "#2B7DD1", // checked in
  },
} as const;

export type Brand = typeof brand;
