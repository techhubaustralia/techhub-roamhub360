import type { Region, BuildingRow } from "./types";

// No built-in/demo sites. All sites are created by admins via "Create building";
// their region/country come from the editor and are stored on the building record.
export const LOCATIONS: Region[] = [];

export interface FlatOffice {
  id: string;
  b: string;
  sub: string;
  open: boolean;
  region: string;
  country: string;
  flag: string;
  ianaTz: string; // for local-time logic (Intl)
  winTz: string; // for Microsoft Graph events
}

// Per-office timezone overrides. No built-in offices remain (LOCATIONS is empty),
// so this is currently unused — a building carries its own tz on its saved plan
// (plan.winTz, set in the editor). Kept as an extension point only.
const OFFICE_TZ: Record<string, { iana: string; win: string }> = {};
const DEFAULT_TZ = { iana: "UTC", win: "UTC" };

export const OFFICES: FlatOffice[] = LOCATIONS.flatMap((r) =>
  r.countries.flatMap((c) =>
    c.offices.map((o) => ({
      id: o.id,
      b: o.b,
      sub: o.sub,
      open: o.open,
      region: r.region,
      country: c.name,
      flag: c.flag,
      ianaTz: (OFFICE_TZ[o.id] ?? DEFAULT_TZ).iana,
      winTz: (OFFICE_TZ[o.id] ?? DEFAULT_TZ).win,
    })),
  ),
);

export const officeById = (id: string): FlatOffice | undefined => OFFICES.find((o) => o.id === id);
export const officeIana = (id: string): string => officeById(id)?.ianaTz ?? "UTC";
export const officeWinTz = (id: string): string => officeById(id)?.winTz ?? "UTC";

// Built-in buildings removed — sites are created by admins. Custom buildings are
// listed from the persisted store (see getBuildingsMeta), not from this array.
export const BUILDINGS: BuildingRow[] = [];

