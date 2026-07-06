"use client";

import { createContext, useContext, useCallback, useEffect, useState, type ReactNode } from "react";
import { OFFICES, type FlatOffice } from "@/lib/data";
import { getBuildingsMeta } from "@/lib/plan-store";

interface LocationCtx {
  office: FlatOffice | null;
  offices: FlatOffice[];
  setOfficeId: (id: string) => void;
}

const Ctx = createContext<LocationCtx | null>(null);

export function LocationProvider({ children }: { children: ReactNode }) {
  const [officeId, setOfficeId] = useState("");
  const [offices, setOffices] = useState<FlatOffice[]>(OFFICES);

  const refresh = useCallback(() => {
    getBuildingsMeta().then(({ custom, hidden }) => {
      const builtIn = OFFICES.filter((o) => !hidden.includes(o.id));
      const customOffices: FlatOffice[] = custom
        .filter((c) => !hidden.includes(c.id) && !builtIn.some((b) => b.id === c.id))
        .map((c) => ({
          id: c.id,
          b: c.name,
          sub: c.country || "Custom site",
          open: true,
          // Group under the region the admin set; only fall back to a bucket
          // when none was chosen, instead of always isolating custom sites.
          region: c.region || "Other sites",
          country: c.country || "",
          flag: "🏢",
          ianaTz: "UTC",
          winTz: "UTC",
        }));
      setOffices([...builtIn, ...customOffices]);
    });
  }, []);

  useEffect(() => {
    refresh();
    const onFocus = () => document.visibilityState === "visible" && refresh();
    window.addEventListener("wh:buildings", refresh);
    document.addEventListener("visibilitychange", onFocus);
    return () => {
      window.removeEventListener("wh:buildings", refresh);
      document.removeEventListener("visibilitychange", onFocus);
    };
  }, [refresh]);

  const office = offices.find((o) => o.id === officeId) ?? offices[0] ?? null;

  return <Ctx.Provider value={{ office, offices, setOfficeId }}>{children}</Ctx.Provider>;
}

export function useLocation() {
  const ctx = useContext(Ctx);
  if (!ctx) throw new Error("useLocation must be used within LocationProvider");
  return ctx;
}
