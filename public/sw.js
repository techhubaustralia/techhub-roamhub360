/* RoamHub360 service worker. Intentionally minimal: it exists to make the app installable
   (a fetch handler is required for the install prompt) and to host push later. It does NOT
   cache responses — this is a multi-tenant, authenticated app, so caching pages/data risks
   leaking one tenant's content to another. Navigation just falls through to the network. */
const VERSION = "rh360-sw-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => e.waitUntil(self.clients.claim()));

// Pass-through fetch handler (satisfies PWA installability without any caching).
self.addEventListener("fetch", () => {});
