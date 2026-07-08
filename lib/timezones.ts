// Timezones for building setup.
//   iana = logic/scheduling (Intl)     win = Microsoft Graph calendar events
//
// The picker offers EVERY IANA zone this runtime knows (Intl.supportedValuesOf → ~420 zones),
// so any office in any country can be set up. For Microsoft Graph we map the common/business
// zones to their Windows names; Graph also accepts IANA identifiers, so any unmapped zone falls
// back to its IANA id (never breaks calendar sync).

export interface TzOption {
  iana: string;
  win: string;
  city: string; // human city/region name, e.g. "Sydney"
  region: string; // continent group, e.g. "Australia"
}

// Curated IANA → Windows time-zone names (Microsoft CLDR). Covers the major business locations of
// every continent; the long tail falls back to the IANA id in winTzFor().
const WINDOWS_TZ: Record<string, string> = {
  // Pacific / Americas (west → east)
  "Pacific/Midway": "UTC-11",
  "Pacific/Honolulu": "Hawaiian Standard Time",
  "America/Anchorage": "Alaskan Standard Time",
  "America/Los_Angeles": "Pacific Standard Time",
  "America/Tijuana": "Pacific Standard Time (Mexico)",
  "America/Vancouver": "Pacific Standard Time",
  "America/Phoenix": "US Mountain Standard Time",
  "America/Denver": "Mountain Standard Time",
  "America/Edmonton": "Mountain Standard Time",
  "America/Chihuahua": "Mountain Standard Time (Mexico)",
  "America/Chicago": "Central Standard Time",
  "America/Winnipeg": "Central Standard Time",
  "America/Mexico_City": "Central Standard Time (Mexico)",
  "America/Guatemala": "Central America Standard Time",
  "America/New_York": "Eastern Standard Time",
  "America/Toronto": "Eastern Standard Time",
  "America/Bogota": "SA Pacific Standard Time",
  "America/Lima": "SA Pacific Standard Time",
  "America/Caracas": "Venezuela Standard Time",
  "America/Halifax": "Atlantic Standard Time",
  "America/Santiago": "Pacific SA Standard Time",
  "America/La_Paz": "SA Western Standard Time",
  "America/St_Johns": "Newfoundland Standard Time",
  "America/Sao_Paulo": "E. South America Standard Time",
  "America/Argentina/Buenos_Aires": "Argentina Standard Time",
  "America/Montevideo": "Montevideo Standard Time",
  "Atlantic/South_Georgia": "UTC-02",
  "Atlantic/Azores": "Azores Standard Time",
  "Atlantic/Cape_Verde": "Cape Verde Standard Time",
  // UTC / Europe / Africa
  UTC: "UTC",
  "Europe/London": "GMT Standard Time",
  "Europe/Dublin": "GMT Standard Time",
  "Europe/Lisbon": "GMT Standard Time",
  "Atlantic/Reykjavik": "Greenwich Standard Time",
  "Africa/Casablanca": "Morocco Standard Time",
  "Africa/Abidjan": "Greenwich Standard Time",
  "Africa/Lagos": "W. Central Africa Standard Time",
  "Europe/Paris": "Romance Standard Time",
  "Europe/Madrid": "Romance Standard Time",
  "Europe/Brussels": "Romance Standard Time",
  "Europe/Rome": "W. Europe Standard Time",
  "Europe/Berlin": "W. Europe Standard Time",
  "Europe/Amsterdam": "W. Europe Standard Time",
  "Europe/Zurich": "W. Europe Standard Time",
  "Europe/Vienna": "W. Europe Standard Time",
  "Europe/Stockholm": "W. Europe Standard Time",
  "Europe/Warsaw": "Central European Standard Time",
  "Europe/Prague": "Central Europe Standard Time",
  "Europe/Budapest": "Central Europe Standard Time",
  "Europe/Athens": "GTB Standard Time",
  "Europe/Bucharest": "GTB Standard Time",
  "Europe/Helsinki": "FLE Standard Time",
  "Europe/Kiev": "FLE Standard Time",
  "Europe/Istanbul": "Turkey Standard Time",
  "Africa/Cairo": "Egypt Standard Time",
  "Africa/Johannesburg": "South Africa Standard Time",
  "Asia/Jerusalem": "Israel Standard Time",
  "Asia/Beirut": "Middle East Standard Time",
  "Asia/Amman": "Jordan Standard Time",
  // Middle East / Russia / Central & South Asia
  "Europe/Moscow": "Russian Standard Time",
  "Asia/Riyadh": "Arab Standard Time",
  "Asia/Kuwait": "Arab Standard Time",
  "Asia/Qatar": "Arab Standard Time",
  "Asia/Baghdad": "Arabic Standard Time",
  "Asia/Tehran": "Iran Standard Time",
  "Asia/Dubai": "Arabian Standard Time",
  "Asia/Muscat": "Arabian Standard Time",
  "Asia/Baku": "Azerbaijan Standard Time",
  "Asia/Yerevan": "Caucasus Standard Time",
  "Asia/Tbilisi": "Georgian Standard Time",
  "Asia/Kabul": "Afghanistan Standard Time",
  "Asia/Karachi": "Pakistan Standard Time",
  "Asia/Tashkent": "West Asia Standard Time",
  "Asia/Kolkata": "India Standard Time",
  "Asia/Colombo": "Sri Lanka Standard Time",
  "Asia/Kathmandu": "Nepal Standard Time",
  "Asia/Dhaka": "Bangladesh Standard Time",
  "Asia/Almaty": "Central Asia Standard Time",
  "Asia/Yangon": "Myanmar Standard Time",
  // South-East & East Asia
  "Asia/Bangkok": "SE Asia Standard Time",
  "Asia/Jakarta": "SE Asia Standard Time",
  "Asia/Ho_Chi_Minh": "SE Asia Standard Time",
  "Asia/Shanghai": "China Standard Time",
  "Asia/Hong_Kong": "China Standard Time",
  "Asia/Singapore": "Singapore Standard Time",
  "Asia/Kuala_Lumpur": "Singapore Standard Time",
  "Asia/Manila": "Singapore Standard Time",
  "Asia/Taipei": "Taipei Standard Time",
  "Asia/Perth": "W. Australia Standard Time",
  "Asia/Tokyo": "Tokyo Standard Time",
  "Asia/Seoul": "Korea Standard Time",
  // Australia / Pacific
  "Australia/Darwin": "AUS Central Standard Time",
  "Australia/Adelaide": "Cen. Australia Standard Time",
  "Australia/Brisbane": "E. Australia Standard Time",
  "Australia/Sydney": "AUS Eastern Standard Time",
  "Australia/Melbourne": "AUS Eastern Standard Time",
  "Australia/Hobart": "Tasmania Standard Time",
  "Pacific/Port_Moresby": "West Pacific Standard Time",
  "Pacific/Guadalcanal": "Central Pacific Standard Time",
  "Pacific/Auckland": "New Zealand Standard Time",
  "Pacific/Fiji": "Fiji Standard Time",
  "Pacific/Tongatapu": "Tonga Standard Time",
};

