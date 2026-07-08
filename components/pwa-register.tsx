"use client";

import { useEffect } from "react";

// Registers the service worker so RoamHub360 is installable to the home screen and can run
// standalone. Renders nothing. Kept separate from LiveProvider so the SSE stream and the SW
// lifecycle stay independent.
export function PwaRegister() {
  useEffect(() => {
    if (!("serviceWorker" in navigator)) return;
    const onLoad = () => navigator.serviceWorker.register("/sw.js").catch(() => {});
    if (document.readyState === "complete") onLoad();
    else window.addEventListener("load", onLoad, { once: true });
  }, []);
  return null;
}
