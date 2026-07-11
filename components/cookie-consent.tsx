"use client";

import { useEffect, useState } from "react";

// Minimal cookie/privacy notice. RoamHub360 uses only essential cookies (the auth session), so this
// is a one-time acknowledgement, not a tracking-consent gate. Dismissal is remembered locally.
const KEY = "rh-cookie-ack";

export function CookieConsent() {
  const [show, setShow] = useState(false);
  useEffect(() => {
    try {
      if (!localStorage.getItem(KEY)) setShow(true);
    } catch {
      /* storage blocked → don't nag */
    }
  }, []);
  if (!show) return null;

  const dismiss = () => {
    try {
      localStorage.setItem(KEY, "1");
    } catch {
      /* ignore */
    }
    setShow(false);
  };

  return (
    <div
      className="no-print fixed inset-x-3 bottom-[calc(env(safe-area-inset-bottom)+74px)] z-[60] mx-auto max-w-2xl rounded-[14px] border bg-card/95 p-4 shadow-xl backdrop-blur sm:flex sm:items-center sm:gap-4 md:bottom-3"
    >
      <p className="text-[12.5px] leading-relaxed text-txt-mute">
        We use only the essential cookies needed to keep you signed in — no advertising or third-party tracking. See our{" "}
        <a href="/privacy" className="text-primary hover:underline">Privacy Policy</a>.
      </p>
      <button
        onClick={dismiss}
        className="mt-3 w-full shrink-0 rounded-[10px] bg-primary px-4 py-2.5 text-[13.5px] font-semibold text-primary-foreground sm:mt-0 sm:w-auto"
      >
        Got it
      </button>
    </div>
  );
}
