"use client";

import { useTheme } from "next-themes";
import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";

export function ThemeToggle() {
  const { resolvedTheme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => setMounted(true), []);

  const dark = resolvedTheme === "dark";
  return (
    <button
      title="Toggle theme"
      onClick={() => setTheme(dark ? "light" : "dark")}
      aria-label="Toggle theme"
      className="grid size-11 shrink-0 place-items-center rounded-[9px] border bg-panel-2 text-txt-dim hover:text-foreground md:size-9"
    >
      {mounted && dark ? <Sun className="size-4" /> : <Moon className="size-4" />}
    </button>
  );
}
