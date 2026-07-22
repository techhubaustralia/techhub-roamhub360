/* RoamHub360 service worker. Intentionally minimal: it exists to make the app installable
   (a fetch handler is required for the install prompt) and to host push later. It does NOT
   cache responses — this is a multi-tenant, authenticated app, so caching pages/data risks
   leaking one tenant's content to another. Navigation just falls through to the network. */
const VERSION = "rh360-sw-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (e) => {
  console.log(`[sw] active: ${VERSION}`); // version marker aids debugging which SW is live
  e.waitUntil(self.clients.claim());
});

// Pass-through fetch handler (satisfies PWA installability without any caching).
self.addEventListener("fetch", () => {});

// ---- Web Push ----
self.addEventListener("push", (event) => {
  let d = {};
  try {
    d = event.data ? event.data.json() : {};
  } catch {
    d = { title: "RoamHub360", body: event.data ? event.data.text() : "" };
  }
  event.waitUntil(
    self.registration.showNotification(d.title || "RoamHub360", {
      body: d.body || "",
      tag: d.tag,
      data: { url: d.url || "/" },
      icon: "/icons/icon-192.png",
      badge: "/icons/icon-192.png",
    }),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = (event.notification.data && event.notification.data.url) || "/";
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((wins) => {
      for (const w of wins) {
        if ("focus" in w) {
          if ("navigate" in w) w.navigate(url);
          return w.focus();
        }
      }
      return self.clients.openWindow(url);
    }),
  );
});