/** The Microsoft Graph (Windows) timezone name for an IANA id. Falls back to the IANA id itself
 *  (Graph accepts IANA), then UTC. */
export const winTzFor = (iana: string): string => WINDOWS_TZ[iana] ?? iana ?? "UTC";

const listZones = (): string[] => {
  try {
    const all = (Intl as unknown as { supportedValuesOf?: (k: string) => string[] }).supportedValuesOf?.("timeZone");
    if (all?.length) return all;
  } catch {
    /* fall through */
  }
  return Object.keys(WINDOWS_TZ); // older runtimes: the curated set
};

/** Every selectable zone, sorted by region then city. */
export const TIMEZONES: TzOption[] = listZones()
  .map((iana) => {
    const parts = iana.split("/");
    const region = parts.length > 1 ? parts[0].replace(/_/g, " ") : "Other";
    const city = parts[parts.length - 1].replace(/_/g, " ");
    return { iana, win: winTzFor(iana), city, region };
  })
  .sort((a, b) => a.region.localeCompare(b.region) || a.city.localeCompare(b.city));

/** Current UTC offset (minutes) for a zone — used to build a live "(UTC±hh:mm)" label. */
export function tzOffsetMinutes(iana: string, at: Date = new Date()): number {
  try {
    const p = Object.fromEntries(
      new Intl.DateTimeFormat("en-US", {
        timeZone: iana,
        hour12: false,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        hour: "2-digit",
        minute: "2-digit",
        second: "2-digit",
      })
        .formatToParts(at)
        .map((x) => [x.type, x.value]),
    );
    const wall = Date.UTC(+p.year, +p.month - 1, +p.day, +(p.hour === "24" ? "00" : p.hour), +p.minute, +p.second);
    return Math.round((wall - at.getTime()) / 60000);
  } catch {
    return 0;
  }
}

/** A display label with the live offset, e.g. "Sydney — Australia (UTC+10:00)". */
export function tzLabel(iana: string): string {
  const opt = TIMEZONES.find((t) => t.iana === iana);
  const city = opt ? opt.city : iana;
  const region = opt ? opt.region : "";
  const off = tzOffsetMinutes(iana);
  const sign = off >= 0 ? "+" : "−";
  const hh = String(Math.floor(Math.abs(off) / 60)).padStart(2, "0");
  const mm = String(Math.abs(off) % 60).padStart(2, "0");
  return `${city}${region ? " — " + region : ""} (UTC${off === 0 ? "±00:00" : `${sign}${hh}:${mm}`})`;
}
