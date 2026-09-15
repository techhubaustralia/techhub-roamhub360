"use client";

import { useState } from "react";
import { cn } from "@/lib/utils";

const initials = (name: string) =>
  name
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((w) => w[0]?.toUpperCase())
    .join("") || "?";

/**
 * Person avatar: the M365 directory photo (a data: URL thumbnail, as served by /api/presence and
 * the directory) over an initials chip. The chip always renders underneath, so a missing photo, a
 * bad data URL, or a load error degrades to initials with no broken-image flash or layout shift.
 * Takes a display name and an optional photo only — never an email — so it can be dropped onto any
 * page without widening what non-admins receive.
 */
export function Avatar({ name, photo, size = 36, className }: { name: string; photo?: string | null; size?: number; className?: string }) {
  const [failed, setFailed] = useState(false);
  const showPhoto = !!photo && !failed;
  return (
    <span
      className={cn("relative inline-grid shrink-0 place-items-center overflow-hidden rounded-full bg-primary/12 font-bold text-primary", className)}
      style={{ width: size, height: size, fontSize: Math.max(9, Math.round(size / 3)) }}
      aria-label={name}
      title={name}
    >
      {initials(name)}
      {showPhoto && (
        // eslint-disable-next-line @next/next/no-img-element -- data: URL thumbnail; next/image cannot optimise it
        <img src={photo} alt="" width={size} height={size} loading="lazy" onError={() => setFailed(true)} className="absolute inset-0 size-full object-cover" />
      )}
    </span>
  );
}
