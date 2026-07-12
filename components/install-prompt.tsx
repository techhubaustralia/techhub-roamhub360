"use client";

import { useEffect, useState } from "react";
import { X, Download, Plus, SquareArrowUp } from "lucide-react";
import { RoamHubMark } from "@/components/roamhub-mark";

// One-tap "install this app" helper. Detects the device and shows the right path:
//   • Android / desktop Chrome → a real Install button (fires the native install prompt).
//   • iPhone / iPad (Safari) → the "Add to Home Screen" steps (iOS has no install API).
// Self-hides when already installed (standalone), after dismissal, or until the cookie notice is
// acknowledged (so we never stack two banners). Makes installing effortless for end users.
type BipEvent = Event & { prompt?: () => void; userChoice?: Promise<{ outcome: string }> };

export function InstallPrompt() {
  const [platform, setPlatform] = useState<"ios" | "android" | null>(null);
  const [deferred, setDeferred] = useState<BipEvent | null>(null);
  const [open, setOpen] = useState(false);
  const [steps, setSteps] = useState(false);

  useEffect(() => {
    const nav = window.navigator as Navigator & { standalone?: boolean };
    const standalone = window.matchMedia?.("(display-mode: standalone)").matches || nav.standalone === true;
    if (standalone) return; // already installed
    try {
      if (localStorage.getItem("rh-install-dismissed") || !localStorage.getItem("rh-cookie-ack")) return;
    } catch {
      /* storage blocked → still allow */
    }
    const ua = nav.userAgent || "";
    const isIOS = /iphone|ipad|ipod/i.test(ua) || (nav.platform === "MacIntel" && nav.maxTouchPoints > 1);
    const isSafari = /^((?!chrome|android|crios|fxios|edg).)*safari/i.test(ua);
    if (isIOS && isSafari) {
      setPlatform("ios");
      setOpen(true);
      return;
    }
    const onBip = (e: Event) => {
      e.preventDefault();
      setDeferred(e as BipEvent);
      setPlatform("android");
      setOpen(true);
    };
    window.addEventListener("beforeinstallprompt", onBip);
    return () => window.removeEventListener("beforeinstallprompt", onBip);
  }, []);

  if (!open || !platform) return null;

  const dismiss = () => {
    try {
      localStorage.setItem("rh-install-dismissed", "1");
    } catch {
      /* ignore */
    }
    setOpen(false);
  };
  const install = async () => {
    if (deferred?.prompt) {
      deferred.prompt();
      try {
        await deferred.userChoice;
      } catch {
        /* ignore */
      }
    }
    dismiss();
  };

  return (
    <div
      className="no-print fixed inset-x-3 z-[55] mx-auto max-w-md rounded-[16px] border bg-card p-4 shadow-2xl md:bottom-5 md:left-auto md:right-5 md:mx-0"
      style={{ bottom: "calc(env(safe-area-inset-bottom) + 74px)" }}
    >
      <div className="flex items-start gap-3">
        <RoamHubMark className="size-10 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="text-[14px] font-bold">Install RoamHub360</div>
          <p className="mt-0.5 text-[12px] text-txt-mute">Add it to your home screen for one-tap access, full-screen, and notifications.</p>
        </div>
        <button onClick={dismiss} aria-label="Not now" className="grid size-8 shrink-0 place-items-center rounded-lg text-txt-mute hover:bg-panel-2">
          <X className="size-4" />
        </button>
      </div>

      {platform === "android" ? (
        <button onClick={install} className="mt-3 flex w-full items-center justify-center gap-2 rounded-[11px] bg-primary px-4 py-3 text-[14px] font-bold text-primary-foreground hover:bg-orange-soft">
          <Download className="size-4" /> Install app
        </button>
      ) : steps ? (
        <div className="mt-3 space-y-2 rounded-[11px] bg-panel-2 p-3 text-[12.5px] leading-relaxed">
          <div className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">1</span>
            <span>Tap the <SquareArrowUp className="inline size-4 align-text-bottom text-primary" /> <b>Share</b> button in Safari.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">2</span>
            <span>Choose <b>Add to Home Screen</b> <Plus className="inline size-3.5 align-text-bottom" />.</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="grid size-6 shrink-0 place-items-center rounded-full bg-primary text-[11px] font-bold text-primary-foreground">3</span>
            <span>Tap <b>Add</b> — that&apos;s it. 🎉</span>
          </div>
        </div>
      ) : (
        <button onClick={() => setSteps(true)} className="mt-3 w-full rounded-[11px] bg-primary px-4 py-3 text-[14px] font-bold text-primary-foreground hover:bg-orange-soft">
          Show me how
        </button>
      )}
    </div>
  );
}
