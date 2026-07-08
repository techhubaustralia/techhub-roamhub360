"use client";

import { useEffect } from "react";

// Real-time bridge. Holds a Server-Sent-Events connection to /api/live and, when the server
// signals a booking change anywhere in the workspace, fires the app's existing `bookings:changed`
// event — so the notifications bell, the "Who's in" board, and the floor plan refresh live,
// without polling. Reconnects with backoff. Renders nothing.
export function LiveProvider() {
  useEffect(() => {
    let es: EventSource | null = null;
    let stopped = false;
    let attempt = 0;
    let timer: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (stopped) return;
      es = new EventSource("/api/live");
      es.onmessage = (e) => {
        attempt = 0;
        try {
          if (JSON.parse(e.data)?.type === "bookings") window.dispatchEvent(new Event("bookings:changed"));
        } catch {
          /* ignore malformed frame */
        }
      };
      es.onerror = () => {
        es?.close();
        if (stopped) return;
        attempt = Math.min(attempt + 1, 6);
        timer = setTimeout(connect, 1000 * attempt); // backoff to ~6s
      };
    };
    connect();

    return () => {
      stopped = true;
      clearTimeout(timer);
      es?.close();
    };
  }, []);

  return null;
}
