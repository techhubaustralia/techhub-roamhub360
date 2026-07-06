"use client";

import { useEffect, useState } from "react";
import { Hexagon } from "lucide-react";

// Only show the "Running in Teams" badge when actually embedded (Teams loads the
// app in an iframe). In a normal browser tab self === top, so the badge hides.
export function TeamsBadge() {
  const [embedded, setEmbedded] = useState(false);
  useEffect(() => {
    try {
      setEmbedded(window.self !== window.top);
    } catch {
      setEmbedded(true); // cross-origin access throws → we're embedded
    }
  }, []);
  if (!embedded) return null;
  return (
    <span className="inline-flex items-center gap-1.5 rounded-lg border border-[#6264a7] bg-[#6264a7]/15 px-2.5 py-1.5 text-xs font-semibold text-[#6264a7] dark:text-[#a9abde]">
      <Hexagon className="size-3.5" /> Running in Teams
    </span>
  );
}
