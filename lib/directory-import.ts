// Pure helpers for "Import from Microsoft 365" (Users & roles). Client-safe, unit-tested.

export interface ImportCandidate {
  email: string;
  displayName?: string;
  jobTitle?: string;
  department?: string;
  photo?: string;
}

/** Directory entries that are NOT yet users of this workspace, sorted by name then email. */
export function pendingDirectoryEntries<T extends ImportCandidate>(entries: T[], existingEmails: Iterable<string>): T[] {
  const have = new Set(Array.from(existingEmails, (e) => e.toLowerCase()));
  const seen = new Set<string>();
  const out: T[] = [];
  for (const e of entries) {
    const email = e.email.toLowerCase();
    if (!email || have.has(email) || seen.has(email)) continue;
    seen.add(email);
    out.push(e);
  }
  return out.sort((a, b) => (a.displayName || a.email).localeCompare(b.displayName || b.email));
}

/** Case-insensitive match on name, email, title or department. Empty query matches everything. */
export function matchesImportQuery(e: ImportCandidate, q: string): boolean {
  const s = q.trim().toLowerCase();
  if (!s) return true;
  return [e.displayName, e.email, e.jobTitle, e.department].some((v) => (v ?? "").toLowerCase().includes(s));
}

export interface ImportOutcome {
  created: number;
  skipped: { email: string; reason: string }[];
}

/** One-line summary for the toast: "Imported 3 users · 2 skipped (already users)". */
export function summariseImport(r: ImportOutcome): { title: string; description?: string } {
  const title = `Imported ${r.created} user${r.created === 1 ? "" : "s"}`;
  if (!r.skipped.length) return { title, description: "They can sign in with Microsoft straight away." };
  const reasons = new Map<string, number>();
  for (const s of r.skipped) reasons.set(s.reason, (reasons.get(s.reason) ?? 0) + 1);
  const detail = [...reasons.entries()].map(([reason, n]) => `${n} ${reason.toLowerCase()}`).join(", ");
  return { title, description: `${r.skipped.length} skipped: ${detail}.` };
}
