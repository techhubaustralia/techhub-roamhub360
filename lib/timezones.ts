// Common timezones for building setup. iana = logic/scheduling, win = Microsoft Graph.
export const TIMEZONES: { label: string; iana: string; win: string }[] = [
  { label: "New York / Eastern (UTC−5)", iana: "America/New_York", win: "Eastern Standard Time" },
  { label: "Chicago / Central (UTC−6)", iana: "America/Chicago", win: "Central Standard Time" },
  { label: "Denver / Mountain (UTC−7)", iana: "America/Denver", win: "Mountain Standard Time" },
  { label: "Los Angeles / Pacific (UTC−8)", iana: "America/Los_Angeles", win: "Pacific Standard Time" },
  { label: "London (UTC+0)", iana: "Europe/London", win: "GMT Standard Time" },
  { label: "Rome / Paris / CET (UTC+1)", iana: "Europe/Rome", win: "W. Europe Standard Time" },
  { label: "Dubai (UTC+4)", iana: "Asia/Dubai", win: "Arabian Standard Time" },
  { label: "Mumbai (UTC+5:30)", iana: "Asia/Kolkata", win: "India Standard Time" },
  { label: "Singapore / Manila (UTC+8)", iana: "Asia/Manila", win: "Singapore Standard Time" },
  { label: "Sydney (UTC+10)", iana: "Australia/Sydney", win: "AUS Eastern Standard Time" },
  { label: "UTC", iana: "UTC", win: "UTC" },
];

export const winTzFor = (iana: string) => TIMEZONES.find((t) => t.iana === iana)?.win ?? "UTC";
